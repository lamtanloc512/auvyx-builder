/**
 * Flatsome-style presets of the Style panel (the Studio's U/QuickSettings.scala): one click per decision (spacing,
 * width, background, columns, button style…) instead of raw CSS. A preset is only a style patch on the current
 * breakpoint (plus tablet / mobile / hover patches when picked on desktop), so the Style panel still shows and edits it.
 * Values match the template library, so presets light up on inserted templates. Pure.
 */
import { resolveValue, type Breakpoint, type StateId, type Styles } from "@auvyx/style-engine";
import type { El } from "./model";
import { setStyle } from "./ops";
import { LEVELS, setVisibility, visibilityOf } from "./visibility";

type Patch = [string, string | undefined][];

export interface PresetChoice {
  name: string;
  patch: Patch;
  tablet?: Patch;
  mobile?: Patch;
  hover?: Patch;
  /** WordPress alignment (not a style; same on every breakpoint) */
  align?: string;
  /** For choices that are not a plain style patch (visibility): edits the styles given the device breakpoints. */
  edit?: (styles: Styles, devices: string[]) => Styles;
  active?: (styles: Styles, devices: string[]) => boolean;
}
export interface PresetGroup { title: string; choices: PresetChoice[] }

const set = (...d: [string, string][]): Patch => d.map(([k, v]) => [k, v]);
const clear = (...props: string[]): Patch => props.map((p) => [p, undefined]);
const color = (slug: string) => `var(--wp--preset--color--${slug})`;
const muted = "#64748b";
const line = "#e2e8f0";
const both = (prefix: string, v: string) => set([`${prefix}-start`, v], [`${prefix}-end`, v]);
/** Container.Band: the site container's side padding, with a fallback for platforms without the variables. */
const BAND = "var(--auvyx-band, max(24px, calc((100% - 1200px) / 2)))";
const bandTags = new Set(["section", "header", "footer", "main"]);
const c = (name: string, patch: Patch, more: Partial<PresetChoice> = {}): PresetChoice => ({ name, patch, ...more });

/** `part`: the document's template-part area ("header", "footer") when it is one. */
export type Bar = "Header" | "Footer";
export function barOf(n: El, root: boolean, part?: string): Bar | undefined {
  if (!root || n.kind !== "Section") return undefined;
  if (part === "header") return "Header";
  if (part === "footer") return "Footer";
  return n.tag === "header" ? "Header" : n.tag === "footer" ? "Footer" : undefined;
}

const isSlider = (n: El) => n.kind === "Section" && Object.values(n.styles).some((b) => !!b?.default?.["scroll-snap-type"]?.trim().startsWith("x"));

const visibility: PresetGroup = {
  title: "Show on",
  choices: LEVELS.map(([level, label]) => c(label, [], {
    edit: (styles, devices) => setVisibility(styles, devices, level),
    active: (styles, devices) => visibilityOf(styles, devices) === level,
  })),
};

/** The bar's edge: nothing, a thin line (the side facing the content) or a soft shadow. */
const edge = (side: string, shadow: string): PresetGroup => ({
  title: "Edge",
  choices: [c("None", clear(side, "box-shadow")), c("Line", [...set([side, `1px solid ${line}`]), ...clear("box-shadow")]), c("Shadow", [...set(["box-shadow", shadow]), ...clear(side)])],
});

const nav: PresetGroup[] = [
  { title: "Align", choices: [["Left", "flex-start"], ["Center", "center"], ["Right", "flex-end"]].map(([n, v]) => c(n!, set(["justify-content", v!]))) },
  { title: "Gap", choices: [["S", "12px"], ["M", "24px"], ["L", "40px"]].map(([n, v]) => c(n!, set(["gap", v!]))) },
  { title: "Size", choices: [c("S", set(["font-size", "14px"])), c("M", clear("font-size")), c("L", set(["font-size", "17px"]))] },
  { title: "Weight", choices: [["Regular", "400"], ["Medium", "500"], ["Bold", "700"]].map(([n, v]) => c(n!, set(["font-weight", v!]))) },
  { title: "Case", choices: [c("Normal", clear("text-transform", "letter-spacing")), c("Uppercase", set(["text-transform", "uppercase"], ["letter-spacing", "0.06em"]))] },
  { title: "Color", choices: [c("Default", clear("color")), c("Muted", set(["color", muted])), c("Brand", set(["color", color("auvyx-primary")])), c("Light", set(["color", color("auvyx-inverse")]))] },
];

function band(root: boolean): PresetGroup[] {
  const side = (w: string) => (root ? `max(24px, calc((100vw - ${w}) / 2))` : `max(24px, calc((100% - ${w}) / 2))`);
  const full = root ? "full" : undefined;
  return [
    {
      title: "Spacing",
      choices: ([["None", "0", "0"], ["S", "32px", "24px"], ["M", "64px", "40px"], ["L", "96px", "56px"], ["XL", "144px", "80px"]] as const).map(([n, d, m]) => c(n, both("padding-block", d), { mobile: both("padding-block", m) })),
    },
    {
      title: "Section width",
      choices: [
        c("Narrow", both("padding-inline", side("720px")), { align: full }),
        c("Container", both("padding-inline", root ? BAND : side("var(--auvyx-container, 1200px)")), { align: full }),
        c("Wide", both("padding-inline", `max(12px, calc((${root ? "100vw" : "100%"} - var(--auvyx-container, 1200px)) / 4))`), { align: full }),
        c("Full", both("padding-inline", "0"), { align: full }),
      ],
    },
    {
      title: "Background",
      choices: [
        c("None", clear("background-color", "color")),
        c("Light", [...set(["background-color", color("auvyx-surface")]), ...clear("color")]),
        c("Brand", set(["background-color", color("auvyx-primary")], ["color", color("auvyx-on-primary")])),
        c("Dark", set(["background-color", color("auvyx-secondary")], ["color", color("auvyx-inverse")])),
      ],
    },
    {
      title: "Height",
      choices: [
        c("Auto", clear("min-height", "justify-content")),
        c("Half screen", set(["min-height", "50vh"], ["display", "flex"], ["flex-direction", "column"], ["justify-content", "center"])),
        c("Full screen", set(["min-height", "100vh"], ["display", "flex"], ["flex-direction", "column"], ["justify-content", "center"])),
      ],
    },
  ];
}

/** A slider (scroll-snap track): its Section width is the track's own width (no side padding), centred. */
function sliderBand(groups: PresetGroup[], root: boolean): PresetGroup[] {
  const parent = "100%";
  const width = (name: string, maxWidth?: string) =>
    c(name, [...(maxWidth === undefined ? clear("max-width") : set(["max-width", maxWidth], ["margin-inline-start", "auto"], ["margin-inline-end", "auto"])), ...both("padding-inline", "0")], { align: root ? "full" : undefined });
  const widths: PresetGroup = {
    title: "Section width",
    choices: [
      width("Narrow", `min(720px, calc(${parent} - 48px))`),
      width("Container", `calc(${parent} - 2 * ${BAND})`),
      width("Wide", `calc(${parent} - 2 * max(12px, calc((${parent} - var(--auvyx-container, 1200px)) / 4)))`),
      width("Full"),
    ],
  };
  return groups.map((g) => (g.title === "Section width" ? widths : g));
}

const columns = (n: number) =>
  c(`${n} cols`, [...set(["display", "grid"], ["grid-template-columns", `repeat(${n}, minmax(0, 1fr))`]), ...clear("flex-direction", "flex-wrap")], {
    tablet: set(["grid-template-columns", `repeat(${Math.min(n, 2)}, minmax(0, 1fr))`]),
    mobile: set(["grid-template-columns", "1fr"]),
  });

const boxProps = ["background-color", "border-width", "border-style", "border-color", "border-radius", "box-shadow", "padding-block-start", "padding-block-end", "padding-inline-start", "padding-inline-end"];
const pad = (v: string) => [...both("padding-block", v), ...both("padding-inline", v)];

const box: PresetGroup[] = [
  {
    title: "Layout",
    choices: [
      c("Stack", [...set(["display", "flex"], ["flex-direction", "column"]), ...clear("flex-wrap", "grid-template-columns")]),
      c("Row", [...set(["display", "flex"], ["flex-wrap", "wrap"], ["align-items", "center"]), ...clear("flex-direction", "grid-template-columns")]),
      columns(2), columns(3), columns(4),
    ],
  },
  { title: "Gap", choices: [["None", "0"], ["S", "8px"], ["M", "16px"], ["L", "24px"], ["XL", "48px"]].map(([n, v]) => c(n!, set(["gap", v!]))) },
  { title: "Align", choices: [["Top", "flex-start"], ["Center", "center"], ["Bottom", "flex-end"], ["Stretch", "stretch"]].map(([n, v]) => c(n!, set(["align-items", v!]))) },
  {
    title: "Box",
    choices: [
      c("Plain", boxProps.map((p) => [p, undefined])),
      c("Card", [...set(["background-color", color("auvyx-base")], ["border-width", "1px"], ["border-style", "solid"], ["border-color", line], ["border-radius", "16px"]), ...pad("28px"), ...clear("box-shadow")], { mobile: pad("22px") }),
      c("Soft", [...set(["background-color", color("auvyx-surface")], ["border-radius", "12px"]), ...pad("24px"), ...clear("border-width", "border-style", "border-color", "box-shadow")]),
      c("Shadow", [...set(["background-color", color("auvyx-base")], ["border-radius", "16px"], ["box-shadow", "0 20px 40px rgba(15, 23, 42, 0.12)"]), ...pad("28px"), ...clear("border-width", "border-style", "border-color")], { mobile: pad("22px") }),
    ],
  },
];

const align: PresetGroup = { title: "Align", choices: [["Left", "start"], ["Center", "center"], ["Right", "end"]].map(([n, v]) => c(n!, set(["text-align", v!]))) };

const heading: PresetGroup[] = [
  { title: "Size", choices: ([["S", "20px", "18px"], ["M", "28px", "24px"], ["L", "40px", "28px"], ["XL", "56px", "36px"], ["XXL", "72px", "44px"]] as const).map(([n, d, m]) => c(n, set(["font-size", d]), { mobile: set(["font-size", m]) })) },
  align,
  { title: "Color", choices: [c("Default", clear("color")), c("Brand", set(["color", color("auvyx-primary")])), c("Muted", set(["color", muted])), c("Light", set(["color", color("auvyx-inverse")]))] },
];

const textGroups: PresetGroup[] = [
  { title: "Size", choices: [c("S", set(["font-size", "14px"])), c("M", clear("font-size")), c("L", set(["font-size", "18px"])), c("XL", set(["font-size", "22px"]))] },
  align,
  { title: "Color", choices: [c("Default", clear("color")), c("Muted", set(["color", muted])), c("Brand", set(["color", color("auvyx-primary")])), c("Light", set(["color", color("auvyx-inverse")]))] },
];

const buttonLook = ["background-color", "color", "border-width", "border-style", "border-color", "text-decoration", "padding-block-start", "padding-block-end", "padding-inline-start", "padding-inline-end"];
const look = (...d: [string, string][]): Patch => { const m = new Map(d); return buttonLook.map((p) => [p, m.get(p)]); };

const buttonGroups: PresetGroup[] = [
  {
    title: "Style",
    choices: [
      c("Primary", look(), { hover: clear("background-color") }),
      c("Dark", look(["background-color", color("auvyx-secondary")]), { hover: clear("background-color") }),
      // Inherits the text color, so it works on light and dark sections (same as the templates' outline button).
      c("Outline", look(["background-color", "transparent"], ["color", "inherit"], ["border-width", "1px"], ["border-style", "solid"], ["border-color", "rgba(100, 116, 139, 0.35)"]), { hover: set(["background-color", "rgba(100, 116, 139, 0.12)"]) }),
      c("Link", [...look(["background-color", "transparent"], ["color", color("auvyx-primary")], ["text-decoration", "underline"]), ...both("padding-block", "0"), ...both("padding-inline", "0")], { hover: clear("background-color") }),
    ],
  },
  {
    title: "Color",
    choices: [
      c("Primary", set(["background-color", color("auvyx-primary")], ["color", "#ffffff"])),
      c("Secondary", set(["background-color", color("auvyx-secondary")], ["color", "#ffffff"])),
      c("Alert", set(["background-color", "#dc2626"], ["color", "#ffffff"])),
      c("Success", set(["background-color", "#16a34a"], ["color", "#ffffff"])),
      c("White", set(["background-color", "#ffffff"], ["color", "#0f172a"])),
    ],
  },
  { title: "Size", choices: [c("S", set(["font-size", "14px"])), c("M", clear("font-size")), c("L", set(["font-size", "18px"])), c("XL", set(["font-size", "20px"]))] },
  { title: "Shape", choices: [c("Square", set(["border-radius", "0"])), c("Rounded", clear("border-radius")), c("Pill", set(["border-radius", "999px"]))] },
  { title: "Width", choices: [c("Auto", clear("width")), c("Full", set(["width", "100%"]))] },
];

const image: PresetGroup[] = [
  { title: "Ratio", choices: [c("Original", clear("aspect-ratio", "object-fit")), ...[["1:1", "1 / 1"], ["4:3", "4 / 3"], ["16:9", "16 / 9"], ["4:5", "4 / 5"]].map(([n, r]) => c(n!, set(["aspect-ratio", r!], ["object-fit", "cover"], ["width", "100%"])))] },
  { title: "Corners", choices: [c("None", clear("border-radius")), c("S", set(["border-radius", "8px"])), c("M", set(["border-radius", "16px"])), c("Round", set(["border-radius", "999px"]))] },
  { title: "Shadow", choices: [c("None", clear("box-shadow")), c("Soft", set(["box-shadow", "0 20px 40px rgba(15, 23, 42, 0.12)"]))] },
];

const icon: PresetGroup[] = [
  { title: "Size", choices: [["S", "18px"], ["M", "24px"], ["L", "40px"], ["XL", "56px"]].map(([n, v]) => c(n!, set(["width", v!], ["height", v!]))) },
  { title: "Color", choices: [...[["Brand", "auvyx-primary"], ["Accent", "auvyx-accent"], ["Dark", "auvyx-secondary"], ["Light", "auvyx-inverse"]].map(([n, s]) => c(n!, set(["color", color(s!)]))), c("Muted", set(["color", muted]))] },
];

function own(n: El, root: boolean, part?: string): PresetGroup[] {
  const bar = barOf(n, root, part);
  switch (n.kind) {
    case "Section":
      if (bar === "Header") return [edge("border-block-end", "0 4px 20px rgba(15, 23, 42, 0.08)"), ...band(root)];
      if (bar === "Footer") return [...box.slice(0, 3), edge("border-block-start", "0 -4px 20px rgba(15, 23, 42, 0.08)"), ...band(root)];
      if (isSlider(n)) return sliderBand(band(root), root);
      if (root) return bandTags.has(n.tag) ? band(root) : box;
      return bandTags.has(n.tag) ? band(root) : box;
    case "Heading": return heading;
    case "Text": return textGroups;
    case "Button": return buttonGroups;
    case "Image": return image;
    case "Icon": return icon;
    case "Nav": return nav;
    default: return [];
  }
}

/** The preset groups of an element. The page's (or part's) root is never hidden; Raw blocks carry no styles of their own. */
export function presetGroups(n: El, root: boolean, part?: string): PresetGroup[] {
  const hideable = !root && n.kind !== "Raw";
  return [...own(n, root, part), ...(hideable ? [visibility] : [])];
}

export function presetActive(n: El, breakpoints: readonly Breakpoint[], devices: string[], bp: string, st: string, choice: PresetChoice): boolean {
  if (choice.active) return choice.active(n.styles, devices);
  return (choice.align === undefined || choice.align === n.align) && choice.patch.every(([p, v]) => resolveValue(n.styles, breakpoints, bp, st as StateId, p)?.value === v);
}

/** The element after picking a choice at (bp, state); desktop picks also write the tablet, mobile and hover patches. */
export function applyPreset(n: El, devices: string[], bp: string, st: string, choice: PresetChoice): El {
  const put = (s: Styles, b: string, state: string, patch: Patch) => patch.reduce((acc, [p, v]) => setStyle(acc, b, state, p, v), s);
  let styles = choice.edit ? choice.edit(n.styles, devices) : put(n.styles, bp, st, choice.patch);
  if (bp === devices[0] && st === "default") {
    ([[1, choice.tablet], [2, choice.mobile]] as const).forEach(([i, patch]) => { const b = devices[i]; if (b && patch && patch.length) styles = put(styles, b, "default", patch); });
    if (choice.hover && choice.hover.length) styles = put(styles, bp, "hover", choice.hover);
  }
  return { ...n, styles, align: choice.align ?? n.align };
}
