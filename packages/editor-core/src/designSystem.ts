/**
 * A design system for one idea (ui-craft's `system`, ported): a concept first, then any hex as the page's ground, with
 * surfaces, borders and muted text derived from it and every text role at 4.5:1 or more by construction, a modular type
 * scale, density, corners and depth, light and dark. The output is a DESIGN.md the design brief endpoint takes
 * (auvyx/v1/design/brief), so the agent decides intent and this decides the values. Pure and deterministic.
 */

export interface Concept {
  /** one sentence naming what is specific to this subject */
  idea: string;
  /** the one element a visitor remembers, which the agent builds */
  signature: string;
  /** the real thing in this subject the ground and primary come from */
  palette: string;
  /** why the display face speaks for this subject */
  voice: string;
  /** why a default habit is still right here, when the system refuses one */
  habit?: string;
}

type Row = { test: (v: unknown) => boolean; expect: string; required?: boolean; default?: unknown };

const isHex = (v: unknown): v is string => typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
const oneOf = (...o: string[]): Row => ({ test: (v) => o.includes(v as string), expect: o.join("|") });
const hex: Row = { test: isHex, expect: 'a hex colour like "#0b6e4f"' };
const stack: Row = { test: (v) => typeof v === "string" && v.trim() !== "" && !/[;{}]/.test(v), expect: "a CSS font stack" };
const distinct = (v: string) => new Set(v.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).size;
const words = (min: number, expect: string): Row => ({ test: (v) => typeof v === "string" && distinct(v) >= min, expect });
const range = (lo: number, hi: number): Row => ({ test: (v) => typeof v === "number" && v >= lo && v <= hi, expect: `a number from ${lo} to ${hi}` });

/** The concept's rows: shared by the system and by a DESIGN.md the agent writes itself. */
export const CONCEPT_SPEC: Record<string, Row> = {
  "concept.idea": { ...words(8, "one sentence of at least 8 different words naming what is specific to this subject"), required: true },
  "concept.signature": { ...words(3, "the one element a visitor remembers, which you will build"), required: true },
  "concept.palette": { ...words(4, "the real thing in this subject the ground and primary are taken from"), required: true },
  "concept.voice": { ...words(4, "why this display face speaks for this subject"), required: true },
  "concept.habit": { ...words(4, "why this default habit is still right for this subject") },
};

const SPEC: Record<string, Row> = {
  name: { test: (v) => typeof v === "string" && /^[\w -]+$/.test(v), expect: "letters, digits, dashes", required: true },
  ...CONCEPT_SPEC,
  "color.ground": { ...hex, expect: 'the light-mode page colour, a hex like "#e6f0ee"', required: true },
  "color.groundDark": { ...hex },
  "color.primary": { ...hex, required: true },
  "color.accent": { ...hex },
  "type.display.family": { ...stack, default: "system-ui, sans-serif" },
  "type.display.weight": { ...range(100, 900), default: 700 },
  "type.display.tracking": { ...range(-0.1, 0.2), default: -0.02 },
  "type.body.family": { ...stack, default: "system-ui, sans-serif" },
  "type.base": { ...range(12, 24), default: 16 },
  "type.ratio": { ...range(1.05, 2), default: 1.25 },
  "space.density": { ...oneOf("compact", "normal", "airy"), default: "normal" },
  "shape.radius": { test: (v) => /^(0|\d*\.?\d+(rem|em|px))$/.test(String(v)), expect: "a length like 0.5rem, or 0", default: "0.5rem" },
  depth: { ...oneOf("none", "soft", "hard"), default: "soft" },
};

export type Design = Record<string, unknown>;
export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Validates a design (nested object, as the agent sends it) against a spec; every problem at once. */
function parse(raw: unknown, spec: Record<string, Row>, strict: boolean): Result<Design> {
  const errors: string[] = [];
  const flat: Design = {};
  const walk = (o: unknown, prefix: string) => {
    for (const [k, v] of Object.entries((o ?? {}) as Record<string, unknown>)) {
      const key = prefix + k;
      if (key in spec) flat[key] = v;
      else if (v && typeof v === "object" && Object.keys(spec).some((s) => s.startsWith(`${key}.`))) walk(v, `${key}.`);
      else if (strict) errors.push(`unknown key "${key}". Keys: ${Object.keys(spec).join(", ")}`);
    }
  };
  walk(raw, "");
  const design: Design = {};
  for (const [key, row] of Object.entries(spec)) {
    if (flat[key] === undefined) {
      if (row.required) errors.push(`missing required "${key}": ${row.expect}`);
      design[key] = row.default;
      continue;
    }
    if (!row.test(flat[key])) errors.push(`${key}: ${JSON.stringify(flat[key])} is invalid, expected ${row.expect}`);
    design[key] = flat[key];
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: design };
}

// ---- colour: OKLCH and sRGB ----

type Lch = { L: number; C: number; h: number };
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const hexRgb = (h: string) => {
  const s = h.length === 4 ? h.slice(1).split("").map((c) => c + c).join("") : h.slice(1);
  return [0, 2, 4].map((i) => Number.parseInt(s.slice(i, i + 2), 16));
};
const rgbHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;

export function hexLch(h: string): Lch {
  const [r, g, b] = hexRgb(h).map((v) => toLinear(v / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, C: Math.hypot(a, bb), h: (Math.atan2(bb, a) * 180) / Math.PI };
}
function lchLinear({ L, C, h }: Lch): number[] {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = (lin: number[]) => lin.every((v) => v >= -0.0001 && v <= 1.0001);
/** Fit by chroma: lightness is what the contrast guarantee steps on, so it must survive the fit. */
function lchHex({ L, C, h }: Lch): string {
  L = Math.min(1, Math.max(0, L));
  if (!inGamut(lchLinear({ L, C, h }))) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(lchLinear({ L, C: mid, h }))) lo = mid;
      else hi = mid;
    }
    C = lo;
  }
  return rgbHex(lchLinear({ L, C, h }).map((v) => toGamma(Math.max(0, v))));
}
const luminance = (h: string) => {
  const [r, g, b] = hexRgb(h).map((v) => toLinear(v / 255)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
const lowest = (fg: string, surfaces: string[]) => Math.min(...surfaces.map((s) => contrast(fg, s)));

/** Walk lightness toward `dir` until `lch` reaches `ratio` on every surface. Measured on the emitted hex, so rounding cannot break it. */
function step(lch: Lch, surfaces: string[], ratio: number, dir: number): string {
  for (let L = lch.L; L >= 0 && L <= 1; L += dir * 0.005) {
    const h = lchHex({ ...lch, L });
    if (lowest(h, surfaces) >= ratio) return h;
  }
  return dir < 0 ? "#000000" : "#ffffff";
}
/** Which way text must go from a ground: -1 darker, 1 lighter. */
const towardInk = (ground: string) => (contrast(ground, "#000000") >= contrast(ground, "#ffffff") ? -1 : 1);
/** Text on a coloured fill: the better of near-black or near-white. */
function onFill(fill: string, tint: Lch): string {
  const dir = towardInk(fill);
  return step({ ...tint, L: dir < 0 ? 0.2 : 0.98 }, [fill], 4.5, dir);
}

/** Per ink direction: where text roles start stepping, and how far surfaces sit from the ground. */
const INK: Record<string, { fg: number; secondary: number; muted: number; lift: { card: number; muted: number; secondary: number; sunk: number; border: number } }> = {
  "-1": { fg: 0.18, secondary: 0.35, muted: 0.44, lift: { card: 0, muted: 0.025, secondary: 0.025, sunk: 0.06, border: 0.1 } },
  "1": { fg: 0.97, secondary: 0.85, muted: 0.72, lift: { card: 0.055, muted: 0.045, secondary: 0.095, sunk: 0.095, border: 0.13 } },
};
const INK_CHROMA = 0.04;
const DARK_L = 0.18;
const DARK_SHIFT = 0.08;
const NEAR_BLACK = 0.12;

export interface Scheme {
  ground: string;
  card: string;
  muted: string;
  secondary: string;
  sunk: string;
  border: string;
  fg: string;
  textSecondary: string;
  mutedFg: string;
  primary: string;
  primaryFg: string;
  highlight: string;
  highlightFg: string;
}

/** Every role for one mode. Light and dark are the same function: only the ground differs. */
function scheme(ground: string, seed: Lch, accent: Lch): Scheme {
  const g = hexLch(ground);
  const dir = towardInk(ground);
  const { lift, ...start } = INK[String(dir)]!;
  const extreme = dir < 0 ? "#000000" : "#ffffff";
  const tint = { C: Math.min(g.C, INK_CHROMA), h: g.h };
  /** A surface sits toward the ink; on a mid ground that would leave text nowhere to go, so it sits the other way. */
  const surface = (d: number) => [d, -d].map((s) => lchHex({ ...g, L: Math.max(g.L, NEAR_BLACK) + dir * s })).find((h) => contrast(h, extreme) >= 4.5) ?? ground;
  const card = lift.card ? surface(lift.card) : ground;
  const muted = surface(lift.muted);
  const secondary = surface(lift.secondary);
  const surfaces = [ground, card, muted, secondary];
  const text = (L: number) => step({ ...tint, L }, surfaces, 4.5, dir);
  const onGround = (lch: Lch, floor: number) => (dir < 0 ? lch : { ...lch, L: Math.max(lch.L, floor) });
  const ink = { ...tint, L: start.fg };
  const primary = dir < 0 ? step(seed, [ground], 3, dir) : step(onGround(seed, 0.72), surfaces, 4.5, dir);
  const highlight = step(onGround(accent, 0.72), surfaces, 4.5, dir);
  return {
    ground, card, muted, secondary, sunk: surface(lift.sunk), border: lchHex({ ...g, L: g.L + dir * lift.border }),
    fg: text(start.fg), textSecondary: text(start.secondary), mutedFg: text(start.muted),
    primary, primaryFg: onFill(primary, ink), highlight, highlightFg: onFill(highlight, ink),
  };
}

/** Dark keeps the ground's hue and chroma. A ground already dark moves by a fixed step instead, so the toggle still changes the page. */
export function groundDark(ground: string): string {
  const g = hexLch(ground);
  return lchHex({ ...g, L: g.L - DARK_L > DARK_SHIFT * 1.5 ? DARK_L : g.L > DARK_L ? g.L - DARK_SHIFT : Math.max(g.L, NEAR_BLACK) + DARK_SHIFT });
}

const longHex = (h: string) => (h.length === 4 ? `#${h.slice(1).split("").map((c) => c + c).join("")}` : h).toLowerCase();

/** What agents reach for unprompted (ui-craft's experiments §3 and §4): refused unless concept.habit argues the case. */
const SOFT_SERIF = /^\W*(Fraunces|Georgia|Literata|Iowan|Palatino)/i;
const HABITS: { name: string; hit: (g: Lch, display: string) => boolean }[] = [
  { name: "cream paper with a soft serif", hit: (g, display) => g.L >= 0.86 && g.C <= 0.06 && (g.h + 360) % 360 >= 50 && (g.h + 360) % 360 <= 115 && SOFT_SERIF.test(display) },
  { name: "near-white with a soft serif", hit: (g, display) => g.L >= 0.95 && g.C <= 0.015 && SOFT_SERIF.test(display) },
];

/** The habit a ground and a display face fall into, unless the concept argues for it. */
export function habitProblem(ground: string, display: string, habit?: string): string | undefined {
  if (!isHex(ground) || habit) return undefined;
  const found = HABITS.find((h) => h.hit(hexLch(ground), display));
  return found
    ? `${ground} with ${display.split(",")[0]!.trim()} is ${found.name}, the look most generated sites share. Take the ground and the face from concept.palette and concept.voice, or argue for it in concept.habit.`
    : undefined;
}

export interface System {
  name: string;
  concept: Concept;
  light: Scheme;
  dark: Scheme;
  type: Record<"display" | "h1" | "h2" | "h3" | "body-md" | "body-sm" | "label-md", { fontFamily: string; fontSize: string; fontWeight?: number; lineHeight: number; letterSpacing?: string }>;
  rounded: { sm: string; md: string; lg: string; full: string };
  spacing: Record<"xs" | "sm" | "md" | "lg" | "xl", string>;
  shadow: Record<"sm" | "md" | "lg", string>;
}

const DENSITY: Record<string, number> = { compact: 0.8, normal: 1, airy: 1.25 };
const SHADOW_SOFT = { sm: "0 1px 3px 0 #0000001a, 0 1px 2px -1px #0000001a", md: "0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a", lg: "0 10px 15px -3px #0000001a, 0 4px 6px -4px #0000001a" };
const HARD = { sm: 2, md: 3, lg: 4 };
const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const scaleLength = (v: string, k: number) => {
  const m = /^(\d*\.?\d+)(rem|em|px)?$/.exec(v);
  if (!m || Number(m[1]) === 0) return "0px";
  return `${Math.round(Number(m[1]) * k * 1000) / 1000}${m[2] ?? "px"}`;
};

/** The system for one design: validated, the habit refused, every role derived. */
export function designSystem(raw: unknown): Result<System> {
  const parsed = parse(raw, SPEC, true);
  if (!parsed.ok) return parsed;
  const d = parsed.value;
  const habit = habitProblem(d["color.ground"] as string, d["type.display.family"] as string, d["concept.habit"] as string | undefined);
  if (habit) return { ok: false, errors: [habit] };
  const seed = hexLch(d["color.primary"] as string);
  const ground = longHex(d["color.ground"] as string);
  const accent = d["color.accent"] ? longHex(d["color.accent"] as string) : lchHex({ L: 0.58, C: 0.17, h: seed.h + 150 });
  const light = scheme(ground, seed, hexLch(accent));
  const dark = scheme(longHex((d["color.groundDark"] as string | undefined) || groundDark(ground)), seed, hexLch(accent));
  const b = d["type.base"] as number;
  const r = d["type.ratio"] as number;
  const tr = d["type.display.tracking"] as number;
  const wt = d["type.display.weight"] as number;
  const display = d["type.display.family"] as string;
  const body = d["type.body.family"] as string;
  const m = DENSITY[d["space.density"] as string]!;
  const radius = String(d["shape.radius"]);
  const depth = d.depth as "none" | "soft" | "hard";
  const shadow = (k: "sm" | "md" | "lg") => (depth === "none" ? "none" : depth === "soft" ? SHADOW_SOFT[k] : `${HARD[k]}px ${HARD[k]}px 0 0 ${light.fg}`);
  return {
    ok: true,
    value: {
      name: d.name as string,
      concept: { idea: d["concept.idea"] as string, signature: d["concept.signature"] as string, palette: d["concept.palette"] as string, voice: d["concept.voice"] as string, ...(d["concept.habit"] ? { habit: d["concept.habit"] as string } : {}) },
      light,
      dark,
      type: {
        display: { fontFamily: display, fontSize: px(b * r ** 5), fontWeight: wt, lineHeight: 1.08, letterSpacing: `${tr}em` },
        h1: { fontFamily: display, fontSize: px(b * r ** 4), fontWeight: wt, lineHeight: 1.1, letterSpacing: `${Math.round(tr * 0.8 * 1000) / 1000}em` },
        h2: { fontFamily: display, fontSize: px(b * r ** 3), fontWeight: wt, lineHeight: 1.15, letterSpacing: `${Math.round(tr * 0.6 * 1000) / 1000}em` },
        h3: { fontFamily: display, fontSize: px(b * r), fontWeight: wt, lineHeight: 1.25 },
        "body-md": { fontFamily: body, fontSize: px(b), lineHeight: 1.5 },
        "body-sm": { fontFamily: body, fontSize: px(b * 0.875), lineHeight: 1.45 },
        "label-md": { fontFamily: body, fontSize: px(b * 0.875), fontWeight: 500, lineHeight: 1.2 },
      },
      rounded: { sm: scaleLength(radius, 0.5), md: scaleLength(radius, 1), lg: scaleLength(radius, 1.5), full: "9999px" },
      spacing: { xs: px(4 * m), sm: px(8 * m), md: px(16 * m), lg: px(32 * m), xl: px(64 * m) },
      shadow: { sm: shadow("sm"), md: shadow("md"), lg: shadow("lg") },
    },
  };
}

const q = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * The system as the DESIGN.md the brief endpoint reads: colors (secondary is the dark mode's ground, a band behind light
 * text), typography levels, rounded, spacing, the primary button. The concept, the dark scheme and the depth ride along
 * in the front matter for the next agent to read (the endpoint keeps the brief; it applies what it knows).
 */
export function systemToDesignMd(s: System): string {
  const { light, dark } = s;
  const level = (t: System["type"][keyof System["type"]]) =>
    `{ fontFamily: ${q(t.fontFamily)}, fontSize: ${t.fontSize}${t.fontWeight ? `, fontWeight: ${t.fontWeight}` : ""}, lineHeight: ${t.lineHeight}${t.letterSpacing ? `, letterSpacing: ${t.letterSpacing}` : ""} }`;
  const c = s.concept;
  return [
    "---",
    `name: ${q(s.name)}`,
    "concept:",
    `  idea: ${q(c.idea)}`,
    `  signature: ${q(c.signature)}`,
    `  palette: ${q(c.palette)}`,
    `  voice: ${q(c.voice)}`,
    ...(c.habit ? [`  habit: ${q(c.habit)}`] : []),
    "colors:",
    `  primary: "${light.primary}"`,
    `  on-primary: "${light.primaryFg}"`,
    `  background: "${light.ground}"`,
    `  surface: "${light.muted}"`,
    `  on-background: "${light.fg}"`,
    `  on-surface-variant: "${light.mutedFg}"`,
    `  outline-variant: "${light.border}"`,
    `  secondary: "${dark.ground}"`,
    `  on-secondary: "${dark.fg}"`,
    `  tertiary: "${light.highlight}"`,
    "dark:",
    `  background: "${dark.ground}"`,
    `  surface: "${dark.muted}"`,
    `  on-background: "${dark.fg}"`,
    `  on-surface-variant: "${dark.mutedFg}"`,
    `  outline-variant: "${dark.border}"`,
    `  primary: "${dark.primary}"`,
    `  on-primary: "${dark.primaryFg}"`,
    "typography:",
    ...Object.entries(s.type).map(([k, t]) => `  ${k}: ${level(t)}`),
    `rounded: { sm: ${s.rounded.sm}, md: ${s.rounded.md}, lg: ${s.rounded.lg}, full: ${s.rounded.full} }`,
    `spacing: { xs: ${s.spacing.xs}, sm: ${s.spacing.sm}, md: ${s.spacing.md}, lg: ${s.spacing.lg}, xl: ${s.spacing.xl} }`,
    `elevation: { sm: ${q(s.shadow.sm)}, md: ${q(s.shadow.md)}, lg: ${q(s.shadow.lg)} }`,
    "components:",
    `  button-primary: { backgroundColor: "${light.primary}", textColor: "${light.primaryFg}", rounded: ${s.rounded.md} }`,
    "---",
    "",
    [c.idea, `Signature: ${c.signature}`, `Colors from ${c.palette}`, `Type: ${c.voice}`].map((t) => t.trim().replace(/[.!?]?$/, (m) => m || ".")).join(" "),
    "",
  ].join("\n");
}

// ---- a DESIGN.md the agent wrote itself ----

/** The front matter's `concept:` block, read line by line (`  idea: "…"`), and the values the habit rule looks at. */
export function readDesignMd(markdown: string): { concept: Partial<Concept>; ground?: string; display?: string } {
  const src = markdown.replace(/\r\n/g, "\n");
  const end = src.startsWith("---\n") ? src.indexOf("\n---", 4) : -1;
  const lines = end > 0 ? src.slice(4, end).split("\n") : [];
  const unquote = (v: string) => v.trim().replace(/^["']|["']$/g, "");
  const block = (name: string): Record<string, string> => {
    const at = lines.findIndex((l) => new RegExp(`^${name}:\\s*(\\{.*\\})?\\s*$`).test(l));
    if (at < 0) return {};
    const inline = /\{(.*)\}/.exec(lines[at]!)?.[1];
    const pairs = inline !== undefined ? inline.split(/,(?=\s*[\w-]+\s*:)/) : lines.slice(at + 1).filter((_, i, all) => all.slice(0, i + 1).every((l) => /^\s+\S/.test(l) || l.trim() === ""));
    return Object.fromEntries(pairs.map((p) => /^\s*([\w-]+)\s*:\s*(.*)$/.exec(p)).filter((m): m is RegExpExecArray => !!m).map((m) => [m[1]!, unquote(m[2]!)]));
  };
  const concept = block("concept") as Partial<Concept>;
  const colors = block("colors");
  const type = lines.join("\n");
  const display = /^\s+(?:display|h1|headline-xl|headline-lg|headline-display|display-lg)\s*:.*fontFamily\s*:\s*("[^"]*"|'[^']*'|[^,}]+)/m.exec(type)?.[1];
  return { concept, ground: colors.background, display: display ? unquote(display) : undefined };
}

/** What a DESIGN.md for a new look lacks: the concept (thin or missing), or a habit it falls into. Empty: fine. */
export function designMdProblems(markdown: string): string[] {
  const { concept, ground, display } = readDesignMd(markdown);
  const checked = parse({ concept }, CONCEPT_SPEC, false);
  const errors = checked.ok ? [] : checked.errors;
  const habit = ground && display ? habitProblem(ground, display, concept.habit) : undefined;
  return habit ? [...errors, habit] : errors;
}
