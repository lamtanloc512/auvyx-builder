/** Runs the TypeScript importers on every case ImportOracle.scala ran the Scala ones on (same inputs, same id counters). */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serialize } from "../../src/markup";
import type { El } from "../../src/model";
import { convert } from "../../src/import/importFile";
import * as ElementorImport from "../../src/import/elementor";
import * as FlatsomeImport from "../../src/import/flatsome";
import { readJson, writeJson, type JObj } from "../../src/import/jvm";

export const repo = join(import.meta.dir, "../../../..");
export const elementorDir = join(repo, "products/builder/tests/fixtures/elementor");
export const flatsomeDir = join(repo, "products/builder/tests/fixtures/flatsome");
/**
 * The Elementor and Flatsome fixtures are third-party pages: they stay in the private repository (the public export leaves
 * them out, tools/export-public.ts), and what reads them is skipped where they are missing.
 */
export const hasElementor = existsSync(join(elementorDir, "landing-template.json"));
export const hasFlatsome = existsSync(join(flatsomeDir, "mega-shop.txt"));
/** Whether the fixtures an oracle case reads are here. */
export const runnable = (name: string) =>
  /^(convert-)?(mega-shop)$/.test(name) ? hasFlatsome : /^(convert-)?(kit-|landing|pro-widgets|kettle|site-settings)/.test(name) ? hasElementor : true;
const local = join(import.meta.dir, "fixtures");
export const read = (p: string) => readFileSync(p, "utf8");
export const ids = (prefix: string) => { let n = 0; return () => `${prefix}${++n}`; };
export const ASSETS = "https://auvyx.invalid/assets/placeholders";

export interface Made { roots: string[]; nodes: Record<string, El>; kept: string[]; source?: string }
export type Case = Made | { error: string };

export function elementor(file: string, globals?: string, assets = ASSETS): Made {
  const p = ElementorImport.piece(readJson(read(file)), file.split("/").pop()!)!;
  const g = (globals && ElementorImport.globals(readJson(read(globals)))) || ElementorImport.emptyGlobals();
  return ElementorImport.build(p.elements, g, assets, ids("e"));
}

export const megaShop = () => read(join(flatsomeDir, "mega-shop.txt"));
export const megaMedia = () => new Map(FlatsomeImport.mediaIds(megaShop()).map((id) => [id, `https://example.com/uploads/${id}.jpg`]));

const conv = (file: string, text: string): Case => {
  const r = convert(file, text, ASSETS, ids("i"));
  return r.ok ? { roots: [...r.value.doc.roots], nodes: { ...r.value.doc.nodes }, kept: r.value.kept, source: r.value.source } : { error: r.error };
};

export function cases(): Record<string, () => Case> {
  const e = (p: string) => join(elementorDir, p);
  const landing = () => read(e("landing-template.json"));
  return {
    "kit-12-globals": () => elementor(e("kit/content/page/12.json"), e("kit/site-settings.json")),
    "kit-12": () => elementor(e("kit/content/page/12.json")),
    "kit-15": () => elementor(e("kit/content/page/15.json")),
    "kit-34": () => elementor(e("kit/templates/34.json")),
    "kit-35": () => elementor(e("kit/templates/35.json")),
    landing: () => elementor(e("landing-template.json")),
    "pro-widgets": () => elementor(e("pro-widgets.json")),
    kettle: () => elementor(e("kettle/kettle-home.json"), e("kettle/site-settings.json")),
    "theme-card": () => elementor(join(local, "theme-card.json")),
    "theme-rules": () => elementor(join(local, "theme-rules.json")),
    "theme-products": () => elementor(join(local, "theme-products.json")),
    "dedupe-titles": () => elementor(join(local, "dedupe-titles.json"), undefined, "https://auvyx.invalid/assets"),
    "mega-shop": () => FlatsomeImport.build(megaShop(), megaMedia(), ASSETS, ids("f")),
    "convert-studio": () => conv("page.json", JSON.stringify({ version: 1, roots: ["a"], nodes: { a: { id: "a", kind: "Heading", text: "Hi", level: 1 } } })),
    "convert-elementor-small": () => conv("t.json", `{"version":"0.4","title":"T","type":"page","content":[{"id":"s","elType":"section","settings":{},"elements":[{"id":"c","elType":"column","settings":{},"elements":[
      {"id":"w","elType":"widget","widgetType":"heading","settings":{"title":"Hello"}}]}]}]}`),
    "convert-flatsome-small": () => conv("p.txt", `[row][col span="6"][button text="Go" link="/shop"][/col][/row]`),
    "convert-bad-json": () => conv("x.json", "{nope"),
    "convert-other-json": () => conv("x.json", `{"a":1}`),
    "convert-plain": () => conv("x.txt", "plain words"),
    "convert-no-piece": () => conv("x.json", `{"settings":{"system_colors":[]}}`),
    "convert-mega-shop": () => conv("mega-shop.txt", megaShop()),
    "convert-landing": () => conv("landing-template.json", landing()),
    "convert-landing-meta": () => conv("elementor.json", writeJson((readJson(landing()) as JObj).get("content")!)),
    "convert-kit-12": () => conv("12.json", read(e("kit/content/page/12.json"))),
    "convert-kit-15": () => conv("15.json", read(e("kit/content/page/15.json"))),
    "convert-pro-widgets": () => conv("pro-widgets.json", read(e("pro-widgets.json"))),
    "convert-kettle": () => conv("kettle-home.json", read(e("kettle/kettle-home.json"))),
    "convert-site-settings": () => conv("site-settings.json", read(e("kit/site-settings.json"))),
  };
}

/** A node as the Scala DocJson writes it (its fields, maps in their order), for comparing documents. */
export const canon = (n: Record<string, unknown>) => JSON.stringify([
  n.id, n.kind, n.text, n.tag, n.level, n.href, n.styles, n.children, n.src, n.alt, n.icon, n.mediaId, n.align, n.className, n.anchor,
  n.blockName, n.raw, n.html, n.bind, n.query, n.locked, n.label, n.target, n.css, n.markup, n.script, n.libs, n.uses, n.game,
]);

export const markupOf = (m: Made) => serialize({ roots: m.roots, nodes: m.nodes });
