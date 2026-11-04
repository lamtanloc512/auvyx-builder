/**
 * Vector path geometry (U/Tools.scala `Anchor`, `pathData`, `bounds`, `parsePath`; U/VectorEdit.scala's mapping and
 * point moves): what the pen writes and what point editing reads back. Pure, so both editors draw the same path.
 */
import { safeBox } from "./elements";

export type Pt = [number, number];

/** A path point with an optional outgoing handle; the incoming one mirrors it (Figma) unless set (`inH`). */
export interface Anchor { x: number; y: number; out?: Pt; inH?: Pt }

export const anchor = (x: number, y: number, out?: Pt, inH?: Pt): Anchor => ({ x, y, ...(out ? { out } : {}), ...(inH ? { inH } : {}) });

/** The incoming handle: its own, else the outgoing one mirrored through the point. */
export const handleIn = (a: Anchor): Pt | undefined => a.inH ?? (a.out ? [2 * a.x - a.out[0], 2 * a.y - a.out[1]] : undefined);

export const moved = (a: Anchor, dx: number, dy: number): Anchor =>
  anchor(a.x + dx, a.y + dy, a.out && [a.out[0] + dx, a.out[1] + dy], a.inH && [a.inH[0] + dx, a.inH[1] + dy]);

/** A number as the Studio writes it: one decimal, no ".0". */
export function num(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(Math.trunc(r) || 0) : String(r);
}

/** SVG path data for anchors, shifted by (ox, oy). */
export function pathData(points: readonly Anchor[], closed: boolean, ox = 0, oy = 0): string {
  const p = (x: number, y: number) => `${num(x - ox)} ${num(y - oy)}`;
  const seg = (a: Anchor, b: Anchor) => {
    const bin = handleIn(b);
    if (!a.out && !bin) return `L${p(b.x, b.y)}`;
    const [c1x, c1y] = a.out ?? [a.x, a.y];
    const [c2x, c2y] = bin ?? [b.x, b.y];
    return `C${p(c1x, c1y)} ${p(c2x, c2y)} ${p(b.x, b.y)}`;
  };
  const first = points[0];
  if (!first) return "";
  let body = "";
  for (let i = 1; i < points.length; i++) body += seg(points[i - 1]!, points[i]!);
  return `M${p(first.x, first.y)}${body}${closed && points.length > 2 ? seg(points[points.length - 1]!, first) + "Z" : ""}`;
}

/** Tight bounds of the curve itself (Figma), not of its handles: every segment is sampled. [x, y, w, h], w/h ≥ 2. */
export function bounds(pts: readonly Anchor[], closed: boolean): [number, number, number, number] {
  const segments: [Anchor, Anchor][] = [];
  for (let i = 1; i < pts.length; i++) segments.push([pts[i - 1]!, pts[i]!]);
  if (closed && pts.length > 2) segments.push([pts[pts.length - 1]!, pts[0]!]);
  const xs = pts.map((a) => a.x), ys = pts.map((a) => a.y);
  for (const [a, b] of segments) {
    const [c1x, c1y] = a.out ?? [a.x, a.y];
    const [c2x, c2y] = handleIn(b) ?? [b.x, b.y];
    for (let i = 1; i < 32; i++) {
      const t = i / 32, u = 1 - t;
      xs.push(u * u * u * a.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * b.x);
      ys.push(u * u * u * a.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * b.y);
    }
  }
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return [x0, y0, Math.max(2, Math.max(...xs) - x0), Math.max(2, Math.max(...ys) - y0)];
}

const TOKEN = /[MLCZmlcz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;

/** Absolute M/L/C/Z path data (what the pen writes) → anchors and the closed flag; null for anything else. */
export function parsePath(d: string): { points: Anchor[]; closed: boolean } | null {
  const tokens = d.match(TOKEN) ?? [];
  if (tokens.some((t) => t.length === 1 && /[a-z]/.test(t))) return null;
  let pts: Anchor[] = [];
  let closed = false;
  let i = 0;
  const n = (k: number) => { const t = tokens[i + k]; if (t === undefined || /^[A-Za-z]$/.test(t)) return undefined; const v = Number(t); return Number.isFinite(v) ? v : undefined; };
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "M" || t === "L") {
      const x = n(1), y = n(2);
      if (x === undefined || y === undefined) return null;
      pts.push(anchor(x, y));
      i += 3;
    } else if (t === "C") {
      const v = [1, 2, 3, 4, 5, 6].map(n);
      if (v.some((x) => x === undefined) || !pts.length) return null;
      const [a, b, c, e, x, y] = v as number[];
      pts = [...pts.slice(0, -1), { ...pts[pts.length - 1]!, out: [a!, b!] }, anchor(x!, y!, undefined, [c!, e!])];
      i += 7;
    } else if (t === "Z") { closed = true; i += 1; }
    else return null;
  }
  if (pts.length < 2) return null;
  // A closing segment that ends on the first point: merge it into the first point.
  const last = pts[pts.length - 1]!, head = pts[0]!;
  if (closed && Math.abs(last.x - head.x) < 0.01 && Math.abs(last.y - head.y) < 0.01 && pts.length > 2) {
    const merged = { ...head };
    if (last.inH) merged.inH = last.inH; else delete merged.inH;
    return { points: [merged, ...pts.slice(1, -1)], closed: true };
  }
  return { points: pts, closed };
}

export interface Frame { x: number; y: number; w: number; h: number }

/** viewBox units → page px (the SVG stretches to the element's box `r`). */
export function toPage(points: readonly Anchor[], viewBox: string, r: Frame): Anchor[] {
  const box = safeBox(viewBox).split(/\s+/).map(Number) as [number, number, number, number];
  const sx = r.w / Math.max(1e-6, box[2]), sy = r.h / Math.max(1e-6, box[3]);
  const map = (p: Pt): Pt => [r.x + (p[0] - box[0]) * sx, r.y + (p[1] - box[1]) * sy];
  return points.map((a) => { const [x, y] = map([a.x, a.y]); return anchor(x, y, a.out && map(a.out), a.inH && map(a.inH)); });
}

/** What point editing writes back: path data relative to the new bounds, the viewBox, and the box in page px. */
export function written(pts: readonly Anchor[], closed: boolean): { d: string; viewBox: string; box: Frame } {
  const [x, y, w, h] = bounds(pts, closed);
  return { d: pathData(pts, closed, x, y), viewBox: `0 0 ${num(w)} ${num(h)}`, box: { x, y, w, h } };
}

/** The grabbed part of point `k` moved to (x, y), the drag having started at (x0, y0): the anchor ("a"), or its outgoing
 * ("o") or incoming ("i") handle; the other handle then mirrors it (Figma). */
export function drag(pts0: readonly Anchor[], part: "a" | "o" | "i", k: number, x0: number, y0: number, x: number, y: number): Anchor[] {
  const a = pts0[k];
  if (!a) return [...pts0];
  const next: Anchor = part === "a" ? moved(a, x - x0, y - y0)
    : part === "o" ? anchor(a.x, a.y, [x, y])
    : anchor(a.x, a.y, [2 * a.x - x, 2 * a.y - y]);
  return pts0.map((p, i) => (i === k ? next : p));
}
