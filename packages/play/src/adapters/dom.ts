/** DOM implementations of the adapters, for a published page (frame side) and inside the sandbox (game side). */
import type { InputTarget } from "../capabilities/input";
import type { LogSink } from "../capabilities/log";
import type { Snapshotter } from "../capabilities/inspect";
import type { ViewportSource } from "../capabilities/viewport";

/** Seen when at least a little of the frame is on screen and the tab is showing. */
export const frameViewport = (frame: HTMLIFrameElement): ViewportSource => {
  let onScreen = true;
  const visible = () => onScreen && !document.hidden;
  return {
    visible,
    watch: (listener) => {
      let last = visible();
      const changed = () => {
        const now = visible();
        if (now !== last) listener((last = now));
      };
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) onScreen = e.isIntersecting;
        changed();
      });
      io.observe(frame);
      document.addEventListener("visibilitychange", changed);
      return () => {
        io.disconnect();
        document.removeEventListener("visibilitychange", changed);
      };
    },
    fullscreen: async () => {
      await frame.requestFullscreen();
    },
  };
};

export const consoleSink = (label: string): LogSink => ({
  write: ({ level, text }) => console[level](`[Auvyx Play ${label}]`, text),
});

/** The KeyboardEvent.code a US keyboard gives for a key (games test `code` as often as `key`). */
export const codeOf = (key: string): string => {
  if (key === " ") return "Space";
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return key; // ArrowRight, Enter, Escape, Shift… are their own code
};

/** Inside the sandbox: events where a game listens for them. Keys go to what has focus inside the game area (else the
 *  area), so they reach listeners on the area, the document and the window alike; pointers to the element under the point. */
export const domInput = (area: HTMLElement): InputTarget => ({
  key: ({ type, key, code }) => {
    const init = { key, code: code ?? codeOf(key), bubbles: true, cancelable: true };
    const focused = document.activeElement;
    const target = focused instanceof HTMLElement && area.contains(focused) ? focused : area;
    target.dispatchEvent(new KeyboardEvent(type === "down" ? "keydown" : "keyup", init));
  },
  pointer: ({ type, x, y }) => {
    const box = area.getBoundingClientRect();
    const clientX = box.left + x * box.width;
    const clientY = box.top + y * box.height;
    const target = document.elementFromPoint(clientX, clientY) ?? area;
    const init = { clientX, clientY, bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", isPrimary: true };
    target.dispatchEvent(new PointerEvent(`pointer${type}`, init));
    if (type === "down") target.dispatchEvent(new MouseEvent("mousedown", init));
    if (type === "up") {
      target.dispatchEvent(new MouseEvent("mouseup", init));
      target.dispatchEvent(new MouseEvent("click", init));
    }
  },
});

/** The game's largest canvas, scaled down. A WebGL canvas needs preserveDrawingBuffer (the runtime asks for it in the Studio). */
export const canvasSnapshotter = (area: HTMLElement): Snapshotter => ({
  snapshot: async (maxWidth) => {
    const canvases = [...area.querySelectorAll("canvas")];
    const canvas = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!canvas || canvas.width === 0) return null;
    const scale = Math.min(1, maxWidth / canvas.width);
    const out = document.createElement("canvas");
    out.width = Math.round(canvas.width * scale);
    out.height = Math.round(canvas.height * scale);
    out.getContext("2d")?.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL("image/jpeg", 0.8);
  },
});
