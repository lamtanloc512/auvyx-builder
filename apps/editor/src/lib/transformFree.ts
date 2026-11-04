/**
 * Free frames in the editor (U/Free.scala, the part the handles and Align need): reading positions from the canvas
 * and writing placements; Align / Distribute of children of one free frame (U/AutoLayout.scala).
 */
import { Arrange, getStyle, parentOf, update, setStyle, type Doc, type El } from "@auvyx/editor-core";
import { resolveValue, type Breakpoint } from "@auvyx/style-engine";
import { store } from "./store.svelte";
import { screens } from "./screens.svelte";

const resolved = (n: El, bp: string, prop: string) => resolveValue(n.styles, screens.all as Breakpoint[], bp, "default", prop)?.value;
const DESKTOP = "base";
const TABLET = "tablet";
const children = (doc: Doc, id: string | null) => (id ? doc.nodes[id]?.children ?? [] : doc.roots);

/** Free on breakpoint `bp`: display block + positioned (relative, or absolute when the frame itself sits in a free frame). */
export function isFrame(id: string, bp = store.breakpoint): boolean {
  const n = store.doc.nodes[id];
  return !!n && n.kind === "Section" && resolved(n, bp, "display") === "block" && ["relative", "absolute"].includes(resolved(n, bp, "position") ?? "");
}

/** The element sits in a free frame on the current breakpoint. */
export function isChild(id: string): boolean { const p = parentOf(store.doc, id); return !!p && isFrame(p); }

/** Box relative to its parent frame's padding box, CSS px; size and center ignore rotation, like Figma's X/Y. */
export function geo(el: HTMLElement): Arrange.Geo {
  const r = el.getBoundingClientRect();
  const f = el.parentElement;
  const fr = f?.getBoundingClientRect();
  const [ox, oy] = f && fr ? [fr.left + f.clientLeft, fr.top + f.clientTop] : [0, 0];
  const [w, h] = [el.offsetWidth, el.offsetHeight];
  return { x: r.left + r.width / 2 - w / 2 - ox, y: r.top + r.height / 2 - h / 2 - oy, w, h };
}

export function frameSize(id: string): [number, number] {
  const f = store.elements.get(id);
  return f ? [f.clientWidth, f.clientHeight] : [1280, 600];
}

export const autoHeight = (n: El) => ["Heading", "Text", "Button", "Accordion"].includes(n.kind);

/** Constraints of a child (current, else defaults: centered in page-level sections, left elsewhere; top). */
export function constraints(id: string): [Arrange.H, Arrange.V] {
  const n = store.doc.nodes[id];
  if (!n) return ["Left", "Top"];
  const bp = store.breakpoint;
  if (resolved(n, bp, "position") === "absolute") return Arrange.constraints((p) => resolved(n, bp, p));
  const p = parentOf(store.doc, id);
  return [p && store.doc.roots.includes(p) ? "Center" : "Left", "Top"];
}

const setAll = (styles: El["styles"], bp: string, patch: Arrange.Patch) => patch.reduce((s, [k, v]) => setStyle(s, bp, "default", k, v), styles);

function childPatch(d: Doc, id: string, frame: string, g: Arrange.Geo, hv: [Arrange.H, Arrange.V]): Doc {
  const [fw, fh] = frameSize(frame);
  const bp = store.breakpoint;
  return update(d, id, (n) => {
    let styles = setAll(n.styles, bp, Arrange.place(g, fw, fh, hv[0], hv[1], autoHeight(n)));
    if (bp === DESKTOP && getStyle(n.styles, TABLET, "default", "position") === undefined) {
      // Text and frames with content reflow; shapes, images and lines keep their size.
      const fallback = autoHeight(n) || (n.kind === "Section" && n.children.length > 0) ? Arrange.childStacked : Arrange.childStackedSized;
      styles = setAll(styles, TABLET, fallback);
    }
    return { ...n, styles };
  });
}

/** Moves/resizes children of free frames (one commit). `boxes`: id → new box. */
export function place(boxes: [string, Arrange.Geo][], key: string | null = null) {
  const d = boxes.reduce((d, [id, g]) => { const frame = parentOf(d, id); return frame ? childPatch(d, id, frame, g, constraints(id)) : d; }, store.doc);
  store.commit(d, key);
}

/** Snap targets inside a frame for a moving/resizing child: edges and centers of siblings and of the frame. */
export function targets(frame: string, moving: string): [number[], number[]] {
  const [fw, fh] = frameSize(frame);
  const sibs = children(store.doc, frame).filter((c) => c !== moving).flatMap((c) => { const e = store.elements.get(c); return e ? [geo(e)] : []; });
  return [[0, fw / 2, fw, ...sibs.flatMap((g) => [g.x, g.x + g.w / 2, g.x + g.w])], [0, fh / 2, fh, ...sibs.flatMap((g) => [g.y, g.y + g.h / 2, g.y + g.h])]];
}

/** Page coordinates of a frame's padding-box origin (to draw guides). */
export function origin(frame: string): [number, number] {
  const f = store.elements.get(frame);
  if (!f) return [0, 0];
  const r = f.getBoundingClientRect();
  return [r.left + f.clientLeft, r.top + f.clientTop];
}

// ---- align / distribute (U/AutoLayout.scala) ----

/** The selection, when it can be arranged: children of one free frame. */
export function arrangeable(): [string, string[]] | null {
  const sel = store.selection;
  const first = sel[0];
  const parent = first ? parentOf(store.doc, first) : null;
  return parent && isFrame(parent) && sel.every((id) => parentOf(store.doc, id) === parent) ? [parent, sel] : null;
}

const geos = (ids: string[]): [string, Arrange.Geo][] => ids.flatMap((id) => { const e = store.elements.get(id); return e ? [[id, geo(e)] as [string, Arrange.Geo]] : []; });

/** Several elements align to their box; one aligns to its frame (Figma). */
export function align(a: Arrange.Align) {
  const ar = arrangeable();
  if (!ar) return;
  const [parent, ids] = ar;
  const boxes = geos(ids);
  if (!boxes.length) return;
  const [fw, fh] = frameSize(parent);
  const bounds = boxes.length === 1 ? { x: 0, y: 0, w: fw, h: fh } : Arrange.bbox(boxes.map((b) => b[1]));
  const out = Arrange.align(boxes.map((b) => b[1]), a, bounds);
  place(boxes.map((b, i) => [b[0], out[i]!]), "align");
}

export function distribute(horizontal: boolean) {
  const ar = arrangeable();
  if (!ar) return;
  const boxes = geos(ar[1]);
  const out = Arrange.distribute(boxes.map((b) => b[1]), horizontal);
  place(boxes.map((b, i) => [b[0], out[i]!]), "distribute");
}
