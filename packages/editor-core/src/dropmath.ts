/** Where a dragged element lands among a container's children (the Scala `DropMath`). Pure. */
export interface Box { left: number; top: number; right: number; bottom: number }
const cx = (b: Box) => (b.left + b.right) / 2;
const cy = (b: Box) => (b.top + b.bottom) / 2;

export interface RowSlot { index: number; x: number; top: number; bottom: number }

export function rowSlot(children: Box[], x: number, y: number): RowSlot | null {
  const rows: Box[][] = [];
  for (const box of children) {
    const last = rows.at(-1);
    if (last && box.top < Math.max(...last.map((b) => b.bottom)) && box.bottom > Math.min(...last.map((b) => b.top))) last.push(box);
    else rows.push([box]);
  }
  if (!rows.length) return null;
  let rowIndex = rows.length - 1;
  for (let i = 0; i < rows.length - 1; i++) {
    if (y <= (Math.max(...rows[i]!.map((b) => b.bottom)) + Math.min(...rows[i + 1]!.map((b) => b.top))) / 2) { rowIndex = i; break; }
  }
  const row = rows[rowIndex]!;
  const top = Math.min(...row.map((b) => b.top)), bottom = Math.max(...row.map((b) => b.bottom));
  const slot = y < Math.min(...rows[0]!.map((b) => b.top)) ? 0 : y > Math.max(...rows.at(-1)!.map((b) => b.bottom)) ? row.length : row.filter((b) => cx(b) < x).length;
  const markerX = slot === 0 ? row[0]!.left : slot === row.length ? row.at(-1)!.right : (row[slot - 1]!.right + row[slot]!.left) / 2;
  return { index: rows.slice(0, rowIndex).reduce((n, r) => n + r.length, 0) + slot, x: markerX, top, bottom };
}

export const slotIndex = (children: Box[], x: number, y: number, vertical: boolean) =>
  vertical ? children.filter((b) => cy(b) < y).length : rowSlot(children, x, y)?.index ?? 0;

export function documentIndex<A>(siblings: readonly A[], visible: readonly A[], slot: number): number {
  if (!visible.length) return siblings.length;
  return slot < visible.length ? siblings.indexOf(visible[slot]!) : siblings.indexOf(visible.at(-1)!) + 1;
}

/** One element under the pointer: its box, whether its parent flows vertically, and its edge band. */
export interface Level { box: Box; vertical: boolean; radius: number; usable?: boolean; claimsInterior?: boolean }

/**
 * Flatsome-style spots: the hovered element and each ancestor (deepest first) offer "before" and "after" on the edges
 * of their parent's flow axis, within their band. Nested same-side edges stack, each getting at least `slice` of
 * travel. Returns the level index and whether the drop goes before it; null: drop inside.
 */
export function edgeSpot(levels: Level[], x: number, y: number, slice = 0): [number, boolean] | null {
  const flowEdges = (l: Level): [number, boolean][] => {
    const [before, after] = l.vertical ? [y - l.box.top, l.box.bottom - y] : [x - l.box.left, l.box.right - x];
    return ([[before, true], [after, false]] as [number, boolean][]).filter(([d]) => d >= -0.5 && d <= l.radius);
  };
  const inBox = (b: Box) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  const spots: [number, number, boolean][] = [];
  levels.forEach((l, i) => { if (l.usable !== false) for (const [d, before] of flowEdges(l)) spots.push([Math.max(0, d), i, before]); });
  const claims = levels.map((l, i) => (l.claimsInterior && inBox(l.box) && !flowEdges(l).length ? i : -1)).filter((i) => i >= 0);
  const claim = claims.length ? Math.min(...claims) : null;
  const kept = claim === null ? spots : spots.filter(([, level]) => level <= claim);
  if (!kept.length) return null;
  const nearest = kept.reduce((a, b) => (Math.floor(b[0]) < Math.floor(a[0]) || (Math.floor(b[0]) === Math.floor(a[0]) && b[1] < a[1]) ? b : a));
  const [, ni, side] = nearest;
  const axis = levels[ni]!.vertical;
  const stack = kept.filter(([, i, b]) => b === side && levels[i]!.vertical === axis).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const travel = stack[0]![0];
  let start = 0;
  let chosen = stack[0]!;
  stack.forEach((spot, j) => {
    const edge = travel - spot[0];
    start = j === 0 ? 0 : Math.max(edge, start + slice);
    if (travel >= start) chosen = spot;
  });
  return [chosen[1], chosen[2]];
}

/** Index to pass to `move`, which counts positions after removing the dragged element. */
export const moveIndex = (fromParent: string | null, fromIndex: number, toParent: string | null, toIndex: number) =>
  fromParent === toParent && fromIndex < toIndex ? toIndex - 1 : toIndex;

/** Edge scrolling while dragging, in px per second (negative: up). */
export function edgeSpeed(y: number, top: number, bottom: number, canUp: boolean, canDown: boolean, edge = 80, max = 600): number {
  if (y < top || y > bottom) return 0;
  const zone = Math.min(edge, (bottom - top) / 3);
  if (zone <= 0) return 0;
  if (canUp && y < top + zone) return -max * (1 - (y - top) / zone);
  if (canDown && y > bottom - zone) return max * (1 - (bottom - y) / zone);
  return 0;
}
