/**
 * What the overlay measures and draws besides outlines (U/Overlay.scala): the selected element's box (layout frame,
 * rotation, spacing, radius), the guides a transform handle snaps to (blue) and the free-frame smart guides (red),
 * and whether ⌥/Alt is held (distances to the hovered element, like Figma). Rects are page coordinates.
 */
import type { Measure } from "@auvyx/editor-core";

export interface Rect { x: number; y: number; w: number; h: number }
export interface Sides { top: number; right: number; bottom: number; left: number }
/** `rect` = bounding box on the page; `frame` = layout box before rotation (same center); `angle` in degrees. */
export interface Box { rect: Rect; frame: Rect; angle: number; padding: Sides; margin: Sides; border: Sides; rtl: boolean; radius: number }

const num = (v: string) => { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : 0; };

export const rectOf = (r: DOMRect): Rect => ({ x: r.left, y: r.top, w: r.width, h: r.height });
export const toR = (x: Rect): Measure.R => ({ left: x.x, top: x.y, right: x.x + x.w, bottom: x.y + x.h });

/** Computed `rotate` ("45deg", "0.5turn", "none") → degrees. */
function degrees(v: string): number {
  const t = v.trim();
  const m = /^-?[\d.]*/.exec(t)?.[0] ?? "";
  const n = Number(m);
  const d = m && Number.isFinite(n) ? n : 0;
  return t.endsWith("turn") ? d * 360 : t.endsWith("rad") ? (d * 180) / Math.PI : t.endsWith("deg") ? d : 0;
}

export function measure(el: HTMLElement): Box {
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
  const sides = (prefix: string, suffix = ""): Sides => ({
    top: num(cs.getPropertyValue(`${prefix}-top${suffix}`)), right: num(cs.getPropertyValue(`${prefix}-right${suffix}`)),
    bottom: num(cs.getPropertyValue(`${prefix}-bottom${suffix}`)), left: num(cs.getPropertyValue(`${prefix}-left${suffix}`)),
  });
  const rect = rectOf(el.getBoundingClientRect());
  const angle = degrees(cs.getPropertyValue("rotate"));
  const frame = angle === 0 ? rect : { x: rect.x + rect.w / 2 - el.offsetWidth / 2, y: rect.y + rect.h / 2 - el.offsetHeight / 2, w: el.offsetWidth, h: el.offsetHeight };
  return { rect, frame, angle, padding: sides("padding"), margin: sides("margin"), border: sides("border", "-width"), rtl: cs.direction === "rtl", radius: num(cs.getPropertyValue("border-top-left-radius")) };
}

export const guides = $state({
  /** Alignment guides while a transform handle snaps (set by the handles), page coordinates. */
  snap: [] as Measure.Line[],
  /** Smart guides while moving or resizing in a free frame (red, like Figma), page coordinates. */
  move: [] as Measure.Line[],
});

/** ⌥/Alt held: distances to the hovered element (Figma). Read every frame, so not reactive (Overlay.altDown). */
export const keys = { alt: false };
const onKey = (e: KeyboardEvent) => { keys.alt = e.altKey; };
const listened = new WeakSet<EventTarget>();
/** Hears ⌥ in a document's window (the editor's, and the canvas frame's after each load). */
export function listenAlt(win: Window) {
  if (listened.has(win)) return;
  listened.add(win);
  win.addEventListener("keydown", onKey, true);
  win.addEventListener("keyup", onKey, true);
  win.addEventListener("blur", () => { keys.alt = false; });
}
if (typeof window !== "undefined") listenAlt(window);
