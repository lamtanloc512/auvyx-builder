import { describe, expect, test } from "bun:test";
import {
  getBlockAt,
  insertBlock,
  moveBlock,
  removeBlock,
  setBlockStyle,
  setStyle,
  setStyles,
  type BlockNode,
} from "./index";

const base = { breakpoint: "base", state: "default" } as const;
const mobile = { breakpoint: "mobile", state: "default" } as const;

describe("setStyle", () => {
  test("adds, trims and prunes", () => {
    const a = setStyle(undefined, base, "gap", " 1rem ");
    expect(a).toEqual({ v: 1, styles: { base: { default: { gap: "1rem" } } } });
    const b = setStyle(a, mobile, "gap", "0.5rem");
    expect(b?.styles.mobile?.default?.gap).toBe("0.5rem");
    const c = setStyle(b, mobile, "gap", "");
    expect(c).toEqual(a);
    expect(setStyle(c, base, "gap", undefined)).toBeUndefined();
  });

  test("does not mutate input", () => {
    const a = setStyle(undefined, base, "gap", "1rem");
    const snapshot = structuredClone(a);
    setStyle(a, base, "color", "red");
    expect(a).toEqual(snapshot);
  });

  test("setStyles applies a batch", () => {
    expect(
      setStyles(undefined, base, { "padding-block-start": "1rem", "padding-block-end": "1rem" })
        ?.styles.base?.default
    ).toEqual({ "padding-block-start": "1rem", "padding-block-end": "1rem" });
  });
});

const leaf = (name: string): BlockNode => ({ name, attributes: {}, innerBlocks: [] });
const tree: BlockNode[] = [
  { name: "auvyx/section", attributes: {}, innerBlocks: [leaf("auvyx/heading"), leaf("auvyx/text")] },
  leaf("auvyx/button"),
];

describe("tree operations", () => {
  test("getBlockAt", () => {
    expect(getBlockAt(tree, [0, 1])?.name).toBe("auvyx/text");
    expect(getBlockAt(tree, [5])).toBeUndefined();
  });

  test("insert and remove are immutable", () => {
    const inserted = insertBlock(tree, [0, 0], leaf("auvyx/button"));
    expect(inserted[0]?.innerBlocks.map((b) => b.name)).toEqual([
      "auvyx/button",
      "auvyx/heading",
      "auvyx/text",
    ]);
    expect(tree[0]?.innerBlocks).toHaveLength(2);
    expect(removeBlock(inserted, [0, 0])).toEqual(tree);
  });

  test("moveBlock moves across levels", () => {
    const moved = moveBlock(tree, [1], [0, 2]);
    expect(moved).toHaveLength(1);
    expect(moved[0]?.innerBlocks.map((b) => b.name)).toEqual([
      "auvyx/heading",
      "auvyx/text",
      "auvyx/button",
    ]);
  });

  test("setBlockStyle writes the auvyx attribute", () => {
    const styled = setBlockStyle(tree, [0, 0], mobile, "font-size", "2rem");
    expect(getBlockAt(styled, [0, 0])?.attributes.auvyx).toEqual({
      v: 1,
      styles: { mobile: { default: { "font-size": "2rem" } } },
    });
  });

  test("throws on invalid paths", () => {
    expect(() => removeBlock(tree, [9])).toThrow(RangeError);
    expect(() => insertBlock(tree, [], leaf("x"))).toThrow(RangeError);
  });
});
