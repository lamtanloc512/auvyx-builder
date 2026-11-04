/**
 * The Style panel's reading and writing (U/StylePanel.scala `state`, `set`, `computed`, `hasAny`…): a field's value and
 * where it comes from (Overrides), the element's computed values (refreshed once things settle), tokens.
 */
import { effective, emptyField, normalizeColumns, overrideField, prettyToken, roundPx, sourceOf, toggleOverride, update, type StyleField, type StyleSource } from "@auvyx/editor-core";
import { resolveValue, type Breakpoint, type StateId } from "@auvyx/style-engine";
import { config, type Token } from "../../lib/config";
import { store } from "../../lib/store.svelte";
import { screens } from "../../lib/screens.svelte";

/** Every editing screen (Store.breakpoints: built-in and custom), widest first by the engine. */
export const bps = () => screens.all as Breakpoint[];
export type { StyleField };

/** A token as the Studio's Tokens has it: slug, name and value (color or size). */
export interface DesignToken { slug: string; name: string; value: string }
const DEFAULTS = {
  color: [["auvyx-primary", "Auvyx Primary", "#171717"], ["auvyx-secondary", "Auvyx Secondary", "#0a0a0a"], ["auvyx-accent", "Auvyx Accent", "#e7000b"], ["auvyx-surface", "Auvyx Surface", "#f5f5f5"], ["auvyx-text", "Auvyx Text", "#0a0a0a"], ["auvyx-inverse", "Auvyx Inverse", "#fafafa"], ["auvyx-on-primary", "Auvyx On primary", "#fafafa"], ["auvyx-base", "Auvyx Base", "#ffffff"], ["auvyx-muted", "Auvyx Muted", "#6b6b6b"], ["auvyx-border", "Auvyx Border", "#e5e5e5"]],
  spacing: [["auvyx-xs", "Auvyx XS", "0.5rem"], ["auvyx-sm", "Auvyx S", "1rem"], ["auvyx-md", "Auvyx M", "1.5rem"], ["auvyx-lg", "Auvyx L", "3rem"], ["auvyx-xl", "Auvyx XL", "6rem"]],
  fontSize: [["auvyx-sm", "Auvyx Small", "0.875rem"], ["auvyx-md", "Auvyx Medium", "1rem"], ["auvyx-lg", "Auvyx Large", "clamp(1.125rem, 1rem + 0.5vw, 1.25rem)"], ["auvyx-xl", "Auvyx XL", "clamp(1.5rem, 1.25rem + 1vw, 1.75rem)"], ["auvyx-xxl", "Auvyx XXL", "clamp(2rem, 1.5rem + 2.5vw, 2.75rem)"]],
} as const;
const tokensOf = (kind: "color" | "spacing" | "fontSize"): DesignToken[] => {
  const site = (config.designSystem?.tokens?.[kind] ?? []) as Token[];
  if (site.length) return site.map((t) => ({ slug: t.slug, name: t.name ?? "", value: (kind === "color" ? t.color : t.size) ?? t.value ?? "" }));
  return DEFAULTS[kind].map(([slug, name, value]) => ({ slug, name, value }));
};
export const Tokens = { colors: tokensOf("color"), spacing: tokensOf("spacing"), fontSizes: tokensOf("fontSize") };

/** Theme fonts (theme.json presets, `fonts` of the config) plus system stacks. */
export const fontOptions: [string, string][] = [
  ...(((config as unknown as { fonts?: { slug: string; name: string }[] }).fonts ?? []).map((f) => [`var(--wp--preset--font-family--${f.slug})`, f.name] as [string, string])),
  ["system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif", "System sans"],
  ["Georgia, \"Times New Roman\", serif", "System serif"],
  ["ui-monospace, SFMono-Regular, Menlo, monospace", "Monospace"],
];

/** Auvyx Builder Pro's lock (ProLock.locked): Pro installed without an active licence. A site that sends no edition sells none. */
export const proLocked: boolean = (() => {
  const e = (config as unknown as { edition?: { pro?: boolean; licensed?: boolean } }).edition;
  return e ? !!e.pro && !e.licensed : false;
})();
/** Pro's settings are shown only while Auvyx Builder Pro is installed (docs/editions.md). */
export const proShown: boolean = (() => {
  const e = (config as unknown as { edition?: { pro?: boolean } }).edition;
  return e ? !!e.pro : true;
})();

/** One field of the selected element at (screen, state). */
export function fieldOf(prop: string): StyleField {
  const n = store.node;
  return n ? overrideField(n.styles, bps(), store.breakpoint, store.styleState, prop) : emptyField;
}
export { effective, sourceOf };

/** Ticks once things settle (document, target, selection, canvas redraw), to refresh computed values. */
class Computed {
  tick = $state(0);
}
export const computedTick = new Computed();
let timer: ReturnType<typeof setTimeout> | undefined;
/** Call from a component: debounced like the Studio's `computedTick` (120 ms). */
export function watchComputed() {
  $effect(() => {
    void store.doc; void store.breakpoint; void store.styleState; void store.selected; void store.drawn;
    clearTimeout(timer);
    timer = setTimeout(() => computedTick.tick++, 120);
  });
}

/** Computed value of the selected element ("1280px", "rgb(…)"), px rounded. Reads the tick, so it follows. */
export function computed(prop: string): string {
  void computedTick.tick;
  const el = store.selected ? store.elements.get(store.selected) : undefined;
  if (!el || !el.isConnected) return "";
  const view = el.ownerDocument.defaultView;
  return view ? roundPx(view.getComputedStyle(el).getPropertyValue(prop).trim()) : "";
}

export function tokenName(slug: string): string | undefined {
  return [...Tokens.colors, ...Tokens.fontSizes, ...Tokens.spacing].find((t) => t.slug === slug)?.name;
}
export const pretty = (v: string) => prettyToken(v, tokenName);

export function set(prop: string, value: string | undefined, key: string) {
  const stored = prop === "grid-template-columns" && value !== undefined ? normalizeColumns(value) : value;
  const id = store.selected;
  if (id) store.setStyles(id, [[prop, stored]], `${key}:${id}:${prop}`);
}

export function setAll(patch: [string, string | undefined][]) {
  const id = store.selected;
  if (id) store.setStyles(id, patch);
}

/** The dot: clear an override, or pin the inherited value here (Store.toggleOverride). */
export function toggleOverrideOf(prop: string) {
  const id = store.selected;
  if (!id) return;
  const bp = store.breakpoint, st = store.styleState;
  const ids = store.selected === id ? store.selection : [id];
  store.commit(ids.reduce((d, i) => update(d, i, (n) => ({ ...n, styles: toggleOverride(n.styles, bps(), bp, st, prop) })), store.doc), `override:${bp}:${st}:${prop}`);
}

export function hasAny(props: readonly string[]): boolean {
  const n = store.node;
  return !!n && props.some((p) => resolveValue(n.styles, bps(), store.breakpoint, store.styleState as StateId, p) !== undefined);
}

export function sourceText(s: StyleSource): string {
  return s === "here" ? "text-blue-600 dark:text-blue-400" : s === "inherited" ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground";
}

export function tip(f: StyleField): string {
  if (f.isOverride) return `Overridden here (the wider screen has ${f.inherited ?? "nothing"}) · click the dot to inherit again · drag to change`;
  const s = sourceOf(f);
  return s === "here" ? "Set on this breakpoint/state · click to reset · drag to change"
    : s === "inherited" ? `Inherited: ${f.inherited ?? ""} · click the dot to override it here` : "Drag to set";
}

export const boxCls = "flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-muted/70 px-2 ring-ring/50 hover:bg-muted focus-within:bg-background focus-within:ring-1";

/** The Studio's resize cursors (U/Cursors.scala): a double arrow with a white halo. */
const doubleArrow = "<path d='M3.5 12l4-4v2.6h9V8l4 4-4 4v-2.6h-9V16z' fill='black' stroke='white' stroke-width='1.3' stroke-linejoin='round'/>";
const resize = (deg: number, fallback: string) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g transform='rotate(${deg} 12 12)'>${doubleArrow}</g></svg>`)}") 12 12, ${fallback}`;
export const Cursors = { ew: resize(0, "ew-resize"), ns: resize(90, "ns-resize") };
