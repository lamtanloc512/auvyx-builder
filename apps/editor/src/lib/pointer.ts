/**
 * A pointer drag that never gets stuck (U/Pointer.scala): moves and the release are heard in the editor and in the
 * canvas frame, in editor coordinates; Escape or a lost pointer cancels. Returns a function that cancels it.
 */
import { viewport } from "./viewport.svelte";

export interface P { x: number; y: number; shift: boolean; alt: boolean; meta: boolean }

export const canvasFrame = () => document.querySelector<HTMLIFrameElement>("iframe[data-auvyx-canvas]");

/** Editor coordinates of an event from either document. */
export function toEditor(e: MouseEvent): P {
  let x = e.clientX, y = e.clientY;
  const view = (e.target as Node | null)?.ownerDocument?.defaultView;
  if (view && view !== window) {
    const f = canvasFrame()?.getBoundingClientRect();
    if (f) { x = f.left + e.clientX * viewport.zoom; y = f.top + e.clientY * viewport.zoom; }
  }
  return { x, y, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey || e.ctrlKey };
}

/** The point in the canvas page's own coordinates (for elementFromPoint), or null outside the frame. */
export function toPage(x: number, y: number): [number, number] | null {
  const f = canvasFrame()?.getBoundingClientRect();
  if (!f || x < f.left || x > f.right || y < f.top || y > f.bottom) return null;
  return [(x - f.left) / viewport.zoom, (y - f.top) / viewport.zoom];
}

export function drag(cursor: string, move: (p: P) => void, end: (p: P) => void, onCancel: () => void = () => {}): () => void {
  const docs = [document, canvasFrame()?.contentDocument].filter(Boolean) as Document[];
  const style = document.createElement("style");
  style.textContent = `*{cursor:${cursor}!important}`;
  document.head.appendChild(style);
  const onMove = (e: PointerEvent) => move(toEditor(e));
  const onUp = (e: PointerEvent) => { stop(); end(toEditor(e)); };
  const onLost = () => { stop(); onCancel(); };
  // A press in the canvas frame moves the focus into it, which blurs this window: that is not a lost pointer.
  let done = false;
  const onBlur = () => setTimeout(() => { if (!done && document.activeElement !== canvasFrame()) onLost(); }, 0);
  function stop() {
    done = true;
    style.remove();
    for (const d of docs) {
      d.removeEventListener("pointermove", onMove, true);
      d.removeEventListener("pointerup", onUp, true);
      d.removeEventListener("pointercancel", onLost, true);
    }
    window.removeEventListener("blur", onBlur);
  }
  for (const d of docs) {
    d.addEventListener("pointermove", onMove, true);
    d.addEventListener("pointerup", onUp, true);
    d.addEventListener("pointercancel", onLost, true);
  }
  window.addEventListener("blur", onBlur);
  return () => { stop(); onCancel(); };
}
