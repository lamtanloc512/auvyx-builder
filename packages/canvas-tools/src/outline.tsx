/**
 * Outline + label around an element in the canvas document (hover, selection,
 * component instances). Follows layout changes every frame. Elements with
 * `display: contents` (component instance wrappers) use their children's bounds.
 */
import { createPortal, useEffect, useMemo, useState } from "@wordpress/element";
import { attachCss } from "./attach-css";
import type { Rect } from "./measure";

export type OutlineVariant = "hover" | "selected" | "component";

const CSS = `
.auvyx-outline{position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:99998}
.auvyx-outline__box{position:absolute;box-sizing:border-box;pointer-events:none}
.auvyx-outline--hover .auvyx-outline__box{border:1px solid #3858e9}
.auvyx-outline--selected .auvyx-outline__box{border:2px solid #3858e9}
.auvyx-outline--component .auvyx-outline__box{border:2px solid #9b51e0}
.auvyx-outline__label{position:absolute;transform:translateY(-100%);padding:3px 6px;border-radius:3px 3px 0 0;font:600 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff;white-space:nowrap}
.auvyx-outline--hover .auvyx-outline__label,.auvyx-outline--selected .auvyx-outline__label{background:#3858e9}
.auvyx-outline--component .auvyx-outline__label{background:#9b51e0}
`;

export const elementRect = (element: HTMLElement): Rect => {
  const win = element.ownerDocument.defaultView ?? window;
  const boxes =
    win.getComputedStyle(element).display === "contents"
      ? [...element.children].map((child) => child.getBoundingClientRect())
      : [element.getBoundingClientRect()];
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.right));
  const bottom = Math.max(...boxes.map((b) => b.bottom));
  return { x: left + win.scrollX, y: top + win.scrollY, w: right - left, h: bottom - top };
};

const same = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

export function ElementOutline({
  element,
  label,
  variant,
}: {
  element: HTMLElement;
  label?: string;
  variant: OutlineVariant;
}) {
  const doc = element.ownerDocument;
  const win = doc.defaultView ?? window;
  const [rect, setRect] = useState(() => elementRect(element));
  const root = useMemo(() => doc.createElement("div"), [doc]);

  useEffect(() => {
    root.className = `auvyx-outline auvyx-outline--${variant}`;
  }, [root, variant]);

  useEffect(() => {
    doc.body.appendChild(root);
    const detach = attachCss(doc, "auvyx-outline", CSS);
    let frame = 0;
    const tick = () => {
      const next = elementRect(element);
      setRect((previous) => (same(previous, next) ? previous : next));
      frame = win.requestAnimationFrame(tick);
    };
    frame = win.requestAnimationFrame(tick);
    return () => {
      win.cancelAnimationFrame(frame);
      root.remove();
      detach();
    };
  }, [doc, win, root, element]);

  return createPortal(
    <>
      <div className="auvyx-outline__box" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
      {label && (
        <div className="auvyx-outline__label" style={{ left: rect.x, top: rect.y }}>
          {label}
        </div>
      )}
    </>,
    root
  );
}
