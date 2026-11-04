/**
 * What the header builder and the footer builder share (the Scala `BuilderParts`, docs/header-builder.md): breakpoints,
 * colour tones read from the design tokens, and the "owned" style keys a builder rewrites on the elements it made.
 * Everything else on those elements (a padding the author set in the inspector, a hover colour) is the author's and stays.
 * Also the few `Ctx` helpers (S/Templates.scala) the builders use to make new items.
 */
import type { Styles } from "@auvyx/style-engine";
import { type El, type Kind, el } from "./model";
import { escapeText } from "./markup";

const color = (slug: string) => `var(--wp--preset--color--${slug})`;

/** The style engine's three buckets, widest first: `key` is the `auvyx.styles` breakpoint id. */
export type Bp = "desktop" | "tablet" | "mobile";
export const BPS: readonly Bp[] = ["desktop", "tablet", "mobile"];
export const BP_KEY: Record<Bp, string> = { desktop: "base", tablet: "tablet", mobile: "mobile" };
export const BP_LABEL: Record<Bp, string> = { desktop: "Desktop", tablet: "Tablet", mobile: "Mobile" };
export const bpOrdinal = (b: Bp) => BPS.indexOf(b);

/** A row's or footer's colours, as tokens only (no fixed value ever reaches the document). */
export type Tone = "plain" | "muted" | "dark" | "brand";
export const TONES: readonly Tone[] = ["plain", "muted", "dark", "brand"];
export const TONE: Record<Tone, { background: string; text: string }> = {
  plain: { background: color("auvyx-base"), text: color("auvyx-text") },
  muted: { background: color("auvyx-surface"), text: color("auvyx-text") },
  dark: { background: color("auvyx-secondary"), text: color("auvyx-inverse") },
  brand: { background: color("auvyx-primary"), text: color("auvyx-on-primary") },
};

export type Platform = "wordpress" | "ezy";

/** The same inline band as the legacy presets and the page column, so header, page and footer share their edges. */
export const BAND = "var(--auvyx-band, max(24px, calc((100% - 1200px) / 2)))";
export const LINE = color("auvyx-border");

export type Decl = [string, string];
export type Computed = Record<string, Decl[]>;

/** Scala's `split("\\s+")` without the empty pieces. */
export const classes = (className: string): string[] => className.split(/\s+/).filter((c) => c.length > 0);

/** `className` without the classes `drop` accepts, then `add` (author classes keep their place, ours go last). */
export const withClasses = (className: string, drop: (c: string) => boolean, add: readonly string[]): string =>
  [...new Set([...classes(className).filter((c) => !drop(c)), ...add])].join(" ");

/**
 * Per-breakpoint values of one property: `values` is (desktop, tablet, mobile), undefined where the element is not shown
 * at that width (any value would do, so it follows the wider one). Only a change from the wider width is written.
 */
export function cascade(property: string, values: readonly (string | undefined)[]): Computed {
  const first = values.find((v) => v !== undefined);
  if (first === undefined) return {};
  const d = values[0] ?? first;
  const t = values[1] ?? d;
  const m = values[2] ?? t;
  return { base: [[property, d]], ...(t !== d ? { tablet: [[property, t]] } : {}), ...(m !== t ? { mobile: [[property, m]] } : {}) };
}

export function merge(...parts: Computed[]): Computed {
  const out: Computed = {};
  for (const p of parts) for (const [k, v] of Object.entries(p)) out[k] = [...(out[k] ?? []), ...v];
  return out;
}

export const base = (...decls: Decl[]): Computed => ({ base: decls });

/**
 * `styles` with every `owned` property removed from the default state at every breakpoint, then `computed` appended.
 * Breakpoints come out in the engine's order and the default state first, so writing twice gives the same value.
 */
export function own(styles: Styles, owned: ReadonlySet<string>, computed: Computed): Styles {
  const order = ["base", "tablet", "mobile"];
  const keys = [...order, ...[...new Set([...Object.keys(styles), ...Object.keys(computed)])].filter((k) => !order.includes(k))];
  const out: Styles = {};
  for (const bp of keys) {
    const states = (styles[bp] ?? {}) as Record<string, Record<string, string>>;
    const def: Record<string, string> = {};
    for (const [k, v] of Object.entries(states.default ?? {})) if (!owned.has(k)) def[k] = v;
    for (const [k, v] of computed[bp] ?? []) def[k] = v;
    const next: Record<string, Record<string, string>> = {};
    if (Object.keys(def).length) next.default = def;
    for (const [s, d] of Object.entries(states)) if (s !== "default") next[s] = d;
    if (Object.keys(next).length) out[bp] = next;
  }
  return out;
}

/** How an element shows when nothing hides it (the display a builder writes back at a width where it is visible). */
export const natural = (n: El): string =>
  n.kind === "Nav" || n.kind === "Section" ? "flex" : n.kind === "Icon" || n.kind === "Button" ? "inline-flex" : "block";

/** A copy of `id`'s subtree with fresh ids (anchors dropped: an HTML id stays unique). Returns the new root id and nodes. */
export function copySubtree(nodes: Readonly<Record<string, El>>, id: string, newId: () => string): [string, Record<string, El>] {
  const n = nodes[id]!;
  const kids = n.children.map((c) => copySubtree(nodes, c, newId));
  const fresh = newId();
  const out: Record<string, El> = {};
  for (const [, k] of kids) Object.assign(out, k);
  out[fresh] = { ...n, id: fresh, anchor: "", children: kids.map(([k]) => k) };
  return [fresh, out];
}

export const subtree = (nodes: Readonly<Record<string, El>>, id: string): string[] => {
  const n = nodes[id];
  return n ? [id, ...n.children.flatMap((c) => subtree(nodes, c))] : [];
};

export const enumName = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

// ---- Ctx: building new elements (S/Templates.scala) ---------------------------------------------

/** `css(...)`: base declarations of the default state. */
export const css = (...decls: Decl[]): Styles => (decls.length ? { base: { default: Object.fromEntries(decls) } } : {});

export const M0: Decl[] = [["margin-block-start", "0"], ["margin-block-end", "0"]];

/** Collects elements while an item is built (the Scala `Ctx`, the helpers the builders call). */
export class Ctx {
  nodes: Record<string, El> = {};
  constructor(private readonly newId: () => string) {}
  private add(e: El): string { this.nodes[e.id] = e; return e.id; }
  private make(kind: Kind, f: Partial<El>) { return this.add(el(this.newId(), kind, f)); }
  div(s: Styles, ...children: string[]) { return this.make("Section", { tag: "div", styles: s, children }); }
  classed(cls: string, id: string) {
    const n = this.nodes[id];
    if (n) this.nodes[id] = { ...n, className: [...n.className.split(" ").filter((c) => c), cls].join(" ") };
    return id;
  }
  named(label: string, id: string) {
    const n = this.nodes[id];
    if (n) this.nodes[id] = { ...n, label };
    return id;
  }
  text(t: string, s: Styles = {}) { return this.make("Text", { text: t, styles: s }); }
  icon(name: string, s: Styles = {}, href = "") { return this.make("Icon", { icon: name, href, styles: s }); }
  nav(source = "pages", toggleAt = "mobile", s: Styles = {}) { return this.make("Nav", { src: source, alt: toggleAt, styles: s }); }
  /** A platform block, saved as its self-closing comment; `label` stands in for its preview until the platform renders it. */
  block(name: string, label: string, attrsJson = "", s: Styles = {}) {
    const placeholder = `<div style="padding:24px;border:1px dashed currentColor;opacity:.6;font:13px/1.4 system-ui;text-align:center">${escapeText(label)}</div>`;
    return this.make("Raw", { blockName: name, raw: `<!-- wp:${name}${attrsJson ? " " + attrsJson : ""} /-->`, html: placeholder, styles: s });
  }
  /** Content kept as it was, saved verbatim. */
  keep(blockName: string, raw: string, preview: string) { return this.make("Raw", { blockName, raw, html: preview }); }
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(error: string): Result<T> => ({ ok: false, error });
