/**
 * The Studio's template builder (Templates.scala: `S`, `css`, `Ctx`), as the importers use it: styles per breakpoint
 * and an element collector that takes ids from the caller. Arguments are built before the element that holds them, as in
 * Scala, so ids come out in the same order.
 */
import type { Styles } from "@auvyx/style-engine";
import { type El, type Kind, el } from "../model";
import { normalizeQuery } from "../elements";
import { escapeText } from "../markup";

export type Decl = readonly [string, string];

/** Base (desktop) declarations, tablet and mobile overrides and hover. */
export class S {
  constructor(
    readonly base: readonly Decl[] = [],
    readonly tablet: readonly Decl[] = [],
    readonly mobile: readonly Decl[] = [],
    readonly hover: readonly Decl[] = [],
  ) {}
  t(...d: Decl[]): S { return new S(this.base, [...this.tablet, ...d], this.mobile, this.hover); }
  m(...d: Decl[]): S { return new S(this.base, this.tablet, [...this.mobile, ...d], this.hover); }
  h(...d: Decl[]): S { return new S(this.base, this.tablet, this.mobile, [...this.hover, ...d]); }
  plus(o: S): S { return new S([...this.base, ...o.base], [...this.tablet, ...o.tablet], [...this.mobile, ...o.mobile], [...this.hover, ...o.hover]); }
  get empty(): boolean { return !this.base.length && !this.tablet.length && !this.mobile.length; }
  get styles(): Styles {
    const decls = (d: readonly Decl[]) => { const o: Record<string, string> = {}; for (const [k, v] of d) o[k] = v; return o; };
    const states = (def: readonly Decl[], hov: readonly Decl[]) => {
      const o: Record<string, Record<string, string>> = {};
      if (def.length) o.default = decls(def);
      if (hov.length) o.hover = decls(hov);
      return o;
    };
    const out: Styles = {};
    if (this.base.length || this.hover.length) out.base = states(this.base, this.hover);
    if (this.tablet.length) out.tablet = states(this.tablet, []);
    if (this.mobile.length) out.mobile = states(this.mobile, []);
    return out;
  }
}

/** S per breakpoint (an object literal is easier to read than positional arguments). */
export const sOf = (o: { base?: readonly Decl[]; tablet?: readonly Decl[]; mobile?: readonly Decl[]; hover?: readonly Decl[] }) =>
  new S(o.base ?? [], o.tablet ?? [], o.mobile ?? [], o.hover ?? []);

export const css = (...d: Decl[]): S => new S(d);
export const NONE = new S();

/** Collects elements while a page is built. `assets` is the placeholder image base URL. */
export class Ctx {
  readonly nodes = new Map<string, El>();
  constructor(private readonly newId: () => string, readonly assets: string) {}

  private add(kind: Kind, fields: Partial<El>): string {
    const e = el(this.newId(), kind, fields);
    this.nodes.set(e.id, e);
    return e.id;
  }
  private update(id: string, f: (n: El) => El): string {
    const n = this.nodes.get(id);
    if (n) this.nodes.set(id, f(n));
    return id;
  }

  section(s: S, tag: string, align: string, children: string[]): string {
    return this.add("Section", { tag, align, styles: s.styles, children });
  }
  div(s: S, children: string[] = []): string { return this.section(s, "div", "", children); }
  classed(cls: string, id: string): string {
    return this.update(id, (n) => ({ ...n, className: [...n.className.split(" ").filter(Boolean), cls].join(" ") }));
  }
  anchored(anchor: string, id: string): string { return this.update(id, (n) => ({ ...n, anchor })); }
  named(label: string, id: string): string { return this.update(id, (n) => ({ ...n, label })); }
  /** More declarations over an element's own, breakpoint by breakpoint. */
  styled(extra: S, id: string): string {
    return this.update(id, (n) => {
      const merged: Styles = { ...n.styles };
      for (const [bp, states] of Object.entries(extra.styles)) {
        const acc: Record<string, Record<string, string>> = { ...(merged[bp] as Record<string, Record<string, string>> | undefined) };
        for (const [st, decls] of Object.entries(states ?? {})) acc[st] = { ...acc[st], ...decls };
        merged[bp] = acc;
      }
      return { ...n, styles: merged };
    });
  }
  heading(text: string, level = 2, s: S = NONE): string { return this.add("Heading", { text, level, styles: s.styles }); }
  text(t: string, s: S = NONE): string { return this.add("Text", { text: t, styles: s.styles }); }
  button(t: string, s: S = NONE, href = "#", extraClass = ""): string {
    return this.add("Button", { text: t, href, className: extraClass, styles: s.styles });
  }
  linkedImage(file: string, alt: string, href: string, s: S = NONE): string {
    return this.add("Image", { src: `${this.assets}/${file}.svg`, alt, href, styles: s.styles });
  }
  divider(s: S = NONE): string { return this.add("Divider", { styles: s.styles }); }
  video(url: string, s: S = NONE): string { return this.add("Video", { src: url, styles: s.styles }); }
  /** A posts loop: its children are the per-post template. */
  loop(query: readonly Decl[], s: S, children: string[]): string {
    const q: Record<string, string> = {};
    for (const [k, v] of query) q[k] = v;
    return this.add("Loop", { query: Object.fromEntries(normalizeQuery(q)), styles: s.styles, children });
  }
  link(t: string, href: string, s: S = NONE): string { return this.add("Button", { text: t, href, styles: s.styles }); }
  nav(source = "pages", toggleAt = "mobile", s: S = NONE): string { return this.add("Nav", { src: source, alt: toggleAt, styles: s.styles }); }
  /** A platform block, saved as its self-closing comment, `label` standing in for its preview. */
  block(name: string, label: string, attrsJson = "", s: S = NONE): string {
    const html = `<div style="padding:24px;border:1px dashed currentColor;opacity:.6;font:13px/1.4 system-ui;text-align:center">${escapeText(label)}</div>`;
    return this.add("Raw", { blockName: name, raw: `<!-- wp:${name}${attrsJson ? " " + attrsJson : ""} /-->`, html, styles: s.styles });
  }
  bind(id: string, ...kv: Decl[]): string {
    return this.update(id, (e) => { const b = { ...e.bind }; for (const [k, v] of kv) b[k] = v; return { ...e, bind: b }; });
  }
  imageAt(url: string, alt: string, s: S = NONE, mediaId = 0, href = ""): string {
    return this.add("Image", { src: url, alt, href, mediaId, styles: s.styles });
  }
  /** Content kept as it was, saved verbatim. */
  keep(blockName: string, raw: string, preview: string): string { return this.add("Raw", { blockName, raw, html: preview }); }
  accordion(title: string, s: S, children: string[]): string { return this.add("Accordion", { text: title, styles: s.styles, children }); }
}
