/**
 * The site's REST endpoints the agent uses beyond the editor's own (WpHost on WordPress): menus (auvyx/v1/menus), the
 * library (auvyx/v1/library), new pages and posts (wp/v2), the site's parts and front page and demo catalogs
 * (auvyx/v1/site-templates, auvyx/v1/demo-catalogs), data sources (auvyx/v1/data-sources), turning blocks into elements
 * (auvyx/v1/convert) and the design brief (auvyx/v1/design/brief). Same requests and shapes as the Studio's host.
 */
import { type Doc, type TreeNode, decodeTree, serialize } from "@auvyx/editor-core";
import { config } from "./config";
import { rest } from "./host";
import { nextId } from "./ids";

const post = <T>(path: string, body: unknown) => rest<T>(path, { method: "POST", body: JSON.stringify(body) }).then((r) => r.data);
const get = <T>(path: string) => rest<T>(path).then((r) => r.data);
const site = config as unknown as { studioUrl?: string; pageTemplates?: { slug: string; title: string }[]; shopRoutes?: Record<string, string> | null; data?: unknown };

// ---- menus ----

export interface MenuNode { label: string; url: string; kind: string; type: string; id: number; mega: boolean; description: string; children: MenuNode[]; panel: number }
export interface EditableMenu { id: number; title: string; items: MenuNode[] }
export interface LinkTarget { label: string; url: string; kind: string; type: string; id: number; group: string }

const num = (v: unknown) => (typeof v === "number" ? Math.trunc(v) : Number.parseInt(String(v ?? "0"), 10) || 0);
const s = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
const node = (i: Record<string, unknown>): MenuNode => ({
  label: s(i.label), url: s(i.url), kind: s(i.kind), type: s(i.type), id: num(i.id), mega: i.mega === true, description: s(i.description),
  children: (Array.isArray(i.children) ? i.children : []).map((c) => node(c as Record<string, unknown>)), panel: num(i.panel),
});
const menuOf = (m: Record<string, unknown>): EditableMenu => ({ id: num(m.id), title: s(m.title), items: (Array.isArray(m.items) ? m.items : []).map((x) => node(x as Record<string, unknown>)) });

export const canEditMenus = () => !!config.canEditMenus && !!config.restRoot;

export const menus = {
  load: async (): Promise<{ menus: EditableMenu[]; targets: LinkTarget[] }> => {
    const r = await get<{ menus?: Record<string, unknown>[]; targets?: Record<string, unknown>[] }>("auvyx/v1/menus");
    return {
      menus: (r.menus ?? []).map(menuOf),
      targets: (r.targets ?? []).map((t) => ({ label: s(t.label), url: s(t.url), kind: s(t.kind), type: s(t.type), id: num(t.id), group: s(t.group) })),
    };
  },
  save: (m: EditableMenu) => post<Record<string, unknown>>("auvyx/v1/menus", m).then(menuOf),
};

// ---- library ----

export interface LibraryItem { id: number; title: string; synced: boolean; category: string; editUrl: string }
export const library = {
  list: () => get<LibraryItem[]>("auvyx/v1/library"),
  create: (title: string, doc: Doc, synced: boolean, category = "") => post<LibraryItem>("auvyx/v1/library", { title, markup: serialize(doc), synced, category }),
};

// ---- pages and posts ----

export interface CreatedPage { id: string; title: string; editUrl: string; viewUrl: string }
export const pageTemplates = () => (site.pageTemplates ?? []).map((t) => [t.slug, t.title] as [string, string]);
export const canCreatePages = () => !!config.restRoot;
export const canCreatePosts = () => !!site.studioUrl;

export async function createPage(title: string, doc: Doc, template: string, publish: boolean, origin: string): Promise<CreatedPage> {
  const body: Record<string, unknown> = { title, content: serialize(doc), status: publish ? "publish" : "draft" };
  if (pageTemplates().some(([t]) => t === template)) body.template = template;
  if (origin) body.meta = { auvyx_from_template: origin };
  const r = await post<{ id: number; link?: string }>("wp/v2/pages", body);
  const id = String(r.id);
  return { id, title, editUrl: (site.studioUrl ?? "").replace("{id}", id), viewUrl: s(r.link) };
}

export async function createPost(title: string, excerpt: string, image: string, doc: Doc, origin: string, categories: string[], date: string): Promise<CreatedPage> {
  const ids: number[] = [];
  for (const name of categories) {
    const found = await get<{ id: number; name: string }[]>(`wp/v2/categories?per_page=100&search=${encodeURIComponent(name)}`);
    const same = found.find((t) => t.name.toLowerCase() === name.toLowerCase());
    ids.push(same ? same.id : (await post<{ id: number }>("wp/v2/categories", { name })).id);
  }
  const body: Record<string, unknown> = { title, content: serialize(doc), excerpt, status: "publish", meta: { auvyx_from_template: origin, auvyx_image: image } };
  if (ids.length) body.categories = ids;
  if (date) body.date = date;
  const r = await post<{ id: number; link?: string }>("wp/v2/posts", body);
  const id = String(r.id);
  return { id, title, editUrl: (site.studioUrl ?? "").replace("{id}", id), viewUrl: s(r.link) };
}

// ---- site templates' site-wide steps ----

export const savePart = (area: string, doc: Doc) => post("auvyx/v1/site-templates/part", { area, content: serialize(doc) });
export const setFront = (pageId: string) => post("auvyx/v1/site-templates/front", { page: Number.parseInt(pageId, 10) || 0 });
export const saveTemplate = (json: string) => post<Record<string, unknown>>("auvyx/v1/site-templates", { template: json });
export const removeTemplate = (id: string) => post(`auvyx/v1/site-templates/${encodeURIComponent(id)}?_method=DELETE`, {});
export const shopRoutes = () => site.shopRoutes ?? null;

export async function importCatalog(templateId: string): Promise<string[]> {
  const r = await get<{ keys?: unknown[] }>(`auvyx/v1/demo-catalogs/${encodeURIComponent(templateId)}`);
  const names: string[] = [];
  for (const key of (r.keys ?? []).map(String)) names.push(s((await post<{ name?: string }>(`auvyx/v1/demo-catalogs/${encodeURIComponent(templateId)}/${encodeURIComponent(key)}`, {})).name));
  return names;
}

export interface SnapshotPage { id: string; title: string; slug: string; template: string; front: boolean; doc: Doc; url: string }
export async function siteSnapshot(): Promise<{ pages: SnapshotPage[]; parts: [string, Doc][] }> {
  const r = await get<{ pages?: Record<string, unknown>[]; parts?: Record<string, TreeNode[]> }>("auvyx/v1/site-templates/site");
  return {
    pages: (r.pages ?? []).map((p) => ({ id: String(num(p.id)), title: s(p.title), slug: s(p.slug), template: s(p.template), front: p.front === true,
      doc: decodeTree((p.blocks as TreeNode[]) ?? [], nextId), url: s(p.url) })),
    parts: Object.entries(r.parts ?? {}).map(([area, tree]) => [area, decodeTree(tree ?? [], nextId)]),
  };
}

// ---- blocks to elements ----

/** auvyx/v1/convert: a block's markup (a pattern, a library item, a theme section) as Auvyx elements. */
export async function convert(markup: string): Promise<Doc> {
  const r = await post<{ blocks?: TreeNode[] } | TreeNode[]>("auvyx/v1/convert", { markup, post: config.postId });
  return decodeTree(Array.isArray(r) ? r : r.blocks ?? [], nextId);
}

// ---- data sources ----

export interface DataSourceSpec { name: string; label: string; fields: Record<string, unknown> }
export const dataSources = {
  list: () => get<{ items?: Record<string, unknown>[] }>("auvyx/v1/data-sources").then((r) => (r.items ?? []).map((i) => ({ name: s(i.name), label: s(i.label), fields: (i.fields ?? {}) as Record<string, unknown> }))),
  items: (name: string, limit: number) => get<{ items?: Record<string, unknown>[] }>(`auvyx/v1/data-sources/${encodeURIComponent(name)}?limit=${limit}`)
    .then((r) => (r.items ?? []).map((i) => Object.fromEntries(Object.entries(i).map(([k, v]) => [k, s(v)])))),
};

// ---- games ----

export const games = {
  get: (key: string) => rest<Record<string, unknown> | null>(`auvyx/v1/games/${encodeURIComponent(key)}`).then((r) => r.data, (e: Error) => (/404|not found/i.test(e.message) ? null : Promise.reject(e))),
  put: (key: string, game: unknown) => post(`auvyx/v1/games/${encodeURIComponent(key)}?_method=PUT`, game),
};
export const gamesAvailable = () => !!(config as unknown as { playUrl?: string }).playUrl;
