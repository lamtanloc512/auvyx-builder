/**
 * Figma-style "scrubbing": drag horizontally on a label or number input to
 * change the value. Click without moving still focuses the input.
 */
import type { PointerEvent as ReactPointerEvent } from "react";

export type ScrubOptions = { step?: number; unit?: string; min?: number };

const NUMERIC = /^(-?\d*\.?\d+)([a-z%]*)$/i;

const round = (value: number, step: number) => {
  const decimals = step < 1 ? Math.min(3, String(step).split(".")[1]?.length ?? 2) : 0;
  return Number(value.toFixed(decimals));
};

/**
 * New value after scrubbing `steps` increments. Keeps the unit of the current
 * value; starts from the inherited value (placeholder) or 0 when unset.
 * Non-numeric values (var(), calc(), auto) start over from 0.
 */
export const scrubValue = (
  current: string | undefined,
  fallback: string | undefined,
  steps: number,
  { step = 1, unit = "px", min }: ScrubOptions = {}
): string => {
  const match = NUMERIC.exec(current?.trim() ?? "") ?? NUMERIC.exec(fallback?.trim() ?? "");
  const base = match ? Number(match[1]) : 0;
  const suffix = match ? match[2] || (match[1] === "0" ? unit : "") : unit;
  let next = round(base + steps * step, step);
  if (min !== undefined) next = Math.max(min, next);
  return `${next}${suffix}`;
};

const PX_PER_STEP = 2;
const THRESHOLD = 3;

/**
 * Pointer handlers for scrubbing. Shift = ×10, Alt = ×0.1.
 * `onScrub(steps)` receives the total steps since pointer down.
 */
export const scrubHandlers = (
  onScrub: (steps: number) => void,
  { focusOnClick = false }: { focusOnClick?: boolean } = {}
) => ({
  onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    const target = event.currentTarget;
    const doc = target.ownerDocument;
    const startX = event.clientX;
    const pointerId = event.pointerId;
    let scrubbing = false;
    if (focusOnClick) event.preventDefault();

    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      if (!scrubbing && Math.abs(dx) < THRESHOLD) return;
      if (!scrubbing) {
        scrubbing = true;
        target.setPointerCapture?.(pointerId);
        doc.body.classList.add("auvyx-scrubbing");
      }
      const multiplier = moveEvent.shiftKey ? 10 : moveEvent.altKey ? 0.1 : 1;
      onScrub(Math.round(dx / PX_PER_STEP) * multiplier);
    };
    const up = () => {
      doc.removeEventListener("pointermove", move);
      doc.body.classList.remove("auvyx-scrubbing");
      if (!scrubbing && focusOnClick && target instanceof HTMLInputElement) {
        target.focus();
        target.select();
      }
    };
    doc.addEventListener("pointermove", move);
    doc.addEventListener("pointerup", up, { once: true });
  },
});
