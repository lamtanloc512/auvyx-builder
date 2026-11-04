import { describe, expect, test } from "bun:test";
import { computeDrag, handleProperties, lengthToPx, logicalProperty, type DragInput } from "./drag";

const start = {
  padding: { top: 16, right: 16, bottom: 16, left: 16 },
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  gap: 10,
  width: 300,
  height: 100,
  radius: 4,
};
const none = { shift: false, alt: false, meta: false };
const tokens = [
  { slug: "auvyx-sm", px: 16 },
  { slug: "auvyx-md", px: 24 },
];
const drag = (partial: Partial<DragInput>) =>
  computeDrag({ handle: { type: "width" }, start, dx: 0, dy: 0, modifiers: none, rtl: false, tokens: [], ...partial });

describe("logicalProperty", () => {
  test("LTR and RTL", () => {
    expect(logicalProperty("padding", "top", false)).toBe("padding-block-start");
    expect(logicalProperty("padding", "left", false)).toBe("padding-inline-start");
    expect(logicalProperty("padding", "left", true)).toBe("padding-inline-end");
    expect(logicalProperty("margin", "right", true)).toBe("margin-inline-start");
  });
});

describe("padding", () => {
  test("dragging the top handle down grows padding-top", () => {
    expect(drag({ handle: { type: "padding", side: "top" }, dy: 9 }).patch).toEqual({
      "padding-block-start": "25px",
    });
  });

  test("dragging the bottom handle up grows padding-bottom; never negative", () => {
    expect(drag({ handle: { type: "padding", side: "bottom" }, dy: -4 }).patch).toEqual({
      "padding-block-end": "20px",
    });
    expect(drag({ handle: { type: "padding", side: "bottom" }, dy: 400 }).patch).toEqual({
      "padding-block-end": "0px",
    });
  });

  test("snaps to spacing tokens within 3px, meta disables it", () => {
    const result = drag({ handle: { type: "padding", side: "left" }, dx: 6, tokens });
    expect(result.patch).toEqual({ "padding-inline-start": "var(--wp--preset--spacing--auvyx-md)" });
    expect(result.label).toBe("Padding left · auvyx-md (24px)");
    expect(
      drag({ handle: { type: "padding", side: "left" }, dx: 6, tokens, modifiers: { ...none, meta: true } }).patch
    ).toEqual({ "padding-inline-start": "22px" });
  });

  test("alt = symmetric, shift = all sides", () => {
    expect(
      Object.keys(drag({ handle: { type: "padding", side: "top" }, dy: 4, modifiers: { ...none, alt: true } }).patch)
    ).toEqual(["padding-block-start", "padding-block-end"]);
    expect(
      Object.keys(drag({ handle: { type: "padding", side: "top" }, dy: 4, modifiers: { ...none, shift: true } }).patch)
    ).toHaveLength(4);
  });
});

describe("margin", () => {
  test("handles sit outside: dragging the top handle up grows margin-top, can go negative", () => {
    expect(drag({ handle: { type: "margin", side: "top" }, dy: -12 }).patch).toEqual({
      "margin-block-start": "12px",
    });
    expect(drag({ handle: { type: "margin", side: "top" }, dy: 5 }).patch).toEqual({
      "margin-block-start": "-5px",
    });
  });
});

describe("gap, size, radius", () => {
  test("gap follows the main axis", () => {
    expect(drag({ handle: { type: "gap", axis: "x" }, dx: 4 }).patch).toEqual({ gap: "14px" });
    expect(drag({ handle: { type: "gap", axis: "y" }, dy: 30 }).patch).toEqual({ gap: "40px" });
  });

  test("width, min-height and corner", () => {
    expect(drag({ handle: { type: "width" }, dx: -50 }).patch).toEqual({ width: "250px" });
    expect(drag({ handle: { type: "height" }, dy: 20 }).patch).toEqual({ "min-height": "120px" });
    expect(drag({ handle: { type: "size" }, dx: 3, dy: 5, modifiers: { ...none, shift: true } })).toEqual({
      patch: { width: "304px", "min-height": "104px" },
      label: "304 × 104",
    });
  });

  test("radius uses the diagonal", () => {
    expect(drag({ handle: { type: "radius" }, dx: 10, dy: 6 }).patch).toEqual({ "border-radius": "12px" });
  });
});

test("handleProperties matches what computeDrag writes", () => {
  expect(handleProperties({ type: "padding", side: "right" }, false)).toEqual(["padding-inline-end"]);
  expect(handleProperties({ type: "size" }, false)).toEqual(["width", "min-height"]);
});

test("lengthToPx", () => {
  expect(lengthToPx("1.5rem", 16)).toBe(24);
  expect(lengthToPx("12px", 16)).toBe(12);
  expect(lengthToPx("clamp(1rem, 2vw, 2rem)", 16)).toBeUndefined();
});
