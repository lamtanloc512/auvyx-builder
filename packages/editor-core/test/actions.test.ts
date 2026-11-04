/**
 * The action registry is Auvyx Studio's: the same tool specs (JSON Schema, byte for byte) as the Scala core
 * (apps/studio/packages/mcp/dist/core.js, `toolSpecs`), and the same action calls on the same document answer the same
 * JSON (results, reports, errors) and leave the same block markup (`callAction` + `markup`).
 */
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { DocJson, type Doc, type TreeNode, serialize } from "../src/index";
import * as Actions from "../src/actions/index";

const CORE = new URL("../../../apps/studio/packages/mcp/dist/core.js", import.meta.url).pathname;
const core = existsSync(CORE) ? await import(CORE) : null;
const maybe = core ? describe : describe.skip;

type Step = [string, unknown] | ((ids: Record<string, string>) => [string, unknown]);

/** The next id the Scala core's generator gives (a global counter): both cores then make the same ids. */
function nextScalaId(): number {
  core.openDocument("probe", JSON.stringify({ blocks: [], canScript: true, blockNames: [] }));
  const out = JSON.parse(core.callAction("probe", "insert_elements", JSON.stringify({ elements: [{ kind: "box" }] })));
  core.closeDocument("probe");
  return Number(String(out.result.ids[0]).slice(1)) + 1;
}

function run(blocks: TreeNode[], steps: Step[], opts: { kind?: string; title?: string; blockNames?: string[]; canScript?: boolean } = {}) {
  const key = `a${Math.random().toString(36).slice(2)}`;
  const kind = opts.kind ?? "page";
  const blockNames = opts.blockNames ?? [];
  core.openDocument(key, JSON.stringify({ blocks, canScript: opts.canScript ?? true, blockNames, kind, title: opts.title ?? "" }));
  const decoded = DocJson.decode(JSON.stringify(JSON.parse(core.studioDocument(key)).result));
  if (!("doc" in decoded)) throw new Error(decoded.error);
  let doc: Doc = decoded.doc;
  let counter = nextScalaId();
  const blocksOk = new Set([...blockNames, "core/template-part"]);
  const ids: Record<string, string> = {};
  for (const step of steps) {
    const [name, input] = typeof step === "function" ? step(ids) : step;
    const text = typeof input === "string" ? input : JSON.stringify(input);
    const theirs = core.callAction(key, name, text);
    const ctx = Actions.context(doc, () => { let id: string; do id = `e${counter++}`; while (doc.nodes[id]); return id; }, {
      view: { ...Actions.defaultView(), document: key, kind, title: opts.title ?? "" },
      canScript: opts.canScript ?? true,
      block: (n) => (blocksOk.has(n) ? n : undefined),
    });
    const mine = Actions.agentCall(name, text, ctx);
    const t = JSON.parse(theirs);
    const m = JSON.parse(mine.text);
    // a JSON parse error's wording is the platform's own
    if (t.error?.code === "bad_input" && /is not JSON/.test(t.error.message)) expect(m.error.message).toContain("is not JSON");
    else expect({ step: name, answer: m }).toEqual({ step: name, answer: t });
    if (mine.doc) doc = mine.doc;
    // the next id: Scala's counter is global and also moves on refused calls, so both start the next step from it
    counter = nextScalaId();
    for (const [r, id] of Object.entries((t.result?.refs as Record<string, string>) ?? {})) ids[r] = id;
    if (t.result?.ids && name === "insert_elements") (t.result.ids as string[]).forEach((id, i) => { ids[`#${i}`] = id; });
    if (name === "duplicate_element" && t.ok) ids.copy = t.result.id;
    expect(serialize(doc)).toBe(JSON.parse(core.markup(key)).result);
  }
  core.closeDocument(key);
  return doc;
}

const st = (decls: Record<string, string>, bp = "base", state = "default") => ({ [bp]: { [state]: decls } });

const HERO: TreeNode[] = [
  { block: "auvyx/section", tag: "header", label: "Hero", styles: st({ padding: "64px 24px" }), children: [
    { block: "auvyx/heading", level: 1, text: "Fall <em>’26</em> &amp; more" },
    { block: "auvyx/text", text: "Quiet clothes — made to last." },
    { block: "auvyx/button", text: "Shop", href: "/shop" },
    { block: "auvyx/image", src: "https://x.test/a.jpg", alt: "A coat" },
    { block: "auvyx/icon", icon: "star" },
  ] } as TreeNode,
  { block: "auvyx/section", tag: "section", children: [{ block: "auvyx/accordion", text: "Shipping?", children: [{ block: "auvyx/text", text: "Free" }] }] } as TreeNode,
  { block: "core/paragraph", raw: "<!-- wp:paragraph -->\n<p>Hi <b>there</b></p>\n<!-- /wp:paragraph -->", html: "<p>Hi <b>there</b></p>" } as TreeNode,
];

maybe("actions = the Studio's", () => {
  test("tool specs, byte for byte", () => {
    expect(JSON.stringify(Actions.toolSpecsFor(new Set(["doc"])))).toBe(core.toolSpecs());
    expect(Actions.agentSpecs().map((s) => s.name)).toEqual(JSON.parse(core.toolSpecs()).map((s: any) => s.function.name));
  });

  test("reading", () => {
    run(HERO, [["read_page", {}], ["read_page", { id: "e2" }], ["read_page", { id: "nope" }], ["read_page", { id: "x~1" }], ["read_page", ""]]);
  });

  test("set_style", () => {
    run(HERO, [
      ["set_style", { id: "e2", values: { color: "red", "font-size": "20px" } }],
      ["set_style", { id: "e2", values: { color: null, "margin-top": " 8px " }, breakpoint: "desktop" }],
      ["set_style", { id: "e2", values: { color: "blue" }, breakpoint: "mobile", state: "hover", also: ["e3", "e2"] }],
      ["set_style", { id: "e2", values: { "not-a-prop": "1", color: "url(javascript:x)" } }],
      ["set_style", { id: "e2", values: {} }],
      ["set_style", { id: "e2", values: { color: "red" }, breakpoint: "wide" }],
      ["set_style", { id: "e2", values: { color: "red" }, state: "visited" }],
      ["set_style", { id: "e2", values: { color: "red" }, also: ["nope"] }],
      ["set_style", { id: "e2", values: { color: 5 } }],
      ["set_style", { id: "e2", values: { color: [1] } }],
      ["set_style", { id: "e2" }],
      ["set_style", { id: "e2", values: { color: "red" }, extra: 1 }],
    ]);
  });

  test("update_element", () => {
    run(HERO, [
      ["update_element", { id: "e2", text: "New <strong>title</strong>", level: "3" }],
      ["update_element", { id: "e2", level: 9 }],
      ["update_element", { id: "e2", src: "x" }],
      ["update_element", { id: "e2" }],
      ["update_element", { id: "e4", href: "/sale", target: "_blank", interaction: { recipe: "link" } }],
      ["update_element", { id: "e4", interaction: { recipe: "card" } }],
      ["update_element", { id: "e4", interaction: { variant: "loud" } }],
      ["update_element", { id: "e4", target: "_top" }],
      ["update_element", { id: "e6", icon: "no-such-icon" }],
      ["update_element", { id: "e6", icon: "heart" }],
      ["update_element", { id: "e1", tag: "main", align: "wide", label: "Top", anchor: "top", css: "& { color: red; }" }],
      ["update_element", { id: "e1", tag: "span" }],
      ["update_element", { id: "e1", align: "huge" }],
      ["update_element", { id: "e1", anchor: "1bad" }],
      ["update_element", { id: "e1", css: "@import url(x); a{}" }],
      ["update_element", { id: "e1", css: "" }],
      ["update_element", { id: "e5", src: "https://x.test/b.jpg", alt: "B" }],
      ["update_element", { id: "e3", text: "Quiet clothes — made to last." }],
      ["update_element", { id: "e10", label: "Para", align: "full" }],
      ["update_element", { id: "e10", css: "a{}" }],
    ]);
  });

  test("insert_elements", () => {
    run(HERO, [
      ["insert_elements", { elements: [
        { ref: "s", kind: "box", tag: "section", align: "full", styles: { base: { padding: "48px" }, mobile: { padding: "24px" } } },
        { ref: "g", in: "s", kind: "Box", class: "grid two", interaction: "card" },
        { in: "g", kind: "heading", level: "2", text: "Why us" },
        { in: "g", kind: "text", text: "Because." },
        { in: "s", kind: "button", text: "Go", href: "/go", interaction: { recipe: "button", variant: "subtle" } },
        { kind: "divider" },
      ], after: "e1" }],
      ["insert_elements", { elements: [{ kind: "image", src: "https://x.test/c.jpg", alt: "C" }], parent: "e1", index: 1 }],
      ["insert_elements", { elements: [{ kind: "icon", icon: "heart" }, { kind: "video", src: "https://youtu.be/abc", frame: "9:16", autoplay: true }], before: "e2" }],
      ["insert_elements", { elements: [{ kind: "navigation", menu: "pages", toggleAt: "tablet", drawer: { style: "left", backdrop: "blur" } }] }],
      ["insert_elements", { elements: [{ kind: "loop", query: { postType: "product", perPage: "8" } }], parent: "e1", index: 99 }],
      ["insert_elements", { elements: [{ kind: "block", block: "core/template-part", attrs: { slug: "header" } }] }],
      ["insert_elements", { elements: [{ kind: "block", block: "core/search" }] }],
      ["insert_elements", { elements: [{ kind: "box" }], after: "e1", parent: "e1" }],
      ["insert_elements", { elements: [{ kind: "box" }], after: "e1", index: 0 }],
      ["insert_elements", { elements: [{ kind: "box" }], parent: "e2" }],
      ["insert_elements", { elements: [{ kind: "box" }], parent: "nope" }],
      ["insert_elements", { elements: [{ kind: "box" }], parent: "e1", index: -1 }],
      ["insert_elements", { elements: [] }],
      ["insert_elements", { elements: [{ kind: "text", in: "x" }] }],
      ["insert_elements", { elements: [{ ref: "a", kind: "text" }, { in: "a", kind: "text" }] }],
      ["insert_elements", { elements: [{ in: "b", kind: "text" }, { ref: "b", kind: "box" }] }],
      ["insert_elements", { elements: [{ ref: "a", kind: "box" }, { ref: "a", kind: "box" }] }],
      ["insert_elements", { elements: [{ kind: "spaceship" }] }],
      ["insert_elements", { elements: [{ kind: "box", anchor: "-x" }] }],
      ["insert_elements", { elements: [{ kind: "block", block: "core/html", interaction: "card" }] }],
      ["insert_elements", { elements: [{ kind: "heading", interaction: "card" }] }],
      ["insert_elements", { elements: [{ kind: "game", game: "bad" }] }],
      ["insert_elements", { elements: [{ kind: "code", html: "<p>hi</p>", js: "console.log(1)", libs: ["three"] }] }],
      ["insert_elements", { elements: [{ kind: "box", level: "two" }] }],
    ]);
  });

  test("code needs the right to script", () => {
    run(HERO, [["insert_elements", { elements: [{ kind: "code", html: "<p>hi</p>" }] }]], { canScript: false });
  });

  test("move, duplicate, remove", () => {
    run(HERO, [
      ["move_element", { id: "e4", before: "e2" }],
      ["move_element", { id: "e4", parent: "e7", index: 0 }],
      ["move_element", { id: "e4" }],
      ["move_element", { id: "e1", parent: "e1" }],
      ["move_element", { id: "e7", parent: "e8" }],
      ["move_element", { id: "e1", parent: "e2" }],
      ["move_element", { id: "e3", after: "e10" }],
      ["move_element", { id: "e3", after: "e10", index: 0 }],
      ["duplicate_element", { id: "e1" }],
      ["duplicate_element", { id: "nope" }],
      ["remove_elements", { ids: ["e8", "e7", "e2"] }],
      ["remove_elements", { ids: [] }],
      ["remove_elements", { ids: ["gone"] }],
      ["remove_elements", { ids: "e1" }],
    ]);
  });

  test("the registry's own refusals", () => {
    run(HERO, [["no_such_action", {}], ["read_page", "{bad json"], ["read_page", { id: 5 }], ["read_page", [1]], ["update_element", { id: null, text: "x" }]]);
  });

  test("headers and footers through the registry", () => {
    run([{ block: "auvyx/section", tag: "header", children: [] } as TreeNode, ...HERO], [
      ["header_layout", {}],
      ["header_set_preset", { preset: "compact" }],
      ["header_layout", {}],
      ["header_add_item", { row: "Main", bp: "desktop", slot: "end", item: "Wishlist" }],
      ["header_add_item", { row: "main", bp: "desktop", slot: "end", item: "wishlist", index: -2 }],
      ["header_add_item", { row: "main", bp: "phone", slot: "end", item: "wishlist" }],
      ["header_move_item", { item: "nope", row: "main", bp: "desktop", slot: "start" }],
      ["header_remove_item", { item: "x~2" }],
      ["header_set_sticky", { sticky: "shrink", overlay: "true" }],
      ["header_set_row_visible", { row: "top", bp: "mobile", on: false }],
      ["header_set_tablet", { mode: "own" }],
      ["header_set_menu", { role: "main", source: "menu:3" }],
      ["footer_layout", {}],
      ["footer_set_preset", { preset: "columns" }],
    ]);
    run([{ block: "auvyx/section", tag: "footer", children: [] } as TreeNode], [
      ["footer_set_preset", { preset: "store" }],
      ["footer_layout", {}],
      ["footer_add_item", { row: "bottom", column: 0, item: "social" }],
      ["footer_set_columns", { row: "main", columns: 3 }],
      ["footer_set_column_align", { row: "main", column: 1, align: "center" }],
      ["footer_set_row_visible", { row: "top", bp: "mobile", on: false }],
      ["footer_set_row_divider", { row: "bottom", on: true }],
      ["footer_set_tone", { tone: "dark" }],
      ["footer_remove_item", { item: "nope" }],
      ["header_layout", {}],
      ["header_set_sticky", { sticky: "on" }],
    ], { kind: "footer" });
  });

  test("the agent's view of a document", () => {
    const doc = run([{ block: "auvyx/section", tag: "header", children: [] } as TreeNode, ...HERO], [["header_set_preset", { preset: "marketplace" }]]);
    const first = doc.nodes[doc.roots[0]!]!;
    const ctx = Actions.context(doc, () => "z", { view: { ...Actions.defaultView(), selected: [first.children[0]!, "e2"], title: "Home", document: "4" } });
    const view = Actions.AgentView.block(ctx);
    expect(view).toContain('document: page "Home" (id 4)');
    expect(view).toContain("header ");
    expect(view).toContain(": builder, tablet follows mobile");
    expect(Actions.AgentView.strip(Actions.AgentView.withView("Add a FAQ", ctx))).toBe("Add a FAQ");
  });
});
