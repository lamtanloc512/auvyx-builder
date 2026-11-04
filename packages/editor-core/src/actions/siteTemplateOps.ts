/**
 * What the agent's `site_template` tool needs of a template beyond reading it (editor-core siteTemplate.ts): writing it
 * (the Scala `SiteTemplate.toJson` / `encode`), capturing a site as one (`SiteTemplate.capture`) and leading the shop's
 * routes to this host's addresses (`BlueprintPlan.localize`). Pure.
 */
import type { Doc, El } from "../model";
import * as ContentModel from "../contentModel";
import { type MenuItem, type Menu, type SiteTemplate, slugify, validKey } from "../siteTemplate";
import { encode as encodeTrees } from "./encode";
import type { Json, JsonObj } from "./schema";

const isBlueprint = (t: SiteTemplate) => t.requires.length > 0 || Object.keys(t.presets).length > 0 || t.catalog !== "" || Object.keys(t.settings).length > 0;

function itemJson(x: MenuItem): JsonObj {
  const o: JsonObj = { label: x.label };
  if (x.page !== "") o.page = x.page; else o.url = x.url;
  if (x.mega) o.mega = true;
  if (x.from !== "") o.from = x.from;
  if (x.children.length) o.children = x.children.map(itemJson);
  return o;
}

export function toJson(t: SiteTemplate): JsonObj {
  const o: JsonObj = { schema: isBlueprint(t) ? "auvyx-site/3" : !t.content && !t.entries.length ? "auvyx-site/1" : "auvyx-site/2", id: t.id, title: t.title };
  if (t.description) o.description = t.description;
  if (t.screenshot) o.screenshot = t.screenshot;
  if (t.requires.length) o.requires = [...t.requires];
  if (Object.keys(t.presets).length) o.presets = { ...t.presets };
  if (t.catalog) o.catalog = t.catalog;
  if (Object.keys(t.settings).length) o.settings = { ...t.settings };
  if (t.brief) o.design = { brief: t.brief };
  if (Object.keys(t.parts).length) o.parts = Object.fromEntries(Object.entries(t.parts).map(([k, v]) => [k, [...v]]));
  if (t.menus.length) o.menus = t.menus.map((m) => ({ key: m.key, title: m.title, items: m.items.map(itemJson) }));
  o.pages = t.pages.map((p) => {
    const po: JsonObj = { key: p.key, title: p.title };
    if (p.slug) po.slug = p.slug;
    if (p.template) po.template = p.template;
    if (p.front) po.front = true;
    po.elements = [...p.elements];
    return po;
  });
  if (t.posts.length) o.posts = t.posts.map((p) => {
    const po: JsonObj = { key: p.key, title: p.title };
    if (p.excerpt) po.excerpt = p.excerpt;
    if (p.image) po.image = p.image;
    if (p.categories.length) po.categories = [...p.categories];
    if (p.date) po.date = p.date;
    po.elements = [...p.elements];
    return po;
  });
  if (t.content) o.content = ContentModel.toJson(t.content);
  if (t.entries.length) o.entries = t.entries.map((e) => {
    const eo: JsonObj = { type: e.typeKey, key: e.key, title: e.title };
    if (e.excerpt) eo.excerpt = e.excerpt;
    if (e.image) eo.image = e.image;
    if (Object.keys(e.values).length) eo.values = { ...e.values };
    if (Object.keys(e.terms).length) eo.terms = { ...e.terms };
    return eo;
  });
  return o;
}

/** ujson.write(…, indent = 1). */
export const encodeTemplate = (t: SiteTemplate) => JSON.stringify(toJson(t), null, 1);

/** One page of a site being captured: its document and where it stands. */
export interface SitePage { title: string; slug: string; template: string; front: boolean; doc: Doc }

const str = (o: unknown, k: string) => (o && typeof o === "object" && typeof (o as JsonObj)[k] === "string" ? (o as JsonObj)[k] as string : undefined);

/** A site as a template: pages (keys from their slugs), menus (items linking to a captured page get its key), header and footer. */
export function capture(id: string, title: string, description: string, brief: string, pages: SitePage[], menus: [string, Menu][],
  parts: [string, Doc][], raw: (n: El) => [string, Json][], pageUrls: Record<string, string> = {}): SiteTemplate {
  const keys: string[] = [];
  for (const p of pages) {
    const base = slugify(p.slug !== "" ? p.slug : p.title);
    let i = 1;
    let k = base;
    while (keys.includes(k)) { i++; k = `${base}-${i}`; }
    keys.push(k);
  }
  const strip = (u: string) => u.replace(/\/$/, "");
  const keyByUrl = new Map<string, string>();
  for (const [k, url] of Object.entries(pageUrls)) if (keys.includes(k)) keyByUrl.set(strip(url), k);
  const relink = (x: MenuItem): MenuItem => {
    const k = keyByUrl.get(strip(x.url));
    return { ...x, page: k ?? x.page, url: k !== undefined ? "" : x.url, children: x.children.map(relink) };
  };
  const menuKeys = new Map(menus.map(([hostId, m]) => [hostId, validKey(m.key) ? m.key : slugify(m.title)]));
  const trees = (doc: Doc): Json[] => {
    const rename = (v: JsonObj): JsonObj => {
      const c: JsonObj = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "children" ? (x as JsonObj[]).map(rename) : x]));
      if (str(c, "kind") === "navigation") { const m = str(c, "menu"); const k = m !== undefined ? menuKeys.get(m) : undefined; if (k !== undefined) c.menu = k; }
      return c;
    };
    return encodeTrees(doc, undefined, raw, false).map(rename);
  };
  return {
    id, title, description, screenshot: "", brief,
    parts: Object.fromEntries(parts.map(([area, doc]) => [area, trees(doc)])),
    menus: menus.map(([hostId, m]) => ({ ...m, key: menuKeys.get(hostId)!, items: m.items.map(relink) })),
    pages: pages.map((p, i) => ({ key: keys[i]!, title: p.title, slug: p.slug, template: p.template, front: p.front, elements: trees(p.doc) })),
    posts: [], entries: [], requires: [], presets: {}, catalog: "", settings: {},
  };
}

/** Where the storefront's routes lead on this host (SiteTemplates::shop_routes on WordPress). */
export interface Local { store: string; shop: string; account: string; track: string; category: string; brand: string }

export function localHref(at: Local, href: string): string {
  const cut = href.search(/[?#]/);
  const [path, rest] = cut < 0 ? [href, ""] : [href.slice(0, cut), href.slice(cut)];
  const under = (base: string, slug: string) => (base === "" ? undefined : `${base.replace(/\/$/, "")}/${slug}/`);
  const p = path.replace(/\/$/, "");
  const to = p === "/store" ? at.store : p === "/shop" ? at.shop : p === "/account" ? at.account : p === "/track-order" ? at.track
    : p.startsWith("/product-categories/") ? under(at.category, p.slice("/product-categories/".length))
    : p.startsWith("/brands/") ? under(at.brand, p.slice("/brands/".length)) : undefined;
  return to ? to + rest : href;
}

/** The template with its menus' and elements' links led to this host's addresses. */
export function localize(t: SiteTemplate, at: Local): SiteTemplate {
  const item = (x: MenuItem): MenuItem => ({ ...x, url: x.url === "" ? x.url : localHref(at, x.url), children: x.children.map(item) });
  const tree = (v: Json): Json => Array.isArray(v) ? v.map(tree)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as JsonObj).map(([k, x]) => [k, k === "href" && typeof x === "string" ? localHref(at, x) : tree(x)])) : v;
  return {
    ...t,
    menus: t.menus.map((m) => ({ ...m, items: m.items.map(item) })),
    pages: t.pages.map((p) => ({ ...p, elements: p.elements.map(tree) })),
    parts: Object.fromEntries(Object.entries(t.parts).map(([a, trees]) => [a, trees.map(tree)])),
  };
}
