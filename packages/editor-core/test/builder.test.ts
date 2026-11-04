/**
 * The header and footer builders do what Auvyx Studio's do: the same action sequence runs through the Scala core
 * (apps/studio/packages/mcp/dist/core.js, `callAction`) and through editor-core's `callBuilder`, and after every step the
 * block markup (what WordPress saves) and the board's view (ids aside) are equal.
 */
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { DocJson, type Doc, type TreeNode, serialize } from "../src/index";
import { cascade, own, withClasses } from "../src/builderParts";
import { headerView, readHeader, tracks } from "../src/headerBuilder";
import { NEWSLETTER_FORM_HTML, NEWSLETTER_FORM_RAW, footerView, readFooter } from "../src/footerBuilder";
import { callBuilder } from "../src/builderActions";

const CORE = new URL("../../../apps/studio/packages/mcp/dist/core.js", import.meta.url).pathname;
const core = existsSync(CORE) ? await import(CORE) : null;
const maybe = core ? describe : describe.skip;

type Step = [string, Record<string, unknown>] | ((v: any) => [string, Record<string, unknown>]);

/** Runs `steps` in both cores from `blocks`; `pick` steps choose an item from the board's view (the same place in both). */
function run(blocks: TreeNode[], kind: string, steps: Step[], area: "header" | "footer") {
  const key = `k${Math.random()}`;
  core.openDocument(key, JSON.stringify({ blocks, canScript: true, blockNames: [], kind }));
  const decoded = DocJson.decode(JSON.stringify(JSON.parse(core.studioDocument(key)).result));
  if (!("doc" in decoded)) throw new Error(decoded.error);
  let doc: Doc = decoded.doc;
  let n = 1000;
  const newId = () => { let id: string; do id = `t${n++}`; while (doc.nodes[id]); return id; };
  const viewOf = (d: Doc) => {
    const root = d.roots.find((r) => (area === "header" ? readHeader(d, r) : readFooter(d, r)));
    if (!root) return null;
    return area === "header" ? headerView(readHeader(d, root)!) : footerView(readFooter(d, root)!);
  };
  const scalaView = () => JSON.parse(core.callAction(key, `${area}_layout`, "{}")).result.layout ?? null;
  const strip = (v: unknown) => JSON.parse(JSON.stringify(v ?? null, (k, x) => (k === "id" || k === "root" ? undefined : x)));
  for (const step of steps) {
    const [mine, theirs] = typeof step === "function" ? [step(viewOf(doc)), step(scalaView())] : [step, step];
    const s = JSON.parse(core.callAction(key, theirs[0], JSON.stringify(theirs[1])));
    const t = callBuilder(mine[0], mine[1], { doc, newId, selected: null, kind, platform: "wordpress" });
    expect({ step: mine[0], ok: t.ok, error: t.ok ? undefined : t.error }).toEqual({ step: mine[0], ok: s.ok, error: s.ok ? undefined : s.error.message });
    if (t.ok) {
      doc = t.value.doc;
      expect(t.value.added.length).toBe((s.added ?? []).length);
      expect(t.value.removed.length).toBe((s.removed ?? []).length);
    }
    expect(serialize(doc)).toBe(JSON.parse(core.markup(key)).result);
    expect(strip(viewOf(doc))).toEqual(strip(scalaView()));
  }
  core.closeDocument(key);
  return doc;
}

const header = (extra: Partial<TreeNode> = {}): TreeNode[] => [{ block: "auvyx/section", tag: "header", children: [], ...extra } as TreeNode];
const item = (layout: number, row: number, slot: number, i: number) => (v: any) => v.layouts[layout].rows[row].slots[slot].items[i].id as string;

maybe("header builder = the Studio's", () => {
  for (const preset of ["marketplace", "compact", "centered", "utility", "nav-first", "boutique", "legacy-classic", "legacy-store", "legacy-centered", "legacy-split", "legacy-minimal", "legacy-megastore"])
    test(`preset ${preset}`, () => { run(header(), "page", [["header_set_preset", { preset }]], "header"); });

  test("every edit, one after the other", () => {
    run(header({ className: "mine" }), "page", [
      ["header_set_preset", { preset: "marketplace" }],
      ["header_add_item", { row: "top", bp: "desktop", slot: "start", item: "text" }],
      ["header_add_item", { row: "main", bp: "desktop", slot: "end", item: "compare", index: 0 }],
      ["header_add_item", { row: "main", bp: "desktop", slot: "end", item: "menu_button" }],
      ["header_add_item", { row: "main", bp: "mobile", slot: "end", item: "account", index: 1 }],
      ["header_add_item", { row: "bottom", bp: "desktop", slot: "end", item: "social" }],
      ["header_add_item", { row: "bottom", bp: "desktop", slot: "center", item: "html" }],
      ["header_add_item", { row: "bottom", bp: "desktop", slot: "center", item: "component" }],
      ["header_add_item", { row: "bottom", bp: "desktop", slot: "center", item: "component", ref: 12 }],
      (v) => ["header_move_item", { item: item(0, 0, 0, 0)(v), row: "bottom", bp: "desktop", slot: "end", index: 0 }],
      (v) => ["header_move_item", { item: item(0, 1, 2, 0)(v), row: "main", bp: "mobile", slot: "start" }],
      (v) => ["header_set_item_visible", { item: item(0, 1, 0, 0)(v), bp: "desktop", on: false }],
      (v) => ["header_set_item_visible", { item: item(0, 1, 0, 0)(v), bp: "mobile", on: false }],
      ["header_set_row_visible", { row: "bottom", bp: "desktop", on: false }],
      ["header_set_row_options", { row: "main", bp: "desktop", height: 80, tone: "brand", divider: true }],
      ["header_set_row_options", { row: "main", bp: "desktop", height: 81 }],
      ["header_set_slot_align", { row: "main", bp: "desktop", slot: "start", align: "between" }],
      ["header_set_sticky", { sticky: "shrink", overlay: true }],
      ["header_set_tablet", { mode: "own" }],
      ["header_add_item", { row: "top", bp: "tablet", slot: "end", item: "cart" }],
      (v) => ["header_set_item_visible", { item: item(1, 1, 1, 0)(v), bp: "tablet", on: false }],
      ["header_set_tablet", { mode: "desktop" }],
      ["header_set_tablet", { mode: "own" }],
      ["header_set_tablet", { mode: "mobile" }],
      ["header_set_menu", { role: "main", source: "menu:7" }],
      ["header_set_menu", { role: "category", source: "Bad Source" }],
      (v) => ["header_remove_item", { item: item(0, 1, 1, 0)(v) }],
      ["header_set_preset", { preset: "boutique" }],
      ["header_set_preset", { preset: "utility" }],
      ["header_set_preset", { preset: "nope" }],
    ], "header");
  });

  test("a header part's wrapper becomes the header (kind header)", () => {
    run([{ block: "auvyx/section", tag: "div", children: [{ block: "auvyx/heading", text: "Shop" }] } as TreeNode], "header",
      [["header_set_preset", { preset: "compact" }], ["header_add_item", { row: "main", bp: "mobile", slot: "center", item: "search_field" }]], "header");
  });

  test("a hand-made header keeps its menu, anchor and platform blocks", () => {
    run([{ block: "auvyx/section", tag: "header", children: [
      { block: "auvyx/nav", src: "menu:4", anchor: "menu" },
      { block: "core/site-title", raw: '<!-- wp:site-title {"level":1} /-->', label: "Site title" },
      { block: "auvyx/section", label: "Top bar", children: [{ block: "auvyx/text", text: "Hello there" }] },
    ] } as TreeNode], "page", [["header_set_preset", { preset: "utility" }], ["header_set_preset", { preset: "marketplace" }]], "header");
  });

  test("a ready (legacy) header converts as configured", () => {
    for (const cls of ["auvyx-hv auvyx-hv-split auvyx-hv-search-icon auvyx-hv-no-account auvyx-hv-dark auvyx-header-sticky", "auvyx-hv auvyx-hv-store auvyx-hv-topbar auvyx-hv-search-field auvyx-hv-wishlist",
      "auvyx-sf-header-config-v2 auvyx-sf-header-layout-nav-first"])
      run(header({ className: cls }), "page", [["header_set_preset", { preset: "legacy" }]], "header");
    run(header({ className: "plain" }), "page", [["header_set_preset", { preset: "legacy" }]], "header");
  });

  test("no header", () => {
    run([{ block: "auvyx/section", tag: "div", children: [] } as TreeNode], "page", [["header_set_preset", { preset: "compact" }]], "header");
  });
});

const footer = (extra: Partial<TreeNode> = {}): TreeNode[] => [{ block: "auvyx/section", tag: "footer", children: [], ...extra } as TreeNode];
const fitem = (row: number, col: number, i: number) => (v: any) => v.rows[row].columns[col].items[i].id as string;
/** The n-th item of a kind, anywhere in the footer. */
const fkind = (kind: string, n = 0) => (v: any) => v.rows.flatMap((r: any) => r.columns.flatMap((c: any) => c.items)).filter((i: any) => i.kind === kind)[n].id as string;

maybe("footer builder = the Studio's", () => {
  for (const preset of ["columns", "simple", "centered", "minimal", "store"])
    test(`preset ${preset}`, () => { run(footer(), "page", [["footer_set_preset", { preset }]], "footer"); });

  test("every edit, one after the other", () => {
    run(footer({ className: "mine" }), "page", [
      ["footer_set_preset", { preset: "columns" }],
      ...["logo", "about", "links", "newsletter", "social", "payments", "contact", "copyright", "text", "html"].map((k, i) =>
        ["footer_add_item", { row: "main", column: i % 4, item: k }] as Step),
      ["footer_add_item", { row: "top", column: 0, item: "text" }],
      ["footer_add_item", { row: "main", column: 9, item: "text" }],
      (v) => ["footer_move_item", { item: fitem(1, 1, 0)(v), row: "bottom", column: 1, index: 0 }],
      (v) => ["footer_move_item", { item: fitem(1, 0, 0)(v), row: "top", column: 0 }],
      (v) => ["footer_set_item_visible", { item: fitem(0, 0, 0)(v), bp: "mobile", on: false }],
      ["footer_set_columns", { row: "main", columns: 2 }],
      ["footer_set_columns", { row: "main", columns: 6 }],
      ["footer_set_columns", { row: "main", columns: 7 }],
      ["footer_set_column_align", { row: "main", column: 1, align: "center" }],
      ["footer_set_column_align", { row: "main", column: 8, align: "end" }],
      ["footer_set_row_visible", { row: "top", bp: "tablet", on: false }],
      ["footer_set_row_divider", { row: "main", on: true }],
      ["footer_set_tone", { tone: "muted" }],
      ["footer_set_tone", { tone: "brand" }],
      (v) => ["footer_set_links", { item: fkind("links", 1)(v), source: "menu:3" }],
      (v) => ["footer_set_links", { item: fkind("logo")(v), source: "pages" }],
      (v) => ["footer_set_links", { item: fkind("links")(v), source: "Not valid" }],
      (v) => ["footer_remove_item", { item: fkind("about")(v) }],
      ["footer_set_preset", { preset: "store" }],
      ["footer_set_preset", { preset: "minimal" }],
    ], "footer");
  });

  test("a ready (legacy) footer converts as configured", () => {
    for (const cls of ["auvyx-fv auvyx-fv-columns auvyx-fv-cols-2 auvyx-fv-social", "auvyx-fv auvyx-fv-minimal auvyx-fv-no-line auvyx-fv-light", "auvyx-fv auvyx-fv-centered"])
      run(footer({ className: cls, children: [{ block: "auvyx/nav", src: "menu:9" } as TreeNode] }), "page", [["footer_set_preset", { preset: "legacy" }]], "footer");
  });

  test("the newsletter form is Forms.element's", () => {
    const doc = run(footer(), "page", [["footer_set_preset", { preset: "store" }]], "footer");
    const form = Object.values(doc.nodes).find((n) => n.blockName === "auvyx/form")!;
    expect([form.raw, form.html, form.label]).toEqual([NEWSLETTER_FORM_RAW, NEWSLETTER_FORM_HTML, "Newsletter form"]);
  });
});

describe("builder parts", () => {
  test("cascade writes only changes from the wider width", () => {
    expect(cascade("display", [undefined, undefined, undefined])).toEqual({});
    expect(cascade("display", [undefined, "grid", "grid"])).toEqual({ base: [["display", "grid"]] });
    expect(cascade("display", ["flex", "none", "flex"])).toEqual({ base: [["display", "flex"]], tablet: [["display", "none"]], mobile: [["display", "flex"]] });
  });
  test("own keeps the author's declarations and other states, engine order", () => {
    const out = own({ mobile: { default: { gap: "1px" } }, base: { hover: { color: "red" }, default: { display: "block", color: "blue" } } }, new Set(["display", "gap"]),
      { base: [["display", "flex"]] });
    expect(JSON.stringify(out)).toBe('{"base":{"default":{"color":"blue","display":"flex"},"hover":{"color":"red"}}}');
  });
  test("withClasses keeps author classes first, ours last, no repeats", () => {
    expect(withClasses("a auvyx-sf-x b a", (c) => c.startsWith("auvyx-sf-"), ["auvyx-sf-y", "b"])).toBe("a b auvyx-sf-y");
  });
  test("tracks: a search field fills, the logo may shrink", () => {
    const it = (kind: string) => ({ el: {} as never, kind: kind as never, hidden: new Set<never>() });
    const row = (start: string[], center: string[], end: string[]) => ({ slots: [["start", start], ["center", center], ["end", end]].map(([slot, items]) =>
      ({ slot, items: (items as string[]).map(it) })) }) as never;
    expect(tracks(row(["Logo"], [], ["Cart"]), () => true)).toBe("minmax(0,1fr) minmax(0,auto) minmax(min-content,1fr)");
    expect(tracks(row(["Logo"], ["SearchField"], ["Cart"]), () => true)).toBe("minmax(0,auto) minmax(0,1fr) auto");
  });
});
