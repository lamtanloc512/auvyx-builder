/**
 * Pages saved by Auvyx Studio (deprecated; Auvyx Editor is the only editor now) open in Auvyx Editor and are saved back
 * unchanged. The Studio stored nothing but block markup in post_content (no post meta, no document of its own): WordPress
 * gives it to the editor as Studio::tree() does (markupToTree here), decodeTree makes the editor's document, serialize
 * writes it back. Fixtures: markup the Studio wrote (products/builder/tests/fixtures/studio.html, its snapshot, and
 * compat/<version>-studio.html, as released versions saved it).
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { decodeTree, markupToTree, serialize } from "../src/index";

const FIXTURES = new URL("../../../products/builder/tests/fixtures/", import.meta.url).pathname;
const files = ["studio.html", ...readdirSync(FIXTURES + "compat").filter((f) => f.endsWith(".html")).map((f) => `compat/${f}`)];

/** What Studio::tree() adds on load: a snippet's theme class (`auvyx-snippet--dark` when none is set), as the PHP does. */
const asLoaded = (markup: string) =>
  markup.replace(/(<!-- wp:auvyx\/snippet \{(?:(?!"className")[^\n])*?"language":"[^"]*")(,"auvyx")/g, '$1,"className":"auvyx-snippet\\u002d\\u002ddark"$2');

describe("pages saved by Auvyx Studio open and save unchanged in Auvyx Editor", () => {
  test("there are Studio-saved fixtures", () => expect(files.length).toBeGreaterThan(1));
  for (const file of files) {
    test(file, () => {
      const markup = readFileSync(FIXTURES + file, "utf8").replace(/\n$/, "");
      const tree = markupToTree(markup);
      expect(tree.length).toBeGreaterThan(0);
      const doc = decodeTree(tree);
      expect(doc.roots.length).toBe(tree.length);
      expect(serialize(doc)).toBe(asLoaded(markup));
    });
  }

  test("the Studio's elements become the editor's own (not kept as raw WordPress blocks)", () => {
    const doc = decodeTree(markupToTree(readFileSync(FIXTURES + "studio.html", "utf8")));
    const kinds = new Set(Object.values(doc.nodes).map((n) => n.kind));
    for (const kind of ["Section", "Heading", "Text", "Button", "Image", "Icon", "Divider", "Video", "Accordion"]) expect(kinds).toContain(kind);
  });
});
