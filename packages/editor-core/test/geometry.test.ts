import { expect, test } from "bun:test";
import { Arrange, Measure } from "../src/index";

// shared/MeasureSuite.scala
const R = (left: number, top: number, right: number, bottom: number): Measure.R => ({ left, top, right, bottom });
const L = (x1: number, y1: number, x2: number, y2: number, dashed = false): Measure.Line => ({ x1, y1, x2, y2, dashed });

test("inside a container: distance to each inner edge", () => {
  const [lines, tags] = Measure.between(R(20, 30, 80, 60), R(0, 0, 100, 100), true);
  expect(tags.map((t) => t.text)).toEqual(["30", "40", "20", "20"]);
  expect(lines[0]).toEqual(L(50, 0, 50, 30));
});

test("siblings side by side: one horizontal gap at the overlap, no extension", () => {
  const [lines, tags] = Measure.between(R(0, 0, 100, 50), R(124, 10, 200, 60), false);
  expect(tags.map((t) => t.text)).toEqual(["24"]);
  expect(lines).toEqual([L(100, 30, 124, 30)]);
});

test("diagonal: both gaps plus dashed extensions to the other element's edges", () => {
  const [lines, tags] = Measure.between(R(0, 0, 100, 50), R(150, 90, 250, 140), false);
  expect(tags.map((t) => t.text)).toEqual(["40", "50"]);
  expect(lines.filter((l) => l.dashed).length).toBe(2);
});

test("anchors: up to the sibling above, left to the parent edge", () => {
  const lines = Measure.anchors(R(100, 200, 200, 260), R(0, 0, 400, 400), [R(80, 50, 300, 150), R(300, 200, 380, 260)]);
  expect(lines).toEqual([L(150, 150, 150, 200), L(0, 230, 100, 230)]);
});

test("snap picks the nearest candidate within the threshold", () => {
  expect(Measure.snap(103, [100, 110, 200], 4)).toBe(100);
  expect(Measure.snap(150, [100, 200], 4)).toBeNull();
});

// shared/ArrangeSuite.scala
const G = (x: number, y: number, w: number, h: number): Arrange.Geo => ({ x, y, w, h });
const a = G(10, 10, 100, 50), b = G(150, 40, 60, 80), c = G(300, 20, 40, 40);

test("align to the selection's box", () => {
  const bounds = Arrange.bbox([a, b, c]);
  expect(bounds).toEqual(G(10, 10, 330, 110));
  expect(Arrange.align([a, b, c], "Left", bounds).map((g) => g.x)).toEqual([10, 10, 10]);
  expect(Arrange.align([a, b], "Bottom", bounds).map((g) => g.y + g.h)).toEqual([120, 120]);
  expect(Arrange.align([c], "CenterH", G(0, 0, 1000, 600))[0]!.x).toBe(480);
});

test("distribute keeps the ends and evens the gaps", () => {
  const out = Arrange.distribute([c, a, b], true);
  expect([out[1]!.x, out[2]!.x, out[0]!.x]).toEqual([10, 175, 300]);
});

test("infer: side by side → row, order by x, median gap, padding from the frame", () => {
  const auto = Arrange.infer([G(200, 40, 100, 50), G(40, 40, 100, 50), G(360, 40, 100, 50)], 500, 130);
  expect([auto.row, auto.order, auto.gap]).toEqual([true, [1, 0, 2], 60]);
  expect([auto.top, auto.right, auto.bottom, auto.left]).toEqual([40, 40, 40, 40]);
});

test("infer: stacked → column", () => {
  const auto = Arrange.infer([G(0, 100, 200, 40), G(0, 0, 200, 80)], 200, 140);
  expect([auto.row, auto.order, auto.gap]).toEqual([false, [1, 0], 20]);
});

// shared/FreeLayoutSuite.scala
const g = G(100, 40, 200, 80);
const map = (p: Arrange.Patch) => Object.fromEntries(p);

test("left/top: px insets and a fixed size", () => {
  const p = map(Arrange.place(g, 1000, 600, "Left", "Top", false));
  expect(p).toEqual({ position: "absolute", "inset-inline-start": "100px", "inset-inline-end": undefined, width: "200px", "inset-block-start": "40px", "inset-block-end": undefined, height: "80px" });
});

test("center keeps the offset from the middle; right and stretch measure from the end", () => {
  expect(map(Arrange.place(g, 1000, 600, "Center", "Top", false))["inset-inline-start"]).toBe("calc(50% - 400px)");
  expect(map(Arrange.place(G(600, 0, 100, 10), 1000, 600, "Center", "Top", false))["inset-inline-start"]).toBe("calc(50% + 100px)");
  const rb = map(Arrange.place(g, 1000, 600, "Right", "Bottom", false));
  expect([rb["inset-inline-end"], rb["inset-block-end"]]).toEqual(["700px", "480px"]);
  const stretch = map(Arrange.place(g, 1000, 600, "LeftRight", "Top", false));
  expect([stretch["inset-inline-start"], stretch["inset-inline-end"], stretch.width]).toEqual(["100px", "700px", undefined]);
});

test("scale uses percentages; text keeps an automatic height", () => {
  const p = map(Arrange.place(g, 1000, 600, "Scale", "Top", true));
  expect([p["inset-inline-start"], p.width, p.height]).toEqual(["10%", "20%", undefined]);
});

test("constraints are read back from the styles", () => {
  for (const h of ["Left", "Right", "LeftRight", "Center", "Scale"] as Arrange.H[])
    for (const v of ["Top", "Bottom", "TopBottom", "Center", "Scale"] as Arrange.V[]) {
      const p = map(Arrange.place(g, 1000, 600, h, v, false));
      expect(Arrange.constraints((k) => p[k])).toEqual([h, v]);
    }
});
