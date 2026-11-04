/**
 * Flatsome's text box Position X/Y (U/TextBoxPosition.scala): a box inside a banner is placed at x% / y% of it, per
 * screen. The inspector's pad and the canvas handle both drag through here; a drag is one undo step.
 */
import { Settings as S, parentOf } from "@auvyx/editor-core";
import { store } from "./store.svelte";
import { viewport } from "./viewport.svelte";
import { BASE, breakpoints } from "./settingsOps";

export const placeable = (id: string) => S.placeable(store.doc, id, breakpoints(), store.breakpoint);
export const currentXY = (id: string) => { const n = store.doc.nodes[id]; return n ? S.readBoxPosition(n.styles, breakpoints(), store.breakpoint) : null; };

/** TextBoxPosition.set: x/y on the current screen (or cleared); the banner becomes the positioning box. */
export function setXY(id: string, xy: [number, number] | null, key: string | null = null) {
  store.commit(S.placeBox(store.doc, id, xy, store.breakpoint, BASE), key);
}

/** Pointer (editor coordinates) → x/y % of the box's banner on the canvas. */
export function pointToXY(id: string, cx: number, cy: number): [number, number] | null {
  const frame = document.querySelector<HTMLElement>("iframe[data-auvyx-canvas]");
  const p = parentOf(store.doc, id);
  const parent = p ? store.elements.get(p) : undefined;
  if (!frame || !parent) return null;
  const f = frame.getBoundingClientRect(), z = viewport.zoom, r = parent.getBoundingClientRect();
  return [S.clampPct(((cx - f.left - r.left * z) / (r.width * z)) * 100), S.clampPct(((cy - f.top - r.top * z) / (r.height * z)) * 100)];
}

let seq = 0;
/** Follows the pointer until release; every move rewrites x/y under one undo key. */
export function dragXY(id: string, ev: PointerEvent, onMove: (cx: number, cy: number) => [number, number] | null) {
  ev.preventDefault();
  ev.stopPropagation();
  seq++;
  const key = `text-box-pos:${id}:${seq}`;
  // Captured, so moves over the canvas frame (another document) still reach us.
  const target = ev.currentTarget as HTMLElement;
  target.setPointerCapture(ev.pointerId);
  const move = (e: PointerEvent) => { const xy = onMove(e.clientX, e.clientY); if (xy) setXY(id, xy, key); };
  const up = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", up); target.removeEventListener("pointercancel", up); };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", up);
  target.addEventListener("pointercancel", up);
  if (!target.hasAttribute("data-text-box-handle")) move(ev); // the pad jumps to the click
}
