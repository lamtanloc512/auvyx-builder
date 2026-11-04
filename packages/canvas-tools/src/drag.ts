/**
 * Pure drag math for canvas handles: pointer delta → style patch.
 * No DOM here, so every rule (direction, modifiers, snapping, RTL) is unit-tested.
 */

export type Side = "top" | "right" | "bottom" | "left";

export type Handle =
  | { type: "padding"; side: Side }
  | { type: "margin"; side: Side }
  | { type: "gap"; axis: "x" | "y" }
  | { type: "width" }
  | { type: "height" }
  | { type: "size" }
  | { type: "radius" };

export type Modifiers = {
  /** Padding/margin: all four sides. Others: 8px steps. */
  shift: boolean;
  /** Padding/margin: the opposite side too (symmetric). */
  alt: boolean;
  /** Disable token snapping. */
  meta: boolean;
};

/** Start values in px, read from the computed style when the drag begins. */
export type StartValues = {
  padding: Record<Side, number>;
  margin: Record<Side, number>;
  gap: number;
  width: number;
  height: number;
  radius: number;
};

export type SpacingToken = { slug: string; px: number };

export type DragInput = {
  handle: Handle;
  start: StartValues;
  dx: number;
  dy: number;
  modifiers: Modifiers;
  rtl: boolean;
  tokens: readonly SpacingToken[];
};

export type DragResult = {
  /** CSS property → value, ready for block-ops setStyles(). */
  patch: Record<string, string>;
  /** Human label for the tooltip, e.g. "Padding top · auvyx-md". */
  label: string;
};

const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];
const OPPOSITE: Record<Side, Side> = { top: "bottom", right: "left", bottom: "top", left: "right" };
const TOKEN_SNAP_PX = 3;

/** Physical side → logical property (we store logical properties, ADR 0004 / RTL). */
export const logicalProperty = (box: "padding" | "margin", side: Side, rtl: boolean): string => {
  if (side === "top") return `${box}-block-start`;
  if (side === "bottom") return `${box}-block-end`;
  const startSide: Side = rtl ? "right" : "left";
  return side === startSide ? `${box}-inline-start` : `${box}-inline-end`;
};

/**
 * Pointer movement that grows the value. Padding handles sit inside the box
 * (dragging toward the content grows padding); margin handles sit outside.
 */
const growth = (handle: Handle, dx: number, dy: number): number => {
  switch (handle.type) {
    case "padding":
      return { top: dy, bottom: -dy, left: dx, right: -dx }[handle.side];
    case "margin":
      return { top: -dy, bottom: dy, left: -dx, right: dx }[handle.side];
    case "gap":
      return handle.axis === "x" ? dx : dy;
    case "width":
    case "size":
      return dx;
    case "height":
      return dy;
    case "radius":
      return (dx + dy) / 2;
  }
};

type Resolved = { css: string; text: string };

const px = (value: number): Resolved => ({ css: `${value}px`, text: `${value}px` });

const snapSpacing = (value: number, input: DragInput): Resolved => {
  if (!input.modifiers.meta) {
    const token = input.tokens.find((t) => Math.abs(t.px - value) <= TOKEN_SNAP_PX);
    if (token) {
      return { css: `var(--wp--preset--spacing--${token.slug})`, text: `${token.slug} (${token.px}px)` };
    }
  }
  return px(value);
};

const step = (value: number, modifiers: Modifiers) =>
  modifiers.shift ? Math.round(value / 8) * 8 : Math.round(value);

const BOX_LABEL = { padding: "Padding", margin: "Margin" } as const;

export const computeDrag = (input: DragInput): DragResult => {
  const { handle, start, dx, dy, modifiers, rtl } = input;
  const delta = growth(handle, dx, dy);

  if (handle.type === "padding" || handle.type === "margin") {
    const raw = Math.round(start[handle.type][handle.side] + delta);
    const value = handle.type === "padding" ? Math.max(0, raw) : raw;
    const resolved = snapSpacing(value, input);
    const sides: Side[] = modifiers.shift
      ? [...SIDES]
      : modifiers.alt
        ? [handle.side, OPPOSITE[handle.side]]
        : [handle.side];
    const patch = Object.fromEntries(
      sides.map((side) => [logicalProperty(handle.type, side, rtl), resolved.css])
    );
    const where = modifiers.shift ? "" : modifiers.alt ? ` ${handle.side}+${OPPOSITE[handle.side]}` : ` ${handle.side}`;
    return { patch, label: `${BOX_LABEL[handle.type]}${where} · ${resolved.text}` };
  }

  if (handle.type === "gap") {
    const resolved = snapSpacing(Math.max(0, Math.round(start.gap + delta)), input);
    return { patch: { gap: resolved.css }, label: `Gap · ${resolved.text}` };
  }

  if (handle.type === "radius") {
    const value = Math.max(0, step(start.radius + delta, modifiers));
    return { patch: { "border-radius": `${value}px` }, label: `Radius · ${value}px` };
  }

  const width = Math.max(0, step(start.width + dx, modifiers));
  const height = Math.max(0, step(start.height + dy, modifiers));
  if (handle.type === "width") {
    return { patch: { width: `${width}px` }, label: `W ${width}px` };
  }
  if (handle.type === "height") {
    return { patch: { "min-height": `${height}px` }, label: `H ${height}px` };
  }
  return {
    patch: { width: `${width}px`, "min-height": `${height}px` },
    label: `${width} × ${height}`,
  };
};

/** Properties a handle writes — used to reset them on double-click. */
export const handleProperties = (handle: Handle, rtl: boolean): string[] => {
  switch (handle.type) {
    case "padding":
    case "margin":
      return [logicalProperty(handle.type, handle.side, rtl)];
    case "gap":
      return ["gap"];
    case "width":
      return ["width"];
    case "height":
      return ["min-height"];
    case "size":
      return ["width", "min-height"];
    case "radius":
      return ["border-radius"];
  }
};

/** "0.5rem" / "12px" → px. Anything else (clamp(), %) → undefined. */
export const lengthToPx = (length: string, rootFontSize: number): number | undefined => {
  const match = /^(-?\d*\.?\d+)(px|rem)$/.exec(length.trim());
  if (!match) return undefined;
  const value = Number(match[1]);
  return match[2] === "rem" ? value * rootFontSize : value;
};
