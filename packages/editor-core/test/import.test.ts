/**
 * The importers (src/import), checked two ways: against what the Scala importers make of the same files
 * (test/import/oracle.json, written by test/import/gen-oracle.sh: every node, its styles in order, the kept list and
 * the saved markup must be equal), and with the expectations of the Scala suites (ImportFileSuite, ElementorImportSuite,
 * FlatsomeImportSuite) on the same fixtures.
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { El } from "../src/model";
import { convert } from "../src/import/importFile";
import * as ElementorImport from "../src/import/elementor";
import * as FlatsomeImport from "../src/import/flatsome";
import { readJson, writeJson, type JObj } from "../src/import/jvm";
import { ASSETS, type Made, canon, cases, elementor, elementorDir, flatsomeDir, hasElementor, hasFlatsome, ids, markupOf, megaMedia, megaShop, read, runnable } from "./import/oracle";

/** Tests on the third-party Elementor / Flatsome fixtures, skipped where those are missing (the public export). */
const testE = test.skipIf(!hasElementor);
const testF = test.skipIf(!hasFlatsome);

const oracle = JSON.parse(read(join(import.meta.dir, "import/oracle.json"))) as Record<string, { doc?: string; markup?: string; kept?: string[]; source?: string; error?: string }>;

describe("the same documents as the Scala importers", () => {
  for (const [name, run] of Object.entries(cases())) {
    test.skipIf(!runnable(name))(name, () => {
      const want = oracle[name]!;
      const got = run();
      if (want.error !== undefined || "error" in got) { expect("error" in got ? got.error : "a document").toBe(want.error ?? "a document"); return; }
      const doc = JSON.parse(want.doc!) as { roots: string[]; nodes: Record<string, Record<string, unknown>> };
      expect(got.roots).toEqual(doc.roots);
      expect(Object.keys(got.nodes).sort()).toEqual(Object.keys(doc.nodes).sort());
      for (const id of Object.keys(doc.nodes)) expect(canon(got.nodes[id] as unknown as Record<string, unknown>)).toBe(canon(doc.nodes[id]!));
      expect(got.kept).toEqual(want.kept!);
      if (want.source) expect(got.source).toBe(want.source);
      expect(markupOf(got)).toBe(want.markup!);
    });
  }
});

const all = (r: Made) => Object.values(r.nodes);
const st = (n: El, bp = "base") => (n.styles[bp]?.default ?? {}) as Record<string, string>;
const e = (p: string) => join(elementorDir, p);
const kit = ["kit/manifest.json", "kit/site-settings.json", "kit/content/page/12.json", "kit/content/page/15.json", "kit/templates/34.json", "kit/templates/35.json"];

describe("ImportFile (ImportFileSuite)", () => {
  test("a Studio document comes back as it is", () => {
    const r = convert("page.json", JSON.stringify({ version: 1, roots: ["a"], nodes: { a: { id: "a", kind: "Heading", text: "Hi", level: 1 } } }), ASSETS, ids("i"));
    expect(r.ok && [r.value.source, r.value.doc.nodes.a?.text]).toEqual(["studio", "Hi"]);
  });
  test("an Elementor export becomes Studio elements; Flatsome shortcodes too; the rest says why not", () => {
    const el = convert("t.json", `{"version":"0.4","title":"T","type":"page","content":[{"id":"s","elType":"section","settings":{},"elements":[{"id":"c","elType":"column","settings":{},"elements":[
      {"id":"w","elType":"widget","widgetType":"heading","settings":{"title":"Hello"}}]}]}]}`, ASSETS, ids("i"));
    if (!el.ok) throw new Error(el.error);
    expect(el.value.source).toBe("elementor");
    expect(Object.values(el.value.doc.nodes).some((n) => n.kind === "Heading" && n.text === "Hello")).toBe(true);
    const f = convert("p.txt", `[row][col span="6"][button text="Go" link="/shop"][/col][/row]`, ASSETS, ids("i"));
    expect(f.ok && f.value.source).toBe("flatsome");
    expect(convert("x.json", "{nope", ASSETS, ids("i"))).toEqual({ ok: false, error: "Not valid JSON" });
    expect(convert("x.json", `{"a":1}`, ASSETS, ids("i")).ok).toBe(false);
    expect(convert("x.txt", "plain words", ASSETS, ids("i")).ok).toBe(false);
  });
  testE("a page's _elementor_data (the bare element array) imports like an export of it", () => {
    const exported = read(e("landing-template.json"));
    const fromMeta = convert("elementor.json", writeJson((readJson(exported) as JObj).get("content")!), ASSETS, ids("e"));
    const fromFile = convert("landing-template.json", exported, ASSETS, ids("e"));
    if (!fromMeta.ok || !fromFile.ok) throw new Error("not converted");
    expect(fromMeta.value.source).toBe("elementor");
    expect(Object.keys(fromMeta.value.doc.nodes).length).toBe(Object.keys(fromFile.value.doc.nodes).length);
    expect(Object.values(fromMeta.value.doc.nodes).some((n) => n.kind === "Heading" && n.text.includes("Spring menu"))).toBe(true);
  });
});

describe("ElementorImport (ElementorImportSuite)", () => {
  testE("Elementor's files are recognised; an Auvyx site template and plain JSON are not", () => {
    for (const p of kit) expect(ElementorImport.detect(readJson(read(e(p))))).toBe(true);
    expect(ElementorImport.detect(readJson(read(e("landing-template.json"))))).toBe(true);
    expect(ElementorImport.detect(readJson(`{"schema":"auvyx-site/3","id":"x","title":"X","pages":[]}`))).toBe(false);
    expect(ElementorImport.detect(readJson(`{"content":"text"}`))).toBe(false);
  });
  testE("a saved-template export: its title and type; a kit page takes its title from the manifest", () => {
    const p = ElementorImport.piece(readJson(read(e("landing-template.json"))), "landing-template.json")!;
    expect([p.title, p.docType, p.elements.length]).toEqual(["Spring landing", "page", 1]);
    const [name, known] = ElementorImport.manifest(readJson(read(e(kit[0]!))));
    expect(name).toBe("Corner Café");
    expect(known.get("12")).toEqual(["Home", "page"]);
    expect(known.get("34")).toEqual(["Main header", "header"]);
  });
  testE("the kit's global colours and fonts become the design brief", () => {
    const g = ElementorImport.globals(readJson(read(e(kit[1]!))))!;
    expect(g.colors.get("primary")).toBe("#7A3E1D");
    expect(g.colors.get("a1b2c3d")).toBe("#F6EFE4");
    expect(g.fonts.get("primary")).toBe("Playfair Display");
    expect(g.width).toBe(1200);
    const brief = ElementorImport.brief(g);
    for (const s of [`primary: "#7A3E1D"`, `tertiary: "#D9A441"`, "fontFamily: Playfair Display", "fontFamily: Inter"]) expect(brief).toContain(s);
  });
  testE("a section of columns → a full-width box over a boxed grid; the widgets keep their content, colours and breakpoints", () => {
    const r = elementor(e(kit[2]!), e(kit[1]!));
    expect(r.roots.length).toBe(2);
    const hero = r.nodes[r.roots[0]!]!;
    expect([hero.kind, hero.align]).toEqual(["Section", "full"]);
    expect(st(hero)["min-height"]).toBe("80vh");
    expect(st(hero)["background-image"]).toContain("cafe.jpg");
    expect(st(hero)["background-image"]!.startsWith("linear-gradient(color-mix(in srgb, #000000 50%")).toBe(true);
    expect(st(hero, "mobile")["padding-block-start"]).toBe("60px");
    const grid = r.nodes[hero.children[0]!]!;
    expect(st(grid)["grid-template-columns"]).toBe("minmax(0, 60fr) minmax(0, 40fr)");
    expect(st(grid)["max-width"]).toBe("1200px");
    expect(st(grid, "mobile")["grid-template-columns"]).toBe("minmax(0, 1fr)");
    const h1 = all(r).find((n) => n.kind === "Heading" && n.level === 1)!;
    expect(h1.text).toBe("Coffee roasted <em>next door</em>");
    expect(st(h1).color).toBe("#F6EFE4");
    expect(st(h1)["font-family"]).toBe("var(--wp--preset--font-family--auvyx-heading)");
    expect(st(h1, "mobile")["font-size"]).toBe("40px");
    expect(st(h1, "mobile")["text-align"]).toBe("center");
    expect(h1.className).toContain("auvyx-animate-up");
    const texts = all(r).filter((n) => n.kind === "Text").map((n) => n.text);
    expect(texts).toContain("Open every day from <strong>7am</strong>.");
    expect(texts.some((t) => t.startsWith("Bring a book."))).toBe(true);
    expect(texts.some((t) => t.includes("script") || t.includes("onclick"))).toBe(false);
    const button = all(r).find((n) => n.kind === "Button")!;
    expect([button.text, button.href]).toEqual(["See the menu", "/menu/"]);
    expect(st(button)["background-color"]).toBe("var(--wp--preset--color--auvyx-primary)");
    expect(button.styles.base?.hover?.["background-color"]).toBe("#2F2A26");
    expect(st(button)["border-radius"]).toBe("30px");
    const img = all(r).find((n) => n.kind === "Image")!;
    expect([img.src, img.alt]).toEqual(["https://example.com/wp-content/uploads/latte.jpg", "A latte with a leaf drawn in the foam"]);
    expect(st(img).width).toBe("80%");
  });
  testE("icon box, spacer, list, accordion and video convert; HTML is kept as a block; the form is marked and listed", () => {
    const r = elementor(e(kit[2]!));
    const n = all(r);
    expect(n.some((x) => x.kind === "Heading" && x.text === "Beans" && x.level === 3)).toBe(true);
    expect(n.some((x) => x.label === "Spacer" && st(x).height === "30px")).toBe(true);
    expect(n.some((x) => x.kind === "Text" && x.text === `<a href="/garden/">Garden</a>`)).toBe(true);
    expect(n.some((x) => x.kind === "Accordion" && x.text === "Do you take cards?")).toBe(true);
    expect(n.some((x) => x.kind === "Video" && x.src.includes("youtube.com"))).toBe(true);
    expect(n.some((x) => x.kind === "Raw" && x.blockName === "core/html" && x.raw.includes("Kept as HTML"))).toBe(true);
    expect(r.kept).toEqual(["form"]);
    expect(n.some((x) => x.label === "Elementor: form")).toBe(true);
  });
  testE("flexbox containers: direction per breakpoint, gap, widths; the outer one is a full-width section with a boxed inside", () => {
    const r = elementor(e(kit[3]!));
    const outer = r.nodes[r.roots[0]!]!;
    expect(outer.align).toBe("full");
    const inner = r.nodes[outer.children[0]!]!;
    expect(st(inner)["flex-direction"]).toBe("row");
    expect(st(inner, "mobile")["flex-direction"]).toBe("column");
    expect(st(inner).gap).toBe("32px");
    const halves = inner.children.map((id) => r.nodes[id]!);
    expect(halves.every((h) => st(h).width === "50%" && st(h, "mobile").width === "100%")).toBe(true);
    expect(all(r).some((x) => x.kind === "Text" && x.text === "$3")).toBe(true);
  });
  testE("Pro widgets: the form becomes an Auvyx form, slides a slider, price table, countdown, social links, rating and headline convert", () => {
    const r = elementor(e("pro-widgets.json"));
    const n = all(r);
    const form = n.find((x) => x.blockName === "auvyx/form")!;
    const def = JSON.parse(/<!-- wp:auvyx\/form (\{.*\}) \/-->/s.exec(form.raw)![1]!.replace(/\\u([0-9a-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
    expect(def.fields.map((f: { name: string; kind: string; required?: boolean }) => [f.name, f.kind, f.required ?? false]))
      .toEqual([["name", "text", true], ["email", "email", true], ["party", "select", false]]);
    expect(def.fields[2].options).toEqual(["2", "4", "6"]);
    expect([def.submit, def.success]).toEqual(["Book a table", "See you soon."]);
    const slider = n.find((x) => x.label === "Slider")!;
    expect(slider.children.length).toBe(2);
    expect(slider.className).toContain("auvyx-autoplay-4");
    expect(st(r.nodes[slider.children[0]!]!)["background-image"]).toContain("slide-1.jpg");
    expect(n.some((x) => x.kind === "Text" && x.text.startsWith("<strong>$19</strong> a month"))).toBe(true);
    expect(n.some((x) => x.className.split(" ").includes("auvyx-until-20261224t1800z"))).toBe(true);
    expect(n.some((x) => x.kind === "Button" && x.text === "Instagram" && x.href === "https://instagram.com/cornercafe")).toBe(true);
    expect(n.some((x) => x.kind === "Text" && x.text.includes("★★★★☆"))).toBe(true);
    expect(n.some((x) => x.kind === "Heading" && x.text === "Coffee for <em>slow mornings</em>" && x.level === 2)).toBe(true);
    expect(r.kept).toEqual(["lottie"]);
  });
  testE("a designed page (Kettle and Crumb): quote colours, list ticks, image boxes, widths and buttons", () => {
    const r = elementor(e("kettle/kettle-home.json"), e("kettle/site-settings.json"));
    const n = all(r);
    expect(r.kept).toEqual([]);
    const quote = n.find((x) => x.kind === "Text" && x.text.startsWith("“The best flat white"))!;
    expect([st(quote).color, st(quote)["font-size"]]).toEqual(["#FFFFFF", "30px"]);
    expect(st(n.find((x) => x.kind === "Text" && x.text === "Linh Tran")!).color).toBe("#C8873E");
    const ticks = n.filter((x) => x.kind === "Text" && x.text === "✓");
    expect(ticks.length).toBe(3);
    expect(ticks.every((t) => st(t).color === "#C8873E")).toBe(true);
    const dish = n.find((x) => x.kind === "Image" && x.src.endsWith("timber-wide-2.jpg"))!;
    expect([st(dish).width, st(dish)["margin-block-end"], st(dish)["border-radius"]]).toEqual(["100%", "20px", "14px"]);
    const lead = n.find((x) => x.kind === "Text" && x.text.startsWith("Single-origin"))!;
    expect([st(lead).width, st(lead)["max-width"]]).toEqual(["560px", "100%"]);
    const call = n.find((x) => x.kind === "Button" && x.text === "Call the café")!;
    expect("align-self" in st(call)).toBe(false);
    expect(call.href).toBe("tel:+15550100");
  });
  test("a theme's own widgets are read by rule: a category card with its sub-list, line heights, phone columns", () => {
    const r = elementor(join(import.meta.dir, "import/fixtures/theme-card.json"));
    const n = all(r);
    expect(r.kept).toEqual([]);
    expect(n.some((x) => st(x)["background-image"]?.includes("phones.jpg"))).toBe(false);
    expect(n.some((x) => x.kind === "Image" && x.src.endsWith("phones.jpg"))).toBe(true);
    const card = n.find((x) => "box-shadow" in st(x))!;
    expect([st(card)["box-shadow"], st(card)["border-radius"], st(card)["background-color"]]).toEqual(["0px 3px 6px 0px rgba(0, 0, 0, 0.05)", "12px", "var(--wp--preset--color--auvyx-base)"]);
    const tablets = n.find((x) => x.text === "Tablets")!;
    expect([tablets.kind, tablets.href, st(tablets)["text-decoration"]]).toEqual(["Button", "https://old.example/tablets/", "none"]);
    expect(n.some((x) => x.kind === "Text" && x.text === "Cases")).toBe(true);
    const grid = n.find((x) => st(x).display === "grid" && x.children.length === 2)!;
    expect(st(grid, "mobile")["grid-template-columns"]).toBe("repeat(2, minmax(0, 1fr))");
    const cols = grid.children.map((id) => r.nodes[id]!);
    expect(st(cols[0]!, "mobile")["padding-inline-start"]).toBe("15px");
    expect(st(cols[1]!, "mobile")["padding-inline-start"]).toBe("4px");
  });
  test("more theme rules: a price card, text as a title, words on a panel, a band behind a newsletter, slides that point at products", () => {
    const r = elementor(join(import.meta.dir, "import/fixtures/theme-rules.json"));
    const n = all(r);
    const named = (l: string) => n.filter((x) => x.label === l);
    expect(n.some((x) => x.kind === "Accordion")).toBe(false);
    expect(st(named("Price table")[0]!)["background-color"]).toBe("#FAFAFA");
    expect(n.some((x) => x.text.startsWith("$29") && x.text.includes("/month")) && n.some((x) => x.kind === "Button" && x.text === "Start")).toBe(true);
    expect(n.some((x) => x.kind === "Image" && x.src.endsWith("sofa.jpg"))).toBe(true);
    expect(n.some((x) => x.text === "Sofas") && n.some((x) => x.text === "From $399")).toBe(true);
    const decor = named("Banner").find((x) => st(x)["background-image"]?.includes("decor.jpg"))!;
    expect([st(decor)["justify-content"], st(decor)["align-items"]]).toEqual(["flex-end", "flex-end"]);
    expect(st(r.nodes[decor.children[0]!]!)["background-color"]).toBe("#FFFFFF");
    const sale = named("Banner").find((x) => st(x)["background-image"]?.includes("sale.jpg"))!;
    expect([st(sale)["align-items"], st(sale)["text-align"]]).toEqual(["flex-end", "right"]);
    expect("color" in st(sale)).toBe(false);
    expect(n.some((x) => x.text === "Sale" && st(x).color === "#FFFFFF")).toBe(true);
    const band = n.find((x) => st(x)["background-image"]?.includes("green.jpg"))!;
    expect(st(r.nodes[band.children[0]!]!)["align-items"]).toBeUndefined();
    expect(named("Slider").length > 0 && !n.some((x) => x.kind === "Loop")).toBe(true);
  });
  test("a theme's product block becomes Auvyx's product card loop", () => {
    const r = elementor(join(import.meta.dir, "import/fixtures/theme-products.json"));
    const n = all(r);
    const loop = n.find((x) => x.kind === "Loop" && x.query.source === "woo/on_sale")!;
    expect(n.find((x) => x.kind === "Loop" && !x.query.source)!.query.perPage).toBe("4");
    expect([loop.query.postType, loop.query.perPage, loop.query.source]).toEqual(["product", "10", "woo/on_sale"]);
    expect(st(loop)["grid-template-columns"]).toBe("repeat(5, minmax(0, 1fr))");
    const carousel = n.find((x) => x.kind === "Loop" && x.query.perPage === "4")!;
    expect([carousel.query.orderBy, carousel.query.order]).toEqual(["menu_order", "asc"]);
    const best = n.find((x) => x.kind === "Loop" && x.query.source === "woo/best_sellers")!;
    expect([best.query.orderBy, best.query.order, best.query.taxonomy, best.query.terms]).toEqual(["date", "asc", "product_cat", "shoes,bags"]);
    expect(n.some((x) => x.className.includes("auvyx-card"))).toBe(true);
    expect(n.some((x) => Object.values(x.bind).includes("woo/price")) && n.some((x) => Object.values(x.bind).includes("woo/was_price"))).toBe(true);
    expect(n.some((x) => x.kind === "Heading" && x.text === "New arrivals")).toBe(true);
  });
  test("a widget's own title right under a heading saying the same is dropped; the heading, text and buttons stay", () => {
    const r = elementor(join(import.meta.dir, "import/fixtures/dedupe-titles.json"), undefined, "https://auvyx.invalid/assets");
    const titles = all(r).filter((x) => x.text.replace(/<[^>]+>/g, "").toLowerCase() === "shop by category");
    expect(titles.filter((x) => x.kind === "Heading").length).toBe(1);
    expect(titles.some((x) => x.kind === "Text")).toBe(true);
    for (const x of all(r)) for (const c of x.children) expect(r.nodes[c]).toBeDefined();
  });
});

describe("FlatsomeImport (FlatsomeImportSuite)", () => {
  const page = hasFlatsome ? megaShop() : "";
  const media = hasFlatsome ? megaMedia() : new Map<string, string>();
  testF("the Mega Shop page is recognised; picture ids are collected for lookup", () => {
    expect(FlatsomeImport.detect(page)).toBe(true);
    expect(FlatsomeImport.detect("<p>Plain [gallery] text</p>")).toBe(false);
    expect(media.has("8989") && media.has("8687")).toBe(true);
  });
  test("parse: containers by balanced closing tags; lone tags stand alone; attributes in any quoting", () => {
    const nodes = FlatsomeImport.parse(`[row][col span="6"]<p>A</p>[button text='Go' link=shop][/col][/row][gap]`);
    expect(nodes.map((n) => n.type === "tag" && n.name)).toEqual(["row", "gap"]);
    const row = nodes[0] as FlatsomeImport.Tag;
    const col = row.children[0] as FlatsomeImport.Tag;
    expect(col.name).toBe("col");
    expect(col.attrs.get("span")).toBe("6");
    expect(col.children.map((c) => c.type)).toEqual(["html", "tag"]);
    const button = col.children[1] as FlatsomeImport.Tag;
    expect(Object.fromEntries(button.attrs)).toEqual({ text: "Go", link: "shop" });
    expect(button.children).toEqual([]);
  });
  testF("Mega Shop → Auvyx: slider of banners with positioned text boxes, rows, live products; unknown shortcodes kept", () => {
    const r = FlatsomeImport.build(page, media, ASSETS, ids("f"));
    const n = all(r);
    const slider = n.find((x) => x.label === "Slider")!;
    expect(slider.className).toContain("auvyx-autoplay-6");
    expect(slider.children.map((id) => r.nodes[id]!).filter((x) => x.label === "Banner").length).toBe(2);
    expect(st(r.nodes[slider.children[0]!]!)["background-image"]).toContain("8989.jpg");
    const box = n.filter((x) => x.label === "Text box");
    expect(box.length).toBe(6);
    expect(box.some((b) => st(b).left === "10%")).toBe(true);
    expect(n.some((x) => x.kind === "Loop" && x.query.postType === "product")).toBe(true);
    expect(n.some((x) => x.kind === "Loop" && x.query.postType === "post")).toBe(true);
    expect(n.filter((x) => x.label === "Icon box").length).toBe(3);
    expect(n.some((x) => x.kind === "Button" && x.text === "Shop now" && x.href === "/shop/")).toBe(true);
    expect(n.some((x) => x.className.includes("auvyx-animate-up"))).toBe(true);
    expect(new Set(r.kept)).toEqual(new Set(["ux_product_categories", "contact-form-7", "ux_instagram_feed"]));
    expect(r.roots.every((id) => r.nodes[id]!.kind === "Section")).toBe(true);
  });
  testF("the converted page is saved as Auvyx blocks, byte for byte the Studio's snapshot (mega-shop.html)", () => {
    const r = FlatsomeImport.build(page, media, ASSETS, ids("f"));
    expect(markupOf(r) + "\n").toBe(read(join(flatsomeDir, "mega-shop.html")));
  });
});
