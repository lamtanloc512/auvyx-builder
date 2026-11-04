/**
 * HtmlRenderer and WebExport ("Export section" / "Export page") write what Auvyx Studio writes: the same document goes through
 * the Scala core (the MCP build, apps/studio/packages/mcp/dist/core.js: `renderHtml`, `webExport`) and through editor-core,
 * and the HTML, the CSS and every exported section are compared byte for byte (or the refusal's message).
 * The trees are parity.test.ts's, plus cases the export reaches that saving does not.
 */
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { DocJson, HtmlRenderer, WebExport, decodeTree, type Doc, type TreeNode } from "../src/index";

const CORE = new URL("../../../apps/studio/packages/mcp/dist/core.js", import.meta.url).pathname;
const core = existsSync(CORE) ? await import(CORE) : null;
const hasExport = !!core && typeof core.webExport === "function";

const st = (decls: Record<string, string>, bp = "base", state = "default") => ({ [bp]: { [state]: decls } });

const slides = JSON.stringify([
  { eyebrow: "New", title: "Fall “26” <b>", body: "Line\nbreak", button: "Shop", href: "/shop", image: "https://x.test/a.jpg",
    color: "var(--wp--preset--color--auvyx-surface)", hover: "zoom", depth: "250", posX: "-5", posY: "7x", target: "_blank", imageHref: "javascript:alert(1)", animate: "fade" },
  { title: "Bad colour", color: "red", image: "https://x.test/has space.jpg", href: "mailto:a@b.c", depthHover: "12", parallax: "abc" },
  { title: "Hex", color: "#112233", image: "/local\u0085x.jpg", href: "HTTPS://ok.test/p?q=1" },
]);

const PAGES: Record<string, TreeNode[]> = {
  "a hero": [{
    block: "auvyx/section", tag: "header", className: "hero auvyx-ui-hero", anchor: "top", label: "Hero",
    styles: { ...st({ padding: "64px 24px", display: "flex" }), ...st({ padding: "32px 16px" }, "mobile") },
    children: [
      { block: "auvyx/heading", level: 1, text: "Fall <em>’26</em> & more", styles: st({ "font-size": "56px" }) },
      { block: "auvyx/text", text: "Quiet clothes — made to last.", align: "wide" },
      { block: "auvyx/button", text: "Shop", href: "/shop?a=1&b=\"2\"", target: "_blank", styles: st({ color: "#fff" }, "base", "hover") },
      { block: "auvyx/image", src: "https://images.unsplash.com/photo-1?w=800&q=80", alt: "A \"coat\"", mediaId: 12, href: "/coat" },
      { block: "auvyx/image", src: "/x.jpg", alt: "" },
      { block: "auvyx/divider" },
    ],
  }],
  "nested sections, accordion, dynamic blocks": [
    { block: "auvyx/section", tag: "div", locked: true, css: ".x{color:red}", children: [
      { block: "auvyx/accordion", text: "Shipping?", children: [{ block: "auvyx/text", text: "Free over <b>$50</b> --> fast" }] },
      { block: "auvyx/icon", icon: "star", href: "/stars" },
      { block: "auvyx/video", src: "https://example.com/v.mp4" },
      { block: "auvyx/section", children: [] },
    ] },
    { block: "auvyx/heading", level: 9, text: "clamped" },
    { block: "auvyx/section", tag: "script", children: [] },
  ],
  "platform blocks stay verbatim": [
    { block: "core/paragraph", raw: "<!-- wp:paragraph -->\n<p>Hi</p>\n<!-- /wp:paragraph -->", html: "<p>Hi</p>" },
    { block: "core/spacer", raw: '<!-- wp:spacer {"height":"40px"} /-->', styles: st({ margin: "0 auto" }) },
    { block: "core/latest-posts", raw: "<!-- wp:latest-posts /-->", styles: st({ gap: "12px" }) },
    { block: "core/archives", raw: '<!-- wp:archives {"auvyx":{"v":1}} /-->', styles: st({ gap: "4px" }) },
    { block: "core/search", raw: "\n <!-- wp:search {} /-->\n", styles: st({ gap: "2px" }) },
    { block: "core/rss", raw: "<!-- wp:rss /--> ", styles: st({ gap: "3px" }) },
    { block: "core/calendar", raw: "<!-- wp:calendar /-->", styles: st({ gap: "5px" }) },
    { block: "auvyx/section", styles: st({ "not-a-property": "1", color: "url(javascript:alert(1))" }), children: [] },
  ],
  "posts loops and their queries": [
    { block: "auvyx/loop", children: [{ block: "auvyx/heading", text: "Title", bind: { content: "post_title", href: "post_url" } }] },
    { block: "auvyx/loop", query: { postType: "product", perPage: 99, offset: "-4", orderBy: "popularity", order: "ASC", inherit: true, excludeCurrent: "true",
      paginate: false, taxonomy: "product_cat", terms: " shoes , Bad Term ,a%20b,", source: "woo/related", include: " 12,abc, 7 ,12,12345678901", more: "button" },
      children: [{ block: "auvyx/image", bind: { url: "featured_image", alt: "featured_image_alt", href: "nope" } }] },
    { block: "auvyx/loop", query: { postType: "Not Valid!", perPage: "x", orderBy: "rand", source: "Bad Source", more: "pages", taxonomy: "a".repeat(40) }, children: [] },
    { block: "auvyx/loop", query: { perPage: "+7", offset: "2147483648", include: "" }, children: [] },
  ],
  "carousels": [
    { block: "auvyx/carousel" },
    { block: "auvyx/carousel", query: { layout: "split", size: "third", height: "640", arrows: "off", gap: "24px", slides, extra: "dropped" }, align: "full" },
    { block: "auvyx/carousel", query: { layout: "weird", size: "x", height: "500", arrows: "maybe", gap: "1234px", slides: "{not json" } },
    { block: "auvyx/carousel", query: { slides: JSON.stringify([{ title: 5 }]) } },
    { block: "auvyx/carousel", query: { slides: JSON.stringify(Array.from({ length: 14 }, (_, i) => ({ title: `S${i}`, eyebrow: "é".repeat(100) }))) } },
  ],
  "navigation and vectors": [
    { block: "auvyx/nav", src: "menu:4", alt: "tablet" },
    { block: "auvyx/nav", src: "pages", alt: "mobile" },
    { block: "auvyx/nav", src: "nav:9", alt: "sometimes", className: "main-nav" },
    { block: "auvyx/vector", src: "M0 0 L100 100 Z", alt: "0 0 200 50" },
    { block: "auvyx/vector", src: "M0 0 <script>", alt: " 0 0 100 100 " },
    { block: "auvyx/vector", src: "M1 1", alt: "-1.5 2 3.25\t4" },
    { block: "auvyx/vector", src: "m1,2c3e2-1", alt: "1 2 3" },
    { block: "auvyx/vector", alt: "\u000b0 0 10 10\u0001" },
  ],
  "code snippets": [
    { block: "auvyx/snippet", text: "import x from 'y'\nconst s = \"a\\\"b\" // note\nselect * from t where a = `q` -- c", alt: "js" },
    { block: "auvyx/snippet", text: "SELECT <b> & \"x\"", alt: "sql", className: "auvyx-snippet--light extra" },
    { block: "auvyx/snippet", text: "", className: "auvyx-snippet auvyx-snippet--dark", anchor: "c1", align: "wide" },
    { block: "auvyx/snippet", text: "éselect as_ AS 'open \\' quote\n'", alt: "a\"b" },
    { block: "auvyx/snippet", text: "x = 'line\u0085break' + 'two lines'", alt: "py" },
  ],
  "bindings on every bindable kind": [
    { block: "auvyx/heading", text: "H", bind: { href: "site_url", content: "site_title", extra: "post_title" } },
    { block: "auvyx/text", text: "T", bind: { content: "meta:subtitle" } },
    { block: "auvyx/text", text: "T", bind: { content: "meta:_secret" } },
    { block: "auvyx/text", text: "T", bind: { content: "meta: padded " } },
    { block: "auvyx/button", text: "B", bind: { url: "product_add_to_cart_url", text: "woo/price_html" } },
    { block: "auvyx/button", text: "B", bind: { url: "store/page_path", text: "store/not_a_field" } },
    { block: "auvyx/image", bind: { url: "store/category_banner", alt: "store/category_banner_alt", href: "meta:" } },
    { block: "auvyx/section", bind: { content: "post_title" }, children: [] },
  ],
  "code elements and games": [
    { block: "auvyx/section", tag: "div", className: "auvyx-code", code: { markup: "<canvas></canvas>", script: "export default ({ el }) => {}\n</script>",
      libs: [" gsap ", "three", "evil", "gsap"], uses: ["products", "posts"] } },
    { block: "auvyx/section", code: { markup: "<b>only markup</b>" }, children: [{ block: "auvyx/text", text: "kept" }] },
    { block: "auvyx/section", className: "auvyx-code", children: [] },
    { block: "auvyx/section", className: "auvyx-game", game: "gabc123def45", label: "Play" },
    { block: "auvyx/text", game: "ignored", code: { markup: "ignored" } },
  ],
  "sandboxed custom code": [
    { block: "auvyx/section", tag: "div", label: "Custom code", sandbox: { html: "<p>hi</p>", css: "p{color:red}", js: "console.log('</script>')", allow: ["https://a.test", "https://b.test"] },
      styles: st({ "min-height": "240px", width: "100%" }), children: [{ block: "auvyx/text", text: "never saved" }] },
    { block: "auvyx/section", className: "auvyx-sandbox", sandbox: { html: "x".repeat(20010), allow: "https://c.test" } },
    { block: "auvyx/section", className: "auvyx-sandbox", children: [] },
    { block: "auvyx/heading", text: "Not a section", sandbox: { html: "<i>h</i>" } },
  ],
  "runtime blocks with defs and presets": [
    { block: "core/paragraph", raw: "<!-- wp:paragraph -->\n<p>first</p>\n<!-- /wp:paragraph -->", defs: [{ id: "on-raw", label: "On raw", groups: ["space"] }] },
    {
      block: "auvyx/section", tag: "div", className: "auvyx-runtime", label: "Stat",
      defs: [
        { id: "stat", label: " Stat ", container: false, props: [{ name: "value", type: "integer" }, { name: "tone", type: "enum", values: ["calm", " loud ", ""] }], groups: ["typography", "space"] },
        { id: "bad-groups", label: "Bad", groups: ["nope"] },
        { id: "", label: "No id", groups: ["space"] },
        { id: "card", label: "Card", container: true, props: [{ name: "title", type: "string" }], groups: ["fill", "layout"] },
        { id: "stat", label: "Duplicate", groups: ["space"] },
      ],
      presets: [
        { preset: "stats-row", label: "Stats row", blocks: [{ kind: "stat", props: { value: "12", tone: "calm" }, style: { color: "var(--wp--preset--color--auvyx-primary)" } }, { kind: "heading", props: { text: "Hi", level: 3 } }] },
        { id: "landing", label: "Landing", sections: ["hero-centered", "faq"] },
        { id: "both", label: "Both", sections: ["faq"], blocks: [{ kind: "text" }] },
        { id: "raw-color", label: "Raw", blocks: [{ kind: "text", style: { color: "#fff" } }] },
        { id: "hero-centered", label: "Reserved" },
        { id: "Bad Id", label: "x", sections: ["faq"] },
        { id: "unknown-kind", label: "x", blocks: [{ kind: "nope" }] },
        { id: "bad-int", label: "x", blocks: [{ kind: "stat", props: { value: "1.5" } }] },
      ],
      runtime: { id: "stat", label: "Stat", props: [{ name: "value", type: "integer" }, { name: "tone", type: "enum", values: ["calm", "loud"] }], groups: ["typography", "space"], fields: { value: "42", tone: "loud" } },
      children: [{ block: "auvyx/text", text: "42", label: "value" }],
    },
    { block: "auvyx/section", runtime: { id: "inline", label: "Inline", container: true, groups: ["layout"], fields: { a: 1, b: null } }, children: [
      { block: "auvyx/section", runtime: { id: "nested", label: "Nested", groups: ["fill"] }, children: [] },
    ] },
    { block: "auvyx/section", runtime: { id: "broken", label: "Broken", groups: [] }, children: [] },
  ],
  "unicode, emoji and control characters": [
    { block: "auvyx/section", label: "Ünï 🎉 \u0001\u001f\u007f   \"q\" \\ </x> -- & <", css: "   ", anchor: "a\"<&>", className: "c\u0000d", children: [
      { block: "auvyx/heading", text: "Emoji 👩‍👩‍👧 \ud83d lone", label: "tab\there\nnew\rline\b\f" },
      { block: "auvyx/button", text: "Go", href: "/ü?x=\"1\"&y=<2>", label: "\ud800" },
      { block: "auvyx/icon", icon: "héart", href: "javascript:--x" },
      { block: "auvyx/video", src: "https://v.test/é.mp4?a=1&b=2" },
    ] },
    { block: "auvyx/text", text: "\u0000 nul", css: "\t\n" },
  ],
  "loose input shapes": [
    { block: "auvyx/heading", level: "4", text: 12, label: true, mediaId: "3" },
    { block: "auvyx/heading", level: 1e10, text: null },
    { block: "auvyx/heading", level: "abc", anchor: 0 },
    { block: "auvyx/image", mediaId: 7.9, src: ["a", "b"], alt: { x: 1 } },
    { block: "auvyx/image", mediaId: -3 },
    { block: "auvyx/section", locked: "true", styles: { base: { default: { padding: 8, margin: 1.5, gap: true } }, "Bad BP": { default: { gap: "1px" } } }, children: [] },
    { block: "auvyx/section", children: [5 as unknown as TreeNode, { block: "auvyx/text", text: "after" }] },
    { block: "auvyx/snippet", text: "x", alt: 7 },
  ],
};


const sq = (r: string) => st({ "border-radius": r });
PAGES["export: modes, sliders, tabs, colours, corners"] = [
  { block: "auvyx/section", className: "auvyx-shadow hero", styles: { ...st({ color: "var(--wp--preset--color--auvyx-primary)", "background-color": "#fff", "font-size": "var(--wp--preset--font-size--auvyx-lg)" }), ...st({ padding: "4px" }, "mobile") },
    children: [
      { block: "auvyx/heading", text: "</style><script>x</script>", styles: st({ color: " var(--wp--preset--color--auvyx-accent) " }) },
      { block: "auvyx/button", text: "Round", href: "https://a.test", styles: sq("12px") },
      { block: "auvyx/button", text: "Pill", href: "tel:123", styles: sq("9999px") },
      { block: "auvyx/button", text: "Square", href: "mailto:a@b.c", styles: sq("0 0") },
      { block: "auvyx/button", text: "Default", href: "javascript:alert(1)" },
      { block: "auvyx/image", src: "https://x.test/a.png", alt: "a", styles: sq("50%") },
      { block: "auvyx/image", src: "data:image/png;base64,xx", alt: "bad" },
      { block: "auvyx/text", text: "own flag", className: "has-text-color", styles: st({ color: "red", "background-color": "blue" }) },
    ] },
  { block: "auvyx/section", className: "auvyx-isolated auvyx-tabs", css: "& { color: red } @keyframes spin { to { transform: rotate(1turn) } }", children: [
    { block: "auvyx/section", styles: st({ display: "flex", "scroll-snap-type": " x mandatory" }), anchor: "s", children: [{ block: "auvyx/text", text: "slide" }] },
    { block: "auvyx/section", styles: st({ "scroll-snap-type": "x mandatory" }, "tablet", "default"), children: [] },
  ] },
  { block: "auvyx/section", className: "auvyx-follow plain auvyx-ui-x auvyx-variant-a auvyx-sf-header-builder auvyx-sf-footer-col auvyx-sf-header-is-sticky 9bad", children: [
    { block: "auvyx/nav", text: "Home", href: "/", alt: "Main" },
    { block: "auvyx/nav" },
  ] },
  { block: "auvyx/section", className: "auvyx-shadow", children: [{ block: "auvyx/carousel", query: { slides } }] },
];
PAGES["export: videos"] = [
  { block: "auvyx/section", children: [
    { block: "auvyx/video", src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", alt: "Rick" },
    { block: "auvyx/video", src: "https://vimeo.com/123456789" },
    { block: "auvyx/video", src: " https://v.test/a.webm ", className: "auvyx-video-autoplay" },
    { block: "auvyx/video", src: "https://youtu.be/dQw4w9WgXcQ", className: "auvyx-video-autoplay" },
    { block: "auvyx/video", src: "https://vimeo.com/video/12345", className: "auvyx-video-autoplay" },
    { block: "auvyx/video", src: "https://x.test/page", className: "auvyx-video-autoplay" },
    { block: "auvyx/video", src: "https://youtu.be/dQw4w9WgXcQ", className: "auvyx-bg-video" },
    { block: "auvyx/video", src: "https://youtu.be/dQw4w9WgXcQ", className: "auvyx-bg-video auvyx-video-autoplay" },
    { block: "auvyx/video", src: "https://vimeo.com/12345", className: "auvyx-bg-video" },
    { block: "auvyx/video", src: "https://vimeo.com/12345", className: "auvyx-bg-video auvyx-video-autoplay" },
    { block: "auvyx/video", src: "https://v.test/a.mp4?x=1", className: "auvyx-bg-video" },
    { block: "auvyx/video", src: "nope", className: "auvyx-bg-video" },
    { block: "auvyx/video", src: "/local.mp4", styles: sq("4px") },
  ] },
];
PAGES["export: a raw block refuses"] = [
  { block: "auvyx/section", children: [{ block: "auvyx/text", text: "ok" }] },
  { block: "core/paragraph", raw: "<!-- wp:paragraph -->\n<p>Hi</p>\n<!-- /wp:paragraph -->", html: "<p>Hi</p>" },
];
PAGES["export: of several raw blocks, the one Scala's map finds first is named"] = [
  ...Array.from({ length: 9 }, (_, i) => ({ block: "auvyx/section", children: [{ block: "auvyx/text", text: `t${i}` }] })),
  ...Array.from({ length: 7 }, (_, i) => ({ block: `core/b${i}`, raw: `<!-- wp:b${i} /-->` })),
];
PAGES["export: raw blocks between sections"] = Array.from({ length: 14 }, (_, i) =>
  i % 3 === 1 ? { block: `core/r${i}`, raw: `<!-- wp:r${i} /-->` } : { block: "auvyx/section", anchor: `s${i}`, children: [] });
PAGES["export: renderable loops, carousels, vectors, sandboxes, bindings"] = [
  { block: "auvyx/section", className: "auvyx-shadow", children: [
    { block: "auvyx/loop", query: { postType: "product", perPage: "4" }, children: [{ block: "auvyx/heading", text: "Title", bind: { content: "post_title", href: "post_url" } }] },
    { block: "auvyx/carousel", query: { layout: "split", size: "third", height: "640", arrows: "off", gap: "24px", slides }, align: "full" },
    { block: "auvyx/carousel", query: { layout: "centered", size: "half", slides: JSON.stringify([{ title: "A", depth: "33", depthHover: "7", parallax: "12", posX: "101", image: "/a.jpg", imageHref: "/x", target: "_blank", animate: "up", hover: "darken" }]) } },
    { block: "auvyx/vector", src: "M0 0 L100 100 Z", alt: "0 0 200 50" },
    { block: "auvyx/vector", src: "m1,2c3e2-1", alt: "1 2 3" },
    { block: "auvyx/text", text: "T", bind: { content: "meta:subtitle" } },
    { block: "auvyx/button", text: "B", bind: { url: "product_add_to_cart_url" }, target: "_blank", href: "/cart" },
    { block: "auvyx/image", src: "/x.jpg", bind: { url: "store/category_banner", alt: "store/category_banner_alt" } },
  ] },
  { block: "auvyx/section", tag: "div", label: "Custom code", sandbox: { html: "<p>hi</p>", css: "p{color:red}</STYLE>", js: "console.log('</script>')", allow: ["https://a.test", "https://b.test:8080", "http://no.test", "https://x..y"] } },
  { block: "auvyx/section", className: "auvyx-isolated", label: "Ünï 🎉 \u0001", anchor: "a\"<&>", children: [
    { block: "auvyx/heading", text: "Emoji 👩‍👩‍👧 \ud83d lone" },
    { block: "auvyx/button", text: "Go", href: "/ü?x=\"1\"&y=<2>" },
    { block: "auvyx/icon", icon: "heart", href: "javascript:--x" },
    { block: "auvyx/video", src: "https://v.test/é.mp4?a=1&b=2" },
  ] },
];
PAGES["export: icons"] = [{ block: "auvyx/section", children: [
  { block: "auvyx/icon", icon: "star" }, { block: "auvyx/icon", icon: "heart", href: "#top" }, { block: "auvyx/icon", icon: "check", href: "//cdn.test/x" },
] }];
PAGES["export: an unknown icon refuses"] = [{ block: "auvyx/section", children: [{ block: "auvyx/icon", icon: "nope" }] }];
PAGES["export: a nav with a menu refuses"] = [{ block: "auvyx/section", children: [{ block: "auvyx/nav", src: "menu:4" }] }];

type Out = { ok: true; value: string } | { ok: false; error: string };
const scalaOut = (json: string): Out => { const o = JSON.parse(json); return o.ok ? { ok: true, value: o.result } : { ok: false, error: o.error?.message ?? o.message ?? JSON.stringify(o) }; };

/** The Studio's own document for a tree (TreeDecoder), and the core's answers on it. */
function open(tree: TreeNode[]) {
  core.openDocument("x", JSON.stringify({ blocks: tree, canScript: true, blockNames: [] }));
  const json = JSON.stringify(JSON.parse(core.studioDocument("x")).result);
  const decoded = DocJson.decode(json);
  if ("error" in decoded) throw new Error(decoded.error);
  // DocJson (TypeScript) leaves the runtime block definitions out; TreeDecoder's port reads the same ones.
  return { ...decoded.doc, defs: decodeTree(tree).defs ?? [] } as Doc;
}

const html = (doc: Doc, canvas: boolean): Out => {
  const h = HtmlRenderer.renderHtml(doc, { mode: canvas ? "canvas" : "publish" });
  if (!h.ok) return { ok: false, error: h.error };
  const c = HtmlRenderer.renderCss(doc);
  return c.ok ? { ok: true, value: JSON.stringify({ html: h.value, css: c.value }) } : { ok: false, error: c.error };
};
const scalaHtml = (canvas: boolean): Out => {
  const o = JSON.parse(core.renderHtml("x", canvas));
  return o.ok ? { ok: true, value: JSON.stringify({ html: o.result.html, css: o.result.css }) } : { ok: false, error: o.error?.message ?? o.message };
};
const plain = (r: Out) => (r.ok ? r : { ok: false, error: r.error });

describe.skipIf(!hasExport)("HtmlRenderer and WebExport equal Auvyx Studio's", () => {
  for (const [name, tree] of Object.entries(PAGES)) {
    test(name, () => {
      const doc = open(tree);
      try {
        expect(html(doc, false)).toEqual(scalaHtml(false));
        expect(html(doc, true)).toEqual(scalaHtml(true));
        expect(plain(WebExport.page(doc))).toEqual(scalaOut(core.webExport("x", "")));
        for (const id of Object.keys(doc.nodes)) expect([id, plain(WebExport.section(doc, id))]).toEqual([id, scalaOut(core.webExport("x", id))]);
        expect(plain(WebExport.section(doc, "missing"))).toEqual(scalaOut(core.webExport("x", "missing")));
      } finally {
        core.closeDocument("x");
      }
    });
  }
});

test("the theme mode classes", () => {
  expect(WebExport.mode("a auvyx-isolated")).toBe("isolated");
  expect(WebExport.mode("auvyx-isolated\tauvyx-shadow")).toBe("shadow");
  expect(WebExport.mode("")).toBe("follow");
  expect(WebExport.withMode(" a auvyx-shadow  b ", "isolated")).toBe("a b auvyx-isolated");
  expect(WebExport.withMode("auvyx-follow a", "follow")).toBe("a");
});

test("an exported section is one web component that cannot close its own style or script", () => {
  const doc: Doc = { roots: ["s"], nodes: { s: { ...emptyEl("s"), className: "auvyx-shadow", css: "& p { color: red }" } } };
  const r = WebExport.section(doc, "s");
  expect(r.ok && r.value.startsWith('<auvyx-section data-auvyx-mode="shadow"><template shadowrootmode="open"><style>:host{display:block;--wp--preset--color--auvyx-primary:')).toBe(true);
});
const emptyEl = (id: string) => ({ id, kind: "Section" as const, text: "", tag: "section", level: 2, href: "", styles: {}, children: [], src: "", alt: "", icon: "", mediaId: 0, align: "", className: "", anchor: "", blockName: "", raw: "", html: "", bind: {}, query: {}, locked: false, label: "", target: "", css: "", markup: "", script: "", libs: [], uses: [], game: "", runtime: "", fields: {} });
