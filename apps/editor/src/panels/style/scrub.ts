/** Drag a prefix to scrub a value (StylePanel.scrub): ±1 per 2 px, Shift ×10, Alt ×0.1; a click without a drag resets a value set here. */
import { scrubValue, type ScrubOptions, type StyleField } from "@auvyx/editor-core";
import { drag } from "../../lib/pointer";
import { computed, Cursors, set } from "./state.svelte";

let pending: (() => void) | null = null;
/** Runs the latest edit once per animation frame (Store.onFrame): a drag writes at most once a frame. */
export function onFrame(f: () => void) {
  const first = pending === null;
  pending = f;
  if (first) requestAnimationFrame(() => { const p = pending; pending = null; p?.(); });
}

export function startScrub(ev: PointerEvent, prop: string, start: StyleField, options: ScrubOptions) {
  const startX = ev.clientX;
  const key = `scrub${Date.now()}`;
  let moved = false;
  drag(Cursors.ew, (e) => {
    const dx = e.x - startX;
    if (moved || Math.abs(dx) > 2) {
      moved = true;
      const mult = e.shift ? 10 : e.alt ? 0.1 : 1;
      const next = scrubValue(start.own, start.inherited ?? computed(prop), Math.round(dx / 2) * mult, options);
      onFrame(() => set(prop, next, key));
    }
  }, () => { if (!moved && start.own !== undefined) set(prop, undefined, "reset"); });
}
