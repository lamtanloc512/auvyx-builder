/**
 * Drag to select (U/Marquee.scala, Figma marquee). Starts on the grey board, on the theme around the content, or on
 * the empty area of a page-level section that is not selected. Selects the outermost elements fully inside the
 * rectangle, live while dragging. Shift adds to the current selection.
 */
import { ancestors, type Doc } from "@auvyx/editor-core";
import { store } from "./store.svelte";
import { viewport } from "./viewport.svelte";
import { canvasFrame, drag, toEditor } from "./pointer";
import { pan } from "./shortcuts.svelte";
import { arrow } from "./cursors";
import type { Rect } from "./measure.svelte";

const THRESHOLD = 4;

/** The rectangle in page coordinates while dragging. */
export const marquee = $state({ rect: null as Rect | null });

/** True right after a marquee, so the click that ends it does not select or deselect. */
let justEnded = false;
export function takeClick(): boolean { const was = justEnded; justEnded = false; return !was; }

/** Editor → canvas page coordinates (unbounded, like Pointer.P.page). */
function page(x: number, y: number): [number, number] {
  const f = canvasFrame()?.getBoundingClientRect();
  return f ? [(x - f.left) / viewport.zoom, (y - f.top) / viewport.zoom] : [x, y];
}

/** Store.selectMany: the first is the selection, the rest are extra. */
export function selectMany(ids: string[]) {
  store.selected = ids[0] ?? null;
  store.extra = new Set(ids.slice(1));
}

export function start(ev: PointerEvent) {
  if (ev.button !== 0 || pan.on) return;
  const first = toEditor(ev);
  const [sx, sy] = page(first.x, first.y);
  const base = ev.shiftKey ? store.selection : [];
  capture(ev);
  let started = false;
  drag(arrow, (p) => {
    if (!started && Math.hypot(p.x - first.x, p.y - first.y) > THRESHOLD) {
      started = true;
      store.hovered = null;
    }
    if (!started) return;
    const [x, y] = page(p.x, p.y);
    const r = { x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) };
    marquee.rect = r;
    const next = [...new Set([...base, ...inside(r)])];
    if (next.join() !== store.selection.join()) selectMany(next);
  }, () => {
    marquee.rect = null;
    if (started) {
      justEnded = true;
      setTimeout(() => { justEnded = false; }, 0);
    }
  }, () => { marquee.rect = null; });
}

/** Every element in document order (Doc.flatten). */
function flatten(doc: Doc): string[] {
  const out: string[] = [];
  const walk = (ids: readonly string[]) => { for (const id of ids) { out.push(id); walk(doc.nodes[id]?.children ?? []); } };
  walk(doc.roots);
  return out;
}

/** Outermost elements whose box is fully inside `r`, in document order. */
function inside(r: Rect): string[] {
  const doc = store.doc;
  const hits = flatten(doc).filter((id) => !store.lockedAt(id)).filter((id) => {
    const el = store.elements.get(id);
    if (!el) return false;
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.left >= r.x && b.top >= r.y && b.right <= r.x + r.w && b.bottom <= r.y + r.h;
  });
  const set = new Set(hits);
  return hits.filter((id) => !ancestors(doc, id).some((a) => set.has(a)));
}

/** Like Pointer.drag: the pressed element keeps the pointer, so nothing under it hovers meanwhile. */
function capture(ev: PointerEvent) {
  try { (ev.target as Element | null)?.setPointerCapture?.(ev.pointerId); } catch { /* not capturable */ }
}
