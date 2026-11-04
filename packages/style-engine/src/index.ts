/**
 * Auvyx style engine (TypeScript).
 *
 * Turns the `auvyx.styles` block attribute into CSS. The PHP port lives in
 * products/builder/src/StyleEngine/StyleEngine.php and MUST produce identical
 * output; shared/fixtures/style-engine/cases.json is run against both.
 */
import cssProperties from "@auvyx/shared/css-properties.json";

export type StateId = "default" | "hover" | "focus" | "active";
export type Declarations = Record<string, string>;
export type BreakpointStyles = Partial<Record<StateId, Declarations>>;
/** breakpoint id → state → property → value */
export type Styles = Record<string, BreakpointStyles>;
export type Breakpoint = {
  id: string;
  label: string;
  maxWidth?: number;
  minWidth?: number;
};

export const STATES: readonly StateId[] = ["default", "hover", "focus", "active"];

const STATE_PSEUDO: Record<StateId, string> = {
  default: "",
  hover: ":hover",
  focus: ":focus-visible",
  active: ":active",
};

const ALLOWED_PROPERTIES = new Set<string>(cssProperties.properties);
const CUSTOM_PROPERTY = /^--[a-z0-9-]+$/;
const BREAKPOINT_ID = /^[a-z][a-z0-9-]*$/;
const FORBIDDEN_VALUE = /[;{}<>\\]|\/\*|\*\/|expression\(|javascript:|@import/i;
const URL_CALL = /url\(/gi;
// Whitespace classes are spelled out (not \s) so JS and PHP PCRE agree byte for byte.
const URL_ARG = /url\([ \t\n\v\f\r]*(['"]?)([^'")]*)\1[ \t\n\v\f\r]*\)/gi;
const EDGE_WHITESPACE = /^[ \t\n\r\0\v]+|[ \t\n\r\0\v]+$/g;
const SAFE_URL = /^(https?:\/\/|\/)/i;
const MAX_VALUE_LENGTH = 500;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isAllowedProperty = (property: string): boolean =>
  ALLOWED_PROPERTIES.has(property) || CUSTOM_PROPERTY.test(property);

export const isSafeValue = (value: string): boolean => {
  if (value.length === 0 || value.length > MAX_VALUE_LENGTH) {
    return false;
  }
  if (FORBIDDEN_VALUE.test(value)) {
    return false;
  }
  const urlArgs = [...value.matchAll(URL_ARG)];
  const urlCalls = value.match(URL_CALL)?.length ?? 0;
  if (urlArgs.length !== urlCalls) {
    return false;
  }
  return urlArgs.every((match) => SAFE_URL.test(trimAscii(match[2] ?? "")));
};

/** Same characters as PHP trim(); String#trim also strips Unicode spaces. */
const trimAscii = (value: string): string => value.replace(EDGE_WHITESPACE, "");

/** Drops anything unsafe or empty. Never throws: input may come from AI, imports or old content. */
export const normalizeStyles = (input: unknown): Styles => {
  const output: Styles = {};
  if (!isRecord(input)) {
    return output;
  }
  for (const [breakpointId, states] of Object.entries(input)) {
    if (!BREAKPOINT_ID.test(breakpointId) || !isRecord(states)) {
      continue;
    }
    const breakpointStyles: BreakpointStyles = {};
    for (const state of STATES) {
      const declarations = states[state];
      if (!isRecord(declarations)) {
        continue;
      }
      const clean: Declarations = {};
      for (const [property, raw] of Object.entries(declarations)) {
        // Integers only: float → string formatting differs between JS and PHP.
        if (typeof raw !== "string" && !Number.isSafeInteger(raw)) {
          continue;
        }
        const value = trimAscii(String(raw));
        if (isAllowedProperty(property) && isSafeValue(value)) {
          clean[property] = value;
        }
      }
      if (Object.keys(clean).length > 0) {
        breakpointStyles[state] = clean;
      }
    }
    if (Object.keys(breakpointStyles).length > 0) {
      output[breakpointId] = breakpointStyles;
    }
  }
  return output;
};

/** FNV-1a 32-bit over the UTF-8 bytes of the normalized JSON, base36. */
export const hashStyles = (styles: Styles): string => {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(JSON.stringify(styles))) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
};

const breakpointRank = (breakpoint: Breakpoint): [number, number] => {
  if (breakpoint.minWidth !== undefined) {
    return [2, breakpoint.minWidth];
  }
  if (breakpoint.maxWidth !== undefined) {
    return [1, -breakpoint.maxWidth];
  }
  return [0, 0];
};

/** Cascade order: base → max-width (wide to narrow) → min-width (narrow to wide). */
export const sortBreakpoints = (breakpoints: readonly Breakpoint[]): Breakpoint[] =>
  [...breakpoints].sort((a, b) => {
    const [groupA, widthA] = breakpointRank(a);
    const [groupB, widthB] = breakpointRank(b);
    return groupA - groupB || widthA - widthB;
  });

export const mediaQuery = (breakpoint: Breakpoint): string => {
  const parts: string[] = [];
  if (breakpoint.minWidth !== undefined) {
    parts.push(`(min-width:${breakpoint.minWidth}px)`);
  }
  if (breakpoint.maxWidth !== undefined) {
    parts.push(`(max-width:${breakpoint.maxWidth}px)`);
  }
  return parts.join(" and ");
};

export type CompileOptions = {
  /**
   * Editor-only: emulate a device without media queries. Rules for every
   * breakpoint up to and including this one are emitted unconditionally, so
   * "Desktop" in a narrow editor canvas still shows desktop styles.
   */
  simulateBreakpoint?: string;
  /**
   * Editor-only: also apply this state's declarations unconditionally, so the
   * user sees e.g. the hover look while editing hover styles.
   */
  forceState?: StateId;
};

export const compileStyles = (
  styles: Styles,
  selector: string,
  breakpoints: readonly Breakpoint[],
  options: CompileOptions = {}
): string => {
  let ordered = sortBreakpoints(breakpoints);
  const simulate = options.simulateBreakpoint !== undefined;
  if (simulate) {
    const index = ordered.findIndex((bp) => bp.id === options.simulateBreakpoint);
    ordered = ordered.slice(0, index + 1);
  }
  const chunks: string[] = [];
  for (const breakpoint of ordered) {
    const breakpointStyles = styles[breakpoint.id];
    if (breakpointStyles === undefined) {
      continue;
    }
    let rules = "";
    for (const state of STATES) {
      const declarations = breakpointStyles[state];
      if (declarations === undefined) {
        continue;
      }
      const body = Object.entries(declarations)
        .map(([property, value]) => `${property}:${value}`)
        .join(";");
      if (body !== "") {
        rules += `${selector}${STATE_PSEUDO[state]}{${body}}`;
        if (state !== "default" && state === options.forceState) {
          rules += `${selector}{${body}}`;
        }
      }
    }
    if (rules === "") {
      continue;
    }
    const query = simulate ? "" : mediaQuery(breakpoint);
    chunks.push(query === "" ? rules : `@media ${query}{${rules}}`);
  }
  return chunks.join("");
};

export type CompiledBlockStyles = { className: string; css: string };

export const compileBlockStyles = (
  input: unknown,
  breakpoints: readonly Breakpoint[],
  options: CompileOptions = {}
): CompiledBlockStyles | null => {
  const styles = normalizeStyles(input);
  if (Object.keys(styles).length === 0) {
    return null;
  }
  const className = `auvyx-${hashStyles(styles)}`;
  const css = compileStyles(styles, `.${className}`, breakpoints, options);
  return css === "" ? null : { className, css };
};

/**
 * Value the user sees at (breakpoint, state) when they have not set one there:
 * walks the desktop-first cascade toward base.
 */
export const resolveValue = (
  styles: Styles,
  breakpoints: readonly Breakpoint[],
  breakpointId: string,
  state: StateId,
  property: string
): { value: string; breakpointId: string } | undefined => {
  const ordered = sortBreakpoints(breakpoints);
  const index = ordered.findIndex((bp) => bp.id === breakpointId);
  for (let i = index; i >= 0; i--) {
    const id = ordered[i]?.id;
    const value = id === undefined ? undefined : styles[id]?.[state]?.[property];
    if (id !== undefined && value !== undefined) {
      return { value, breakpointId: id };
    }
  }
  return undefined;
};

/*
 * Scoped CSS (`auvyx.css`): free CSS for one element, where `&` is the element. Mirrored in StyleEngine.php and the
 * Studio's StyleEngine.scala; shared/fixtures/style-engine/cases.json ("scoped") is run against all three.
 *
 * The text is wrapped in the element's class with CSS nesting (`.auvyx-x…{…}`), so whatever it says applies inside the
 * element only: bare declarations style the element, `&:hover`, `& > p`, `.card`, `@media`, `@container` nest.
 * `@keyframes` cannot nest, so top-level ones are kept beside the wrapper (their names are global: keep them unique).
 * Refused whole, never repaired: markup (`<`), escapes (`\`), unbalanced braces, @import/@charset/@namespace,
 * legacy script hooks, and url() outside https/site paths.
 */
const SCOPED_MAX_BYTES = 20000;
const SCOPED_COMMENT = /\/\*[\s\S]*?\*\//g;
const SCOPED_FORBIDDEN = /[<\\]|\/\*|\*\/|expression\(|javascript:|@import|@charset|@namespace|behavior:|-moz-binding/i;

const urlsAreSafe = (text: string): boolean => {
  const urlArgs = [...text.matchAll(URL_ARG)];
  const urlCalls = text.match(URL_CALL)?.length ?? 0;
  return urlArgs.length === urlCalls && urlArgs.every((match) => SAFE_URL.test(trimAscii(match[2] ?? "")));
};

/** Top-level items: a declaration up to its `;`, a rule or at-rule up to the brace that closes it. Null when braces do not balance. */
const topLevelItems = (text: string): string[] | null => {
  const items: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth < 0) {
        return null;
      }
      if (depth === 0) {
        items.push(text.slice(start, i + 1));
        start = i + 1;
      }
    } else if (ch === ";" && depth === 0) {
      items.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (depth !== 0) {
    return null;
  }
  items.push(text.slice(start));
  return items.map(trimAscii).filter((item) => item !== "");
};

const isKeyframes = (item: string): boolean => {
  // ASCII only: String#toLowerCase also folds a few non-ASCII letters (the Kelvin sign), PHP's strtolower does not.
  const head = item.slice(0, 19).replace(/[A-Z]/g, (c) => c.toLowerCase());
  return head.startsWith("@keyframes") || head.startsWith("@-webkit-keyframes");
};

export const compileScopedCss = (input: unknown): CompiledBlockStyles | null => {
  if (typeof input !== "string" || new TextEncoder().encode(input).length > SCOPED_MAX_BYTES) {
    return null;
  }
  const text = trimAscii(input.replace(SCOPED_COMMENT, ""));
  if (text === "" || SCOPED_FORBIDDEN.test(text) || !urlsAreSafe(text)) {
    return null;
  }
  const items = topLevelItems(text);
  if (items === null) {
    return null;
  }
  const keyframes = items.filter(isKeyframes).join("");
  const body = items.filter((item) => !isKeyframes(item)).join("");
  if (keyframes === "" && body === "") {
    return null;
  }
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(`${keyframes}\n${body}`)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const className = `auvyx-x${hash.toString(36)}`;
  return { className, css: keyframes + (body === "" ? "" : `.${className}{${body}}`) };
};
