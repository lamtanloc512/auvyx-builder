import { describe, expect, test } from "bun:test";
import {
  columnCount,
  columnTemplate,
  layoutMode,
  matrixPatch,
  matrixValue,
  modePatch,
} from "./auto-layout-model";

const resolver = (styles: Record<string, string>) => (property: string) => styles[property];

describe("layoutMode", () => {
  test.each([
    [{}, undefined],
    [{ display: "flex" }, "row"],
    [{ display: "flex", "flex-direction": "column-reverse" }, "column"],
    [{ display: "inline-grid" }, "grid"],
    [{ display: "inline-block" }, "block"],
    [{ display: "none" }, "none"],
  ] as const)("%p → %p", (styles, expected) => {
    expect(layoutMode(resolver(styles))).toBe(expected);
  });
});

test("modePatch clears flex-only properties when leaving flex", () => {
  expect(modePatch("column")).toEqual({ display: "flex", "flex-direction": "column" });
  expect(modePatch("grid")).toEqual({ display: "grid", "flex-direction": undefined, "flex-wrap": undefined });
});

describe("alignment matrix", () => {
  test("row: x = justify-content, y = align-items", () => {
    expect(matrixPatch("row", 2, 1)).toEqual({ "justify-content": "flex-end", "align-items": "center" });
    expect(matrixValue("row", resolver({ "justify-content": "flex-end", "align-items": "center" }))).toEqual({ x: 2, y: 1 });
  });

  test("column swaps the axes", () => {
    expect(matrixPatch("column", 0, 2)).toEqual({ "align-items": "flex-start", "justify-content": "flex-end" });
  });

  test("grid uses justify-items / align-items", () => {
    expect(matrixPatch("grid", 1, 1)).toEqual({ "justify-items": "center", "align-items": "center" });
  });

  test("unset justify-content is start; unset align-items is no cell", () => {
    expect(matrixValue("column", resolver({ "align-items": "center" }))).toEqual({ x: 1, y: 0 });
    expect(matrixValue("row", resolver({}))).toEqual({ x: 0, y: undefined });
  });

  test("space-between and unknown values are not a cell", () => {
    expect(matrixValue("row", resolver({ "justify-content": "space-between" }))).toEqual({ x: undefined, y: undefined });
  });
});

test("columns ⇄ count", () => {
  expect(columnCount("repeat(3, 1fr)")).toBe("3");
  expect(columnCount("200px 1fr")).toBe("200px 1fr");
  expect(columnTemplate("4")).toBe("repeat(4, minmax(0, 1fr))");
  expect(columnTemplate("1fr 2fr")).toBe("1fr 2fr");
});
