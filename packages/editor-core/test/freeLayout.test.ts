// Free frames (the Studio's FreeLayoutSuite): placement patches and constraints read back from them.
import { expect, test } from "bun:test";
import { normalizeStyles } from "@auvyx/style-engine";
import { freeConstraints, freeFrame, freePlace, type FreeH, type FreeV, type Geo } from "../src/index";

const g: Geo = { x: 100, y: 40, w: 200, h: 80 };
const map = (p: [string, string | undefined][]) => Object.fromEntries(p);
const HS: FreeH[] = ["Left", "Right", "LeftRight", "Center", "Scale"];
const VS: FreeV[] = ["Top", "Bottom", "TopBottom", "Center", "Scale"];

test("left/top: px insets and a fixed size", () => {
  const p = map(freePlace(g, 1000, 600, "Left", "Top", false));
  expect([p.position, p["inset-inline-start"], p["inset-block-start"], p.width, p.height, p["inset-inline-end"]]).toEqual(["absolute", "100px", "40px", "200px", "80px", undefined]);
});

test("center keeps the offset from the middle; right and stretch measure from the end", () => {
  expect(map(freePlace(g, 1000, 600, "Center", "Top", false))["inset-inline-start"]).toBe("calc(50% - 400px)");
  expect(map(freePlace({ x: 600, y: 0, w: 100, h: 10 }, 1000, 600, "Center", "Top", false))["inset-inline-start"]).toBe("calc(50% + 100px)");
  expect(map(freePlace(g, 1000, 600, "Right", "Bottom", false))["inset-inline-end"]).toBe("700px");
  expect(map(freePlace(g, 1000, 600, "Right", "Bottom", false))["inset-block-end"]).toBe("480px");
  const s = map(freePlace(g, 1000, 600, "LeftRight", "Top", false));
  expect([s["inset-inline-start"], s["inset-inline-end"], s.width]).toEqual(["100px", "700px", undefined]);
});

test("scale uses percentages; text keeps an automatic height", () => {
  const p = map(freePlace(g, 1000, 600, "Scale", "Top", true));
  expect([p["inset-inline-start"], p.width, p.height]).toEqual(["10%", "20%", undefined]);
});

test("constraints are read back, and every placement survives the sanitizer", () => {
  for (const h of HS) for (const v of VS) {
    const p = freePlace(g, 1000, 600, h, v, false);
    const m = map(p);
    expect(freeConstraints((k) => m[k])).toEqual([h, v]);
    const decls = Object.fromEntries(p.filter(([, x]) => x !== undefined)) as Record<string, string>;
    expect(normalizeStyles({ base: { default: decls } })).toEqual({ base: { default: decls } });
  }
  expect(map(freeFrame(420.4)).height).toBe("420px");
});
