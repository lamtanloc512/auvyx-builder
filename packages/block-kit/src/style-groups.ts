/**
 * Style panel definition as data. The panel renders it generically (or with a
 * custom section), and the same metadata will feed the AI block catalog
 * (ADR 0013) — add a property here once, it shows up everywhere.
 */
import type { ScrubOptions } from "@auvyx/controls";

export type FieldType = "text" | "select" | "color";

export type StyleField = {
  property: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  half?: boolean;
  help?: string;
  /** Numeric field: drag the label to change the value. */
  scrub?: ScrubOptions;
  /** Show only when this returns true for the resolved value of another property. */
  when?: (resolve: (property: string) => string | undefined) => boolean;
};

export type StyleGroup = {
  id: string;
  title: string;
  fields: readonly StyleField[];
  /** Rendered by a dedicated component instead of the generic field list. */
  custom?: "auto-layout" | "box-model";
};

const isPositioned = (resolve: (p: string) => string | undefined) =>
  ["relative", "absolute", "fixed", "sticky"].includes(resolve("position") ?? "");

const PX: ScrubOptions = { step: 1, unit: "px" };
const PX_MIN0: ScrubOptions = { step: 1, unit: "px", min: 0 };

export const STYLE_GROUPS: readonly StyleGroup[] = [
  {
    id: "layout",
    title: "Auto layout",
    custom: "auto-layout",
    fields: [
      { property: "display", label: "Display", type: "select" },
      { property: "flex-direction", label: "Direction", type: "select" },
      { property: "flex-wrap", label: "Wrap", type: "select" },
      { property: "justify-content", label: "Justify", type: "select" },
      { property: "justify-items", label: "Justify items", type: "select" },
      { property: "align-items", label: "Align", type: "select" },
      { property: "gap", label: "Gap", type: "text", scrub: PX_MIN0 },
      { property: "grid-template-columns", label: "Columns", type: "text" },
    ],
  },
  {
    id: "spacing",
    title: "Spacing",
    custom: "box-model",
    fields: [
      { property: "margin-block-start", label: "Margin top", type: "text" },
      { property: "margin-inline-end", label: "Margin right", type: "text" },
      { property: "margin-block-end", label: "Margin bottom", type: "text" },
      { property: "margin-inline-start", label: "Margin left", type: "text" },
      { property: "padding-block-start", label: "Padding top", type: "text" },
      { property: "padding-inline-end", label: "Padding right", type: "text" },
      { property: "padding-block-end", label: "Padding bottom", type: "text" },
      { property: "padding-inline-start", label: "Padding left", type: "text" },
    ],
  },
  {
    id: "size",
    title: "Size",
    fields: [
      { property: "width", label: "W", type: "text", half: true, scrub: PX_MIN0 },
      { property: "height", label: "H", type: "text", half: true, scrub: PX_MIN0 },
      { property: "min-width", label: "Min W", type: "text", half: true, scrub: PX_MIN0 },
      { property: "min-height", label: "Min H", type: "text", half: true, scrub: PX_MIN0 },
      { property: "max-width", label: "Max W", type: "text", half: true, scrub: PX_MIN0 },
      { property: "max-height", label: "Max H", type: "text", half: true, scrub: PX_MIN0 },
      {
        property: "overflow",
        label: "Overflow",
        type: "select",
        options: ["visible", "hidden", "clip", "auto", "scroll"],
      },
      {
        property: "scroll-snap-type",
        label: "Snap",
        type: "select",
        options: ["none", "x mandatory", "y mandatory", "both mandatory"],
      },
      { property: "scroll-snap-align", label: "Snap align", type: "select", options: ["start", "center", "end"] },
      { property: "scrollbar-width", label: "Scrollbar", type: "select", options: ["auto", "thin", "none"] },
    ],
  },
  {
    id: "position",
    title: "Position",
    fields: [
      {
        property: "position",
        label: "Position",
        type: "select",
        options: ["static", "relative", "absolute", "sticky", "fixed"],
        half: true,
      },
      { property: "z-index", label: "Z-index", type: "text", half: true, scrub: { step: 1, unit: "" } },
      { property: "top", label: "Top", type: "text", half: true, scrub: PX, when: isPositioned },
      { property: "bottom", label: "Bottom", type: "text", half: true, scrub: PX, when: isPositioned },
      { property: "left", label: "Left", type: "text", half: true, scrub: PX, when: isPositioned },
      { property: "right", label: "Right", type: "text", half: true, scrub: PX, when: isPositioned },
    ],
  },
  {
    id: "typography",
    title: "Typography",
    fields: [
      { property: "color", label: "Text color", type: "color" },
      { property: "font-size", label: "Size", type: "text", half: true, scrub: PX_MIN0 },
      {
        property: "font-weight",
        label: "Weight",
        type: "select",
        options: ["300", "400", "500", "600", "700", "800", "900"],
        half: true,
      },
      { property: "line-height", label: "Line height", type: "text", half: true, scrub: { step: 0.05, unit: "", min: 0 } },
      { property: "letter-spacing", label: "Letter spacing", type: "text", half: true, scrub: { step: 0.01, unit: "em" } },
      {
        property: "text-align",
        label: "Align",
        type: "select",
        options: ["start", "center", "end", "justify"],
        half: true,
      },
      {
        property: "text-transform",
        label: "Transform",
        type: "select",
        options: ["none", "uppercase", "lowercase", "capitalize"],
        half: true,
      },
      { property: "font-family", label: "Font family", type: "text" },
    ],
  },
  {
    id: "background",
    title: "Background",
    fields: [
      { property: "background-color", label: "Color", type: "color" },
      {
        property: "background-image",
        label: "Image / gradient",
        type: "text",
        help: "url(https://…) or linear-gradient(…)",
      },
      {
        property: "background-size",
        label: "Size",
        type: "select",
        options: ["auto", "cover", "contain"],
        half: true,
      },
      { property: "background-position", label: "Position", type: "text", half: true },
    ],
  },
  {
    id: "border",
    title: "Border",
    fields: [
      { property: "border-width", label: "Width", type: "text", half: true, scrub: PX_MIN0 },
      {
        property: "border-style",
        label: "Style",
        type: "select",
        options: ["none", "solid", "dashed", "dotted"],
        half: true,
      },
      { property: "border-color", label: "Color", type: "color" },
      { property: "border-radius", label: "Radius", type: "text", scrub: PX_MIN0 },
    ],
  },
  {
    id: "effects",
    title: "Effects",
    fields: [
      { property: "opacity", label: "Opacity", type: "text", half: true, scrub: { step: 0.05, unit: "", min: 0 } },
      {
        property: "cursor",
        label: "Cursor",
        type: "select",
        options: ["auto", "pointer", "default", "not-allowed"],
        half: true,
      },
      { property: "box-shadow", label: "Shadow", type: "text" },
      { property: "transform", label: "Transform", type: "text" },
      { property: "transition", label: "Transition", type: "text", help: "e.g. all .2s ease" },
      { property: "animation", label: "Animation", type: "text", help: "name duration easing, e.g. auvyx-float 4s ease-in-out infinite (keyframes in Custom CSS)" },
      { property: "filter", label: "Filter", type: "text", help: "e.g. blur(8px) saturate(1.2)" },
      { property: "backdrop-filter", label: "Backdrop", type: "text", help: "e.g. blur(12px)" },
      { property: "mix-blend-mode", label: "Blend", type: "select", options: ["normal", "multiply", "screen", "overlay", "difference", "luminosity"] },
      { property: "clip-path", label: "Clip path", type: "text", help: "e.g. polygon(0 0, 100% 0, 100% 85%, 0 100%)" },
      { property: "mask-image", label: "Mask", type: "text", help: "e.g. linear-gradient(black 70%, transparent)" },
      { property: "text-shadow", label: "Text shadow", type: "text" },
      { property: "perspective", label: "Perspective", type: "text", half: true },
      { property: "will-change", label: "Will change", type: "text", half: true },
    ],
  },
];

export const GROUPED_PROPERTIES: ReadonlySet<string> = new Set(
  STYLE_GROUPS.flatMap((group) => group.fields.map((field) => field.property))
);
