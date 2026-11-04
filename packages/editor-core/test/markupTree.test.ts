/**
 * The template library (products/builder/patterns/generated, written by the Scala BlockMarkup) read back through
 * markupToTree (parse_blocks + Studio::tree()) and decodeTree, then written by serialize: byte for byte the same.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { decodeTree, markupToTree, parseBlocks, serialize } from "../src/index";

// Auvyx Builder's library and Auvyx Builder Pro's (docs/editions.md).
const DIRS = ["../../../products/builder/patterns/generated/", "../../../products/pro/patterns/generated/"].map((d) => new URL(d, import.meta.url).pathname).filter((d) => existsSync(d));
const files = DIRS.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith(".html")).sort().map((f) => dir + f));

describe("parseBlocks", () => {
  test("freeform, void, nested, namespaces and attributes as parse_blocks()", () => {
    const md = 'Hi <!-- wp:auvyx/section {"tagName":"div"} -->\n<div>\n\n<!-- wp:paragraph -->\n<p>x</p>\n<!-- /wp:paragraph -->\n\n</div>\n<!-- /wp:auvyx/section -->\n\n<!-- wp:spacer {"height":"40px"} /-->';
    const out = parseBlocks(md);
    expect(out.map((b) => b.blockName)).toEqual([null, "auvyx/section", null, "core/spacer"]);
    expect(out[0]!.innerHTML).toBe("Hi ");
    const s = out[1]!;
    expect(s.attrs).toEqual({ tagName: "div" });
    expect(s.innerBlocks[0]!.blockName).toBe("core/paragraph");
    expect(s.innerHTML).toBe("\n<div>\n\n\n\n</div>\n");
    expect(s.innerContent).toEqual(["\n<div>\n\n", null, "\n\n</div>\n"]);
    expect(md.slice(s.start, s.end)).toStartWith("<!-- wp:auvyx/section");
    expect(md.slice(s.start, s.end)).toEndWith("<!-- /wp:auvyx/section -->");
    expect(out[3]!.attrs).toEqual({ height: "40px" });
  });
});

describe("every generated template round-trips", () => {
  test("there are templates", () => expect(files.length).toBeGreaterThan(100));
  for (const f of files) {
    test(f.split("/products/")[1]!, () => {
      const markup = readFileSync(f, "utf8").replace(/\n$/, "");
      const tree = markupToTree(markup);
      expect(tree.length).toBe(1);
      // Studio::tree() names a snippet's theme in its className (`auvyx-snippet--dark` when none is set), so a dark snippet
      // that had no className comes back with one: the PHP does the same to a page it loads. Same page HTML.
      const expected = markup.replace(/(<!-- wp:auvyx\/snippet \{(?:(?!"className")[^\n])*?"language":"[^"]*")(,"auvyx")/g, '$1,"className":"auvyx-snippet\\u002d\\u002ddark"$2');
      expect(serialize(decodeTree(tree))).toBe(expected);
    });
  }
});
