/**
 * Reads the selected element's box from the DOM (document coordinates of the
 * canvas, which is usually the editor iframe).
 */
import type { Side } from "./drag";

export type Rect = { x: number; y: number; w: number; h: number };

export type Box = Rect & {
  padding: Record<Side, number>;
  margin: Record<Side, number>;
  border: Record<Side, number>;
  radius: number;
  /** Used CSS width/height (respecting box-sizing), the start values for resizing. */
  width: number;
  height: number;
  rtl: boolean;
  /** Space between the first two children of a flex/grid container. */
  gap: { rect: Rect; axis: "x" | "y"; value: number } | null;
};

const num = (value: string) => Number.parseFloat(value) || 0;

const sides = (cs: CSSStyleDeclaration, prefix: string, suffix = ""): Record<Side, number> => ({
  top: num(cs.getPropertyValue(`${prefix}-top${suffix}`)),
  right: num(cs.getPropertyValue(`${prefix}-right${suffix}`)),
  bottom: num(cs.getPropertyValue(`${prefix}-bottom${suffix}`)),
  left: num(cs.getPropertyValue(`${prefix}-left${suffix}`)),
});

/** Gutenberg adds appenders and drop zones as children; they are not layout items. */
const isLayoutChild = (child: Element, win: Window) =>
  child instanceof (win as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement &&
  child.tagName !== "STYLE" &&
  !child.classList.contains("block-list-appender") &&
  !child.classList.contains("block-editor-block-list__insertion-point") &&
  win.getComputedStyle(child).display !== "none";

export const measure = (element: HTMLElement): Box => {
  const win = element.ownerDocument.defaultView ?? window;
  const rect = element.getBoundingClientRect();
  const cs = win.getComputedStyle(element);
  const x = rect.left + win.scrollX;
  const y = rect.top + win.scrollY;

  let gap: Box["gap"] = null;
  if (/flex|grid/.test(cs.display)) {
    const [a, b] = [...element.children].filter((child) => isLayoutChild(child, win));
    if (a && b) {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (Math.abs(ra.top - rb.top) < 2) {
        const [first, second] = ra.left <= rb.left ? [ra, rb] : [rb, ra];
        const top = Math.max(ra.top, rb.top);
        gap = {
          axis: "x",
          value: num(cs.columnGap),
          rect: { x: first.right + win.scrollX, y: top + win.scrollY, w: second.left - first.right, h: Math.min(ra.bottom, rb.bottom) - top },
        };
      } else {
        const left = Math.max(ra.left, rb.left);
        gap = {
          axis: "y",
          value: num(cs.rowGap),
          rect: { x: left + win.scrollX, y: ra.bottom + win.scrollY, w: Math.min(ra.right, rb.right) - left, h: rb.top - ra.bottom },
        };
      }
    }
  }

  return {
    x,
    y,
    w: rect.width,
    h: rect.height,
    padding: sides(cs, "padding"),
    margin: sides(cs, "margin"),
    border: sides(cs, "border", "-width"),
    radius: num(cs.borderTopLeftRadius),
    width: num(cs.width),
    height: num(cs.height),
    rtl: cs.direction === "rtl",
    gap,
  };
};
