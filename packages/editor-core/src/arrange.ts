/**
 * Free (Figma "freeform") frames and Figma's Align / Distribute / auto-layout inference (shared/FreeLayout.scala,
 * shared/Arrange.scala). Pure; unit-tested.
 *
 * A frame is free on a breakpoint when its resolved `display` is `block` and `position` is `relative`. A child is
 * written as `position: absolute` plus logical insets (x from the inline start, y from the block start) and a size.
 */

export type H = "Left" | "Right" | "LeftRight" | "Center" | "Scale";
export type V = "Top" | "Bottom" | "TopBottom" | "Center" | "Scale";
export type Align = "Left" | "CenterH" | "Right" | "Top" | "CenterV" | "Bottom";
/** A child box relative to its frame's padding box (CSS px). */
export interface Geo { x: number; y: number; w: number; h: number }
export type Patch = [string, string | undefined][];

/** Every property a placement writes (so switching constraints clears the old ones). */
export const CHILD_PROPS = ["position", "inset-inline-start", "inset-inline-end", "inset-block-start", "inset-block-end", "width", "height"];

const px = (v: number) => `${Math.round(v)}px`;
const pct = (v: number) => `${String(Math.round(v * 100) / 100)}%`;
const center = (offset: number) => { const o = Math.round(offset); return o >= 0 ? `calc(50% + ${o}px)` : `calc(50% - ${-o}px)`; };

/** Style patch placing a child at `g` in a frame of size (fw, fh). `autoHeight`: text keeps its natural height. */
export function place(g: Geo, fw: number, fh: number, h: H, v: V, autoHeight: boolean): Patch {
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
export function constraints(get: (prop: string) => string | undefined): [H, V] {
  const axis = (start: string | undefined, end: string | undefined) =>
    start !== undefined && end !== undefined ? 2 : start !== undefined && start.startsWith("calc(50%") ? 3 : start !== undefined && start.endsWith("%") ? 4 : start === undefined && end !== undefined ? 1 : 0;
  const hs: H[] = ["Left", "Right", "LeftRight", "Center", "Scale"];
  const vs: V[] = ["Top", "Bottom", "TopBottom", "Center", "Scale"];
  return [hs[axis(get("inset-inline-start"), get("inset-inline-end"))]!, vs[axis(get("inset-block-start"), get("inset-block-end"))]!];
}

/** Frame styles that make it free, keeping its current height. */
export const frame = (height: number): Patch => [["display", "block"], ["position", "relative"], ["height", px(height)], ["min-height", undefined]];
/** Narrow screens: a free frame stacks its children (written on tablet; mobile inherits). */
export const frameStacked: Patch = [["display", "flex"], ["flex-direction", "column"], ["gap", "16px"], ["height", "auto"]];
export const childStacked: Patch = [["position", "static"], ["width", "auto"], ["height", "auto"], ["max-width", "100%"]];
/** Same for elements with an intrinsic look (shapes, images, lines): keep their size, never wider than the screen. */
export const childStackedSized: Patch = [["position", "static"], ["max-width", "100%"]];
/** Leaving free layout on a breakpoint: children back in the flow, keeping their size (Figma). */
export const childInFlow: Patch = ["position", "inset-inline-start", "inset-inline-end", "inset-block-start", "inset-block-end"].map((p) => [p, undefined]);

// ---- Arrange ----

export function bbox(gs: Geo[]): Geo {
  const x0 = Math.min(...gs.map((g) => g.x)), y0 = Math.min(...gs.map((g) => g.y));
  return { x: x0, y: y0, w: Math.max(...gs.map((g) => g.x + g.w)) - x0, h: Math.max(...gs.map((g) => g.y + g.h)) - y0 };
}

/** Aligns every box to `bounds` (the selection's box, or the frame for a single element). */
export function align(gs: Geo[], a: Align, bounds: Geo): Geo[] {
  return gs.map((g) =>
    a === "Left" ? { ...g, x: bounds.x }
    : a === "CenterH" ? { ...g, x: bounds.x + (bounds.w - g.w) / 2 }
    : a === "Right" ? { ...g, x: bounds.x + bounds.w - g.w }
    : a === "Top" ? { ...g, y: bounds.y }
    : a === "CenterV" ? { ...g, y: bounds.y + (bounds.h - g.h) / 2 }
    : { ...g, y: bounds.y + bounds.h - g.h });
}

/** Equal gaps between boxes (in their current order along the axis); the first and last stay put. */
export function distribute(gs: Geo[], horizontal: boolean): Geo[] {
  if (gs.length < 3) return gs;
  const pos = (g: Geo) => (horizontal ? g.x : g.y);
  const size = (g: Geo) => (horizontal ? g.w : g.h);
  const order = gs.map((_, i) => i).sort((a, b) => pos(gs[a]!) - pos(gs[b]!));
  const first = gs[order[0]!]!, last = gs[order.at(-1)!]!;
  const free = pos(last) + size(last) - pos(first) - order.reduce((s, i) => s + size(gs[i]!), 0);
  const gap = free / (order.length - 1);
  let at = pos(first);
  const placed = new Map<number, Geo>();
  for (const i of order) {
    const g = gs[i]!;
    placed.set(i, horizontal ? { ...g, x: at } : { ...g, y: at });
    at += size(g) + gap;
  }
  return gs.map((_, i) => placed.get(i)!);
}

/** What "Add auto layout" infers from where things are: direction, order, gap and the frame's padding. */
export interface Auto { row: boolean; order: number[]; gap: number; top: number; right: number; bottom: number; left: number }

export function infer(gs: Geo[], frameW: number, frameH: number): Auto {
  if (!gs.length) return { row: false, order: [], gap: 0, top: 0, right: 0, bottom: 0, left: 0 };
  const b = bbox(gs);
  // A row when the boxes spread more across than down (Figma decides the same way).
  const row = gs.length > 1 && b.w - Math.max(...gs.map((g) => g.w)) > b.h - Math.max(...gs.map((g) => g.h));
  const key = (i: number): [number, number] => (row ? [gs[i]!.x, gs[i]!.y] : [gs[i]!.y, gs[i]!.x]);
  const order = gs.map((_, i) => i).sort((a, c) => { const [a1, a2] = key(a), [c1, c2] = key(c); return a1 - c1 || a2 - c2; });
  const gaps = order.slice(1).map((c, k) => { const a = order[k]!; return Math.max(0, row ? gs[c]!.x - (gs[a]!.x + gs[a]!.w) : gs[c]!.y - (gs[a]!.y + gs[a]!.h)); }).sort((x, y) => x - y);
  const gap = gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]!) : 0;
  const pad = (v: number) => Math.max(0, Math.round(v));
  return { row, order, gap, top: pad(b.y), right: pad(frameW - b.x - b.w), bottom: pad(frameH - b.y - b.h), left: pad(b.x) };
}
