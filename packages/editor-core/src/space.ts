/**
 * The margin/padding box (the Studio's shared Drag.scala and the geometry of U/SpaceControl.scala): which logical
 * properties a side edits, the sides one edit applies to, the scrub math with token snapping, and the box's drawing.
 */
export type Side = "Top" | "Right" | "Bottom" | "Left";
export const SIDES: readonly Side[] = ["Top", "Right", "Bottom", "Left"];
export type SpaceBox = "margin" | "padding";

export interface SpaceModifiers { shift?: boolean; alt?: boolean; meta?: boolean }
/** Spacing preset resolved to px for snapping. */
export interface SpacingToken { slug: string; px: number }
export interface SpaceResult { patch: [string, string | undefined][]; label: string }

const TOKEN_SNAP_PX = 3;

export const oppositeSide = (s: Side): Side => (s === "Top" ? "Bottom" : s === "Bottom" ? "Top" : s === "Left" ? "Right" : "Left");

export function logicalProperty(box: string, side: Side, rtl: boolean): string {
  switch (side) {
    case "Top": return `${box}-block-start`;
    case "Bottom": return `${box}-block-end`;
    case "Left": return rtl ? `${box}-inline-end` : `${box}-inline-start`;
    case "Right": return rtl ? `${box}-inline-start` : `${box}-inline-end`;
  }
}

/** Sides one edit applies to (Webstudio): Shift = all four, Alt = the side and its opposite. */
export const spaceSides = (side: Side, m: SpaceModifiers): Side[] => (m.shift ? [...SIDES] : m.alt ? [side, oppositeSide(side)] : [side]);

/** Spacing value `startPx + delta`, snapped to a token within 3px (⌘/Ctrl: no snapping). Padding never goes negative. */
export function spacingScrub(box: string, side: Side, startPx: number, delta: number, m: SpaceModifiers, rtl: boolean, tokens: readonly SpacingToken[]): SpaceResult {
  const raw = Math.round(startPx + delta);
  const value = box === "padding" ? Math.max(0, raw) : raw;
  const t = tokens.find((t) => !m.meta && Math.abs(t.px - value) <= TOKEN_SNAP_PX);
  const [css, text] = t ? [`var(--wp--preset--spacing--${t.slug})`, `${t.slug} (${Math.round(t.px)}px)`] : [`${value}px`, `${value}px`];
  const targets = spaceSides(side, m);
  const where = targets.length === 4 ? "" : " " + targets.map((s) => s.toLowerCase()).join("+");
  return { patch: targets.map((s) => [logicalProperty(box, s, rtl), css]), label: `${box.charAt(0).toUpperCase()}${box.slice(1)}${where} · ${text}` };
}

/** "0.5rem" / "12px" → px; other lengths (clamp(), %) → undefined. */
export function lengthToPx(length: string, rootFontSize = 16): number | undefined {
  const m = /^(-?\d*\.?\d+)(px|rem)$/.exec(length.trim());
  if (!m) return undefined;
  return m[2] === "rem" ? Number(m[1]) * rootFontSize : Number(m[1]);
}

/** Short display of a spacing value: token → its name, "24px" → "24", short values as they are, else the measured px. */
export function shortSpace(value: string, measured: number, tokens: readonly { slug: string; name: string }[]): string {
  const t = tokens.find((t) => value === `var(--wp--preset--spacing--${t.slug})`);
  if (t) return t.name.replace(/^Auvyx /, "").trim();
  if (value.endsWith("px") && value.slice(0, -2).trim() !== "" && !isNaN(Number(value.slice(0, -2)))) return value.slice(0, -2);
  if (value.length <= 6) return value;
  return `≈${Math.round(measured)}`;
}

// ---- the box's drawing (trapezoids like Webstudio's) ----

export const SPACE_W = 248;
export const SPACE_H = 128;
/** margin ring thickness (x, y) */
export const SPACE_MX = 40;
export const SPACE_MY = 26;

export function spacePolygon(box: SpaceBox, side: Side): string {
  const [o, i] = box === "margin" ? [0, 1] : [1, 2];
  const [x0, y0, x1, y1] = [SPACE_MX * o, SPACE_MY * o, SPACE_W - SPACE_MX * o, SPACE_H - SPACE_MY * o];
  const [u0, v0, u1, v1] = [SPACE_MX * i, SPACE_MY * i, SPACE_W - SPACE_MX * i, SPACE_H - SPACE_MY * i];
  const pts: [number, number][] =
    side === "Top" ? [[x0, y0], [x1, y0], [u1, v0], [u0, v0]]
    : side === "Bottom" ? [[x0, y1], [x1, y1], [u1, v1], [u0, v1]]
    : side === "Left" ? [[x0, y0], [u0, v0], [u0, v1], [x0, y1]]
    : [[x1, y0], [u1, v0], [u1, v1], [x1, y1]];
  // Scala prints doubles ("40.0"); the browser reads both the same.
  return pts.map(([x, y]) => `${x},${y}`).join(" ");
}

export function spaceLabelAt(box: SpaceBox, side: Side): [number, number] {
  const ring = box === "margin" ? 0.5 : 1.5;
  switch (side) {
    case "Top": return [SPACE_W / 2, SPACE_MY * ring];
    case "Bottom": return [SPACE_W / 2, SPACE_H - SPACE_MY * ring];
    case "Left": return [SPACE_MX * ring, SPACE_H / 2];
    case "Right": return [SPACE_W - SPACE_MX * ring, SPACE_H / 2];
  }
}
