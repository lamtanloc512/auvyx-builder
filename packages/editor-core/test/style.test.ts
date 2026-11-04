// The Style panel's pure rules, with the cases of the Studio's ScrubSuite, DragSuite, TokenLabelsSuite,
// BackgroundSuite, OverridesSuite and StyleGroupsSuite, so both editors answer the same.
import { expect, test } from "bun:test";
import { isSafeValue, type Breakpoint, type Styles } from "@auvyx/style-engine";
import {
  allowsStyleGroup, composeBackground, decodeTree, el, getStyle, layoutMode, lengthToPx, logicalProperty, normalizeColumns, opacityPercent,
  overrideField, parseBackground, parseOpacity, pinOverride, prettyToken, repeatColumns, roundPx, scaleStep, scrubValue, shortSpace, showsDot,
  sizeMode, sourceOf, spaceLabelAt, spacePolygon, spacingScrub, STYLE_PANEL, toggleOverride, type Side, type SpaceModifiers, type SpacingToken,
} from "../src/index";

test("scrub: same results as the TS scrubValue", () => {
  expect(scrubValue("16px", undefined, 4)).toBe("20px");
  expect(scrubValue("1.5rem", undefined, 2, { step: 0.1 })).toBe("1.7rem");
  expect(scrubValue(undefined, "24px", -4)).toBe("20px");
  expect(scrubValue(undefined, undefined, 3)).toBe("3px");
  expect(scrubValue(undefined, undefined, 3, { unit: "" })).toBe("3");
  expect(scrubValue("0", undefined, 5)).toBe("5px");
  expect(scrubValue("0.8", undefined, 1, { step: 0.05, unit: "" })).toBe("0.85");
  expect(scrubValue("2px", undefined, -10, { min: 0 })).toBe("0px");
  expect(scrubValue("var(--x)", "auto", 2)).toBe("2px");
  expect(scrubValue("600", undefined, 1, { step: 100, unit: "" })).toBe("700");
  expect(scrubValue("-1.5em", undefined, -1, { step: 0.01, unit: "em" })).toBe("-1.51em");
});

const tokens: SpacingToken[] = [{ slug: "auvyx-md", px: 24 }];
const run = (box: string, side: Side, start: number, delta: number, m: SpaceModifiers = {}, t: SpacingToken[] = []) => spacingScrub(box, side, start, delta, m, false, t);

test("space: padding adds the delta, never negative, snaps to tokens", () => {
  expect(run("padding", "Top", 16, 9).patch).toEqual([["padding-block-start", "25px"]]);
  expect(run("padding", "Bottom", 16, -400).patch).toEqual([["padding-block-end", "0px"]]);
  const snapped = run("padding", "Left", 16, 6, {}, tokens);
  expect(snapped.patch).toEqual([["padding-inline-start", "var(--wp--preset--spacing--auvyx-md)"]]);
  expect(snapped.label).toBe("Padding left · auvyx-md (24px)");
  expect(run("padding", "Left", 16, 6, { meta: true }, tokens).patch).toEqual([["padding-inline-start", "22px"]]);
});

test("space: Shift = all sides, Alt = opposite pair; margin may go negative; RTL flips inline sides", () => {
  expect(run("padding", "Top", 0, 4, { shift: true }).patch.length).toBe(4);
  expect(run("margin", "Left", 0, 4, { alt: true }).patch.map((p) => p[0])).toEqual(["margin-inline-start", "margin-inline-end"]);
  expect(run("margin", "Left", 0, 4, { alt: true }).label).toBe("Margin left+right · 4px");
  expect(run("margin", "Top", 0, -5).patch).toEqual([["margin-block-start", "-5px"]]);
  expect(logicalProperty("padding", "Left", true)).toBe("padding-inline-end");
  expect(lengthToPx("1.5rem", 16)).toBe(24);
  expect(lengthToPx("clamp(1rem, 2vw, 2rem)", 16)).toBeUndefined();
});

test("space: short labels and the box's drawing", () => {
  const names = [{ slug: "auvyx-md", name: "Auvyx M" }];
  expect(shortSpace("var(--wp--preset--spacing--auvyx-md)", 24, names)).toBe("M");
  expect(shortSpace("24px", 24, names)).toBe("24");
  expect(shortSpace("2rem", 32, names)).toBe("2rem");
  expect(shortSpace("calc(1rem + 2vw)", 41.6, names)).toBe("≈42");
  expect(spacePolygon("margin", "Top")).toBe("0,0 248,0 208,26 40,26");
  expect(spacePolygon("padding", "Right")).toBe("208,26 168,52 168,76 208,102");
  expect(spaceLabelAt("padding", "Left")).toEqual([60, 64]);
});

test("token labels", () => {
  expect(prettyToken("var(--wp--preset--font-size--auvyx-xl)")).toBe("XL");
  expect(prettyToken("var(--wp--preset--color--auvyx-text)")).toBe("Text");
  expect(prettyToken("var(--wp--preset--color--accent-contrast)")).toBe("Accent Contrast");
  expect(prettyToken("var(--wp--preset--color--auvyx-primary)", (s) => (s === "auvyx-primary" ? "Auvyx Primary" : undefined))).toBe("Primary");
  expect(prettyToken("color-mix(in srgb, var(--wp--preset--color--auvyx-text) 35%, transparent)")).toBe("Text 35%");
  expect(prettyToken("16px")).toBe("16px");
  expect(prettyToken("calc(var(--wp--preset--font-size--auvyx-xl) * 2)")).toBe("calc(var(--wp--preset--font-size--auvyx-xl) * 2)");
});

test("background layers", () => {
  const photo = "https://demos.flatsome.com/wp-content/uploads/2016/07/hotel-2-1000x464.jpg";
  const value = composeBackground({ overlay: "rgba(0, 0, 0, 0.35)", image: photo })!;
  expect(value).toBe(`linear-gradient(rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.35)), url("${photo}")`);
  expect(parseBackground(value)).toEqual({ overlay: "rgba(0, 0, 0, 0.35)", image: photo });
  expect(isSafeValue(value)).toBe(true);
  const swapped = composeBackground({ ...parseBackground(composeBackground({ overlay: "#00000059", image: "/a.jpg" })!), image: photo })!;
  expect(parseBackground(swapped)).toEqual({ overlay: "#00000059", image: photo });
  expect(parseBackground(`url(${photo})`)).toEqual({ overlay: "", image: photo });
  const token = "color-mix(in srgb, var(--wp--preset--color--auvyx-text) 35%, transparent)";
  const themed = composeBackground({ overlay: token, image: "/a.jpg" })!;
  expect(parseBackground(composeBackground({ ...parseBackground(themed), image: photo })!)).toEqual({ overlay: token, image: photo });
  expect(composeBackground({ overlay: "", image: "javascript:alert(1)" })).toBeUndefined();
  expect(composeBackground({ overlay: "", image: "htt" })).toBeUndefined();
  expect(composeBackground({ overlay: "red), url(https://x.test/a.png", image: "" })).toBeUndefined();
  expect(composeBackground({ overlay: "", image: "" })).toBeUndefined();
});

const bps: Breakpoint[] = [{ id: "base", label: "Desktop" }, { id: "tablet", label: "Tablet", maxWidth: 1024 }, { id: "mobile", label: "Mobile", maxWidth: 767 }];

test("overrides: unset, base, inherited, override, pin, toggle", () => {
  expect(overrideField({}, bps, "mobile", "default", "gap")).toEqual({ own: undefined, inherited: undefined, from: undefined, isOverride: false, canPin: false });
  expect(sourceOf(overrideField({}, bps, "mobile", "default", "gap"))).toBe("unset");
  const s: Styles = { base: { default: { gap: "24px" } } };
  const b = overrideField(s, bps, "base", "default", "gap");
  expect([b.own, sourceOf(b), b.isOverride, b.canPin, showsDot(b)]).toEqual(["24px", "here", false, false, false]);
  const m = overrideField(s, bps, "mobile", "default", "gap");
  expect([m.inherited, m.from, sourceOf(m), m.canPin, m.isOverride]).toEqual(["24px", "base", "inherited", true, false]);
  const t: Styles = { base: { default: { gap: "24px" } }, tablet: { default: { gap: "16px" } } };
  expect(overrideField(t, bps, "mobile", "default", "gap").from).toBe("tablet");
  const tf = overrideField(t, bps, "tablet", "default", "gap");
  expect([tf.own, tf.inherited, tf.isOverride, tf.canPin]).toEqual(["16px", "24px", true, false]);
  const pinned = pinOverride(s, bps, "mobile", "default", "gap");
  expect(getStyle(pinned, "mobile", "default", "gap")).toBe("24px");
  expect(getStyle(toggleOverride(pinned, bps, "mobile", "default", "gap"), "mobile", "default", "gap")).toBeUndefined();
  // a pseudo state builds on Normal at the same breakpoint
  expect(overrideField(s, bps, "base", "hover", "gap").inherited).toBe("24px");
});

test("style groups gate the cards", () => {
  expect(STYLE_PANEL[0]).toBe("Presets");
  const doc = decodeTree([]);
  expect(allowsStyleGroup(el("a", "Heading"), doc, "fill")).toBe(false);
  expect(allowsStyleGroup(el("a", "Button"), doc, "fill")).toBe(true);
  expect(allowsStyleGroup(el("a", "Raw"), doc, "fill")).toBe(true);
  expect(allowsStyleGroup(null, doc, "fill")).toBe(true);
});

test("value rules", () => {
  expect(normalizeColumns(" 3 ")).toBe("repeat(3, minmax(0, 1fr))");
  expect(normalizeColumns("0")).toBe("0");
  expect(normalizeColumns("2fr 1fr")).toBe("2fr 1fr");
  expect(repeatColumns("repeat(4, minmax(0, 1fr))")).toBe("4");
  expect(roundPx("12.5px 3.2px 4px")).toBe("13px 3px 4px");
  expect(opacityPercent("0.8")).toBe("80");
  expect(parseOpacity("80%")).toEqual({ valid: true, value: "0.8" });
  expect(parseOpacity("100")).toEqual({ valid: true, value: "1" });
  expect(parseOpacity("")).toEqual({ valid: true, value: undefined });
  expect(parseOpacity("x").valid).toBe(false);
  expect([sizeMode(undefined), sizeMode("100%"), sizeMode("fit-content"), sizeMode("320px")]).toEqual(["Auto", "Fill", "Hug", "Fixed"]);
  const steps: [string, string][] = [["0", "0"], ["M", "var(--wp--preset--spacing--auvyx-md)"]];
  expect(scaleStep(["0px", "0px"], steps)).toBe("0");
  expect(scaleStep(["var(--wp--preset--spacing--auvyx-md)"], steps)).toBe("M");
  expect(scaleStep(["0px", undefined], steps)).toBeNull();
  expect([layoutMode("flex", "column"), layoutMode("flex", undefined), layoutMode("grid", undefined), layoutMode("block", undefined, "relative"), layoutMode("block", undefined), layoutMode(undefined, "row")]).toEqual(["Column", "Row", "Grid", "Free", "Block", undefined]);
});

import { applyPreset, presetActive, presetGroups } from "../src/index";

test("presets: groups per element, apply writes the responsive patches, active reads them back", () => {
  const devices = ["base", "tablet", "mobile"];
  const section = el("s", "Section", { tag: "section" });
  expect(presetGroups(section, true).map((g) => g.title)).toEqual(["Spacing", "Section width", "Background", "Height"]);
  expect(presetGroups(el("d", "Section", { tag: "div" }), false).map((g) => g.title)).toEqual(["Layout", "Gap", "Align", "Box", "Show on"]);
  expect(presetGroups(el("h", "Section", { tag: "header" }), true)[0]!.title).toBe("Edge");
  expect(presetGroups(el("h", "Section", { tag: "div" }), true, "footer").map((g) => g.title).slice(0, 4)).toEqual(["Layout", "Gap", "Align", "Edge"]);
  const spacingM = presetGroups(section, true)[0]!.choices[2]!;
  const after = applyPreset(section, devices, "base", "default", spacingM);
  expect(after.styles).toEqual({ base: { default: { "padding-block-start": "64px", "padding-block-end": "64px" } }, mobile: { default: { "padding-block-start": "40px", "padding-block-end": "40px" } } });
  expect(presetActive(after, bps, devices, "base", "default", spacingM)).toBe(true);
  expect(presetActive(after, bps, devices, "mobile", "default", spacingM)).toBe(false);
  const width = presetGroups(section, true)[1]!.choices[3]!;
  expect(applyPreset(section, devices, "base", "default", width).align).toBe("full");
  const hidden = presetGroups(el("t", "Text"), false).at(-1)!.choices.find((c) => c.name === "Hidden")!;
  const t = applyPreset(el("t", "Text"), devices, "base", "default", hidden);
  expect(t.styles).toEqual({ base: { default: { display: "none" } } });
  expect(presetActive(t, bps, devices, "base", "default", hidden)).toBe(true);
});
