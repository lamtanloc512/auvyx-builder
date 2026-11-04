/**
 * Editing a vector's points (U/VectorEdit.scala; Figma: double-click a vector). Anchors and handles are dragged in page
 * coordinates (the canvas frame's); every change rewrites the path, its viewBox and the element's box live (one undo
 * step per drag). Esc, Enter, a click outside, another selection or an undo leaves the mode.
 */
import { PathEdit, parentOf, update } from "@auvyx/editor-core";
import { store } from "./store.svelte";
import { viewport } from "./viewport.svelte";
import { measure } from "./measure.svelte";
import { canvasFrame, drag as pointerDrag, toEditor } from "./pointer";
import { arrow } from "./cursors";
import { toast } from "./toast.svelte";
import * as Free from "./transformFree";

type Anchor = PathEdit.Anchor;
export interface Editing { id: string; pts: Anchor[]; closed: boolean }

export const vectorEdit = $state<{ editing: Editing | null }>({ editing: null });
/** The source the document should hold while editing: anything else (an undo, another edit) leaves the mode. */
let expected: { src: string; alt: string } | null = null;

export const active = () => vectorEdit.editing !== null;

export function stop() {
  vectorEdit.editing = null;
  expected = null;
}

$effect.root(() => {
  // another selection leaves the mode
  $effect(() => { const s = store.selected; const e = vectorEdit.editing; if (e && s !== e.id) stop(); });
  // the document jumped (undo, redo) or the element went: the points held are stale (Store.afterHistoryJump)
  $effect(() => {
    const d = store.doc;
    const e = vectorEdit.editing;
    if (!e || !expected) return;
    const n = d.nodes[e.id];
    if (!n || n.src !== expected.src || n.alt !== expected.alt) stop();
  });
});

export function start(id: string) {
  const n = store.doc.nodes[id];
  const el = store.elements.get(id);
  const parsed = n?.kind === "Path" ? PathEdit.parsePath(n.src) : null;
  if (n && el?.isConnected && parsed) {
    const page = PathEdit.toPage(parsed.points, n.alt, measure(el).frame);
    store.selected = id;
    expected = { src: n.src, alt: n.alt };
    vectorEdit.editing = { id, pts: page, closed: parsed.closed };
  }
  if (!vectorEdit.editing && n?.kind === "Path") toast("This shape's path can't be edited point by point");
}

/** Writes points back: path relative to the new bounds, viewBox, and the element's box. */
function write(id: string, pts: Anchor[], closed: boolean, key: string) {
  const w = PathEdit.written(pts, closed);
  expected = { src: w.d, alt: w.viewBox };
  store.commit(update(store.doc, id, (n) => ({ ...n, src: w.d, alt: w.viewBox })), key);
  if (Free.isChild(id)) {
    const p = parentOf(store.doc, id);
    if (p) {
      const [ox, oy] = Free.origin(p);
      Free.place([[id, { x: w.box.x - ox, y: w.box.y - oy, w: w.box.w, h: w.box.h }]], key);
    }
  } else store.setStyles(id, [["width", `${Math.round(w.box.w)}px`], ["height", `${Math.round(w.box.h)}px`]], key);
}

/** Store.onFrame: the latest write of a frame wins. */
let pendingFrame: (() => void) | null = null;
function onFrame(f: () => void) {
  const scheduled = pendingFrame !== null;
  pendingFrame = f;
  if (!scheduled) requestAnimationFrame(() => { const run = pendingFrame; pendingFrame = null; run?.(); });
}

/** Editor coordinates → the canvas page's (unbounded, unlike pointer.toPage). */
function page(x: number, y: number): [number, number] {
  const f = canvasFrame()?.getBoundingClientRect();
  return f ? [(x - f.left) / viewport.zoom, (y - f.top) / viewport.zoom] : [x, y];
}

/** Which part was grabbed: anchor ("a"), outgoing ("o") or incoming ("i") handle of point k. */
export function grab(ev: PointerEvent, part: "a" | "o" | "i", k: number) {
  const e = vectorEdit.editing;
  if (!e) return;
  ev.preventDefault();
  ev.stopPropagation();
  const p0 = toEditor(ev);
  const [x0, y0] = page(p0.x, p0.y);
  const { id, pts: pts0, closed } = e;
  const key = `vector:${id}:${Date.now()}`;
  pointerDrag(arrow, (p) => {
    const [x, y] = page(p.x, p.y);
    const pts = PathEdit.drag(pts0, part, k, x0, y0, x, y);
    vectorEdit.editing = { id, pts, closed };
    onFrame(() => write(id, pts, closed, key));
  }, () => {});
}

/** The points, handles and outline as SVG, page coordinates mapped by `w` (U/VectorEdit.apply). */
export function overlaySvg(e: Editing, w: (x: number, y: number) => [number, number]): string {
  const n = (d: number) => Math.round(d * 10) / 10;
  const mapped = e.pts.map((a) => { const [x, y] = w(a.x, a.y); return PathEdit.anchor(x, y, a.out && w(...a.out), a.inH && w(...a.inH)); });
  const outline = `<path d="${PathEdit.pathData(mapped, e.closed)}" stroke="#2563eb" stroke-width="1.5" fill="none"/>`;
  const handles = mapped.flatMap((a, k) =>
    ([["o", a.out], ["i", PathEdit.handleIn(a)]] as const).flatMap(([kind, h]) => h ? [
      `<path d="M${n(a.x)} ${n(a.y)}L${n(h[0])} ${n(h[1])}" stroke="#2563eb" stroke-width="1"/>`,
      `<circle data-k="${kind}${k}" cx="${n(h[0])}" cy="${n(h[1])}" r="4" fill="white" stroke="#2563eb" style="cursor:move"/>`,
    ] : [])).join("");
  const anchors = mapped.map((a, k) =>
    `<rect data-k="a${k}" x="${n(a.x - 4.5)}" y="${n(a.y - 4.5)}" width="9" height="9" fill="white" stroke="#2563eb" stroke-width="1.5" style="cursor:move"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style="position:absolute;inset:0;overflow:visible">${outline}${handles}${anchors}</svg>`;
}
