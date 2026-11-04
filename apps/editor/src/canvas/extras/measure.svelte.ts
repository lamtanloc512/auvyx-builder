/**
 * Rects the canvas extras follow (U/Overlay.scala selRect, SliderFocus.measure), in page coordinates of the canvas
 * frame, re-measured every frame while mounted, like the overlay's own outlines.
 */
import { store } from "../../lib/store.svelte";
import type { Rect } from "../../lib/measure.svelte";

const same = (a: Rect | null, b: Rect | null) => (a === b) || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);
const live = (id: string | null) => { const e = id ? store.elements.get(id) : undefined; return e?.isConnected ? e : null; };
const rectOf = (e: HTMLElement): Rect => { const d = e.getBoundingClientRect(); return { x: d.left, y: d.top, w: d.width, h: d.height }; };

/** The element's rect each frame (null while it is not on the canvas). Call from a component. */
export function follow(id: () => string | null): { readonly rect: Rect | null } {
  let rect = $state<Rect | null>(null);
  $effect(() => {
    let raf = 0;
    const tick = () => {
      const e = live(id());
      const r = e ? rectOf(e) : null;
      if (!same(r, rect)) rect = r;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  });
  return { get rect() { return rect; } };
}
