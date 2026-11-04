/**
 * The footer builder (the Scala `FooterBuilder`, `FooterBuilderOps`, `FooterBuilderPresets`, docs/header-builder.md): rows
 * Top / Main / Bottom, each 1 to 6 columns of items (logo, tagline, link lists, newsletter, social, payments, contact,
 * copyright, text, HTML), read back through `auvyx-sf-footer-*` markers. Columns fold to two on tablets and one on phones through
 * the style engine's breakpoint styles. Every edit is a pure function of the document, as the Studio's.
 */
import { type Doc, type El, el, subtreeIds } from "./model";
import { validate } from "./docjson";
import {
  BAND, BPS, type Bp, Ctx, LINE, M0, type Platform, type Result, TONE, TONES, type Tone, base, cascade, classes, css, enumName, fail, merge,
  natural, ok, own, subtree, withClasses,
} from "./builderParts";
import type { BuilderItemView, Env } from "./headerBuilder";

export const FOOTER_MARKER = "auvyx-sf-footer-builder";
export const MAX_COLUMNS = 6;

export type FooterRowKind = "top" | "main" | "bottom";
export const FOOTER_ROWS: readonly FooterRowKind[] = ["top", "main", "bottom"];
export const FOOTER_ROW_LABEL: Record<FooterRowKind, string> = { top: "Top row", main: "Footer columns", bottom: "Last line" };

export type FooterAlign = "start" | "center" | "end";
export const FOOTER_ALIGNS: readonly FooterAlign[] = ["start", "center", "end"];
const ALIGN_ITEMS: Record<FooterAlign, string> = { start: "flex-start", center: "center", end: "flex-end" };

export type FooterItemKind = "Logo" | "About" | "Links" | "Newsletter" | "Social" | "Payments" | "Contact" | "Copyright" | "Text" | "Html" | "Custom";
export const FOOTER_ITEM_KINDS: readonly FooterItemKind[] = ["Logo", "About", "Links", "Newsletter", "Social", "Payments", "Contact", "Copyright", "Text", "Html", "Custom"];
export const FOOTER_ITEM: Record<FooterItemKind, { token: string; label: string }> = {
  Logo: { token: "logo", label: "Logo" }, About: { token: "about", label: "Tagline" }, Links: { token: "links", label: "Links" },
  Newsletter: { token: "newsletter", label: "Newsletter" }, Social: { token: "social", label: "Follow" }, Payments: { token: "payments", label: "Payments" },
  Contact: { token: "contact", label: "Contact" }, Copyright: { token: "copyright", label: "Copyright" }, Text: { token: "text", label: "Text" },
  Html: { token: "html", label: "HTML" }, Custom: { token: "", label: "Element" },
};

const mk = (s: string) => `auvyx-sf-footer-${s}`;
const rowMarker = (r: FooterRowKind) => mk(`row-${r}`);
const colsMarker = (n: number) => mk(`cols-${n}`);
const COL = mk("col");
const alignMarker = (a: FooterAlign) => mk(`align-${a}`);
const itemMarker = (k: FooterItemKind) => mk(`item-${FOOTER_ITEM[k].token}`);
const hideMarker = (b: Bp) => mk(`hide-${b}`);
const toneMarker = (t: Tone) => mk(`tone-${t}`);
const DIVIDER = mk("divider");

export const FOOTER_MARKERS: ReadonlySet<string> = new Set([
  FOOTER_MARKER, COL, DIVIDER, ...FOOTER_ROWS.map(rowMarker), ...[1, 2, 3, 4, 5, 6].map(colsMarker), ...FOOTER_ALIGNS.map(alignMarker),
  ...FOOTER_ITEM_KINDS.filter((k) => FOOTER_ITEM[k].token).map(itemMarker), ...BPS.map(hideMarker), ...TONES.map(toneMarker),
]);

export interface FooterItemView { el: El; kind: FooterItemKind; hidden: Set<Bp> }
export interface ColumnView { el: El; align: FooterAlign; items: FooterItemView[] }
export interface FooterRowView { el: El; kind: FooterRowKind; divider: boolean; hidden: Set<Bp>; columns: ColumnView[]; extras: string[] }
export interface FooterLayout { root: El; tone: Tone; rows: FooterRowView[]; extras: string[]; pool: Record<string, El> }

const rowItems = (r: FooterRowView) => r.columns.flatMap((c) => c.items);
const rowShows = (r: FooterRowView, bp: Bp) => !r.hidden.has(bp) && rowItems(r).some((i) => !i.hidden.has(bp));

export function findFooterItem(l: FooterLayout, item: string): [FooterRowView, number, FooterItemView] | undefined {
  for (const r of l.rows) for (const [ci, c] of r.columns.entries()) for (const it of c.items) if (it.el.id === item) return [r, ci, it];
  return undefined;
}

export const isFooterBuilder = (className: string) => classes(className).includes(FOOTER_MARKER);

/** The builder layout of the footer at `rootId`; undefined for a legacy or hand-made footer. */
export function readFooter(doc: Doc, rootId: string): FooterLayout | undefined {
  const root = doc.nodes[rootId];
  if (!root || root.kind !== "Section" || !isFooterBuilder(root.className)) return undefined;
  const nodes = (ids: readonly string[]) => ids.map((i) => doc.nodes[i]).filter((n): n is El => !!n);
  const hidden = (cs: Set<string>) => new Set(BPS.filter((b) => cs.has(hideMarker(b))));
  const item = (n: El): FooterItemView => {
    const cs = new Set(classes(n.className));
    const kind = FOOTER_ITEM_KINDS.find((k) => FOOTER_ITEM[k].token && cs.has(itemMarker(k))) ?? "Custom";
    return { el: n, kind, hidden: kind === "Custom" ? new Set() : hidden(cs) };
  };
  const row = (n: El, r: FooterRowKind): FooterRowView => {
    const cs = new Set(classes(n.className));
    const cols = nodes(n.children).filter((c) => c.kind === "Section" && classes(c.className).includes(COL)).map((c): ColumnView => {
      const ccs = new Set(classes(c.className));
      return { el: c, align: FOOTER_ALIGNS.find((a) => ccs.has(alignMarker(a))) ?? "start", items: nodes(c.children).map(item) };
    });
    const ids = new Set(cols.map((c) => c.el.id));
    return { el: n, kind: r, divider: cs.has(DIVIDER), hidden: hidden(cs), columns: cols, extras: n.children.filter((c) => !ids.has(c)) };
  };
  const kids = nodes(root.children);
  const rows = FOOTER_ROWS.flatMap((r) => { const k = kids.find((x) => x.kind === "Section" && classes(x.className).includes(rowMarker(r))); return k ? [row(k, r)] : []; });
  const ids = new Set(rows.map((r) => r.el.id));
  const cs = new Set(classes(root.className));
  return { root, tone: TONES.find((t) => cs.has(toneMarker(t))) ?? "dark", rows, extras: root.children.filter((c) => !ids.has(c)), pool: { ...doc.nodes } };
}

const ownClass = (c: string) => FOOTER_MARKERS.has(c);
const legacyClass = (c: string) => c === "auvyx-fv" || c.startsWith("auvyx-fv-");
const ROOT_KEYS = new Set(["display", "flex-direction", "gap", "width", "box-sizing", "padding-block-start", "padding-block-end",
  "padding-inline-start", "padding-inline-end", "margin-block-start", "background-color", "color", "border-block-start"]);
const ROW_KEYS = new Set(["display", "grid-template-columns", "gap", "align-items", "width", "border-block-start", "padding-block-start"]);
const COLUMN_KEYS = new Set(["display", "flex-direction", "gap", "align-items", "min-width", "text-align"]);
const ITEM_KEYS = new Set(["display"]);

/** The document with `layout` written back under its root (markers and owned styles; the rest is kept). */
export function writeFooter(doc: Doc, l: FooterLayout): Doc {
  const out: Record<string, El> = {};
  const put = (e: El) => { out[e.id] = e; return e.id; };
  const keep = (id: string) => { for (const k of subtree(l.pool, id)) out[k] = l.pool[k]!; return id; };
  const item = (i: FooterItemView): string => {
    if (i.kind === "Custom") return keep(i.el.id);
    i.el.children.forEach(keep);
    return put({ ...i.el, className: withClasses(i.el.className, ownClass, [itemMarker(i.kind), ...BPS.filter((b) => i.hidden.has(b)).map(hideMarker)]),
      styles: own(i.el.styles, ITEM_KEYS, cascade("display", BPS.map((b) => (i.hidden.has(b) ? "none" : natural(i.el))))) });
  };
  const column = (c: ColumnView): string => {
    const kids = c.items.map(item);
    return put({ ...c.el, className: withClasses(c.el.className, ownClass, [COL, ...(c.align !== "start" ? [alignMarker(c.align)] : [])]),
      label: c.el.label || "Column", children: kids,
      styles: own(c.el.styles, COLUMN_KEYS, base(["display", "flex"], ["flex-direction", "column"], ["gap", "12px"], ["align-items", ALIGN_ITEMS[c.align]],
        ["min-width", "0"], ["text-align", c.align])) });
  };
  const row = (r: FooterRowView): string => {
    const n = Math.max(1, r.columns.length);
    const kids = [...r.columns.map(column), ...r.extras.map(keep)];
    const grid = cascade("grid-template-columns", [`repeat(${n}, minmax(0, 1fr))`, `repeat(${Math.min(n, 2)}, minmax(0, 1fr))`, "minmax(0, 1fr)"]);
    const display = cascade("display", BPS.map((b) => (rowShows(r, b) ? "grid" : "none")));
    const look = {
      base: [["gap", "40px"], ["align-items", "start"], ["width", "100%"],
        ...(r.divider ? [["border-block-start", "1px solid color-mix(in srgb, currentColor 18%, transparent)"], ["padding-block-start", "24px"]] : [])] as [string, string][],
      mobile: [["gap", "24px"]] as [string, string][],
    };
    const marks = [rowMarker(r.kind), colsMarker(Math.min(n, MAX_COLUMNS)), ...(r.divider ? [DIVIDER] : []), ...BPS.filter((b) => r.hidden.has(b)).map(hideMarker)];
    return put({ ...r.el, className: withClasses(r.el.className, ownClass, marks), label: r.el.label || FOOTER_ROW_LABEL[r.kind], children: kids,
      styles: own(r.el.styles, ROW_KEYS, merge(display, grid, look)) });
  };
  const kids = [...[...l.rows].sort((a, b) => FOOTER_ROWS.indexOf(a.kind) - FOOTER_ROWS.indexOf(b.kind)).map(row), ...l.extras.map(keep)];
  const light = l.tone === "plain" || l.tone === "muted";
  const look = {
    base: [["display", "flex"], ["flex-direction", "column"], ["gap", "32px"], ["width", "100%"], ["box-sizing", "border-box"],
      ["padding-block-start", "64px"], ["padding-block-end", "32px"], ["padding-inline-start", BAND], ["padding-inline-end", BAND], ["margin-block-start", "0"],
      ["background-color", TONE[l.tone].background], ["color", TONE[l.tone].text], ...(light ? [["border-block-start", `1px solid ${LINE}`]] : [])] as [string, string][],
    mobile: [["padding-block-start", "40px"], ["padding-block-end", "24px"]] as [string, string][],
  };
  put({ ...l.root, className: withClasses(l.root.className, (c) => ownClass(c) || legacyClass(c), [FOOTER_MARKER, toneMarker(l.tone)]), children: kids,
    styles: own(l.root.styles, ROOT_KEYS, look) });
  const nodes: Record<string, El> = { ...doc.nodes };
  for (const id of subtreeIds(doc, l.root.id)) delete nodes[id];
  return { ...doc, nodes: { ...nodes, ...out } };
}

// ---- items ---------------------------------------------------------------------------------------

const SMALL = css(["font-size", "0.8125rem"], ["opacity", "0.75"], ...M0);
const LINKS_CSS = "& .auvyx-nav__list{flex-direction:column;align-items:flex-start;gap:10px}";

/** The newsletter form (Forms.element of the Studio's newsletter form, byte for byte: test/builder.test.ts). */
export const NEWSLETTER_FORM_RAW =
  '<!-- wp:auvyx/form {"id":"newsletter","fields":[{"name":"email","label":"Email","kind":"email","required":true,"placeholder":"you@example.com"}],"submit":"Subscribe","success":"Thanks, you are on the list."} /-->';
export const NEWSLETTER_FORM_HTML =
  '<form class="auvyx-form" id="auvyx-form-newsletter" action="#" method="post" accept-charset="UTF-8"><p class="auvyx-form__sent" id="auvyx-form-newsletter-sent" role="status">Thanks, you are on the list.</p><p class="auvyx-form__error" id="auvyx-form-newsletter-error" role="alert">Your message could not be sent. Check the fields and try again.</p><div class="auvyx-form__field"><label class="auvyx-form__label" for="auvyx-newsletter-email">Email<span class="auvyx-form__req" aria-hidden="true">*</span></label><input class="auvyx-form__control" type="email" id="auvyx-newsletter-email" name="email" maxlength="300" placeholder="you@example.com" required></div><div class="auvyx-form__trap" aria-hidden="true"><label>Leave this empty<input type="text" name="_auvyx_hp" tabindex="-1" autocomplete="off"></label></div><input type="hidden" name="_auvyx_form" value="newsletter"><button class="auvyx-form__submit" type="submit" disabled>Subscribe</button></form>';

/** A new item; `source` is a link list's menu, `text` a text item's copy. */
export function createFooterItem(kind: FooterItemKind, platform: Platform, newId: () => string, source?: string, text?: string, owner = "Your site"): Result<[El, Record<string, El>]> {
  if (platform === "ezy") return fail("EzyPlatform's footer items are made in Auvyx Studio");
  const c = new Ctx(newId);
  const row = (gap: string, ...kids: string[]) => c.div(css(["display", "flex"], ["align-items", "center"], ["flex-wrap", "wrap"], ["gap", gap]), ...kids);
  const stack = (gap: string, ...kids: string[]) => c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", gap]), ...kids);
  const title = (t: string) => c.text(t, css(["font-size", "0.75rem"], ["font-weight", "600"], ["letter-spacing", "0.12em"], ["text-transform", "uppercase"], ["opacity", "0.6"], ...M0));
  const ico = (name: string, size: string) => c.icon(name, css(["font-size", size], ["color", "inherit"]));
  let id: string;
  switch (kind) {
    case "Logo": id = c.block("core/site-title", "Site title", '{"level":0}'); break;
    case "About": id = c.block("core/site-tagline", "Tagline", "", css(["opacity", "0.75"])); break;
    case "Links": { const nav = c.nav(source ?? "pages", "never", css(["font-size", "0.9375rem"])); id = stack("12px", title(text ?? "Links"), nav); break; }
    case "Newsletter": id = stack("12px", c.text(text ?? "Get our news and offers", css(["font-weight", "600"], ...M0))); break;
    case "Social": id = row("14px", ...["facebook", "instagram", "youtube"].map((n) => c.icon(n, css(["font-size", "1.125rem"], ["color", "inherit"]), "#"))); break;
    case "Payments": id = row("10px", ico("credit-card", "1.25rem"), ico("wallet", "1.25rem"), c.text("Visa · Mastercard · PayPal", SMALL)); break;
    case "Contact":
      id = stack("8px", row("8px", ico("phone", "1rem"), c.text("(555) 123-4567", SMALL)), row("8px", ico("mail", "1rem"), c.text("hello@example.com", SMALL)));
      break;
    case "Copyright": id = c.text(`© ${owner}. All rights reserved.`, SMALL); break;
    case "Text": id = c.text(text ?? "A few words about your shop.", SMALL); break;
    case "Html": id = c.keep("core/html", "<!-- wp:html -->\n<span>Your HTML</span>\n<!-- /wp:html -->", "<span>Your HTML</span>"); break;
    default: return fail("Only builder items can be created");
  }
  c.named(FOOTER_ITEM[kind].label, id);
  const nodes = { ...c.nodes };
  // the link list's menu reads top to bottom
  const nav = nodes[id]!.children.map((k) => nodes[k]).find((n) => n?.kind === "Nav");
  if (nav) nodes[nav.id] = { ...nav, css: LINKS_CSS };
  if (kind === "Newsletter") {
    const form = el(newId(), "Raw", { blockName: "auvyx/form", raw: NEWSLETTER_FORM_RAW, html: NEWSLETTER_FORM_HTML, label: "Newsletter form" });
    nodes[form.id] = form;
    nodes[id] = { ...nodes[id]!, children: [...nodes[id]!.children, form.id] };
  }
  const n = nodes[id]!;
  delete nodes[id];
  return ok([n, nodes]);
}

/** The menu of a link list (its navigation), when the item is one. */
export const linksNav = (l: FooterLayout, item: FooterItemView): El | undefined =>
  item.kind === "Links" ? item.el.children.map((c) => l.pool[c]).find((n) => n?.kind === "Nav") : undefined;

// ---- presets -------------------------------------------------------------------------------------

export interface ColumnSpec { items: FooterItemKind[]; align?: FooterAlign }
export interface FooterRowSpec { kind: FooterRowKind; columns: ColumnSpec[]; divider?: boolean }
export interface FooterPreset { id: string; label: string; hint: string; rows: FooterRowSpec[]; tone?: Tone }

export type FooterVariant = "columns" | "simple" | "centered" | "minimal";
export const FOOTER_VARIANT_HINT: Record<FooterVariant, string> = {
  columns: "Logo and tagline, then columns of links; the last line below",
  simple: "Logo on the left, the site's menu on the right; the last line below",
  centered: "Logo, menu and follow icons stacked in the middle",
  minimal: "One line: copyright on the left, the menu on the right",
};

const col = (...items: FooterItemKind[]): ColumnSpec => ({ items });
const end = (...items: FooterItemKind[]): ColumnSpec => ({ items, align: "end" });
const center = (...items: FooterItemKind[]): ColumnSpec => ({ items, align: "center" });
const lastLine: FooterRowSpec = { kind: "bottom", columns: [col("Copyright"), end("Social")], divider: true };

export const FOOTER_PRESETS: readonly FooterPreset[] = [
  { id: "columns", label: "Columns", hint: FOOTER_VARIANT_HINT.columns, rows: [{ kind: "main", columns: [col("Logo", "About"), col("Links"), col("Links"), col("Links")] }, lastLine] },
  { id: "simple", label: "Simple", hint: FOOTER_VARIANT_HINT.simple, rows: [{ kind: "main", columns: [col("Logo", "About"), end("Links")] }, lastLine] },
  { id: "centered", label: "Centered", hint: FOOTER_VARIANT_HINT.centered,
    rows: [{ kind: "main", columns: [center("Logo", "About", "Links", "Social")] }, { kind: "bottom", columns: [center("Copyright")], divider: true }] },
  { id: "minimal", label: "Minimal", hint: FOOTER_VARIANT_HINT.minimal, rows: [{ kind: "main", columns: [col("Copyright"), end("Links", "Social")] }] },
  { id: "store", label: "Store", hint: "A newsletter row, the shop's link columns and contact, then the copyright and payment icons",
    rows: [{ kind: "top", columns: [col("Newsletter"), end("Social")], divider: false },
      { kind: "main", columns: [col("Logo", "About", "Contact"), col("Links"), col("Links"), col("Links")], divider: true },
      { kind: "bottom", columns: [col("Copyright"), end("Payments")], divider: true }] },
];

/** A ready (legacy) footer's configuration (FooterPresets.read). */
export interface LegacyFooter { variant: FooterVariant; columns: number; social: boolean; lastLine: boolean; dark: boolean }
export function readLegacyFooter(className: string): LegacyFooter | undefined {
  const cs = new Set(className.split(" "));
  if (!cs.has("auvyx-fv")) return undefined;
  return {
    variant: (["columns", "simple", "centered", "minimal"] as FooterVariant[]).find((v) => cs.has(`auvyx-fv-${v}`)) ?? "columns",
    columns: [1, 2, 3].find((n) => cs.has(`auvyx-fv-cols-${n}`)) ?? 3, social: cs.has("auvyx-fv-social"), lastLine: !cs.has("auvyx-fv-no-line"), dark: !cs.has("auvyx-fv-light"),
  };
}

export function legacyFooterPreset(cfg: LegacyFooter): FooterPreset {
  const p = FOOTER_PRESETS.find((x) => x.id === cfg.variant) ?? FOOTER_PRESETS[0]!;
  const cols = Math.min(3, Math.max(1, cfg.columns));
  const rows = p.rows.filter((r) => cfg.lastLine || r.kind !== "bottom" || cfg.variant === "minimal").map((r) => {
    const trimmed = p.id === "columns" && r.kind === "main" ? { ...r, columns: r.columns.slice(0, cols + 1) } : r;
    return { ...trimmed, columns: trimmed.columns.map((c) => ({ ...c, items: c.items.filter((k) => cfg.social || k !== "Social") })) };
  });
  return { ...p, id: `legacy-${p.id}`, rows, tone: cfg.dark ? "dark" : "muted" };
}

export const footerPresetById = (id: string) => FOOTER_PRESETS.find((p) => p.id === id);

// ---- edits (FooterBuilderOps) --------------------------------------------------------------------

const NOT_BUILDER = "This footer is not a builder footer: pick a builder preset first";
export const NO_FOOTER = "This document has no footer";
const checked = (doc: Doc): Result<Doc> => { const why = validate(doc); return why ? fail(why) : ok(doc); };

export function editFooter(doc: Doc, rootId: string, f: (l: FooterLayout) => Result<FooterLayout>): Result<Doc> {
  const l = readFooter(doc, rootId);
  if (!l) return fail(NOT_BUILDER);
  const r = f(l);
  return r.ok ? checked(writeFooter(doc, r.value)) : r;
}

const section = (env: Env) => el(env.newId(), "Section", { tag: "div" });
const emptyColumn = (env: Env): ColumnView => ({ el: section(env), align: "start", items: [] });

const mapRow = (l: FooterLayout, r: FooterRowKind, env: Env, f: (row: FooterRowView) => Result<FooterRowView>): Result<FooterLayout> => {
  let row = l.rows.find((x) => x.kind === r);
  if (!row) { const e = section(env); row = { el: e, kind: r, divider: r === "bottom", hidden: new Set(), columns: [emptyColumn(env)], extras: [] }; }
  const res = f(row);
  return res.ok ? ok({ ...l, rows: [...l.rows.filter((x) => x.kind !== r), res.value].sort((a, b) => FOOTER_ROWS.indexOf(a.kind) - FOOTER_ROWS.indexOf(b.kind)) }) : res;
};
const mapColumn = (row: FooterRowView, column: number, f: (c: ColumnView) => ColumnView): Result<FooterRowView> =>
  column >= 0 && column < row.columns.length
    ? ok({ ...row, columns: row.columns.map((c, i) => (i === column ? f(c) : c)) })
    : fail(`The ${FOOTER_ROW_LABEL[row.kind].toLowerCase()} has ${row.columns.length} column(s)`);
const without = (l: FooterLayout, item: string): FooterLayout =>
  ({ ...l, rows: l.rows.map((r) => ({ ...r, columns: r.columns.map((c) => ({ ...c, items: c.items.filter((i) => i.el.id !== item) })) })) });
const mapItems = (l: FooterLayout, f: (i: FooterItemView) => FooterItemView): FooterLayout =>
  ({ ...l, rows: l.rows.map((r) => ({ ...r, columns: r.columns.map((c) => ({ ...c, items: c.items.map(f) })) })) });
const insertAt = <T>(items: T[], item: T, index?: number): T[] => {
  const i = index === undefined ? items.length : Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, i), item, ...items.slice(i)];
};
const noItem = (id: string) => `No item '${id}' in this footer`;

export function footerAddItem(doc: Doc, rootId: string, input: { row: FooterRowKind; column: number; item: FooterItemKind; index?: number }, env: Env): Result<[Doc, string]> {
  let added = "";
  const r = editFooter(doc, rootId, (l) => {
    const made = createFooterItem(input.item, env.platform, env.newId);
    if (!made.ok) return made;
    const [n, kids] = made.value;
    added = n.id;
    return mapRow({ ...l, pool: { ...l.pool, ...kids, [n.id]: n } }, input.row, env,
      (row) => mapColumn(row, input.column, (c) => ({ ...c, items: insertAt(c.items, { el: n, kind: input.item, hidden: new Set<Bp>() }, input.index) })));
  });
  return r.ok ? ok([r.value, added]) : r;
}

export const footerMoveItem = (doc: Doc, rootId: string, input: { item: string; row: FooterRowKind; column: number; index?: number }, env: Env): Result<Doc> =>
  editFooter(doc, rootId, (l) => {
    const found = findFooterItem(l, input.item);
    if (!found) return fail(noItem(input.item));
    return mapRow(without(l, input.item), input.row, env, (row) => mapColumn(row, input.column, (c) => ({ ...c, items: insertAt(c.items, found[2], input.index) })));
  });

export const footerRemoveItem = (doc: Doc, rootId: string, item: string): Result<Doc> =>
  editFooter(doc, rootId, (l) => (findFooterItem(l, item) ? ok(without(l, item)) : fail(noItem(item))));

/** 1 to 6 columns; the items of columns that go away move to the last remaining one. */
export function footerSetColumns(doc: Doc, rootId: string, input: { row: FooterRowKind; columns: number }, env: Env): Result<Doc> {
  if (input.columns < 1 || input.columns > MAX_COLUMNS) return fail(`A row has 1 to ${MAX_COLUMNS} columns`);
  return editFooter(doc, rootId, (l) => mapRow(l, input.row, env, (r) => {
    const n = input.columns;
    if (r.columns.length <= n) return ok({ ...r, columns: [...r.columns, ...Array.from({ length: n - r.columns.length }, () => emptyColumn(env))] });
    const kept = r.columns.slice(0, n);
    const spilled = r.columns.slice(n).flatMap((c) => c.items);
    return ok({ ...r, columns: kept.map((c, i) => (i === n - 1 ? { ...c, items: [...c.items, ...spilled] } : c)) });
  }));
}

export const footerSetColumnAlign = (doc: Doc, rootId: string, input: { row: FooterRowKind; column: number; align: FooterAlign }, env: Env): Result<Doc> =>
  editFooter(doc, rootId, (l) => mapRow(l, input.row, env, (r) => mapColumn(r, input.column, (c) => ({ ...c, align: input.align }))));

export const footerSetRowVisible = (doc: Doc, rootId: string, input: { row: FooterRowKind; bp: Bp; on: boolean }, env: Env): Result<Doc> =>
  editFooter(doc, rootId, (l) => mapRow(l, input.row, env, (r) =>
    ok({ ...r, hidden: input.on ? new Set([...r.hidden].filter((b) => b !== input.bp)) : new Set([...r.hidden, input.bp]) })));

export const footerSetRowDivider = (doc: Doc, rootId: string, input: { row: FooterRowKind; on: boolean }, env: Env): Result<Doc> =>
  editFooter(doc, rootId, (l) => mapRow(l, input.row, env, (r) => ok({ ...r, divider: input.on })));

export const footerSetItemVisible = (doc: Doc, rootId: string, input: { item: string; bp: Bp; on: boolean }): Result<Doc> =>
  editFooter(doc, rootId, (l) => {
    const found = findFooterItem(l, input.item);
    if (!found) return fail(noItem(input.item));
    if (found[2].kind === "Custom") return fail("Only builder items can be hidden per breakpoint");
    return ok(mapItems(l, (i) => (i.el.id === input.item
      ? { ...i, hidden: input.on ? new Set([...i.hidden].filter((b) => b !== input.bp)) : new Set([...i.hidden, input.bp]) } : i)));
  });

export const footerSetTone = (doc: Doc, rootId: string, tone: Tone): Result<Doc> => editFooter(doc, rootId, (l) => ok({ ...l, tone }));

const SOURCE = /^[a-z][a-z0-9_-]{0,40}(:[A-Za-z0-9_-]{1,64})?$/;

/** The menu a link list shows (its one navigation). */
export function footerSetLinks(doc: Doc, rootId: string, input: { item: string; source: string }): Result<Doc> {
  if (!SOURCE.test(input.source)) return fail("A menu source is pages, nav:ID or menu:ID");
  return editFooter(doc, rootId, (l) => {
    const found = findFooterItem(l, input.item);
    if (!found) return fail(noItem(input.item));
    const nav = linksNav(l, found[2]);
    return nav ? ok({ ...l, pool: { ...l.pool, [nav.id]: { ...nav, src: input.source } } }) : fail("This item is not a link list");
  });
}

/** `legacy` converts a ready (legacy) footer as it is configured. */
export function footerSetPreset(doc: Doc, rootId: string, preset: string, env: Env): Result<Doc> {
  let p: FooterPreset | undefined;
  if (preset === "legacy") {
    const n = doc.nodes[rootId];
    const c = n ? readLegacyFooter(n.className) : undefined;
    if (!c) return fail("This footer is not a ready footer: pick a preset");
    p = legacyFooterPreset(c);
  } else {
    p = footerPresetById(preset);
    if (!p) return fail(`Unknown footer preset '${preset}'`);
  }
  return rebuildFooter(doc, rootId, p, env);
}

/** Rebuilds the footer under `rootId` (builder or legacy) as `preset` (see the Scala `rebuild`). */
export function rebuildFooter(doc: Doc, rootId: string, preset: FooterPreset, env: Env): Result<Doc> {
  const root = doc.nodes[rootId];
  if (!root || root.kind !== "Section") return fail("Footer root is missing or is not a section");
  const old = readFooter(doc, rootId);
  const oldEls = subtreeIds(doc, rootId).slice(1).map((i) => doc.nodes[i]).filter((n): n is El => !!n);
  const reuse = new Map<FooterItemKind, FooterItemView[]>();
  if (old) for (const r of old.rows) for (const i of rowItems(r)) reuse.set(i.kind, [...(reuse.get(i.kind) ?? []), i]);
  let sources = old ? [] : oldEls.filter((n) => n.kind === "Nav").map((n) => n.src);
  const raws = oldEls.filter((n) => n.kind === "Raw");
  let pool: Record<string, El> = { ...doc.nodes };
  let error: string | undefined;
  const item = (kind: FooterItemKind): FooterItemView | undefined => {
    const found = reuse.get(kind)?.[0];
    if (found) { reuse.set(kind, reuse.get(kind)!.slice(1)); return { ...found, hidden: new Set() }; }
    const source = kind === "Links" ? sources[0] : undefined;
    if (source !== undefined) sources = sources.slice(1);
    const made = createFooterItem(kind, env.platform, env.newId, source);
    if (!made.ok) { error ??= made.error; return undefined; }
    const [n0, kids] = made.value;
    const r = n0.kind === "Raw" ? raws.find((x) => x.label === n0.label && x.blockName === n0.blockName) : undefined;
    const n = r ? { ...n0, raw: r.raw, html: r.html, mediaId: r.mediaId } : n0;
    pool = { ...pool, ...kids, [n.id]: n };
    return { el: n, kind, hidden: new Set() };
  };
  const rows = preset.rows.map((spec): FooterRowView => {
    const prev = old?.rows.find((r) => r.kind === spec.kind);
    const cols = spec.columns.map((c, i): ColumnView => {
      const items = c.items.map(item);
      return { el: prev?.columns[i]?.el ?? section(env), align: c.align ?? "start", items: items.filter((x): x is FooterItemView => !!x) };
    });
    return { el: prev?.el ?? section(env), kind: spec.kind, divider: spec.divider ?? false, hidden: new Set(), columns: cols, extras: prev?.extras ?? [] };
  });
  if (error) return fail(error);
  const baseRoot = old ? old.root : { ...root, styles: {}, tag: "footer", align: root.align || "full" };
  return checked(writeFooter(doc, { root: baseRoot, tone: preset.tone ?? "dark", rows, extras: old?.extras ?? [], pool }));
}

/** A fresh footer document for `preset`. */
export function newFooter(preset: FooterPreset, env: Env): Doc {
  const root = el(env.newId(), "Section", { tag: "footer", align: "full", label: "Footer" });
  const r = rebuildFooter({ roots: [root.id], nodes: { [root.id]: root } }, root.id, preset, env);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

// ---- the board's view (BuilderActions.footerView) ------------------------------------------------

export interface FooterColumnView { align: FooterAlign; items: BuilderItemView[] }
export interface FooterRowViewOut { row: FooterRowKind; divider: boolean; hidden: Bp[]; columns: FooterColumnView[] }
export interface FooterView { root: string; tone: Tone; rows: FooterRowViewOut[] }

export function footerView(l: FooterLayout): FooterView {
  const sorted = (s: Set<Bp>) => BPS.filter((b) => s.has(b));
  const it = (i: FooterItemView): BuilderItemView => ({ id: i.el.id, kind: enumName(i.kind), label: i.el.label, hidden: sorted(i.hidden) });
  return { root: l.root.id, tone: l.tone, rows: l.rows.map((r) => ({ row: r.kind, divider: r.divider, hidden: sorted(r.hidden),
    columns: r.columns.map((c) => ({ align: c.align, items: c.items.map(it) })) })) };
}

export const footerKindOf = (name: string): FooterItemKind => FOOTER_ITEM_KINDS.find((k) => enumName(k) === name) ?? "Custom";
