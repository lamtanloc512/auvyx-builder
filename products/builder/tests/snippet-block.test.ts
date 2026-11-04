import { describe, expect, test } from "bun:test";
import { createBlock, getSaveContent } from "@wordpress/blocks";
import "../editor/index";

describe("auvyx/snippet block", () => {
  test("save() matches PHP-shaped markup", () => {
    const block = createBlock("auvyx/snippet", {
      code: "SELECT 1;",
      language: "sql",
      theme: "dark",
    });
    const html = getSaveContent(block.name, block.attributes, []);
    expect(html).toContain("auvyx-snippet");
    expect(html).toContain("token-keyword");
    expect(html).toContain("SELECT");
    expect(html).toContain("auvyx-snippet__copy");
    expect(html).toContain('data-auvyx-snippet="1"');
  });
});
