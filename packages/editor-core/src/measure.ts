/** Figma-style measurement and snapping geometry, page px (shared/Measure.scala). Pure; unit-tested. */

export interface R { left: number; top: number; right: number; bottom: number }
/** A guide segment; `dashed` = extension line, else a distance line. */
export interface Line { x1: number; y1: number; x2: number; y2: number; dashed: boolean }
/** A distance label at (x, y). */
export interface Tag { x: number; y: number; text: string }

const cx = (r: R) => (r.left + r.right) / 2;
const cy = (r: R) => (r.top + r.bottom) / 2;
const fmt = (d: number) => String(Math.round(d));
const line = (x1: number, y1: number, x2: number, y2: number, dashed = false): Line => ({ x1, y1, x2, y2, dashed });

/**
 * Distances from the selection `s` to the hovered element `h` (Figma, Alt-hover). If `h` contains `s`: distance to
 * each inner edge. Otherwise: the gaps between them, with dashed extension lines when they do not overlap on the
 * other axis.
 */
export function between(s: R, h: R, hContainsS: boolean): [Line[], Tag[]] {
  if (hContainsS) {
    const sides: [number, Line, Tag][] = [
      [s.top - h.top, line(cx(s), h.top, cx(s), s.top), { x: cx(s), y: (h.top + s.top) / 2, text: fmt(s.top - h.top) }],
      [h.bottom - s.bottom, line(cx(s), s.bottom, cx(s), h.bottom), { x: cx(s), y: (s.bottom + h.bottom) / 2, text: fmt(h.bottom - s.bottom) }],
      [s.left - h.left, line(h.left, cy(s), s.left, cy(s)), { x: (h.left + s.left) / 2, y: cy(s), text: fmt(s.left - h.left) }],
      [h.right - s.right, line(s.right, cy(s), h.right, cy(s)), { x: (s.right + h.right) / 2, y: cy(s), text: fmt(h.right - s.right) }],
    ];
    const kept = sides.filter(([d]) => d > 0.5);
    return [kept.map((k) => k[1]), kept.map((k) => k[2])];
  }
  const lines: Line[] = [];
  const tags: Tag[] = [];
  const overlapX = Math.min(s.right, h.right) - Math.max(s.left, h.left);
  const overlapY = Math.min(s.bottom, h.bottom) - Math.max(s.top, h.top);
  // vertical gap (h below or above s)
  const vGap = h.top >= s.bottom ? [s.bottom, h.top] : s.top >= h.bottom ? [h.bottom, s.top] : null;
  if (vGap) {
    const [a, b] = vGap as [number, number];
    const x = overlapX > 0 ? (Math.max(s.left, h.left) + Math.min(s.right, h.right)) / 2 : cx(s);
    lines.push(line(x, a, x, b));
    tags.push({ x, y: (a + b) / 2, text: fmt(b - a) });
    if (overlapX <= 0) {
      const edge = h.top >= s.bottom ? h.top : h.bottom;
      lines.push(line(Math.min(x, h.left), edge, Math.max(x, h.right), edge, true));
    }
  }
  // horizontal gap (h right or left of s)
  const hGap = h.left >= s.right ? [s.right, h.left] : s.left >= h.right ? [h.right, s.left] : null;
  if (hGap) {
    const [a, b] = hGap as [number, number];
    const y = overlapY > 0 ? (Math.max(s.top, h.top) + Math.min(s.bottom, h.bottom)) / 2 : cy(s);
    lines.push(line(a, y, b, y));
    tags.push({ x: (a + b) / 2, y, text: fmt(b - a) });
    if (overlapY <= 0) {
      const edge = h.left >= s.right ? h.left : h.right;
      lines.push(line(edge, Math.min(y, h.top), edge, Math.max(y, h.bottom), true));
    }
  }
  return [lines, tags];
}

/**
 * Figma's position lines for a selection: from its top and left edges to the nearest thing above / to the left (a
 * sibling that overlaps on the other axis, else the parent's edge).
 */
export function anchors(s: R, parent: R, others: R[]): Line[] {
  const above = [...others.filter((o) => o.bottom <= s.top && o.right > s.left && o.left < s.right).map((o) => o.bottom), parent.top];
  const before = [...others.filter((o) => o.right <= s.left && o.bottom > s.top && o.top < s.bottom).map((o) => o.right), parent.left];
  const maxOf = (xs: number[]) => (xs.length ? Math.max(...xs) : null);
  const top = maxOf(above.filter((t) => t <= s.top));
  const left = maxOf(before.filter((l) => l <= s.left));
  const out: Line[] = [];
  if (top !== null && s.top - top > 0.5) out.push(line(cx(s), top, cx(s), s.top));
  if (left !== null && s.left - left > 0.5) out.push(line(left, cy(s), s.left, cy(s)));
  return out;
}

/** Nearest candidate within `threshold` of `value`. */
export function snap(value: number, candidates: number[], threshold: number): number | null {
  let best: number | null = null;
  for (const c of candidates) if (Math.abs(c - value) <= threshold && (best === null || Math.abs(c - value) < Math.abs(best - value))) best = c;
  return best;
}
