/**
 * Site templates for the agent (U/SiteTemplateOps.scala, U/ContentOps.install): list, read, save, capture this site,
 * delete and apply a template, through the same endpoints as the Studio's WordPress host. Applying builds the design
 * brief, the demo catalog, content types and sample entries, menus, pages, posts, the menus' items, header and footer,
 * then the front page; a step that fails is reported and the rest goes on. Nothing is deleted.
 */
import * as SiteTemplate from "../../../../packages/editor-core/src/siteTemplate";
import * as ContentModel from "../../../../packages/editor-core/src/contentModel";
import { capture, encodeTemplate, localize } from "./agentCore";
import * as Site from "./agentSite";
import { elementContext, get, list, read } from "./siteTemplates";
import * as Content from "./content.svelte";
import { config } from "./config";
import { uploadMedia } from "./host";

type T = SiteTemplate.SiteTemplate;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const available = () => !!config.siteTemplates && !!config.restRoot;

export interface Report { done: string[]; failed: string[] }
const text = (r: Report) => [...r.done.map((d) => `✓ ${d}`), ...r.failed.map((f) => `✗ ${f}`)].join("\n");

export const menuTitle = (t: T, m: SiteTemplate.Menu) => `${m.title} · ${t.title}`;
const catalogOf = (t: T) => (t.catalog !== "" ? t.catalog : t.id);

/** A template picture uploaded to the site's media library: its id there. */
async function upload(url: string): Promise<number | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    const name = url.split("/").pop()?.split(/[?#]/)[0] || "picture.jpg";
    const type = (res.headers.get("content-type") ?? "").split(";")[0] || "image/jpeg";
    const m = await uploadMedia(new File([blob], name, { type }));
    return m.id;
  } catch { return undefined; }
}

/** ContentOps.install: the template's types merged into the site, then its sample entries (pictures uploaded, links second). */
async function installContent(t: T, done: (l: string) => void, bad: (l: string) => void) {
  if (!t.content) return;
  if (!Content.available()) { bad("Content types: this platform cannot add them here"); return; }
  const defn = t.content;
  try {
    const base = await Content.store.definition();
    const saved = await Content.store.save(ContentModel.merge(base, defn));
    Content.content.definition = saved;
  } catch (e) { bad(`Content types: ${msg(e)}`); return; }
  done(`Content types: ${defn.types.map((x) => x.label).join(", ")}`);
  const uploads = new Map<string, Promise<number | undefined>>();
  const media = (u: string) => { let p = uploads.get(u); if (!p) { p = upload(u); uploads.set(u, p); } return p; };
  const ids = new Map<string, string>();
  for (const e of t.entries) {
    const ct = ContentModel.typeOf(defn, e.typeKey);
    if (!ct) continue;
    const values: Record<string, unknown> = {};
    for (const f of ct.fields) {
      const v = e.values[f.key];
      if (v === undefined) continue;
      if (["image", "gallery", "file"].includes(f.kind)) {
        const urls = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : [];
        const got = (await Promise.all(urls.map(media))).filter((x): x is number => x !== undefined);
        if (got.length) values[f.key] = f.kind === "gallery" ? got : got[0];
      } else if (f.kind !== "relation") values[f.key] = v;
    }
    try {
      const s = await Content.store.saveEntry(ct.key, { id: "", title: e.title, status: "publish", content: "", excerpt: e.excerpt, image: e.image, values, terms: e.terms, url: "", editUrl: "" });
      ids.set(`${ct.key}\u0000${e.key}`, s.id);
    } catch (err) { bad(`${ct.singular} “${e.title}”: ${msg(err)}`); }
  }
  done(`${ids.size} sample entries`);
  for (const e of t.entries) {
    const ct = ContentModel.typeOf(defn, e.typeKey);
    const id = ct ? ids.get(`${ct.key}\u0000${e.key}`) : undefined;
    if (!ct || !id) continue;
    const rels = ct.fields.filter((f) => f.kind === "relation" && e.values[f.key] !== undefined).map((f) => {
      const v = e.values[f.key];
      const keys = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : [];
      const targets = keys.flatMap((k) => { const x = ids.get(`${f.to}\u0000${k}`); return x && /^\d+$/.test(x) ? [Number(x)] : []; });
      return [f.key, f.multiple ? targets : targets[0] ?? null] as const;
    });
    if (!rels.length) continue;
    try {
      const cur = await Content.store.entry(ct.key, id);
      await Content.store.saveEntry(ct.key, { ...cur, values: { ...cur.values, ...Object.fromEntries(rels) } });
    } catch (err) { bad(`${ct.singular} links: ${msg(err)}`); }
  }
}

/** Builds the template on this site (SiteTemplateOps.applyHere; WordPress applies blueprints the same way). */
export async function apply(template: T, applyBrief: (md: string) => Promise<{ ok: boolean; text: string }>): Promise<Report> {
  const routes = Site.shopRoutes();
  const t = routes ? localize(template, { store: routes.store ?? "", shop: routes.shop ?? "", account: routes.account ?? "", track: routes.track ?? "", category: routes.category ?? "", brand: routes.brand ?? "" }) : template;
  const done: string[] = [], bad: string[] = [];
  const note = async <A>(label: string, p: Promise<A>): Promise<A | undefined> => {
    try { const v = await p; done.push(label); return v; } catch (e) { bad.push(`${label}: ${msg(e)}`); return undefined; }
  };
  const base = elementContext();
  const ctx = { ...base, field: (k: string) => base.field!(k) || Content.isContentField(k, t.content) };
  const pageTemplates = new Set(Site.pageTemplates().map(([s]) => s));
  if (t.brief.trim() !== "") {
    const r = await applyBrief(t.brief);
    if (r.ok) done.push("Design brief applied"); else bad.push(`Design brief applied: ${r.text.replace(/^Not applied: /, "")}`);
  }
  try {
    const names = await Site.importCatalog(catalogOf(t));
    if (names.length) done.push(`${names.length} demo products imported`);
  } catch (e) { bad.push(`Demo products: ${msg(e)}`); }
  await installContent(t, (l) => done.push(l), (l) => bad.push(l));
  const menuIds = new Map<string, number>();
  if (t.menus.length) {
    if (!Site.canEditMenus()) bad.push("Menus: this platform cannot create menus here");
    else for (const m of t.menus) {
      try { menuIds.set(m.key, (await Site.menus.save({ id: 0, title: menuTitle(t, m), items: [] })).id); } catch { /* reported with its items below */ }
    }
  }
  const navs = Object.fromEntries([...menuIds].map(([k, id]) => [k, `nav:${id}`]));
  const created: [SiteTemplate.Page, Site.CreatedPage][] = [];
  for (const p of t.pages) {
    const doc = SiteTemplate.document(p.elements, ctx, navs);
    if (!doc.roots.length) { bad.push(`Page “${p.title}”: nothing in it this site can show (its blocks are not available here)`); continue; }
    const c = await note(`Page “${p.title}”`, Site.createPage(p.title, doc, pageTemplates.has(p.template) ? p.template : "", true, t.title));
    if (c) created.push([p, c]);
  }
  if (t.posts.length) {
    if (!Site.canCreatePosts()) bad.push("Posts: this platform cannot create posts here");
    else for (const p of t.posts) await note(`Post “${p.title}”`, Site.createPost(p.title, p.excerpt, p.image, SiteTemplate.document(p.elements, ctx, navs), t.title, p.categories, p.date));
  }
  const pageIds = new Map(created.map(([p, c]) => [p.key, c]));
  const urls = Object.fromEntries([...pageIds].map(([k, c]) => [k, c.viewUrl]));
  if (Site.canEditMenus()) {
    const node = (x: SiteTemplate.MenuItem): Site.MenuNode => {
      const target = pageIds.get(x.page);
      return { label: x.label, url: SiteTemplate.link(x, urls), kind: target ? "post-type" : "custom", type: target ? "page" : "", id: target ? Number.parseInt(target.id, 10) || 0 : 0,
        mega: x.mega, description: "", children: x.children.map(node), panel: 0 };
    };
    for (const m of t.menus.filter((m) => menuIds.has(m.key)))
      await note(`Menu “${menuTitle(t, m)}”`, Site.menus.save({ id: menuIds.get(m.key)!, title: menuTitle(t, m), items: m.items.map(node) }));
  }
  for (const [area, trees] of Object.entries(t.parts)) await note(`The site's ${area}`, Site.savePart(area, SiteTemplate.document(trees, ctx, navs)));
  const front = t.pages.find((p) => p.front);
  const page = front ? pageIds.get(front.key) : undefined;
  if (page) await note(`Front page: “${page.title}”`, Site.setFront(page.id));
  return { done, failed: bad };
}

/** This site as a template: its pages, menus, header, footer and design brief. */
async function captureSite(id: string, title: string, description: string, brief: string) {
  const ms: [string, SiteTemplate.Menu][] = [];
  if (Site.canEditMenus()) {
    try {
      const { menus } = await Site.menus.load();
      const item = (n: Site.MenuNode): SiteTemplate.MenuItem => ({ label: n.label, page: "", url: n.url, mega: n.mega, children: n.children.map(item), from: "" });
      for (const m of menus) ms.push([`nav:${m.id}`, { key: "", title: m.title, items: m.items.map(item) }]);
    } catch { /* no menus */ }
  }
  const snap = await Site.siteSnapshot();
  const pages = snap.pages.filter((p) => p.doc.roots.length > 0);
  return capture(id, title, description, brief, pages.map((p) => ({ title: p.title, slug: p.slug, template: p.template, front: p.front, doc: p.doc })), ms, snap.parts,
    (n) => [["markup", n.raw]], Object.fromEntries(pages.map((p) => [SiteTemplate.slugify(p.slug !== "" ? p.slug : p.title), p.url])));
}

/** The agent's site_template tool: list | get | save | capture | delete | apply. */
export async function tool(action: string, json: string, brief: () => string, applyBrief: (md: string) => Promise<{ ok: boolean; text: string }>): Promise<{ ok: boolean; text: string }> {
  if (!available()) return { ok: false, text: "Site templates are not available on this site (or for this user)." };
  const arg = (k: string) => { try { const v = (JSON.parse(json) as Record<string, unknown>)[k]; return v === undefined || v === null ? "" : typeof v === "string" ? v : String(v); } catch { return ""; } };
  try {
    switch (action) {
      case "list": {
        const items = await list();
        return { ok: true, text: items.length ? items.map((i) => `${i.id}: ${i.title}${i.builtIn ? " (built in)" : ""} — ${i.description.slice(0, 100)} [pages: ${i.pages.join(", ")}]`).join("\n") : "(no site templates yet)" };
      }
      case "get": return { ok: true, text: await get(arg("id")) };
      case "save": {
        const d = SiteTemplate.decode(json);
        if (!d.ok) return { ok: false, text: `Not saved, fix: ${d.error}` };
        const t = d.value;
        const sum = await Site.saveTemplate(encodeTemplate(t));
        return { ok: true, text: `Saved “${String(sum.title ?? t.title)}” (${String(sum.id ?? t.id)}) with ${t.pages.length} page(s), ${t.menus.length} menu(s)${Object.keys(t.parts).length ? `, ${Object.keys(t.parts).join(" and ")}` : ""}.` };
      }
      case "capture": {
        const id = SiteTemplate.validKey(arg("id")) ? arg("id") : SiteTemplate.slugify(arg("title"));
        const t = await captureSite(id, arg("title") || id, arg("description"), brief());
        const problems = SiteTemplate.check(t);
        if (problems.length) return { ok: false, text: `The site cannot be saved as a template: ${problems.join("; ")}` };
        const sum = await Site.saveTemplate(encodeTemplate(t));
        return { ok: true, text: `Saved this site as “${String(sum.title ?? t.title)}” (${String(sum.id ?? t.id)}): ${t.pages.map((p) => p.title).join(", ")}; ${t.menus.length} menu(s).` };
      }
      case "delete": await Site.removeTemplate(arg("id")); return { ok: true, text: `Deleted ${arg("id")}.` };
      case "apply": {
        const d = read(await get(arg("id")));
        if (!d.ok) return { ok: false, text: `The template has problems: ${d.error}` };
        const r = await apply(d.value, applyBrief);
        return { ok: r.failed.length === 0, text: `Applied “${d.value.title}”:\n${text(r)}` };
      }
      default: return { ok: false, text: `Unknown action "${action}": list, get, save, capture, delete or apply.` };
    }
  } catch (e) { return { ok: false, text: msg(e) }; }
}

export { encodeTemplate };
