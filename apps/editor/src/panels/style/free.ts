/**
 * Free frames on the canvas (U/Free.scala), as far as the Style panel needs: is a frame free, convert a frame to free
 * (every child keeps where it is now) or back to flow, a child's X/Y and constraints. Geometry is measured from the
 * canvas page.
 */
import {
  childrenOf, freeConstraints, freeFrame, freePlace, parentOf, setStyle, update,
  FREE_CHILD_IN_FLOW, FREE_CHILD_STACKED, FREE_CHILD_STACKED_SIZED, FREE_FRAME_STACKED, type Doc, type El, type FreeH, type FreeV, type Geo,
} from "@auvyx/editor-core";
import { resolveValue, type StateId } from "@auvyx/style-engine";
import { store, SCREENS } from "../../lib/store.svelte";
import { bps } from "./state.svelte";

type Patch = [string, string | undefined][];
const setStyles = (styles: El["styles"], bp: string, st: string, patch: Patch) => patch.reduce((s, [p, v]) => setStyle(s, bp, st, p, v), styles);
const resolved = (n: El, bp: string, prop: string) => resolveValue(n.styles, bps(), bp, "default" as StateId, prop)?.value;
const desktop = () => SCREENS[0]!.id;
const tablet = () => SCREENS[1]?.id;

/** The element is a free frame on this breakpoint. */
export function isFrame(id: string, bp = store.breakpoint): boolean {
  const n = store.doc.nodes[id];
  if (!n || n.kind !== "Section") return false;
  const pos = resolved(n, bp, "position");
  return resolved(n, bp, "display") === "block" && (pos === "relative" || pos === "absolute");
}

/** The element sits in a free frame on the current breakpoint. */
export function isChild(id: string): boolean {
  const p = parentOf(store.doc, id);
  return p !== null && isFrame(p);
}

/** Box relative to its parent's padding box, CSS px; size and center ignore rotation (Figma's X/Y). */
export function geo(el: HTMLElement): Geo {
  const r = el.getBoundingClientRect();
  const f = el.parentElement;
  let ox = 0, oy = 0;
  if (f) { const fr = f.getBoundingClientRect(); ox = fr.left + f.clientLeft; oy = fr.top + f.clientTop; }
  const w = el.offsetWidth, h = el.offsetHeight;
  return { x: r.left + r.width / 2 - w / 2 - ox, y: r.top + r.height / 2 - h / 2 - oy, w, h };
}

function frameSize(id: string): [number, number] {
  const f = store.elements.get(id);
  return f ? [f.clientWidth, f.clientHeight] : [1280, 600];
}

const autoHeight = (n: El) => ["Heading", "Text", "Button", "Accordion"].includes(n.kind);

/** Constraints of a child (current, else defaults: centered in page-level sections, left elsewhere; top). */
export function constraints(id: string): [FreeH, FreeV] {
  const n = store.doc.nodes[id];
  if (!n) return ["Left", "Top"];
  const bp = store.breakpoint;
  if (resolved(n, bp, "position") === "absolute") return freeConstraints((p) => resolved(n, bp, p));
  const p = parentOf(store.doc, id);
  return [p !== null && store.doc.roots.includes(p) ? "Center" : "Left", "Top"];
}

function childPatch(d: Doc, id: string, frame: string, g: Geo, hv: [FreeH, FreeV]): Doc {
  const [fw, fh] = frameSize(frame);
  const bp = store.breakpoint;
  return update(d, id, (n) => {
    let styles = setStyles(n.styles, bp, "default", freePlace(g, fw, fh, hv[0], hv[1], autoHeight(n)));
    const t = tablet();
    if (bp === desktop() && t && n.styles[t]?.default?.position === undefined) {
      const fallback = autoHeight(n) || (n.kind === "Section" && n.children.length > 0) ? FREE_CHILD_STACKED : FREE_CHILD_STACKED_SIZED;
      styles = setStyles(styles, t, "default", fallback);
    }
    return { ...n, styles };
  });
}

/** Moves/resizes children of free frames (one commit). */
export function place(boxes: [string, Geo][], key: string | null = null, hv?: [FreeH, FreeV]) {
  const d = boxes.reduce((d, [id, g]) => {
    const frame = parentOf(d, id);
    return frame === null ? d : childPatch(d, id, frame, g, hv ?? constraints(id));
  }, store.doc);
  store.commit(d, key);
}

/** Flow → Free on the current breakpoint: every child keeps where it is now. */
export function toFree(frame: string) {
  const f = store.elements.get(frame);
  const node = store.doc.nodes[frame];
  if (!f || !node) return;
  const bp = store.breakpoint;
  const placedItself = resolved(node, bp, "position") === "absolute";
  let d = update(store.doc, frame, (n) => {
    let styles = setStyles(n.styles, bp, "default", freeFrame(f.clientHeight).filter(([p]) => !(placedItself && p === "position")));
    const t = tablet();
    if (bp === desktop() && t) styles = setStyles(styles, t, "default", FREE_FRAME_STACKED);
    return { ...n, styles };
  });
  // measure before anything moves
  const boxes = childrenOf(store.doc, frame).flatMap((id) => { const e = store.elements.get(id); return e ? [[id, geo(e)] as [string, Geo]] : []; });
  const [fw, fh] = [f.clientWidth, f.clientHeight];
  for (const [id, g] of boxes) {
    d = update(d, id, (n) => {
      const h: FreeH = store.doc.roots.includes(frame) ? "Center" : "Left";
      let styles = setStyles(n.styles, bp, "default", freePlace(g, fw, fh, h, "Top", autoHeight(n)));
      const t = tablet();
      if (bp === desktop() && t) styles = setStyles(styles, t, "default", FREE_CHILD_STACKED);
      return { ...n, styles };
    });
  }
  store.commit(d);
}

/** Free → flow on the current breakpoint (the caller sets the new display). */
export function leaveFree(frame: string, d: Doc): Doc {
  const bp = store.breakpoint;
  return childrenOf(d, frame).reduce((acc, id) => update(acc, id, (n) => ({ ...n, styles: setStyles(n.styles, bp, "default", FREE_CHILD_IN_FLOW) })), d);
}

export { setStyles, resolved };
