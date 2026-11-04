/**
 * A whole site from Elementor's files (S/ElementorImport.scala `site`, `pictures`, `relink`): every Elementor file chosen
 * (name → JSON) as one site template, with pages, header and footer, the design brief from the kit's globals and a main
 * menu of the pages; and the template's pictures from the old site, to copy into the Media Library.
 */
import { type Doc, type El, SiteTemplate } from "@auvyx/editor-core";
import { ElementorImport, type JVal, type JObj } from "@auvyx/editor-core/import";
import { encode } from "../../../../../packages/editor-core/src/actions/encode";

type T = SiteTemplate.SiteTemplate;
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const last = (name: string) => name.split("/").pop() ?? "";
const isMap = (v: JVal | undefined): v is JObj => v instanceof Map;
const SAFE_FAMILY = /^[A-Za-z0-9 _-]{1,60}$/;
const SAFE_URL = /^(https?:\/\/|\/)[^\s"'()<>]+$/i;
const CSS_URL = /url\(\s*["']?([^"')\s]+)["']?\s*\)/g;
const HOME = /^(home|homepage|home page|trang chủ|trang chu)$/;

/** A kit's manifest order: its content pages, then its templates (ElementorImport.manifestOrder). */
function manifestOrder(json: JVal): string[] {
  if (!isMap(json)) return [];
  const content = json.get("content");
  const templates = json.get("templates");
  return [
    ...(isMap(content) ? [...content.values()].flatMap((items) => (isMap(items) ? [...items.keys()] : [])) : []),
    ...(isMap(templates) ? [...templates.keys()] : []),
  ];
}

/** Every `*font_family` value in a piece (ElementorImport.families). */
function families(v: JVal): string[] {
  if (isMap(v)) return [...v].flatMap(([k, x]) => (k.endsWith("font_family") ? (typeof x === "string" && x !== "" ? [x] : []) : families(x)));
  if (Array.isArray(v)) return v.flatMap(families);
  return [];
}

/** The attributes in a block's opening comment (ElementJson.blockAttrs). */
function blockAttrs(raw: string): Json | undefined {
  const open = raw.indexOf("<!-- wp:");
  if (open < 0) return undefined;
  const start = raw.indexOf("{", open);
  const ws = /\s/.exec(raw.slice(open + 8));
  const nameEnd = ws ? open + 8 + ws.index : -1;
  if (start < 0 || nameEnd < 0 || start > nameEnd + 1) return undefined;
  let depth = 0, inString = false, end = -1;
  for (let i = start; i < raw.length && end < 0; i++) {
    const c = raw[i];
    if (inString) { if (c === "\\") i++; else if (c === '"') inString = false; }
    else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) end = i;
  }
  if (end < 0) return undefined;
  try { return JSON.parse(raw.slice(start, end + 1)) as Json; } catch { return undefined; }
}

/** What an import made and what it could not carry over. */
export interface Site { template: T; kept: string[]; skipped: string[] }

/** ElementorImport.detect over plain files. */
export const detect = (json: JVal) => ElementorImport.detect(json);

export function site(files: [string, JVal][], assets: string, newId: () => string): { ok: true; value: Site } | { ok: false; error: string } {
  const manifestFile = files.find(([n]) => last(n) === "manifest.json");
  const [kitName, known] = manifestFile ? ElementorImport.manifest(manifestFile[1]) : ["", new Map<string, [string, string]>()];
  const g0 = files.map(([, j]) => ElementorImport.globals(j)).find((g) => g !== undefined) ?? ElementorImport.emptyGlobals();
  const notMeta = (n: string) => !["manifest.json", "site-settings.json"].includes(last(n));
  const pieces = files.filter(([n]) => notMeta(n)).flatMap(([name, json]) => {
    const p = ElementorImport.piece(json, name);
    if (!p) return [];
    const k = known.get(p.id);
    return [k ? { ...p, title: k[0] !== "" ? k[0] : p.title, docType: k[1] !== "" ? k[1] : p.docType } : p];
  });
  // No kit fonts (a saved page or a theme's templates): the family the pages use most stands for both.
  let g = g0;
  if (g0.fonts.size === 0) {
    const used = pieces.flatMap((p) => families(p.elements)).filter((f) => SAFE_FAMILY.test(f));
    const counts = new Map<string, number>();
    used.forEach((f) => counts.set(f, (counts.get(f) ?? 0) + 1));
    const top = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (top) g = { ...g0, fonts: new Map([["primary", top[0]], ["text", top[0]]]) };
  }
  const skipped = files.map(([n]) => n).filter((n) => notMeta(n) && !pieces.some((p) => p.id === last(n).replace(/\.json$/, "")));
  if (!pieces.length)
    return { ok: false, error: "No Elementor page or template in these files. Export from Elementor (Templates → Saved Templates → Export, or Tools → Export Kit, unzipped) and choose the .json files." };
  const kept: string[] = [];
  const trees = (p: ElementorImport.Piece): unknown[] => {
    const r = ElementorImport.build(p.elements, g, assets, newId);
    kept.push(...r.kept);
    const doc: Doc = { roots: r.roots, nodes: r.nodes };
    // kept blocks (forms, HTML, shortcodes) carry their own markup into the template, which applies it as it is
    return encode(doc, undefined, (n: El) => {
      const attrs = blockAttrs(n.raw);
      return attrs === undefined ? [["markup", n.raw]] : [["markup", n.raw], ["attrs", attrs]];
    }, false);
  };
  const parts = (["header", "footer"] as const).flatMap((a) => { const p = pieces.find((x) => x.docType === a); return p ? [[a, trees(p)] as const] : []; });
  // the kit's own order (its manifest), else the files' (numeric ids in order), wherever the files came from
  const order = manifestFile ? manifestOrder(manifestFile[1]) : [];
  const rank = (p: ElementorImport.Piece): [number, number, string] => {
    const i = order.indexOf(p.id);
    return [i < 0 ? Number.MAX_SAFE_INTEGER : i, /^-?\d+$/.test(p.id) ? Number(p.id) : Number.MAX_SAFE_INTEGER, p.id];
  };
  const cmp = (a: ElementorImport.Piece, b: ElementorImport.Piece) => {
    const [x, y] = [rank(a), rank(b)];
    return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0);
  };
  const unordered = pieces.filter((p) => !["header", "footer", "popup", "kit"].includes(p.docType)).sort(cmp);
  const home = unordered.findIndex((p) => HOME.test(p.title.trim().toLowerCase()));
  const pages = home > 0 ? [unordered[home]!, ...unordered.filter((_, i) => i !== home)] : unordered;
  const keys: string[] = [];
  for (const p of pages) {
    const base = SiteTemplate.slugify(p.title) || "page";
    let i = 1;
    while (keys.includes(i === 1 ? base : `${base}-${i}`)) i++;
    keys.push(i === 1 ? base : `${base}-${i}`);
  }
  const front = 0;
  const built: SiteTemplate.Page[] = pages.map((p, i) => ({ key: keys[i]!, title: p.title, slug: keys[i]!, template: "page-no-title", front: i === front, elements: trees(p) }));
  const name = [kitName, g.name].find((x) => x.trim() !== "") ?? pages[front]?.title ?? "Elementor import";
  const menu: SiteTemplate.Menu = { key: "main", title: "Main menu", items: built.map((p) => ({ label: p.title, page: p.key, url: "", mega: false, children: [], from: "" })) };
  return {
    ok: true,
    value: {
      template: {
        id: SiteTemplate.slugify(`elementor-${name}`).slice(0, 60), title: `${name} (from Elementor)`,
        description: `Imported from Elementor: ${built.length} page(s)${parts.length ? `, ${parts.map(([a]) => a).join(" and ")}` : ""}.`,
        screenshot: "", brief: ElementorImport.brief(g), parts: Object.fromEntries(parts), menus: [menu], pages: built.slice(0, SiteTemplate.MAX_PAGES),
        posts: [], entries: [], requires: [], presets: {}, catalog: "", settings: {},
      },
      kept: [...new Set(kept)],
      skipped,
    },
  };
}

// ---- pictures from the old site ----------------------------------------------------------------

const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];

/**
 * Every picture the template shows from elsewhere (images' `src`, background `url(...)`s), with its alt text, once each;
 * `here` says which addresses are this site's own (they stay as they are).
 */
export function pictures(t: T, here: (url: string) => boolean): [string, string][] {
  const out: [string, string][] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== "object") return;
    const m = v as Record<string, unknown>;
    if (m.kind === "image" && typeof m.src === "string" && SAFE_URL.test(m.src)) out.push([m.src, typeof m.alt === "string" ? m.alt : ""]);
    if (m.styles !== undefined) for (const s of strings(m.styles)) for (const x of s.matchAll(CSS_URL)) if (x[1] && SAFE_URL.test(x[1])) out.push([x[1], ""]);
    Object.values(m).forEach(walk);
  };
  [...Object.values(t.parts).flat(), ...t.pages.flatMap((p) => p.elements)].forEach(walk);
  const by = new Map<string, string>();
  for (const [u, alt] of out) if (!here(u)) by.set(u, by.get(u) || alt);
  return [...by].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** The template with each copied picture's old address replaced by its new one. */
export function relink(t: T, copies: Map<string, string>, encodeTemplate: (t: T) => string): T {
  if (!copies.size) return t;
  // longest first, so an address that begins another (a.jpg, a.jpg?w=300) is not cut in half
  const json = [...copies].sort((a, b) => b[0].length - a[0].length)
    .reduce((j, [from, to]) => j.split(`"${from}"`).join(`"${to}"`).split(`\\"${from}\\"`).join(`\\"${to}\\"`), encodeTemplate(t));
  const d = SiteTemplate.decode(json);
  return d.ok ? d.value : t;
}
