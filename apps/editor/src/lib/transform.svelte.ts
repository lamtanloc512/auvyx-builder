/**
 * Figma-style transform handles on the selection (U/TransformHandles.scala): corner squares and edges resize (Shift on
 * a corner keeps the ratio), the zones just outside the corners rotate (Shift snaps to 15°, double-click resets),
 * radius handles inside the corners (Alt: this corner only). Sizes are written as px on the current breakpoint:
 * `width`, and `height` for media or `min-height` for boxes and text. Rotation is the CSS `rotate` property.
 * Also the Row column splitters (U/Overlay.scala startColResize, UiCatalog.applyColSplit).
 */
import { Measure, ancestors, getStyle, parentOf, setStyle, update, type El, type Kind } from "@auvyx/editor-core";
import { store } from "./store.svelte";
import { viewport } from "./viewport.svelte";
import { canvasFrame, drag, type P } from "./pointer";
import { guides, measure, rectOf, type Box, type Rect } from "./measure.svelte";
import * as Free from "./transformFree";

// ---- cursors (U/Cursors.scala) ----
const svg = (body: string, hx: number, hy: number, fallback: string) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${body}</svg>`)}") ${hx} ${hy}, ${fallback}`;
const stroked = (d: string, width = 1.6) =>
  `<path d='${d}' fill='none' stroke='white' stroke-width='${width + 2.4}' stroke-linecap='round' stroke-linejoin='round'/>` +
  `<path d='${d}' fill='none' stroke='black' stroke-width='${width}' stroke-linecap='round' stroke-linejoin='round'/>`;
const doubleArrow = "<path d='M3.5 12l4-4v2.6h9V8l4 4-4 4v-2.6h-9V16z' fill='black' stroke='white' stroke-width='1.3' stroke-linejoin='round'/>";
const resize = (deg: number, fallback: string) => svg(`<g transform='rotate(${deg} 12 12)'>${doubleArrow}</g>`, 12, 12, fallback);
export const Cursors = {
  ew: resize(0, "ew-resize"),
  ns: resize(90, "ns-resize"),
  nwse: resize(45, "nwse-resize"),
  nesw: resize(-45, "nesw-resize"),
  rotate: svg(stroked("M6 15a7 7 0 0 1 11.2-7.6") + "<path d='M15.4 4.6l4.2.9-1 4.2z' fill='black' stroke='white' stroke-width='1.2' stroke-linejoin='round'/>", 12, 12, "crosshair"),
  radius: svg(stroked("M5 19v-5a9 9 0 0 1 9-9h5") + stroked("M11.5 11.5l6 6m0-3.6v3.6h-3.6", 1.5), 12, 12, "pointer"),
};

// ---- handles ----
export type H = "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW" | "RotNE" | "RotNW" | "RotSE" | "RotSW" | "RadNW" | "RadNE" | "RadSW" | "RadSE";
export const HANDLES: H[] = ["N", "S", "E", "W", "NE", "NW", "SE", "SW", "RotNE", "RotNW", "RotSE", "RotSW", "RadNW", "RadNE", "RadSW", "RadSE"];

const SQUARE = 8;
const EDGE = 8;
const ROT_ZONE = 18;

export const isRotate = (h: H) => h.startsWith("Rot");
export const isRadius = (h: H) => h.startsWith("Rad");
export const isEdge = (h: H) => h === "N" || h === "S" || h === "E" || h === "W";

export function cursor(h: H): string {
  if (h === "N" || h === "S") return Cursors.ns;
  if (h === "E" || h === "W") return Cursors.ew;
  if (h === "NE" || h === "SW") return Cursors.nesw;
  if (h === "NW" || h === "SE") return Cursors.nwse;
  return isRotate(h) ? Cursors.rotate : Cursors.radius;
}

/** The selected element's measured box (set by the overlay every frame). */
export const selection = $state({ box: null as Box | null });
/** "Radius 24" while a radius handle is hovered or dragged. */
export const radius = $state({ label: null as string | null });
let dragging = false;
export const isDragging = () => dragging;

/** Radius handles sit inside the corners, at the current radius (at least 12px in), like Figma. */
function radiusInset(r: Rect): number {
  const px = (selection.box?.radius ?? 0) * viewport.zoom;
  return Math.min(Math.max(12, px * 0.3 + 12), Math.min(r.w, r.h) / 2 - 4);
}

/** Handle rect around the workspace frame rect `r`. */
export function at(h: H, r: Rect): Rect {
  const [x0, y0, x1, y1] = [r.x, r.y, r.x + r.w, r.y + r.h];
  const sq = (cx: number, cy: number, s: number): Rect => ({ x: cx - s / 2, y: cy - s / 2, w: s, h: s });
  const inset = SQUARE + 2;
  switch (h) {
    case "NW": return sq(x0, y0, SQUARE);
    case "NE": return sq(x1, y0, SQUARE);
    case "SW": return sq(x0, y1, SQUARE);
    case "SE": return sq(x1, y1, SQUARE);
    case "N": return { x: x0 + inset, y: y0 - EDGE / 2, w: Math.max(0, r.w - 2 * inset), h: EDGE };
    case "S": return { x: x0 + inset, y: y1 - EDGE / 2, w: Math.max(0, r.w - 2 * inset), h: EDGE };
    case "W": return { x: x0 - EDGE / 2, y: y0 + inset, w: EDGE, h: Math.max(0, r.h - 2 * inset) };
    case "E": return { x: x1 - EDGE / 2, y: y0 + inset, w: EDGE, h: Math.max(0, r.h - 2 * inset) };
    case "RotNW": return { x: x0 - ROT_ZONE - 2, y: y0 - ROT_ZONE - 2, w: ROT_ZONE, h: ROT_ZONE };
    case "RotNE": return { x: x1 + 2, y: y0 - ROT_ZONE - 2, w: ROT_ZONE, h: ROT_ZONE };
    case "RotSW": return { x: x0 - ROT_ZONE - 2, y: y1 + 2, w: ROT_ZONE, h: ROT_ZONE };
    case "RotSE": return { x: x1 + 2, y: y1 + 2, w: ROT_ZONE, h: ROT_ZONE };
    case "RadNW": return sq(x0 + radiusInset(r), y0 + radiusInset(r), 10);
    case "RadNE": return sq(x1 - radiusInset(r), y0 + radiusInset(r), 10);
    case "RadSW": return sq(x0 + radiusInset(r), y1 - radiusInset(r), 10);
    case "RadSE": return sq(x1 - radiusInset(r), y1 - radiusInset(r), 10);
  }
}

const heightProp = (kind: Kind) => (kind === "Image" || kind === "Icon" || kind === "Video" || kind === "Path" ? "height" : "min-height");

/** Which handles an element gets: page-level sections only change height (their width is the page's). */
function handlesOf(n: El, root: boolean): H[] {
  const rad = ["Section", "Image", "Button", "Video"].includes(n.kind);
  if (n.kind === "Raw") return [];
  if (root) return ["N", "S"];
  return HANDLES.filter((h) => rad || !isRadius(h));
}

/** The selected element's handles. Locked layers cannot be resized or rotated on the canvas. */
export function allowed(): Set<H> {
  const n = store.node;
  if (!n || n.locked || ancestors(store.doc, n.id).some((a) => store.doc.nodes[a]?.locked)) return new Set();
  return new Set(handlesOf(n, store.doc.roots.includes(n.id)));
}

/** Store.onFrame: the latest write of a frame wins. */
let pendingFrame: (() => void) | null = null;
function onFrame(write: () => void) {
  const scheduled = pendingFrame !== null;
  pendingFrame = write;
  if (!scheduled) requestAnimationFrame(() => { const run = pendingFrame; pendingFrame = null; run?.(); });
}

const fmt = (d: number) => String(d);

export function hoverRadius(h: H, on: boolean) {
  if (!isRadius(h)) return;
  if (on) radius.label = selection.box ? `Radius ${Math.round(selection.box.radius)}` : null;
  else if (!dragging) radius.label = null;
}

export function resetRotation(h: H) { if (isRotate(h) && store.selected) store.setStyles(store.selected, [["rotate", undefined]]); }

export function start(h: H, ev: PointerEvent) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  ev.stopPropagation();
  const id = store.selected;
  const node = id ? store.doc.nodes[id] : undefined;
  const box = selection.box;
  const el = id ? store.elements.get(id) : undefined;
  if (!id || !node || !box || !el || !viewport.card) return;
  const z = viewport.zoom;
  const [sx, sy] = [ev.clientX, ev.clientY];
  const key = `transform:${id}:${Date.now()}`;
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
  const px = (s: string) => { const n = Number(s.replace(/px$/, "")); return Number.isFinite(n) ? n : 0; };
  // CSS width/height may be content-box: keep the padding/border difference out of the written value.
  const [dw, dh] = cs.boxSizing === "border-box" ? [0, 0] : [box.frame.w - px(cs.width), box.frame.h - px(cs.height)];
  const rad = (box.angle * Math.PI) / 180;
  const fr = canvasFrame()?.getBoundingClientRect();
  const [cx, cy] = fr ? [fr.left + (box.frame.x + box.frame.w / 2) * z, fr.top + (box.frame.y + box.frame.h / 2) * z] : [sx, sy];
  const a0 = Math.atan2(sy - cy, sx - cx);
  // Snap targets (Figma smart guides): edges and centers of the siblings and the parent's content box.
  const doc = store.doc;
  const parent = parentOf(doc, id);
  const sibs = parent ? doc.nodes[parent]?.children ?? [] : doc.roots;
  const others = sibs.filter((c) => c !== id).flatMap((c) => { const e = store.elements.get(c); return e ? [rectOf(e.getBoundingClientRect())] : []; });
  const pe = parent ? store.elements.get(parent) : undefined;
  const parentBox = pe ? (() => { const b = measure(pe); return [{ x: b.rect.x + b.padding.left, y: b.rect.y + b.padding.top, w: b.rect.w - b.padding.left - b.padding.right, h: b.rect.h - b.padding.top - b.padding.bottom }]; })() : [];
  const targets = [...others, ...parentBox];
  const xs = targets.flatMap((r) => [r.x, r.x + r.w / 2, r.x + r.w]);
  const ys = targets.flatMap((r) => [r.y, r.y + r.h / 2, r.y + r.h]);
  const threshold = 6 / z;
  // Child of a free frame: resize writes a full placement (frame-local box + constraints).
  const freeStart = Free.isChild(id) && parent ? { parent, g0: Free.geo(el), t: Free.targets(parent, id) } : null;
  const local = (e: P) => {
    const [dx, dy] = [(e.x - sx) / z, (e.y - sy) / z];
    return [dx * Math.cos(rad) + dy * Math.sin(rad), -dx * Math.sin(rad) + dy * Math.cos(rad)] as const;
  };

  const move = (e: P) => {
    if (isRadius(h)) {
      // Toward the center = more radius (in the element's own axes). Alt: this corner only.
      const [lx, ly] = local(e);
      const inward = h === "RadNW" ? (lx + ly) / 2 : h === "RadNE" ? (-lx + ly) / 2 : h === "RadSW" ? (lx - ly) / 2 : (-lx - ly) / 2;
      const r = Math.round(Math.max(0, Math.min(Math.min(box.frame.w, box.frame.h) / 2, box.radius + inward)));
      const prop = !e.alt ? "border-radius"
        : h === "RadNW" ? "border-top-left-radius" : h === "RadNE" ? "border-top-right-radius" : h === "RadSW" ? "border-bottom-left-radius" : "border-bottom-right-radius";
      onFrame(() => store.setStyles(id, [[prop, `${r}px`]], key));
      radius.label = `Radius ${r}`;
    } else if (isRotate(h)) {
      const raw = box.angle + ((Math.atan2(e.y - cy, e.x - cx) - a0) * 180) / Math.PI;
      const snapped = e.shift ? Math.round(raw / 15) * 15 : Math.round(raw * 10) / 10;
      const deg = (((snapped % 360) + 540) % 360) - 180;
      onFrame(() => store.setStyles(id, [["rotate", deg !== 0 ? `${fmt(deg)}deg` : undefined]], key));
    } else {
      // Pointer movement in page px, in the element's own (rotated) axes.
      const [lx, ly] = local(e);
      const horizontal = ["E", "W", "NE", "NW", "SE", "SW"].includes(h);
      const vertical = ["N", "S", "NE", "NW", "SE", "SW"].includes(h);
      // An edge handle changes only its own axis: the other one must not follow the pointer's drift.
      let w = horizontal ? box.frame.w + (["W", "NW", "SW"].includes(h) ? -lx : lx) : box.frame.w;
      let hh = vertical ? box.frame.h + (["N", "NE", "NW"].includes(h) ? -ly : ly) : box.frame.h;
      if (e.shift && horizontal && vertical) {
        const s = Math.max(w / box.frame.w, hh / box.frame.h);
        w = box.frame.w * s;
        hh = box.frame.h * s;
      }
      // Snap the moving right/bottom edge (the layout keeps the top-left in place). ⌘/Ctrl: no snapping.
      const lines: Measure.Line[] = [];
      if (box.angle === 0 && !e.shift && !e.meta) {
        const top = Math.min(box.frame.y, ys.length ? Math.min(...ys) : box.frame.y), bottom = Math.max(box.frame.y + hh, ys.length ? Math.max(...ys) : 0);
        const lft = Math.min(box.frame.x, xs.length ? Math.min(...xs) : box.frame.x), rgt = Math.max(box.frame.x + w, xs.length ? Math.max(...xs) : 0);
        if (["E", "NE", "SE"].includes(h)) {
          const x = Measure.snap(box.frame.x + w, xs, threshold);
          if (x !== null) { w = x - box.frame.x; lines.push({ x1: x, y1: top, x2: x, y2: bottom, dashed: false }); }
        }
        if (["S", "SE", "SW"].includes(h)) {
          const y = Measure.snap(box.frame.y + hh, ys, threshold);
          if (y !== null) { hh = y - box.frame.y; lines.push({ x1: lft, y1: y, x2: rgt, y2: y, dashed: false }); }
        }
      }
      guides.snap = lines;
      if (freeStart && box.angle === 0) {
        // Free frame (Figma): every edge moves; left/top handles move X/Y too. Snap the moving edges (red guides).
        const { g0, t: [fxs, fys] } = freeStart;
        const moveL = ["W", "NW", "SW"].includes(h), moveT = ["N", "NE", "NW"].includes(h);
        let [x0, x1] = moveL ? [g0.x + (g0.w - w), g0.x + g0.w] : [g0.x, g0.x + w];
        let [y0, y1] = moveT ? [g0.y + (g0.h - hh), g0.y + g0.h] : [g0.y, g0.y + hh];
        const red: Measure.Line[] = [];
        const [ox, oy] = Free.origin(freeStart.parent);
        const [fw, fh] = Free.frameSize(freeStart.parent);
        if (!e.shift && !e.meta) {
          if (horizontal) {
            const c = moveL ? Measure.snap(x0, fxs, threshold) : Measure.snap(x1, fxs, threshold);
            if (c !== null) { if (moveL) x0 = c; else x1 = c; red.push({ x1: ox + c, y1: oy, x2: ox + c, y2: oy + fh, dashed: false }); }
          }
          if (vertical) {
            const c = moveT ? Measure.snap(y0, fys, threshold) : Measure.snap(y1, fys, threshold);
            if (c !== null) { if (moveT) y0 = c; else y1 = c; red.push({ x1: ox, y1: oy + c, x2: ox + fw, y2: oy + c, dashed: false }); }
          }
        }
        guides.snap = [];
        guides.move = red;
        const g = { x: Math.min(x0, x1 - 1), y: Math.min(y0, y1 - 1), w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
        onFrame(() => Free.place([[id, g]], key));
      } else {
        const patch: [string, string | undefined][] = [
          ...(horizontal ? [["width", `${Math.max(1, Math.round(w - dw))}px`] as [string, string]] : []),
          ...(vertical ? [[heightProp(node.kind), `${Math.max(1, Math.round(hh - dh))}px`] as [string, string]] : []),
        ];
        onFrame(() => store.setStyles(id, patch, key));
      }
    }
  };
  const cleanup = () => {
    guides.snap = [];
    guides.move = [];
    radius.label = null;
    dragging = false;
  };
  capture(ev);
  dragging = true;
  // Both documents (editor + canvas iframe), ends on release anywhere: no sticky drags.
  drag(cursor(h), move, () => cleanup(), cleanup);
}

// ---- Row column splitters ----

/** Drag a Row boundary: the two columns either side trade width, the rest keep theirs. */
export function startColResize(ev: PointerEvent, index: number) {
  const rowId = store.selected;
  const rowEl = rowId ? store.elements.get(rowId) : undefined;
  if (!rowId || !rowEl) return;
  ev.preventDefault();
  ev.stopPropagation();
  const cols = (store.doc.nodes[rowId]?.children ?? []).flatMap((c) => { const e = store.elements.get(c); return e ? [e] : []; });
  if (index + 1 >= cols.length) return;
  const rowRect = rowEl.getBoundingClientRect();
  const a = cols[index]!.getBoundingClientRect();
  const b = cols[index + 1]!.getBoundingClientRect();
  const spanLeft = a.left - rowRect.left;
  const spanWidth = b.right - rowRect.left - spanLeft;
  capture(ev);
  drag("col-resize", (p) => {
    const f = canvasFrame()?.getBoundingClientRect();
    if (!f) return;
    const localX = (p.x - f.left) / viewport.zoom - rowRect.left;
    const frac = Math.max(0.08, Math.min(0.92, (localX - spanLeft) / spanWidth));
    applyColSplit(rowId, index, frac);
  }, () => {});
}

/** UiCatalog.applyColSplit: the columns either side of a boundary share their flex weight at `frac`. */
export function applyColSplit(id: string, index: number, frac: number) {
  const doc = store.doc;
  const cols = doc.nodes[id]?.children ?? [];
  if (index + 1 >= cols.length) return;
  const bp = store.breakpoint, st = store.styleState;
  const growOf = (cid: string) => { const v = Number(getStyle(doc.nodes[cid]?.styles ?? {}, bp, "default", "flex-grow")); return Number.isFinite(v) && getStyle(doc.nodes[cid]?.styles ?? {}, bp, "default", "flex-grow") !== undefined ? v : 1; };
  const total = growOf(cols[index]!) + growOf(cols[index + 1]!);
  const left = Math.max(0.05, frac * total);
  const right = Math.max(0.05, (1 - frac) * total);
  const set = (d: typeof doc, cid: string, grow: number) =>
    update(d, cid, (n) => ({ ...n, styles: ([["flex-grow", grow.toFixed(3)], ["flex-basis", "0%"], ["min-width", "0px"]] as [string, string][]).reduce((s, [p, v]) => setStyle(s, bp, st, p, v), n.styles) }));
  // one commit for both columns, so a drag is one undo step
  store.commit(set(set(doc, cols[index]!, left), cols[index + 1]!, right), `ui-split:${cols[index]}`);
}

/** Like Pointer.drag: the pressed element keeps the pointer, so nothing under it hovers meanwhile. */
function capture(ev: PointerEvent) {
  try { (ev.target as Element | null)?.setPointerCapture?.(ev.pointerId); } catch { /* not capturable */ }
}
