/**
 * The site, through its REST API as the signed-in user (the REST nonce), as the Studio's WordPress host does
 * (apps/studio/packages/host-wordpress WpHost): save, autosave, the canvas render, the post lock, media.
 */
import { type Doc, serialize } from "@auvyx/editor-core";
import { config } from "./config";

export const connected = !!config.restRoot;

export async function rest<T>(path: string, init: RequestInit = {}): Promise<{ data: T; headers: Headers }> {
  const res = await fetch(`${config.restRoot.replace(/\/$/, "")}/${path.replace(/^\//, "")}`, {
    credentials: "same-origin",
    ...init,
    headers: { "X-WP-Nonce": config.nonce, ...(init.body && !(init.body instanceof Blob) ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string })?.message || `${res.status} ${res.statusText}`);
  return { data: data as T, headers: res.headers };
}

const post = <T>(path: string, body: unknown) => rest<T>(path, { method: "POST", body: JSON.stringify(body) }).then((r) => r.data);

/** Saves the content; `publish` also publishes it. Template parts are addressed by their template id. */
export const save = (doc: Doc, publish: boolean) =>
  post(`wp/v2/${config.restBase}/${config.restId || config.postId}`, { content: serialize(doc), ...(publish ? { status: "publish" } : {}) });

/** WordPress's autosave: its author's draft is saved outright ("saved"), anything else kept aside, live content untouched. */
export const keep = (doc: Doc) =>
  post<{ id: number }>(`wp/v2/${config.restBase}/${config.postId}/autosaves`, { content: serialize(doc) })
    .then((r) => (String(r.id) === String(config.postId) ? "saved" : "kept") as "saved" | "kept");

export const acquireLock = (takeover: boolean) => post<{ locked?: boolean; by?: string }>(`auvyx/v1/lock/${config.postId}`, { takeover });

export interface Rendered { html: string; css: string; assets: string }

/** The path of an absolute or site-relative URL: the page the canvas shows. */
export const pathOf = (url: string) => {
  const path = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, "").split(/[?#]/)[0];
  return path || "/";
};

/**
 * The block markup the site renders for the canvas, with each element's id and position in the order the site meets
 * them (pre-order; children are a container's inner blocks). Positions are `<prefix>/<root index>(.<child index>)*`
 * in the whole document; `from` renders one element and what is inside it. (WpHost.canvasMarks)
 */
export function canvasMarks(doc: Doc, from: string | null, prefix: string): [string, string[], string[]] {
  const paths = new Map<string, string>();
  const place = (id: string, path: string) => {
    paths.set(id, path);
    doc.nodes[id]?.children.forEach((c, i) => place(c, `${path}.${i}`));
  };
  doc.roots.forEach((r, i) => place(r, `${prefix}/${i}`));
  const roots = from && doc.nodes[from] ? [from] : doc.roots;
  const order: string[] = [];
  const walk = (id: string) => { const n = doc.nodes[id]; if (n) { order.push(id); n.children.forEach(walk); } };
  roots.forEach(walk);
  const part: Doc = from ? { ...doc, roots, nodes: Object.fromEntries(order.map((id) => [id, doc.nodes[id]!])) } : doc;
  return [serialize(part), order, order.map((id) => paths.get(id)!)];
}

export const canvasRender = (doc: Doc, from: string | null) => {
  const [markup, ids, paths] = canvasMarks(doc, from, config.canvasPrefix || "content");
  return post<Rendered>("auvyx/v1/canvas/render", { post: config.postId, markup, ids, paths, at: pathOf(config.webCanvasUrl) });
};

/** An attachment as wp/v2/media answers it (the fields the editor reads). */
export interface Media {
  id: number;
  source_url: string;
  alt_text: string;
  mime_type: string;
  title: { rendered: string };
  media_details?: { width?: number; height?: number; sizes?: Record<string, { source_url: string; width: number }> };
}
export const thumb = (m: Media) => m.media_details?.sizes?.medium?.source_url ?? m.media_details?.sizes?.thumbnail?.source_url ?? m.source_url;
/** The picture the page uses: WordPress's "large" when there is one, else the original. */
export const pageUrl = (m: Media) => m.media_details?.sizes?.large?.source_url ?? m.source_url;
export const uploadMedia = (file: File) =>
  rest<Media>("wp/v2/media", { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"` }, body: file }).then((r) => r.data);
