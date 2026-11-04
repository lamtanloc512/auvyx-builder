/**
 * Per-field responsive overrides (the Studio's shared Overrides.scala): a field's value set on this screen (`own`),
 * or inherited from the next wider screen, or, for a pseudo state, from Normal. An override is only a declaration on
 * another breakpoint, so saved markup never depends on it.
 */
import { resolveValue, sortBreakpoints, type Breakpoint, type StateId, type Styles } from "@auvyx/style-engine";
import { getStyle, setStyle } from "./ops";

export type StyleSource = "here" | "inherited" | "unset";

export interface StyleField {
  own?: string;
  inherited?: string;
  /** breakpoint the inherited value comes from */
  from?: string;
  /** this breakpoint keeps its own value and is not the base one */
  isOverride: boolean;
  /** an inherited value is there to pin as an override */
  canPin: boolean;
}

export const emptyField: StyleField = { isOverride: false, canPin: false };
export const effective = (f: StyleField): string | undefined => f.own ?? f.inherited;
export const sourceOf = (f: StyleField): StyleSource => (f.own !== undefined ? "here" : f.inherited !== undefined ? "inherited" : "unset");
/** The dot is the override affordance: it only exists on a field that overrides one or could. */
export const showsDot = (f: StyleField): boolean => f.isOverride || f.canPin;

/** The breakpoint without a media query (the widest). */
export const baseBreakpoint = (breakpoints: readonly Breakpoint[]): string => sortBreakpoints(breakpoints)[0]?.id ?? "base";

const wider = (styles: Styles, breakpoints: readonly Breakpoint[], bp: string, st: string, prop: string) => {
  const sorted = sortBreakpoints(breakpoints);
  const i = sorted.findIndex((b) => b.id === bp);
  return i <= 0 ? undefined : resolveValue(styles, sorted, sorted[i - 1]!.id, st as StateId, prop);
};

export function overrideField(styles: Styles, breakpoints: readonly Breakpoint[], bp: string, st: string, prop: string): StyleField {
  const own = getStyle(styles, bp, st, prop);
  const isBase = bp === baseBreakpoint(breakpoints);
  const inherited = wider(styles, breakpoints, bp, st, prop) ?? (st === "default" ? undefined : resolveValue(styles, breakpoints, bp, "default", prop));
  return {
    own,
    inherited: inherited?.value,
    from: inherited?.breakpointId,
    isOverride: own !== undefined && !isBase,
    canPin: own === undefined && inherited !== undefined && !isBase,
  };
}

/** Drop this breakpoint's value; the field inherits again. */
export const clearOverride = (styles: Styles, bp: string, st: string, prop: string): Styles => setStyle(styles, bp, st, prop, undefined);

/** Start overriding here with the value the field would otherwise show (nothing to pin: unchanged). */
export function pinOverride(styles: Styles, breakpoints: readonly Breakpoint[], bp: string, st: string, prop: string): Styles {
  const f = overrideField(styles, breakpoints, bp, st, prop);
  return f.canPin ? setStyle(styles, bp, st, prop, f.inherited) : styles;
}

/** What a click on the dot does: clear an override, pin an inherited value. */
export const toggleOverride = (styles: Styles, breakpoints: readonly Breakpoint[], bp: string, st: string, prop: string): Styles =>
  overrideField(styles, breakpoints, bp, st, prop).isOverride ? clearOverride(styles, bp, st, prop) : pinOverride(styles, breakpoints, bp, st, prop);
