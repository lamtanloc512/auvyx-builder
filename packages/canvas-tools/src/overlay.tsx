/**
 * Figma-style handles over the selected block, rendered into the canvas
 * document (editor iframe). Dragging writes the active breakpoint/state via
 * onChange; consecutive updates of the same attribute collapse into one undo
 * step in the block editor.
 */
import { createPortal, useEffect, useMemo, useRef, useState } from "@wordpress/element";
import type { PointerEvent as ReactPointerEvent } from "react";
import { attachCss } from "./attach-css";
import { computeDrag, handleProperties, lengthToPx, type Handle } from "./drag";
import { measure, type Box, type Rect } from "./measure";
import { OVERLAY_CSS } from "./overlay-css";

export type CanvasOverlayProps = {
  element: HTMLElement;
  /** Badge text, e.g. "Section · Tablet" ("" = no badge). */
  label: string;
  /** Spacing presets (slug + CSS length) for snapping. */
  spacingTokens: readonly { slug: string; size?: string }[];
  onChange: (patch: Record<string, string | undefined>) => void;
};

type Placed = { key: string; handle: Handle; rect: Rect; kind: string; cursor: string };

const PILL = 18;
const THICK = 6;
const MIN_BAND = 12;

const horizontalPill = (cx: number, cy: number): Rect => ({ x: cx - PILL / 2, y: cy - THICK / 2, w: PILL, h: THICK });
const verticalPill = (cx: number, cy: number): Rect => ({ x: cx - THICK / 2, y: cy - PILL / 2, w: THICK, h: PILL });

const placeHandles = (box: Box): Placed[] => {
  const { x, y, w, h, padding: p, margin: m, border: b } = box;
  const midX = x + w / 2;
  const midY = y + h / 2;
  const band = (value: number) => Math.max(Math.abs(value), MIN_BAND) / 2;
  const placed: Placed[] = [
    { key: "pt", handle: { type: "padding", side: "top" }, kind: "padding", cursor: "ns-resize", rect: horizontalPill(midX, y + b.top + band(p.top)) },
    { key: "pb", handle: { type: "padding", side: "bottom" }, kind: "padding", cursor: "ns-resize", rect: horizontalPill(midX, y + h - b.bottom - band(p.bottom)) },
    { key: "pl", handle: { type: "padding", side: "left" }, kind: "padding", cursor: "ew-resize", rect: verticalPill(x + b.left + band(p.left), midY) },
    { key: "pr", handle: { type: "padding", side: "right" }, kind: "padding", cursor: "ew-resize", rect: verticalPill(x + w - b.right - band(p.right), midY) },
    { key: "mt", handle: { type: "margin", side: "top" }, kind: "margin", cursor: "ns-resize", rect: horizontalPill(midX, y - band(m.top)) },
    { key: "mb", handle: { type: "margin", side: "bottom" }, kind: "margin", cursor: "ns-resize", rect: horizontalPill(midX, y + h + band(m.bottom)) },
    { key: "ml", handle: { type: "margin", side: "left" }, kind: "margin", cursor: "ew-resize", rect: verticalPill(x - band(m.left), midY) },
    { key: "mr", handle: { type: "margin", side: "right" }, kind: "margin", cursor: "ew-resize", rect: verticalPill(x + w + band(m.right), midY) },
    { key: "w", handle: { type: "width" }, kind: "size", cursor: "ew-resize", rect: verticalPill(x + w, y + h - Math.min(h / 3, 28)) },
    { key: "h", handle: { type: "height" }, kind: "size", cursor: "ns-resize", rect: horizontalPill(x + w - Math.min(w / 3, 48), y + h) },
    { key: "wh", handle: { type: "size" }, kind: "size", cursor: "nwse-resize", rect: { x: x + w - 4, y: y + h - 4, w: 8, h: 8 } },
    { key: "r", handle: { type: "radius" }, kind: "radius", cursor: "nwse-resize", rect: { x: x + 10 + Math.min(box.radius, 60) * 0.3 - 4, y: y + 10 + Math.min(box.radius, 60) * 0.3 - 4, w: 8, h: 8 } },
  ];
  if (box.gap && box.gap.rect.w > 0 && box.gap.rect.h > 0) {
    const g = box.gap.rect;
    placed.push({
      key: "gap",
      handle: { type: "gap", axis: box.gap.axis },
      kind: "gap",
      cursor: box.gap.axis === "x" ? "col-resize" : "row-resize",
      rect: box.gap.axis === "x" ? verticalPill(g.x + g.w / 2, g.y + g.h / 2) : horizontalPill(g.x + g.w / 2, g.y + g.h / 2),
    });
  }
  return placed;
};

const bands = (box: Box, kind: string): Rect[] => {
  const { x, y, w, h, padding: p, margin: m, border: b } = box;
  if (kind === "padding") {
    const ix = x + b.left;
    const iy = y + b.top;
    const iw = w - b.left - b.right;
    const ih = h - b.top - b.bottom;
    return [
      { x: ix, y: iy, w: iw, h: p.top },
      { x: ix, y: iy + ih - p.bottom, w: iw, h: p.bottom },
      { x: ix, y: iy + p.top, w: p.left, h: ih - p.top - p.bottom },
      { x: ix + iw - p.right, y: iy + p.top, w: p.right, h: ih - p.top - p.bottom },
    ];
  }
  if (kind === "margin") {
    return [
      { x: x - m.left, y: y - m.top, w: w + m.left + m.right, h: m.top },
      { x: x - m.left, y: y + h, w: w + m.left + m.right, h: m.bottom },
      { x: x - m.left, y, w: m.left, h },
      { x: x + w, y, w: m.right, h },
    ].map((r) => ({ ...r, w: Math.abs(r.w), h: Math.abs(r.h) }));
  }
  if (kind === "gap" && box.gap) {
    return [box.gap.rect];
  }
  return [];
};

const style = (r: Rect) => ({ left: r.x, top: r.y, width: Math.max(0, r.w), height: Math.max(0, r.h) });

const sameBox = (a: Box, b: Box) => JSON.stringify(a) === JSON.stringify(b);

type Drag = { key: string; kind: string; label: string; x: number; y: number };

export function CanvasOverlay({ element, label, spacingTokens, onChange }: CanvasOverlayProps) {
  const doc = element.ownerDocument;
  const win = doc.defaultView ?? window;
  const [box, setBox] = useState(() => measure(element));
  const [hoverKind, setHoverKind] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const root = useMemo(() => {
    const node = doc.createElement("div");
    node.className = "auvyx-ov";
    return node;
  }, [doc]);

  useEffect(() => {
    doc.body.appendChild(root);
    const detach = attachCss(doc, "auvyx-canvas-tools", OVERLAY_CSS);
    return () => {
      root.remove();
      detach();
    };
  }, [doc, root]);

  // Follow layout changes (typing, resizing, scrolling, other blocks) every frame.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const next = measure(element);
      setBox((previous) => (sameBox(previous, next) ? previous : next));
      frame = win.requestAnimationFrame(tick);
    };
    frame = win.requestAnimationFrame(tick);
    return () => win.cancelAnimationFrame(frame);
  }, [element, win]);

  const startDrag = (placed: Placed) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events (tests, dev helpers) have no active pointer to capture.
    }

    const start = measure(element);
    const rootFontSize = Number.parseFloat(win.getComputedStyle(doc.documentElement).fontSize) || 16;
    const tokens = spacingTokens.flatMap((token) => {
      const px = token.size === undefined ? undefined : lengthToPx(token.size, rootFontSize);
      return px === undefined ? [] : [{ slug: token.slug, px }];
    });
    const origin = { x: event.clientX, y: event.clientY };
    let frame = 0;
    doc.body.classList.add("auvyx-ov-dragging");
    doc.body.style.setProperty("--auvyx-ov-cursor", placed.cursor);

    const move = (moveEvent: PointerEvent) => {
      win.cancelAnimationFrame(frame);
      frame = win.requestAnimationFrame(() => {
        const result = computeDrag({
          handle: placed.handle,
          start: {
            padding: start.padding,
            margin: start.margin,
            gap: start.gap?.value ?? 0,
            width: start.width,
            height: start.height,
            radius: start.radius,
          },
          dx: moveEvent.clientX - origin.x,
          dy: moveEvent.clientY - origin.y,
          modifiers: { shift: moveEvent.shiftKey, alt: moveEvent.altKey, meta: moveEvent.metaKey || moveEvent.ctrlKey },
          rtl: start.rtl,
          tokens,
        });
        onChangeRef.current(result.patch);
        setDrag({ key: placed.key, kind: placed.kind, label: result.label, x: moveEvent.pageX, y: moveEvent.pageY });
      });
    };
    const end = () => {
      win.cancelAnimationFrame(frame);
      target.removeEventListener("pointermove", move);
      doc.body.classList.remove("auvyx-ov-dragging");
      setDrag(null);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end, { once: true });
    target.addEventListener("pointercancel", end, { once: true });
    setDrag({ key: placed.key, kind: placed.kind, label: "", x: event.pageX, y: event.pageY });
  };

  const reset = (placed: Placed) => () =>
    onChangeRef.current(
      Object.fromEntries(handleProperties(placed.handle, box.rtl).map((property) => [property, undefined]))
    );

  const shownKind = drag?.kind ?? hoverKind;
  const placed = placeHandles(box);

  return createPortal(
    <>
      {shownKind &&
        bands(box, shownKind).map((rect, index) => (
          <div key={`${shownKind}-${index}`} className={`auvyx-ov__band auvyx-ov__band--${shownKind}`} style={style(rect)} />
        ))}
      {label !== "" && (
        <div className="auvyx-ov__badge" style={{ left: box.x + box.w, top: box.y - 2 }}>
          {label}
        </div>
      )}
      {placed.map((item) => (
        <div
          key={item.key}
          role="presentation"
          data-handle={item.key}
          title="Drag · Shift: all sides / 8px · Alt: both sides · ⌘/Ctrl: no snapping · Double-click: reset"
          className={`auvyx-ov__h auvyx-ov__h--${item.kind}${drag?.key === item.key ? " is-active" : ""}`}
          style={{ ...style(item.rect), cursor: item.cursor }}
          onPointerDown={startDrag(item)}
          onPointerEnter={() => setHoverKind(item.kind)}
          onPointerLeave={() => setHoverKind(null)}
          onDoubleClick={reset(item)}
        />
      ))}
      {drag && drag.label !== "" && (
        <div className="auvyx-ov__tip" style={{ left: drag.x + 14, top: drag.y + 14 }}>
          {drag.label}
        </div>
      )}
    </>,
    root
  );
}

