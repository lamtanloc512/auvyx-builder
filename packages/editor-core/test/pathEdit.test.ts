import { expect, test } from "bun:test";
import { PathEdit } from "../src/index";

// U/Tools.scala (pen geometry) and U/VectorEdit.scala (point moves). The Studio has no suite for these: the cases are
// what the Scala code answers, worked out by hand.
const { anchor, pathData, bounds, parsePath, toPage, written, drag, handleIn, num } = PathEdit;

test("numbers: one decimal, no .0, no -0", () => {
  expect(num(12)).toBe("12");
  expect(num(12.04)).toBe("12");
  expect(num(12.06)).toBe("12.1");
  expect(num(-0.04)).toBe("0");
  expect(num(-2.25)).toBe("-2.2"); // Math.round like Scala's (half up)
});

test("pathData: straight segments, closed with Z, shifted", () => {
  const pts = [anchor(10, 10), anchor(110, 10), anchor(60, 90)];
  expect(pathData(pts, false)).toBe("M10 10L110 10L60 90");
  expect(pathData(pts, true)).toBe("M10 10L110 10L60 90L10 10Z");
  expect(pathData(pts, true, 10, 10)).toBe("M0 0L100 0L50 80L0 0Z");
  // two points never close
  expect(pathData(pts.slice(0, 2), true)).toBe("M10 10L110 10");
  expect(pathData([], false)).toBe("");
});

test("pathData: a handle makes a curve, the incoming one mirrors", () => {
  const a = anchor(0, 0, [20, 0]);
  const b = anchor(100, 0, [120, 50]);
  expect(handleIn(b)).toEqual([80, -50]);
  expect(pathData([a, b], false)).toBe("M0 0C20 0 80 -50 100 0");
  // an own incoming handle wins over the mirror
  expect(pathData([a, anchor(100, 0, [120, 50], [90, 10])], false)).toBe("M0 0C20 0 90 10 100 0");
  // only the end has a handle: the start's control point is the start itself
  expect(pathData([anchor(0, 0), anchor(100, 0, undefined, [50, 50])], false)).toBe("M0 0C0 0 50 50 100 0");
});

test("bounds: the curve, not its handles; at least 2 × 2", () => {
  expect(bounds([anchor(10, 20), anchor(110, 20)], false)).toEqual([10, 20, 100, 2]);
  const [x, y, w, h] = bounds([anchor(0, 0, [0, 100]), anchor(100, 0, undefined, [100, 100])], false);
  expect([x, y, w]).toEqual([0, 0, 100]);
  // the curve peaks at 3/4 of the handles' height
  expect(h).toBeCloseTo(75, 0);
  expect(h).toBeLessThan(100);
  // closing adds the last → first segment
  const open = bounds([anchor(0, 0), anchor(50, 0, [50, 50]), anchor(100, 0)], false);
  const closed = bounds([anchor(0, 0), anchor(50, 0, [50, 50]), anchor(100, 0)], true);
  expect(closed).toEqual(open);
});

test("parsePath: absolute M/L/C/Z round-trips with pathData", () => {
  const pts = [anchor(0, 0, [20, 0]), anchor(100, 0, [120, 50]), anchor(50, 80)];
  for (const closed of [false, true]) {
    const d = pathData(pts, closed);
    const back = parsePath(d)!;
    expect(back.closed).toBe(closed);
    expect(pathData(back.points, back.closed)).toBe(d);
  }
});

test("parsePath: the closing segment back to the first point merges into it", () => {
  const r = parsePath("M0 0L100 0L50 80L0 0Z")!;
  expect(r.closed).toBe(true);
  expect(r.points.map((a) => [a.x, a.y])).toEqual([[0, 0], [100, 0], [50, 80]]);
  // a curved closing segment keeps its incoming handle on the first point
  const c = parsePath("M0 0L100 0L50 80C40 80 10 20 0 0Z")!;
  expect(c.points.length).toBe(3);
  expect(c.points[0]!.inH).toEqual([10, 20]);
  expect(c.points[2]!.out).toEqual([40, 80]);
});

test("parsePath: anything the pen does not write is refused", () => {
  expect(parsePath("M50 0L100 100H0Z")).toBeNull(); // H
  expect(parsePath("m0 0l10 10")).toBeNull(); // relative
  expect(parsePath("M0 0")).toBeNull(); // one point
  expect(parsePath("M0 0L10")).toBeNull(); // missing number
  expect(parsePath("C1 2 3 4 5 6")).toBeNull(); // a curve with no start
  expect(parsePath("M0 0 L 1e1 -.5")!.points[1]).toEqual(anchor(10, -0.5));
});

test("toPage: viewBox units stretched onto the element's box", () => {
  const pts = parsePath("M0 0L100 50")!.points;
  expect(toPage(pts, "0 0 100 50", { x: 10, y: 20, w: 200, h: 100 })).toEqual([anchor(10, 20), anchor(210, 120)]);
  // a bad viewBox is the default 0 0 100 100
  expect(toPage([anchor(50, 50, [100, 100])], "nope", { x: 0, y: 0, w: 10, h: 10 })).toEqual([anchor(5, 5, [10, 10])]);
});

test("written: path relative to its bounds, the viewBox and the page box", () => {
  const w = written([anchor(10, 20), anchor(110, 20), anchor(60, 100)], true);
  expect(w.d).toBe("M0 0L100 0L50 80L0 0Z");
  expect(w.viewBox).toBe("0 0 100 80");
  expect(w.box).toEqual({ x: 10, y: 20, w: 100, h: 80 });
});

test("drag: an anchor carries its handles; a handle pulls, the other mirrors", () => {
  const pts = [anchor(0, 0, [10, 0], [-5, 5]), anchor(100, 0)];
  expect(drag(pts, "a", 0, 0, 0, 5, 5)[0]).toEqual(anchor(5, 5, [15, 5], [0, 10]));
  const o = drag(pts, "o", 0, 0, 0, 20, 10)[0]!;
  expect(o).toEqual(anchor(0, 0, [20, 10]));
  expect(handleIn(o)).toEqual([-20, -10]);
  expect(drag(pts, "i", 0, 0, 0, -20, -10)[0]).toEqual(anchor(0, 0, [20, 10]));
  expect(drag(pts, "a", 1, 0, 0, 1, 1)[0]).toBe(pts[0]!);
});
