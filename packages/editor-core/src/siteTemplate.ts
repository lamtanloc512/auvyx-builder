/**
 * A whole site in one JSON file (`auvyx-site/1..3`, docs/site-templates.md): the Scala `SiteTemplate` reader and checker
 * (S/SiteTemplate.scala) and `document` (a page's element trees → a document). Auvyx Editor applies one page of a template to
 * the page it edits (Page templates); a whole site is applied from the Site templates screen.
 */
import type { Doc } from "./model";
import { type Context, decodePage, field, str } from "./elementJson";
import * as ContentModel from "./contentModel";
import { isRecord } from "./json";

export const SCHEMA = "auvyx-site/3";
export const SCHEMAS = new Set(["auvyx-site/1", "auvyx-site/2", SCHEMA]);
export const MAX_ENTRIES = 300;
export const PARTS = ["header", "footer"];
export const MAX_JSON_LENGTH = 4 * 1024 * 1024;
export const MAX_PAGES = 60;
export const MAX_MENUS = 12;
export const MAX_MENU_ITEMS = 200;
export const MAX_POSTS = 100;

/** Built-in templates name the Studio's placeholder pictures by this marker (Templates.GeneratedAssets). */
export const GENERATED_ASSETS = "https://auvyx.invalid/assets/placeholders";

const REQUIRES = ["commerce.product", "commerce.cart", "commerce.review"];
const PRESET_SLOTS = ["header", "footer", "card", "product", "shop"];
const MENU_SOURCES = ["categories", "brands"];

export interface MenuItem { label: string; page: string; url: string; mega: boolean; children: MenuItem[]; from: string }
export interface Menu { key: string; title: string; items: MenuItem[] }
export interface Page { key: string; title: string; slug: string; template: string; front: boolean; elements: unknown[] }
export interface Post { key: string; title: string; excerpt: string; image: string; elements: unknown[]; categories: string[]; date: string }
export interface Sample { typeKey: string; key: string; title: string; excerpt: string; image: string; values: Record<string, unknown>; terms: Record<string, string[]> }

export interface SiteTemplate {
  id: string;
  title: string;
  description: string;
  screenshot: string;
  brief: string;
  parts: Record<string, unknown[]>;
  menus: Menu[];
  pages: Page[];
  posts: Post[];
  content?: ContentModel.Definition;
  entries: Sample[];
  requires: string[];
  presets: Record<string, string>;
  catalog: string;
  settings: Record<string, unknown>;
}

/** What a template lists before it is opened (`auvyx/v1/site-templates` items). */
export interface Summary { id: string; title: string; description: string; screenshot: string; pages: string[]; builtIn: boolean; blueprint?: boolean }

export const front = (t: SiteTemplate) => t.pages.find((p) => p.front);
export const isBlueprint = (t: SiteTemplate) =>
  t.requires.length > 0 || Object.keys(t.presets).length > 0 || t.catalog !== "" || Object.keys(t.settings).length > 0;
export const summary = (t: SiteTemplate, builtIn: boolean): Summary =>
  ({ id: t.id, title: t.title, description: t.description, screenshot: t.screenshot, pages: t.pages.map((p) => p.title), builtIn, blueprint: isBlueprint(t) });

const KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const validKey = (s: string) => KEY.test(s);

const FOLDS: Record<string, string> = Object.fromEntries(([
  ["a", "àáạảãâầấậẩẫăằắặẳẵäåā"], ["e", "èéẹẻẽêềếệểễëē"], ["i", "ìíịỉĩîïī"], ["o", "òóọỏõôồốộổỗơờớợởỡöøō"],
  ["u", "ùúụủũưừứựửữûüū"], ["y", "ỳýỵỷỹÿ"], ["d", "đ"], ["c", "ç"], ["n", "ñ"], ["s", "ß"],
] as const).flatMap(([base, accented]) => [...accented].map((c) => [c, base])));

/** A key from any title: "Trang chủ" → "trang-chu". */
export function slugify(s: string): string {
  const ascii = [...s.toLowerCase()].map((c) => FOLDS[c] ?? c).join("");
  const k = ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/, "");
  return k === "" ? "page" : k;
}

/** A post date the platforms take as written. */
const POST_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;
export const postCategories = (names: string[]) =>
  [...new Set(names.map((n) => n.trim()).filter((n) => n !== "" && n.length <= 60))].slice(0, 10);

/** HtmlRenderer.safeUrl: http(s) or relative (and mailto / tel unless media). */
export function safeUrl(raw: string, media = false): string | undefined {
  const s = raw.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, "");
  if (s === "" || [...s].some((c) => c <= " " || c === "\x7f" || c === "\\")) return undefined;
  const colon = s.indexOf(":");
  const boundary = s.search(/[/?#]/);
  if (colon >= 0 && (boundary < 0 || colon < boundary)) {
    const scheme = s.slice(0, colon).replace(/[A-Z]/g, (c) => c.toLowerCase());
    if ((scheme === "http" || scheme === "https") && s.slice(colon + 1).startsWith("//")) return s;
    if (!media && (scheme === "mailto" || scheme === "tel")) return s;
    return undefined;
  }
  return s;
}

// ---- reading ----------------------------------------------------------------------------

const arr = (o: unknown, key: string): unknown[] => { const v = field(o, key); return Array.isArray(v) ? v : []; };
const flag = (o: unknown, key: string) => str(o, key) === "true";
const s0 = (o: unknown, key: string) => str(o, key) ?? "";

const menuItem = (o: unknown, depth: number): MenuItem => ({
  label: s0(o, "label"), page: s0(o, "page"), url: s0(o, "url"), mega: flag(o, "mega"),
  children: depth >= 3 ? [] : arr(o, "children").map((c) => menuItem(c, depth + 1)), from: s0(o, "from"),
});

export type Decoded = { ok: true; value: SiteTemplate } | { ok: false; error: string };

/** Reads and checks a template; every problem at once when it cannot be used. */
export function decode(json: string): Decoded {
  if (json.length > MAX_JSON_LENGTH) return { ok: false, error: `The template is larger than ${MAX_JSON_LENGTH / 1024 / 1024} MB.` };
  let v: unknown;
  try { v = JSON.parse(json); } catch (e) { return { ok: false, error: `Not JSON: ${String((e as Error).message ?? "").slice(0, 160)}` }; }
  return fromJson(v);
}

export function fromJson(o: unknown): Decoded {
  if (!isRecord(o)) return { ok: false, error: "A template is a JSON object." };
  const partsObj = field(o, "parts");
  const parts: Record<string, unknown[]> = {};
  for (const p of PARTS) { const v = field(partsObj, p); if (Array.isArray(v)) parts[p] = v; }
  const objOf = (v: unknown) => (isRecord(v) ? v : undefined);
  const t: SiteTemplate = {
    id: s0(o, "id"), title: s0(o, "title"), description: s0(o, "description"), screenshot: s0(o, "screenshot"),
    brief: str(field(o, "design"), "brief") ?? "",
    parts,
    menus: arr(o, "menus").map((m) => ({ key: s0(m, "key"), title: s0(m, "title"), items: arr(m, "items").map((x) => menuItem(x, 1)) })),
    pages: arr(o, "pages").map((p) => ({ key: s0(p, "key"), title: s0(p, "title"), slug: s0(p, "slug"), template: s0(p, "template"), front: flag(p, "front"), elements: arr(p, "elements") })),
    posts: arr(o, "posts").map((p) => {
      const date = s0(p, "date");
      return { key: s0(p, "key"), title: s0(p, "title"), excerpt: s0(p, "excerpt"), image: s0(p, "image"), elements: arr(p, "elements"),
        categories: postCategories(arr(p, "categories").filter((c): c is string => typeof c === "string")), date: POST_DATE.test(date) ? date : "" };
    }),
    entries: arr(o, "entries").map((e) => ({
      typeKey: s0(e, "type"), key: s0(e, "key"), title: s0(e, "title"), excerpt: s0(e, "excerpt"), image: s0(e, "image"),
      values: { ...objOf(field(e, "values")) },
      terms: Object.fromEntries(Object.entries(objOf(field(e, "terms")) ?? {}).map(([k, x]) =>
        [k, Array.isArray(x) ? x.filter((n): n is string => typeof n === "string").map((n) => n.trim()).filter((n) => n !== "") : []])),
    })),
    requires: arr(o, "requires").filter((k): k is string => typeof k === "string").map((k) => k.trim()),
    presets: Object.fromEntries(Object.entries(objOf(field(o, "presets")) ?? {}).flatMap(([k, x]) => (typeof x === "string" ? [[k, x.trim()]] : []))),
    catalog: s0(o, "catalog"),
    settings: { ...objOf(field(o, "settings")) },
  };
  const schema = str(o, "schema");
  const rawContent = field(o, "content");
  const content = rawContent === undefined ? undefined : ContentModel.validate(rawContent);
  const withContent: SiteTemplate = { ...t, ...(content?.ok ? { content: content.value } : {}) };
  const problems = [
    ...(schema !== undefined && !SCHEMAS.has(schema) ? [`schema must be "${SCHEMA}"`] : []),
    ...(content && !content.ok ? content.errors.map((e) => `content.${e}`) : []),
    ...check(withContent),
  ];
  return problems.length ? { ok: false, error: problems.join("; ") } : { ok: true, value: withContent };
}

/** Everything wrong with a template, empty when it can be applied. */
export function check(t: SiteTemplate): string[] {
  const out: string[] = [];
  if (!validKey(t.id)) out.push('id: lowercase letters, digits, - and _ ("my-shop")');
  if (t.title.trim() === "") out.push("title is empty");
  if (!t.pages.length) out.push("no pages");
  if (t.pages.length > MAX_PAGES) out.push(`more than ${MAX_PAGES} pages`);
  if (t.menus.length > MAX_MENUS) out.push(`more than ${MAX_MENUS} menus`);
  const dupes = (keys: string[]) => [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  t.pages.forEach((p, i) => {
    if (!validKey(p.key)) out.push(`pages[${i}].key "${p.key}" is not a key`);
    if (p.title.trim() === "") out.push(`pages[${i}] has no title`);
    if (!p.elements.length) out.push(`page "${p.key}" has no elements`);
  });
  dupes(t.pages.map((p) => p.key)).forEach((k) => out.push(`page key "${k}" is used twice`));
  if (t.pages.filter((p) => p.front).length > 1) out.push("more than one front page");
  const pageKeys = new Set(t.pages.map((p) => p.key));
  const items = (m: Menu) => { const walk = (xs: MenuItem[]): MenuItem[] => xs.flatMap((x) => [x, ...walk(x.children)]); return walk(m.items); };
  t.menus.forEach((m) => {
    if (!validKey(m.key)) out.push(`menu key "${m.key}" is not a key`);
    const all = items(m);
    if (all.length > MAX_MENU_ITEMS) out.push(`menu "${m.key}" has more than ${MAX_MENU_ITEMS} items`);
    all.forEach((x) => {
      if (x.label.trim() === "") out.push(`menu "${m.key}": an item has no label`);
      if (x.page !== "" && !pageKeys.has(x.page)) out.push(`menu "${m.key}": "${x.label}" links to page "${x.page}", which is not in pages`);
      if (x.page === "" && x.url === "") out.push(`menu "${m.key}": "${x.label}" has neither page nor url`);
    });
  });
  dupes(t.menus.map((m) => m.key)).forEach((k) => out.push(`menu key "${k}" is used twice`));
  t.menus.forEach((m) => items(m).filter((x) => x.from !== "").forEach((x) => {
    if (!MENU_SOURCES.includes(x.from)) out.push(`menu "${m.key}": "${x.label}" lists "${x.from}", which is none of ${[...MENU_SOURCES].sort().join(", ")}`);
  }));
  t.requires.filter((k) => !REQUIRES.includes(k)).forEach((k) => out.push(`requires: "${k}" is not one of ${REQUIRES.join(", ")}`));
  dupes(t.requires).forEach((k) => out.push(`requires: "${k}" is listed twice`));
  Object.entries(t.presets).forEach(([slot, key]) => {
    if (slot === "dock") out.push("presets.dock: there is no bottom dock; one menu is a hamburger, several are one floating button and a drawer");
    else if (!PRESET_SLOTS.includes(slot)) out.push(`presets.${slot}: slots are ${PRESET_SLOTS.join(", ")}`);
    if (!validKey(key)) out.push(`presets.${slot}: "${key}" is not a preset key`);
  });
  if (t.catalog !== "" && !validKey(t.catalog)) out.push(`catalog: "${t.catalog}" is not a demo catalog id`);
  if (t.posts.length > MAX_POSTS) out.push(`more than ${MAX_POSTS} posts`);
  t.posts.forEach((p, i) => {
    if (!validKey(p.key)) out.push(`posts[${i}].key "${p.key}" is not a key`);
    if (p.title.trim() === "") out.push(`posts[${i}] has no title`);
    if (p.excerpt.length > 1000) out.push(`post "${p.key}": the excerpt is longer than 1000 characters`);
    if (p.image !== "" && safeUrl(p.image, true) === undefined) out.push(`post "${p.key}": the image is not a usable address`);
  });
  dupes(t.posts.map((p) => p.key)).forEach((k) => out.push(`post key "${k}" is used twice`));
  if (t.entries.length > MAX_ENTRIES) out.push(`more than ${MAX_ENTRIES} entries`);
  const types = t.content ?? ContentModel.emptyDefinition;
  const samplesByType = new Map<string, Set<string>>();
  t.entries.forEach((e) => { if (!samplesByType.has(e.typeKey)) samplesByType.set(e.typeKey, new Set()); samplesByType.get(e.typeKey)!.add(e.key); });
  t.entries.forEach((e, i) => {
    const at = `entries[${i}]`;
    const ct = ContentModel.typeOf(types, e.typeKey);
    if (!ct) { out.push(`${at}: no content type "${e.typeKey}" in content`); return; }
    if (!validKey(e.key)) out.push(`${at}.key "${e.key}" is not a key`);
    if (e.title.trim() === "") out.push(`${at} has no title`);
    if (e.image !== "" && safeUrl(e.image, true) === undefined) out.push(`${at}: the image is not a usable address`);
    Object.keys(e.values).filter((k) => !ct.fields.some((f) => f.key === k)).forEach((k) => out.push(`${at}.values.${k}: no such field in ${ct.key}`));
    ct.fields.forEach((f) => {
      const v = Object.hasOwn(e.values, f.key) ? e.values[f.key] : null;
      if (f.kind === "image" || f.kind === "file" || f.kind === "gallery") {
        const urls = Array.isArray(v) ? v : v === null || v === undefined ? [] : [v];
        if (urls.some((u) => typeof u !== "string" || safeUrl(u, true) === undefined)) out.push(`${at}.values.${f.key}: picture and file values are addresses`);
        if (f.required && !urls.length) out.push(`${at}.values.${f.key}: ${f.label} is required`);
      } else if (f.kind === "relation") {
        const keys = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : [];
        keys.filter((k) => !(samplesByType.get(f.to)?.has(k) ?? false)).forEach((k) => out.push(`${at}.values.${f.key}: no ${f.to} entry "${k}" in entries`));
        if (f.required && !keys.length) out.push(`${at}.values.${f.key}: ${f.label} is required`);
      } else {
        const r = ContentModel.sanitize(f, v);
        if (!r.ok) out.push(`${at}.values.${f.key}: ${r.error}`);
      }
    });
    Object.keys(e.terms).filter((k) => !types.taxonomies.some((x) => x.key === k && x.types.includes(ct.key))).forEach((k) => out.push(`${at}.terms.${k}: no such taxonomy on ${ct.key}`));
  });
  const byType = new Map<string, string[]>();
  t.entries.forEach((e) => byType.set(e.typeKey, [...(byType.get(e.typeKey) ?? []), e.key]));
  byType.forEach((keys, ty) => dupes(keys).forEach((k) => out.push(`${ty} entry key "${k}" is used twice`)));
  return out;
}

// ---- applying ---------------------------------------------------------------------------

/**
 * A page's (or a part's) element trees → a document. Navigations naming one of the template's menus point at the menu
 * the import created (`menus`: key → the host's menu id).
 */
export function document(trees: readonly unknown[], ctx: Context, menus: Record<string, string> = {}): Doc {
  const doc = decodePage(trees, ctx);
  return {
    ...doc,
    nodes: Object.fromEntries(Object.entries(doc.nodes).map(([id, n]) =>
      [id, n.kind === "Nav" && Object.hasOwn(menus, n.src) ? { ...n, src: menus[n.src]! } : n])),
  };
}

/** A menu item's link: its page's address on this site, else its url. */
export const link = (x: MenuItem, pageUrls: Record<string, string>) => (x.page !== "" ? pageUrls[x.page] ?? "#" : x.url);
