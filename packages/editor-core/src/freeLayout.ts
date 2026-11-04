/**
 * Free (Figma "freeform") frames (the Studio's shared FreeLayout.scala): children placed by X/Y inside their frame,
 * with constraints so the page still works when the frame is wider or narrower than when it was designed. A frame is
 * free on a breakpoint when its resolved `display` is `block` and `position` is `relative` (or `absolute`).
 */
export type FreeH = "Left" | "Right" | "LeftRight" | "Center" | "Scale";
export type FreeV = "Top" | "Bottom" | "TopBottom" | "Center" | "Scale";
/** A child box relative to its frame's padding box (CSS px). */
export interface Geo { x: number; y: number; w: number; h: number }
type Patch = [string, string | undefined][];

/** Every property a placement writes (so switching constraints clears the old ones). */
export const FREE_CHILD_PROPS = ["position", "inset-inline-start", "inset-inline-end", "inset-block-start", "inset-block-end", "width", "height"];

const px = (v: number) => `${Math.round(v)}px`;
const pct = (v: number) => `${Math.round(v * 100) / 100}%`;
const center = (offset: number) => { const o = Math.round(offset); return o >= 0 ? `calc(50% + ${o}px)` : `calc(50% - ${-o}px)`; };

/** Style patch placing a child at `g` in a frame of size (fw, fh). `autoHeight`: text keeps its natural height. */
export function freePlace(g: Geo, fw: number, fh: number, h: FreeH, v: FreeV, autoHeight: boolean): Patch {
  const horizontal: Patch =
    h === "Left" ? [["inset-inline-start", px(g.x)], ["inset-inline-end", undefined], ["width", px(g.w)]]
    : h === "Right" ? [["inset-inline-start", undefined], ["inset-inline-end", px(fw - g.x - g.w)], ["width", px(g.w)]]
    : h === "LeftRight" ? [["inset-inline-start", px(g.x)], ["inset-inline-end", px(fw - g.x - g.w)], ["width", undefined]]
    : h === "Center" ? [["inset-inline-start", center(g.x - fw / 2)], ["inset-inline-end", undefined], ["width", px(g.w)]]
    : [["inset-inline-start", pct((g.x / Math.max(1, fw)) * 100)], ["inset-inline-end", undefined], ["width", pct((g.w / Math.max(1, fw)) * 100)]];
  const height = autoHeight ? undefined : px(g.h);
  const vertical: Patch =
    v === "Top" ? [["inset-block-start", px(g.y)], ["inset-block-end", undefined], ["height", height]]
    : v === "Bottom" ? [["inset-block-start", undefined], ["inset-block-end", px(fh - g.y - g.h)], ["height", height]]
    : v === "TopBottom" ? [["inset-block-start", px(g.y)], ["inset-block-end", px(fh - g.y - g.h)], ["height", undefined]]
    : v === "Center" ? [["inset-block-start", center(g.y - fh / 2)], ["inset-block-end", undefined], ["height", height]]
    : [["inset-block-start", pct((g.y / Math.max(1, fh)) * 100)], ["inset-block-end", undefined], ["height", autoHeight ? undefined : pct((g.h / Math.max(1, fh)) * 100)]];
  return [["position", "absolute"], ...horizontal, ...vertical];
}

/** Constraints from a child's resolved styles. */
export function freeConstraints(get: (prop: string) => string | undefined): [FreeH, FreeV] {
  const axis = (start: string | undefined, end: string | undefined): number =>
    start !== undefined && end !== undefined ? 2
    : start !== undefined && start.startsWith("calc(50%") ? 3
    : start !== undefined && start.endsWith("%") ? 4
    : start === undefined && end !== undefined ? 1 : 0;
  const hs: FreeH[] = ["Left", "Right", "LeftRight", "Center", "Scale"];
  const vs: FreeV[] = ["Top", "Bottom", "TopBottom", "Center", "Scale"];
  return [hs[axis(get("inset-inline-start"), get("inset-inline-end"))]!, vs[axis(get("inset-block-start"), get("inset-block-end"))]!];
}

/** Frame styles that make it free, keeping its current height. */
export const freeFrame = (height: number): Patch => [["display", "block"], ["position", "relative"], ["height", px(height)], ["min-height", undefined]];

/** Narrow screens: a free frame stacks its children (written on tablet; mobile inherits). */
export const FREE_FRAME_STACKED: Patch = [["display", "flex"], ["flex-direction", "column"], ["gap", "16px"], ["height", "auto"]];
export const FREE_CHILD_STACKED: Patch = [["position", "static"], ["width", "auto"], ["height", "auto"], ["max-width", "100%"]];
/** Same for elements with an intrinsic look (shapes, images, lines): keep their size, never wider than the screen. */
export const FREE_CHILD_STACKED_SIZED: Patch = [["position", "static"], ["max-width", "100%"]];
/** Leaving free layout on a breakpoint: children back in the flow, keeping their size (Figma). */
export const FREE_CHILD_IN_FLOW: Patch = ["position", "inset-inline-start", "inset-inline-end", "inset-block-start", "inset-block-end"].map((p) => [p, undefined]);
