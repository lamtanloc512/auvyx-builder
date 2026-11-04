/**
 * Site templates, element trees and content types: the Scala suites' cases (ElementJsonSuite, SiteTemplateSuite,
 * ContentModelSuite with shared/fixtures/content-types/cases.json), the Scala core itself where it can say (the MCP build's
 * insert_elements runs ElementJson.decode), and a port's real site template.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { serialize, type Doc, type El } from "../src/index";
import * as ContentModel from "../src/contentModel";
import * as ElementJson from "../src/elementJson";
import * as SiteTemplate from "../src/siteTemplate";
import fixtures from "../../../shared/fixtures/content-types/cases.json";

const ids = () => { let n = 0; return () => `e${++n}`; };
const ctx = (canScript = false): ElementJson.Context =>
  ({ newId: ids(), canScript, block: (n) => (n === "core/latest-posts" ? n : undefined), field: (k) => k === "ezy/custom" });

describe("ElementJson (ElementJsonSuite)", () => {
  test("lenient input: numbers as strings, flat styles, desktop, unknown kinds dropped", () => {
    const o = { kind: "box", children: [{ kind: "heading", level: "3", text: "T" }, { kind: "widget" }], styles: { desktop: { gap: "8px" }, mobile: { default: { gap: 4 } } } };
    const [root, rest] = ElementJson.decode(o, true, ctx())!;
    expect(root.align).toBe("full");
    expect(root.tag).toBe("section");
    expect(root.children.length).toBe(1);
    expect(rest[root.children[0]!]!.level).toBe(3);
    expect(root.styles.base?.default?.gap).toBe("8px");
    expect(root.styles.mobile?.default?.gap).toBe("4");
  });

  test("code needs the right to script; blocks must be offered by the site", () => {
    const code = { kind: "code", html: "<canvas></canvas>", js: "export default () => {}" };
    expect(ElementJson.decode(code, true, ctx())).toBeUndefined();
    expect(ElementJson.decode(code, true, ctx(true))?.[0].markup).toBe("<canvas></canvas>");
    const offered = { kind: "block", block: "core/latest-posts", attrs: { postsToShow: 3, "bad key": 1, obj: {} } };
    expect(ElementJson.decode(offered, false, ctx())?.[0].raw).toBe('<!-- wp:core/latest-posts {"postsToShow":3} /-->');
    expect(ElementJson.decode({ kind: "block", block: "x/unknown" }, false, ctx())).toBeUndefined();
  });

  test("a form keeps its fields (a list), cleaned the way Forms reads them", () => {
    const c: ElementJson.Context = { newId: ids(), block: (n) => (n === "auvyx/form" ? n : undefined) };
    const o = { kind: "block", block: "auvyx/form", attrs: { id: "book", submit: "Book", fields: [
      { name: "name", label: "Full name", kind: "text", required: true }, { name: "when", label: "Time", kind: "select", options: ["9:00", "10:00"] },
      { name: "Bad Name", kind: "text" }, { name: "x", kind: "nope" }] } };
    expect(ElementJson.decode(o, false, c)?.[0].raw).toBe(
      '<!-- wp:auvyx/form {"id":"book","fields":[{"name":"name","label":"Full name","kind":"text","required":true},{"name":"when","label":"Time","kind":"select","options":["9:00","10:00"]}],"submit":"Book","success":"Thank you. We received your message."} /-->');
  });

  test("bindings keep known fields only; loop queries normalize", () => {
    const o = { kind: "loop", query: { postType: "post", perPage: "3" }, children: [
      { kind: "heading", bind: { content: "post_title" } }, { kind: "text", bind: { content: "nope" } }, { kind: "text", bind: { content: "ezy/custom" } }] };
    const [loop, rest] = ElementJson.decode(o, false, ctx())!;
    expect(loop.query.perPage).toBe("3");
    expect(loop.children.map((c) => rest[c]!.bind.content)).toEqual(["post_title", undefined, "ezy/custom"]);
  });

  test("a block keeps its own markup only where allowed (site templates) and only for that block", () => {
    const c: ElementJson.Context = { newId: ids(), block: (n) => (n === "core/paragraph" ? n : undefined), rawMarkup: true };
    const p = { kind: "block", block: "core/paragraph", markup: "<!-- wp:paragraph -->\n<p>Hello</p>\n<!-- /wp:paragraph -->" };
    expect(ElementJson.decode(p, false, c)?.[0].raw).toBe("<!-- wp:paragraph -->\n<p>Hello</p>\n<!-- /wp:paragraph -->");
    expect(ElementJson.decode(p, false, { ...c, rawMarkup: false })?.[0].raw).toBe("<!-- wp:core/paragraph /-->");
    const other = { kind: "block", block: "core/paragraph", markup: "<!-- wp:html --><script>x</script><!-- /wp:html -->" };
    expect(ElementJson.decode(other, false, c)?.[0].raw).toBe("<!-- wp:core/paragraph /-->");
    expect(ElementJson.markupBlock('<!-- wp:woocommerce/cart {"a":1} /-->')).toBe("woocommerce/cart");
  });

  test("a site template's HTML block is kept as written where the platform has core/html, and nowhere else", () => {
    const html = { kind: "block", block: "core/html", markup: '<!-- wp:html -->\n<ul class="menu"><li>One</li></ul>\n<!-- /wp:html -->' };
    const wp: ElementJson.Context = { newId: ids(), rawMarkup: true, html: true };
    const kept = ElementJson.decode(html, false, wp)?.[0];
    expect([kept?.kind, kept?.blockName, kept?.raw]).toEqual(["Raw", "core/html", html.markup]);
    expect(ElementJson.decode(html, false, { ...wp, html: false })).toBeUndefined();
    expect(ElementJson.decode(html, false, { ...wp, rawMarkup: false })).toBeUndefined();
  });

  test("anchors, autoplay, the other platform's site pieces, behaviour classes", () => {
    expect(ElementJson.decode({ kind: "box", tag: "div", class: "tab-pane", anchor: "tab1" }, false, ctx())?.[0].anchor).toBe("tab1");
    expect(ElementJson.decode({ kind: "box", anchor: '1 bad"x' }, false, ctx())?.[0].anchor).toBe("");
    expect(ElementJson.decode({ kind: "video", src: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", autoplay: true }, false, ctx())?.[0].className).toBe("auvyx-video-autoplay");
    const ezy: ElementJson.Context = { newId: ids(), block: (n) => (["ezy/site-logo", "ezy/search", "ezy/cart-link"].includes(n) ? n : undefined) };
    const logo = ElementJson.decode({ kind: "block", block: "core/site-title", attrs: { level: 0 } }, false, ezy)?.[0];
    expect([logo?.blockName, logo?.raw]).toEqual(["ezy/site-logo", "<!-- wp:ezy/site-logo /-->"]);
    expect(ElementJson.decode({ kind: "block", block: "woocommerce/customer-account" }, false, ezy)).toBeUndefined();
    const [root, rest] = ElementJson.decode({ kind: "box", class: 'auvyx-hv auvyx-header-sticky auvyx-timer bad"<x> auvyx-hv', children: [{ kind: "navigation", class: "auvyx-nav--x", drawer: { style: "right" } }] }, true, ctx())!;
    expect(root.className).toBe("auvyx-hv auvyx-header-sticky auvyx-timer");
    expect(new Set(rest[root.children[0]!]!.className.split(" "))).toEqual(new Set(["auvyx-nav--x", "auvyx-drawer-right"]));
  });
});

// ---- the Scala core says the same (insert_elements runs ElementJson.decode) ------------------

const CORE = new URL("../../../apps/studio/packages/mcp/dist/core.js", import.meta.url).pathname;
const core = existsSync(CORE) ? await import(CORE) : null;

type Tree = Record<string, unknown> & { children?: Tree[] };
/** A tree as insert_elements' flat list. */
const flat = (trees: Tree[]): Record<string, unknown>[] => {
  const out: Record<string, unknown>[] = [];
  let n = 0;
  const walk = (t: Tree, parent?: string) => {
    const { children, ...rest } = t;
    const ref = `r${++n}`;
    out.push({ ...rest, ref, ...(parent ? { in: parent } : {}) });
    (children ?? []).forEach((c) => walk(c, ref));
  };
  trees.forEach((t) => walk(t));
  return out;
};
/** A document with ids renamed in document order, so two decoders' outputs compare. */
const canonical = (doc: Doc) => {
  const names = new Map<string, string>();
  const order: El[] = [];
  const walk = (id: string) => { const n = doc.nodes[id]; if (!n) return; names.set(id, `n${names.size + 1}`); order.push(n); n.children.forEach(walk); };
  doc.roots.forEach(walk);
  return order.map((n) => ({ ...n, id: names.get(n.id), children: n.children.map((c) => names.get(c)) }));
};

const PARITY: Record<string, Tree[]> = {
  "a page of every kind": [
    { kind: "box", tag: "header", class: "hero auvyx-hv", anchor: "top", styles: { desktop: { gap: "8px", "background-color": "blue", background: "red" }, mobile: { default: { gap: "4px" }, hover: { color: "#fff" } } }, children: [
      { kind: "heading", level: 1, text: "Hello <em>there</em>", interaction: { recipe: "link", variant: "subtle" } },
      { kind: "text", text: "Body", align: "wide" },
      { kind: "button", text: "Go", href: "/go", interaction: { recipe: "button" } },
      { kind: "image", src: "https://example.com/a.jpg", alt: "A", href: "/a" },
      { kind: "icon", icon: "no-such-icon" },
      { kind: "icon", icon: "heart" },
      { kind: "divider" },
      { kind: "video", src: "https://youtu.be/abcdefgh", frame: "9:16", autoplay: true },
      { kind: "vector", path: "M0 0L10 10", viewBox: "0 0 10 10" },
      { kind: "navigation", menu: "nav:4", toggleAt: "tablet", drawer: { style: "left", width: "wide", backdrop: "blur", fold: true } },
      { kind: "accordion", text: "Q?", children: [{ kind: "text", text: "A." }] },
      { kind: "box", tag: "script", children: [] },
    ] },
    { kind: "loop", query: { postType: "post", perPage: "99", order: "asc", bogus: "x" }, children: [
      { kind: "heading", bind: { content: "post_title", href: "post_url" } }, { kind: "image", bind: { url: "featured_image", alt: "nope" } }] },
    { kind: "block", block: "core/latest-posts", attrs: { postsToShow: 3, displayDate: true, order: "desc" } },
    { kind: "code", html: "<div id=x></div>", js: "export default () => {}", libs: ["gsap", "nope"], data: ["a"], css: "& {color:red}" },
  ],
};

describe.skipIf(!core)("ElementJson = the Scala core", () => {
  for (const [name, trees] of Object.entries(PARITY)) {
    test(name, () => {
      core.openDocument("st", JSON.stringify({ blocks: [], canScript: true, blockNames: ["core/latest-posts"] }));
      const r = JSON.parse(core.callAction("st", "insert_elements", JSON.stringify({ elements: flat(trees) })));
      expect(r.ok).toBe(true);
      const scalaDoc = JSON.parse(core.studioDocument("st")).result as Doc;
      const scalaMarkup = JSON.parse(core.markup("st")).result as string;
      core.closeDocument("st");
      const ours = ElementJson.decodePage(trees, { newId: ids(), canScript: true, block: (n) => (n === "core/latest-posts" ? n : undefined) });
      const full = (d: Doc) => canonical(d).map(({ id, kind, text, tag, level, href, styles, children, src, alt, icon, align, className, anchor, blockName, raw, bind, query, css, markup, script, libs, uses }) =>
        ({ id, kind, text, tag, level, href, styles, children, src, alt, icon, align, className, anchor, blockName, raw, bind, query, css, markup, script, libs, uses }));
      const scalaNodes = Object.fromEntries(Object.entries(scalaDoc.nodes).map(([id, n]) => [id, { text: "", tag: "section", level: 2, href: "", styles: {}, children: [], src: "", alt: "", icon: "", align: "", className: "", anchor: "", blockName: "", raw: "", bind: {}, query: {}, css: "", markup: "", script: "", libs: [], uses: [], ...n } as El]));
      expect(full(ours)).toEqual(full({ roots: scalaDoc.roots, nodes: scalaNodes }));
      expect(serialize(ours)).toBe(scalaMarkup);
    });
  }
});

// ---- SiteTemplateSuite ----------------------------------------------------------------------

const sample = JSON.stringify({
  schema: "auvyx-site/1", id: "habaki", title: "Industrial real estate",
  design: { brief: "# Brand\nPrimary: #0b3a5b" },
  parts: { header: [{ kind: "box", children: [{ kind: "navigation", menu: "main" }] }] },
  menus: [{ key: "main", title: "Main", items: [
    { label: "Home", page: "home" }, { label: "More", url: "/more/", children: [{ label: "Contact", page: "contact" }] }] }],
  pages: [
    { key: "home", title: "Trang chủ", template: "page-no-title", front: true, elements: [{ kind: "box", children: [{ kind: "heading", level: 1, text: "Kho xưởng" }] }] },
    { key: "contact", title: "Liên hệ", elements: [{ kind: "box", children: [{ kind: "text", text: "Hi" }] }] }],
});

const ok = (r: SiteTemplate.Decoded) => { if (!r.ok) throw new Error(r.error); return r.value; };

describe("SiteTemplate (SiteTemplateSuite)", () => {
  test("reads a template", () => {
    const t = ok(SiteTemplate.decode(sample));
    expect(SiteTemplate.front(t)?.key).toBe("home");
    expect(t.menus[0]!.items[1]!.children[0]!.page).toBe("contact");
    expect(t.brief.slice(0, 7)).toBe("# Brand");
  });

  test("lists every problem at once", () => {
    const bad = JSON.stringify({ schema: "auvyx-site/1", id: "Bad Id", title: "", menus: [{ key: "m", title: "M", items: [{ label: "X", page: "nope" }, { label: "" }] }],
      pages: [{ key: "a", title: "A", front: true, elements: [] }, { key: "a", title: "B", front: true, elements: [{ kind: "box" }] }] });
    const r = SiteTemplate.decode(bad);
    expect(r.ok).toBe(false);
    const why = r.ok ? "" : r.error;
    for (const p of ["id:", "title is empty", 'page "a" has no elements', 'page key "a" is used twice', "more than one front page",
      'links to page "nope"', "an item has no label", "has neither page nor url"]) expect(why).toContain(p);
    const nine = SiteTemplate.decode('{"schema":"auvyx-site/9"}');
    expect(nine.ok ? "" : nine.error).toContain("schema");
    expect(SiteTemplate.decode("not json").ok).toBe(false);
  });

  test("applying: pages become documents, navigations point at the created menu, menu links at pages", () => {
    const t = ok(SiteTemplate.decode(sample));
    const header = SiteTemplate.document(t.parts.header!, { newId: ids() }, { main: "42" });
    expect(Object.values(header.nodes).find((n) => n.kind === "Nav")?.src).toBe("42");
    const home = SiteTemplate.document(t.pages[0]!.elements, { newId: ids() });
    expect(home.nodes[home.roots[0]!]!.align).toBe("full");
    const urls = { home: "https://site/", contact: "https://site/lien-he/" };
    expect(t.menus[0]!.items.map((x) => SiteTemplate.link(x, urls))).toEqual(["https://site/", "/more/"]);
    expect(SiteTemplate.slugify("Giới thiệu & Liên hệ")).toBe("gioi-thieu-lien-he");
  });

  const site = (extra: string) =>
    `{"schema":"auvyx-site/2","id":"homes","title":"Homes","pages":[{"key":"home","title":"Home","front":true,"elements":[{"kind":"heading","text":"Hi"}]}],${extra}}`;
  const content = `"content":{"types":[{"key":"property","label":"Properties","fields":[{"key":"price","type":"money","required":true},{"key":"photo","type":"image"},{"key":"agent","type":"relation","to":"agent"}]},{"key":"agent","label":"Agents"}],
     "taxonomies":[{"key":"district","label":"Districts","types":["property"]}]}`;

  test("a template with content types and sample entries reads", () => {
    const t = ok(SiteTemplate.decode(site(content + `,"entries":[{"type":"agent","key":"ann","title":"Ann"},
      {"type":"property","key":"loft","title":"Loft","values":{"price":"320000","photo":"/wp-content/plugins/auvyx-builder/assets/a.jpg","agent":"ann"},"terms":{"district":["Ba Đình"]}}]`)));
    expect(t.content?.types.map((x) => x.key)).toEqual(["property", "agent"]);
    expect(t.entries.map((e) => e.key)).toEqual(["ann", "loft"]);
  });

  test("entries are checked against their types", () => {
    const r = SiteTemplate.decode(site(content + `,"entries":[{"type":"room","key":"r1","title":"R"},
      {"type":"property","key":"p1","title":"P","values":{"price":"cheap","photo":12,"agent":"bob","nope":1},"terms":{"floor":["1"]}}]`));
    const errors = r.ok ? "" : r.error;
    for (const e of ['entries[0]: no content type "room" in content', "entries[1].values.nope: no such field in property",
      "entries[1].values.price: price: not a valid price", "entries[1].values.photo: picture and file values are addresses",
      'entries[1].values.agent: no agent entry "bob" in entries', "entries[1].terms.floor: no such taxonomy on property"]) expect(errors).toContain(e);
    const broken = SiteTemplate.decode(site(`"content":{"types":[{"key":"post"}]}`));
    expect(broken.ok ? "" : broken.error).toContain("content.types[0].key: reserved");
  });

  // A port's own site template (ports/*/theme/site-templates), as WordPress serves it.
  const ports = new URL("../../../ports/", import.meta.url).pathname;
  const files = existsSync(ports) ? readdirSync(ports).flatMap((p) => {
    const dir = `${ports}${p}/theme/site-templates`;
    return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => `${dir}/${f}`) : [];
  }) : [];
  test.skipIf(!files.length)("the ports' site templates read, and their pages become documents with what WordPress keeps", () => {
    for (const file of files) {
      const t = ok(SiteTemplate.decode(readFileSync(file, "utf8")));
      expect(t.pages.length).toBeGreaterThan(0);
      for (const p of t.pages) {
        const doc = SiteTemplate.document(p.elements, { newId: ids(), rawMarkup: true, html: true, block: () => undefined });
        expect(doc.roots.length).toBeGreaterThan(0);
        // every core/html block is kept as written, and the page writes back as block markup
        expect(Object.values(doc.nodes).filter((n) => n.kind === "Raw").every((n) => n.blockName === "core/html" && n.raw.startsWith("<!-- wp:html"))).toBe(true);
        expect(serialize(doc).length).toBeGreaterThan(0);
      }
    }
  });
});

// ---- ContentModelSuite (shared fixtures, also run by the Studio and PHP) ---------------------

const fieldOf = (v: Record<string, unknown>): ContentModel.Field => {
  const target = typeof v.to === "string" ? [{ key: v.to }] : [];
  const r = ContentModel.validate({ types: [{ key: "fixture", fields: [v] }, ...target] });
  if (!r.ok) throw new Error(`fixture field refused: ${r.errors}`);
  return r.value.types[0]!.fields[0]!;
};

describe("ContentModel (shared/fixtures/content-types)", () => {
  for (const c of fixtures.validate as { name: string; input: unknown; expected?: unknown; errors?: string[] }[]) {
    test(`validate: ${c.name}`, () => {
      const got = ContentModel.validate(c.input);
      if (c.expected) expect(got.ok ? ContentModel.toJson(got.value) : got.errors).toEqual(c.expected as Record<string, unknown>);
      else expect(got.ok ? null : got.errors).toEqual(c.errors!);
    });
  }
  for (const c of fixtures.values as { name: string; field: Record<string, unknown>; value: unknown; kept?: unknown; empty?: boolean; error?: string }[]) {
    test(`value: ${c.name}`, () => {
      const got = ContentModel.sanitize(fieldOf(c.field), c.value);
      if ("kept" in c) expect(got).toEqual({ ok: true, value: c.kept });
      else if (c.empty) expect(got).toEqual({ ok: true, value: undefined });
      else expect(got).toEqual({ ok: false, error: c.error! });
    });
  }
  for (const c of fixtures.display as { name: string; field: Record<string, unknown>; value: unknown; text: string }[]) {
    test(`display: ${c.name}`, () => expect(ContentModel.display(fieldOf(c.field), c.value)).toBe(c.text));
  }
  test("merge replaces by key and keeps the rest; a definition survives its own JSON; bindings", () => {
    const p = (s: string) => { const r = ContentModel.parse(s); if (!r.ok) throw new Error(r.errors.join()); return r.value; };
    const merged = ContentModel.merge(p('{"types":[{"key":"room"},{"key":"hall"}]}'), p('{"types":[{"key":"room","label":"Rooms","fields":[{"key":"beds","type":"number"}]},{"key":"spa"}]}'));
    expect(merged.types.map((t) => t.key)).toEqual(["room", "hall", "spa"]);
    expect(ContentModel.typeOf(merged, "room")?.fields.map((f) => f.key)).toEqual(["beds"]);
    const d = ContentModel.validate(fixtures.validate[0]!.input);
    if (!d.ok) throw new Error("fixture");
    expect(ContentModel.validate(ContentModel.toJson(d.value))).toEqual(d);
    const b = ContentModel.bindings(d.value.types[0]!);
    expect(b.map((x) => x.key).slice(0, 2)).toEqual(["property/price", "property/area"]);
    expect(b.find((x) => x.key === "property/photos")?.shape).toBe("Image");
  });
});
