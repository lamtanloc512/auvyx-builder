/**
 * The header builder (the Scala `HeaderBuilder`, `HeaderBuilderOps`, `HeaderBuilderPresets`, `HeaderOptions`,
 * docs/header-builder.md): rows Top / Main / Bottom × breakpoint × slots start / center / end, holding items (logo, menu,
 * search, cart…). The header stays an ordinary document: a root section, one section per breakpoint layout, three row
 * sections in each, three slot sections in each row, and the items as plain elements. `auvyx-sf-header-*` markers in className
 * let the builder read it back. Every edit is a pure function of the document; the same ids, styles and classes as the
 * Studio's (test/builder.test.ts runs both).
 */
import { type Doc, type El, el, parentOf, subtreeIds } from "./model";
import { validate } from "./docjson";
import {
  BAND, BPS, BP_LABEL, type Bp, Ctx, LINE, M0, type Platform, type Result, TONE, TONES, type Tone, base, bpOrdinal, cascade, classes,
  copySubtree, css, enumName, fail, merge, natural, ok, own, subtree, withClasses,
} from "./builderParts";

// ---- HeaderOptions -------------------------------------------------------------------------------

export type Sticky = "Off" | "On" | "Shrink";
export const STICKIES: readonly Sticky[] = ["Off", "On", "Shrink"];
export const STICKY_LABEL: Record<Sticky, string> = { Off: "Off", On: "Sticky", Shrink: "Shrink" };
export const HEADER_OVERLAY = "auvyx-header-overlay";
export const HEADER_TOP_BAR = "auvyx-header-topbar";
export interface HeaderOptions { sticky: Sticky; overlay: boolean }

export function readHeaderOptions(className: string): HeaderOptions {
  const cs = new Set(className.split(" "));
  return { sticky: cs.has("auvyx-header-shrink") ? "Shrink" : cs.has("auvyx-header-sticky") ? "On" : "Off", overlay: cs.has(HEADER_OVERLAY) };
}

/** Shrink is sticky too, so it carries both tokens. */
export function writeHeaderOptions(className: string, o: HeaderOptions): string {
  const rest = className.split(" ").filter((c) => c && !["auvyx-header-sticky", "auvyx-header-shrink", HEADER_OVERLAY].includes(c));
  const tokens = o.sticky === "On" ? ["auvyx-header-sticky"] : o.sticky === "Shrink" ? ["auvyx-header-sticky", "auvyx-header-shrink"] : [];
  return [...rest, ...tokens, ...(o.overlay ? [HEADER_OVERLAY] : [])].join(" ");
}

// ---- NavDept / NavDrawer (the class tokens the new items carry) -----------------------------------

export const NAV_DEPT_LABEL = "Shop by categories";
export const navDeptWrite = (className: string, on: boolean, home: boolean) =>
  [...className.split(" ").filter((c) => c && c !== "auvyx-nav-dept" && c !== "auvyx-nav-dept-home"), ...(on ? ["auvyx-nav-dept"] : []), ...(on && home ? ["auvyx-nav-dept-home"] : [])].join(" ");

const DRAWER_STYLES = ["dropdown", "left", "right", "full", "sheet"];
export function navDrawerWrite(className: string, o: { style?: string; width?: string; backdrop?: string; fold?: boolean }): string {
  const { style = "dropdown", width = "default", backdrop = "dim", fold = false } = o;
  const rest = className.split(" ").filter((c) => c && !c.startsWith("auvyx-drawer-"));
  const drawer = style !== "dropdown" && DRAWER_STYLES.includes(style);
  const tokens = !drawer ? [] : [
    `auvyx-drawer-${style}`,
    ...(width !== "default" && ["narrow", "wide"].includes(width) ? [`auvyx-drawer-w-${width}`] : []),
    ...(backdrop !== "dim" && ["blur", "none"].includes(backdrop) ? [`auvyx-drawer-bg-${backdrop}`] : []),
    ...(fold ? ["auvyx-drawer-fold"] : []),
  ];
  return [...rest, ...tokens].join(" ");
}

// ---- vocabulary ----------------------------------------------------------------------------------

export const HEADER_MARKER = "auvyx-sf-header-builder";

export type RowKind = "top" | "main" | "bottom";
export const ROWS: readonly RowKind[] = ["top", "main", "bottom"];
export const ROW_LABEL: Record<RowKind, string> = { top: "Top bar", main: "Main row", bottom: "Bottom row" };

export type Align = "start" | "center" | "end" | "between";
export const ALIGNS: readonly Align[] = ["start", "center", "end", "between"];
const JUSTIFY: Record<Align, string> = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" };

export type Slot = "start" | "center" | "end";
export const SLOTS: readonly Slot[] = ["start", "center", "end"];
export const SLOT_LABEL: Record<Slot, string> = { start: "Start", center: "Center", end: "End" };
const SLOT_ALIGN: Record<Slot, Align> = { start: "start", center: "center", end: "end" };
const SLOT_COLUMN: Record<Slot, number> = { start: 1, center: 2, end: 3 };

/** What the tablet shows: the desktop layout, the mobile one, or a layout of its own. */
export type TabletMode = "desktop" | "mobile" | "own";
export const TABLET_MODES: readonly TabletMode[] = ["desktop", "mobile", "own"];

export type MenuRole = "main" | "category";
const MENU_ROLES: readonly MenuRole[] = ["main", "category"];
const ROLE_DEFAULT: Record<MenuRole, string> = { main: "pages", category: "categories" };

/** Item kinds by their Scala names (the action layer's snake names come from enumName). */
export type ItemKind =
  | "Logo" | "Menu" | "Category" | "SearchIcon" | "SearchField" | "Account" | "Cart" | "Wishlist" | "Compare" | "Social" | "Text"
  | "Html" | "Component" | "MenuButton" | "Custom";
export const ITEM_KINDS: readonly ItemKind[] = [
  "Logo", "Menu", "Category", "SearchIcon", "SearchField", "Account", "Cart", "Wishlist", "Compare", "Social", "Text", "Html", "Component", "MenuButton", "Custom",
];
export const ITEM: Record<ItemKind, { token: string; label: string; role?: MenuRole }> = {
  Logo: { token: "logo", label: "Logo" },
  Menu: { token: "menu", label: "Menu", role: "main" },
  Category: { token: "category", label: "Category menu", role: "category" },
  SearchIcon: { token: "search-icon", label: "Search" },
  SearchField: { token: "search-field", label: "Search" },
  Account: { token: "account", label: "Account" },
  Cart: { token: "cart", label: "Cart" },
  Wishlist: { token: "wishlist", label: "Wishlist" },
  Compare: { token: "compare", label: "Compare" },
  Social: { token: "social", label: "Social" },
  Text: { token: "text", label: "Text" },
  Html: { token: "html", label: "HTML" },
  Component: { token: "component", label: "Component" },
  MenuButton: { token: "menu-button", label: "Menu button", role: "main" },
  Custom: { token: "", label: "Element" },
};

/** Row heights a builder header may have (px). */
export const HEIGHTS: readonly number[] = [32, 36, 40, 44, 48, 56, 64, 72, 80, 96];

export function defaultHeight(bp: Bp, row: RowKind): number {
  if (row === "top") return 36;
  if (row === "main") return bp === "desktop" ? 72 : bp === "tablet" ? 64 : 56;
  return 48;
}

const mk = (s: string) => `auvyx-sf-header-${s}`;
const tabletMarker = (t: TabletMode) => mk(`tablet-${t}`);
const bpMarker = (b: Bp) => mk(`bp-${b}`);
const rowMarker = (r: RowKind) => mk(`row-${r}`);
const slotMarker = (s: Slot) => mk(`slot-${s}`);
const alignMarker = (a: Align) => mk(`align-${a}`);
const itemMarker = (k: ItemKind) => mk(`item-${ITEM[k].token}`);
const hideMarker = (b: Bp) => mk(`hide-${b}`);
const heightMarker = (h: number) => mk(`h-${h}`);
const toneMarker = (t: Tone) => mk(`tone-${t}`);
const DIVIDER = mk("divider");

/** The serialization vocabulary (anatomy.json `header.markers`). */
export const HEADER_MARKERS: ReadonlySet<string> = new Set([
  HEADER_MARKER, DIVIDER, ...TABLET_MODES.map(tabletMarker), ...BPS.map(bpMarker), ...ROWS.map(rowMarker), ...SLOTS.map(slotMarker),
  ...ALIGNS.map(alignMarker), ...ITEM_KINDS.filter((k) => ITEM[k].token).map(itemMarker), ...BPS.map(hideMarker), ...HEIGHTS.map(heightMarker),
  ...TONES.map(toneMarker),
]);

// ---- the model -----------------------------------------------------------------------------------

export interface Binding { src: string; bind: Record<string, string> }
export interface ItemView { el: El; kind: ItemKind; hidden: Set<Bp> }
export interface SlotView { el: El; slot: Slot; align: Align; items: ItemView[] }
export interface RowView { el: El; kind: RowKind; height: number; tone: Tone; divider: boolean; hidden: Set<Bp>; slots: SlotView[]; extras: string[] }
export interface TreeView { el: El; bp: Bp; rows: RowView[]; extras: string[] }
export interface HeaderLayout {
  root: El; tablet: TabletMode; options: HeaderOptions; trees: TreeView[]; extras: string[]; pool: Record<string, El>;
}

const rowItems = (r: RowView) => r.slots.flatMap((s) => s.items);
const treeItems = (t: TreeView) => t.rows.flatMap(rowItems);
export const layoutItems = (l: HeaderLayout) => l.trees.flatMap(treeItems);
const treeOf = (l: HeaderLayout, bp: Bp) => l.trees.find((t) => t.bp === bp);

/** The layout a breakpoint shows (the tablet follows the desktop or mobile one unless it has its own). */
export const treeFor = (l: HeaderLayout, bp: Bp): Bp =>
  bp === "tablet" ? (l.tablet === "desktop" ? "desktop" : l.tablet === "mobile" ? "mobile" : "tablet") : bp;
export const covers = (l: HeaderLayout, tree: Bp): Set<Bp> => new Set(BPS.filter((b) => treeFor(l, b) === tree));

export function findItem(l: HeaderLayout, item: string): [TreeView, RowView, SlotView, ItemView] | undefined {
  for (const t of l.trees) for (const r of t.rows) for (const s of r.slots) for (const i of s.items) if (i.el.id === item) return [t, r, s, i];
  return undefined;
}

const itemVisible = (l: HeaderLayout, t: TreeView, i: ItemView, bp: Bp) => covers(l, t.bp).has(bp) && !i.hidden.has(bp);
const rowVisible = (l: HeaderLayout, t: TreeView, r: RowView, bp: Bp) =>
  covers(l, t.bp).has(bp) && !r.hidden.has(bp) && rowItems(r).some((i) => itemVisible(l, t, i, bp));

/** The header's height at a width: the sum of the rows shown there. */
export function headerHeight(l: HeaderLayout, bp: Bp): number {
  const t = treeOf(l, treeFor(l, bp));
  return t ? t.rows.filter((r) => rowVisible(l, t, r, bp)).reduce((a, r) => a + r.height, 0) : 0;
}

/** Each menu role's binding (source and data bindings), from its first placement, desktop first. */
export function menus(l: HeaderLayout): Map<MenuRole, Binding> {
  const out = new Map<MenuRole, Binding>();
  const items = layoutItems(l);
  for (const role of MENU_ROLES) {
    const i = items.find((x) => ITEM[x.kind].role === role);
    if (i) out.set(role, { src: i.el.src, bind: i.el.bind });
  }
  return out;
}

// ---- reading -------------------------------------------------------------------------------------

export const isHeaderBuilder = (className: string) => classes(className).includes(HEADER_MARKER);

/** The builder layout of the header rooted at `rootId`; undefined when it is not a builder header. */
export function readHeader(doc: Doc, rootId: string): HeaderLayout | undefined {
  const root = doc.nodes[rootId];
  if (!root || root.kind !== "Section" || !isHeaderBuilder(root.className)) return undefined;
  const rcs = new Set(classes(root.className));
  const sections = (ids: readonly string[]) => ids.map((i) => doc.nodes[i]).filter((n): n is El => !!n);
  const hidden = (cs: Set<string>) => new Set(BPS.filter((b) => cs.has(hideMarker(b))));
  const item = (n: El): ItemView => {
    const cs = new Set(classes(n.className));
    const kind = ITEM_KINDS.find((k) => ITEM[k].token && cs.has(itemMarker(k))) ?? "Custom";
    return { el: n, kind, hidden: kind === "Custom" ? new Set() : hidden(cs) };
  };
  const slot = (n: El, s: Slot): SlotView => {
    const cs = new Set(classes(n.className));
    return { el: n, slot: s, align: ALIGNS.find((a) => cs.has(alignMarker(a))) ?? SLOT_ALIGN[s], items: sections(n.children).map(item) };
  };
  const row = (n: El, bp: Bp, r: RowKind): RowView => {
    const cs = new Set(classes(n.className));
    const kids = sections(n.children);
    const slots = SLOTS.flatMap((s) => { const k = kids.find((x) => x.kind === "Section" && classes(x.className).includes(slotMarker(s))); return k ? [slot(k, s)] : []; });
    const ids = new Set(slots.map((s) => s.el.id));
    return {
      el: n, kind: r, height: HEIGHTS.find((h) => cs.has(heightMarker(h))) ?? defaultHeight(bp, r), tone: TONES.find((t) => cs.has(toneMarker(t))) ?? "plain",
      divider: cs.has(DIVIDER), hidden: hidden(cs), slots, extras: n.children.filter((c) => !ids.has(c)),
    };
  };
  const tree = (n: El, bp: Bp): TreeView => {
    const kids = sections(n.children);
    const rows = ROWS.flatMap((r) => { const k = kids.find((x) => x.kind === "Section" && classes(x.className).includes(rowMarker(r))); return k ? [row(k, bp, r)] : []; });
    const ids = new Set(rows.map((r) => r.el.id));
    return { el: n, bp, rows, extras: n.children.filter((c) => !ids.has(c)) };
  };
  const kids = sections(root.children);
  const trees = BPS.flatMap((b) => { const k = kids.find((x) => x.kind === "Section" && classes(x.className).includes(bpMarker(b))); return k ? [tree(k, b)] : []; });
  const ids = new Set(trees.map((t) => t.el.id));
  return {
    root, tablet: TABLET_MODES.find((t) => rcs.has(tabletMarker(t))) ?? "mobile", options: readHeaderOptions(root.className), trees,
    extras: root.children.filter((c) => !ids.has(c)), pool: { ...doc.nodes },
  };
}

// ---- writing -------------------------------------------------------------------------------------

const COMMERCE_MARKERS = new Set([
  "auvyx-sf-header-config-v2", ...["marketplace", "compact", "centered", "utility", "nav-first", "boutique"].map((l) => `auvyx-sf-header-layout-${l}`),
  ...["dropdown", "flyout", "mega", "drawer"].map((p) => `auvyx-sf-header-menu-${p}`), ...["off", "icon", "field"].map((s) => `auvyx-sf-header-search-${s}`),
  "auvyx-sf-header-has-topbar", "auvyx-sf-header-has-account", "auvyx-sf-header-has-wishlist", "auvyx-sf-header-has-cart", "auvyx-sf-header-is-sticky", "auvyx-sf-header-home-expanded",
]);
const legacyClass = (c: string) =>
  c === "auvyx-hv" || c.startsWith("auvyx-hv-") || COMMERCE_MARKERS.has(c) || ["auvyx-header-sticky", "auvyx-header-shrink", HEADER_OVERLAY].includes(c);
const ownClass = (c: string) => HEADER_MARKERS.has(c) || c === HEADER_TOP_BAR;

const ROOT_KEYS = new Set(["display", "flex-direction", "width"]);
const TREE_KEYS = new Set(["display", "flex-direction"]);
const ROW_KEYS = new Set(["display", "grid-template-columns", "align-items", "gap", "min-height", "box-sizing", "padding-inline-start",
  "padding-inline-end", "position", "background-color", "color", "border-block-end"]);
const SLOT_KEYS = new Set(["display", "align-items", "justify-content", "gap", "min-width", "flex-wrap", "grid-column", "grid-row"]);
const ITEM_KEYS = new Set(["display", "flex", "min-width", "overflow", "width"]);

/** One grid track per slot (see the Scala `tracks`). */
export function tracks(row: RowView, shown: (i: ItemView) => boolean): string {
  const items = (s: Slot) => (row.slots.find((x) => x.slot === s)?.items ?? []).filter(shown);
  const has = (s: Slot, k: ItemKind) => items(s).some((i) => i.kind === k);
  const fill = SLOTS.some((s) => has(s, "SearchField"));
  return SLOTS.map((s) => {
    if (fill) return has(s, "SearchField") ? "minmax(0,1fr)" : has(s, "Logo") ? "minmax(0,auto)" : "auto";
    if (s === "center") return "minmax(0,auto)";
    return has(s, "Logo") ? "minmax(0,1fr)" : "minmax(min-content,1fr)";
  }).join(" ");
}

const per = (f: (b: Bp) => string | undefined) => BPS.map(f);

/** The document with `layout` written back under its root. */
export function writeHeader(doc: Doc, l: HeaderLayout): Doc {
  const out: Record<string, El> = {};
  const put = (e: El) => { out[e.id] = e; return e.id; };
  const keep = (id: string) => { for (const k of subtree(l.pool, id)) out[k] = l.pool[k]!; return id; };
  const item = (t: TreeView, i: ItemView): string => {
    if (i.kind === "Custom") return keep(i.el.id);
    i.el.children.forEach(keep);
    const cov = covers(l, t.bp);
    const display = cascade("display", per((b) => (cov.has(b) ? (i.hidden.has(b) ? "none" : natural(i.el)) : undefined)));
    const sizing = i.kind === "Logo" ? base(["flex", "0 1 auto"], ["min-width", "0"], ["overflow", "hidden"])
      : i.kind === "SearchField" ? base(["flex", "1 1 auto"], ["min-width", "0"], ["width", "100%"]) : base(["flex", "none"]);
    return put({ ...i.el, className: withClasses(i.el.className, ownClass, [itemMarker(i.kind), ...BPS.filter((b) => i.hidden.has(b)).map(hideMarker)]),
      styles: own(i.el.styles, ITEM_KEYS, merge(display, sizing)) });
  };
  const slot = (t: TreeView, s: SlotView): string => {
    const kids = s.items.map((i) => item(t, i));
    return put({ ...s.el, className: withClasses(s.el.className, ownClass, [slotMarker(s.slot), ...(s.align !== SLOT_ALIGN[s.slot] ? [alignMarker(s.align)] : [])]),
      label: s.el.label || SLOT_LABEL[s.slot], children: kids,
      styles: own(s.el.styles, SLOT_KEYS, base(["display", "flex"], ["align-items", "center"], ["justify-content", JUSTIFY[s.align]], ["gap", "16px"],
        ["min-width", "0"], ["flex-wrap", "nowrap"], ["grid-column", String(SLOT_COLUMN[s.slot])], ["grid-row", "1"])) });
  };
  const row = (t: TreeView, r: RowView): string => {
    const kids = [...[...r.slots].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)).map((s) => slot(t, s)), ...r.extras.map(keep)];
    const cov = covers(l, t.bp);
    const display = cascade("display", per((b) => (cov.has(b) ? (rowVisible(l, t, r, b) ? "grid" : "none") : undefined)));
    const grid = cascade("grid-template-columns", per((b) => (cov.has(b) ? tracks(r, (i) => itemVisible(l, t, i, b)) : undefined)));
    const look = { base: [["align-items", "center"], ["gap", "16px"], ["min-height", `${r.height}px`], ["box-sizing", "border-box"],
      ["padding-inline-start", BAND], ["padding-inline-end", BAND], ["position", "relative"], ["background-color", TONE[r.tone].background], ["color", TONE[r.tone].text],
      ...(r.divider ? [["border-block-end", `1px solid ${LINE}`]] : [])] as [string, string][] };
    const marks = [rowMarker(r.kind), heightMarker(r.height), toneMarker(r.tone), ...(r.divider ? [DIVIDER] : []),
      ...BPS.filter((b) => r.hidden.has(b)).map(hideMarker), ...(r.kind === "top" ? [HEADER_TOP_BAR] : [])];
    return put({ ...r.el, className: withClasses(r.el.className, ownClass, marks), label: r.el.label || ROW_LABEL[r.kind], children: kids,
      styles: own(r.el.styles, ROW_KEYS, merge(display, grid, look)) });
  };
  const tree = (t: TreeView): string => {
    const kids = [...[...t.rows].sort((a, b) => ROWS.indexOf(a.kind) - ROWS.indexOf(b.kind)).map((r) => row(t, r)), ...t.extras.map(keep)];
    const cov = covers(l, t.bp);
    const display = cascade("display", per((b) => (cov.has(b) ? "flex" : "none")));
    return put({ ...t.el, className: withClasses(t.el.className, ownClass, [bpMarker(t.bp)]), label: t.el.label || `${BP_LABEL[t.bp]} header`, children: kids,
      styles: own(t.el.styles, TREE_KEYS, merge(display, base(["flex-direction", "column"]))) });
  };
  const kids = [...[...l.trees].sort((a, b) => bpOrdinal(a.bp) - bpOrdinal(b.bp)).map(tree), ...l.extras.map(keep)];
  const rootClass = writeHeaderOptions(withClasses(l.root.className, (c) => ownClass(c) || legacyClass(c), [HEADER_MARKER, tabletMarker(l.tablet)]), l.options);
  put({ ...l.root, className: rootClass, children: kids, styles: own(l.root.styles, ROOT_KEYS, base(["display", "flex"], ["flex-direction", "column"], ["width", "100%"])) });
  const nodes: Record<string, El> = { ...doc.nodes };
  for (const id of subtreeIds(doc, l.root.id)) delete nodes[id];
  return { ...doc, nodes: { ...nodes, ...out } };
}

// ---- items ---------------------------------------------------------------------------------------

/** Why an item cannot go somewhere, or undefined. */
export function refuse(kind: ItemKind, platform: Platform, _tree: Bp, cov: Set<Bp>): string | undefined {
  if (kind === "Custom") return "Only builder items can be added";
  if (kind === "Compare" && platform === "ezy") return "EzyPlatform has no product comparison";
  if (kind === "MenuButton" && cov.has("desktop")) return "The menu button is for tablet and mobile layouts; use Menu on desktop";
  return undefined;
}

const LOGO_CSS = "& a{max-width:100%;min-width:0}& :is(.auvyx-ezy-site-name,.wp-block-site-title,.wp-block-site-title a){display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}";

/** A new item: WordPress's own block where it has one (logo, search, account, cart), plain elements otherwise. */
export function createItem(kind: ItemKind, platform: Platform, newId: () => string, menu?: Binding, text?: string, ref = 0): Result<[El, Record<string, El>]> {
  if (platform === "ezy") return fail("EzyPlatform's header items are made in Auvyx Studio");
  const c = new Ctx(newId);
  const nav = (role: MenuRole, toggle: string, s: ReturnType<typeof css>) => c.nav(menu?.src ?? ROLE_DEFAULT[role], toggle, s);
  let id: string;
  switch (kind) {
    case "Logo": id = c.block("core/site-title", "Site title", '{"level":0}'); break;
    case "Menu": id = nav("main", "never", css(["font-size", "0.9375rem"], ["font-weight", "500"], ["position", "static"])); break;
    case "Category": id = c.classed(navDeptWrite("", true, true), nav("category", "never", css(["font-size", "0.9375rem"], ["font-weight", "600"]))); break;
    case "MenuButton": id = c.classed(navDrawerWrite("", { style: "left", backdrop: "blur" }), nav("main", "tablet", css(["position", "static"]))); break;
    case "SearchIcon": id = c.block("core/search", "Search", '{"buttonPosition":"button-only","buttonUseIcon":true,"showLabel":false}'); break;
    case "SearchField": id = c.block("core/search", "Search", '{"buttonPosition":"button-inside","buttonUseIcon":true,"showLabel":false,"placeholder":"Search products…"}'); break;
    case "Account": id = c.block("woocommerce/customer-account", "Account"); break;
    case "Cart": id = c.block("woocommerce/mini-cart", "Cart"); break;
    case "Wishlist": id = c.block("auvyx-woo/wishlist-link", "Wishlist"); break;
    case "Compare": id = c.icon("layers", css(["color", "inherit"], ["font-size", "1.25rem"]), "/compare"); break;
    case "Social":
      id = c.div(css(["display", "flex"], ["align-items", "center"], ["gap", "14px"]),
        ...["facebook", "instagram", "youtube"].map((n) => c.icon(n, css(["font-size", "1.125rem"], ["color", "inherit"]), "#")));
      break;
    case "Text": id = c.text(text ?? "Free shipping on orders over $50 · 30-day returns", css(["font-size", "0.8125rem"], ["white-space", "nowrap"], ...M0)); break;
    case "Html": id = c.keep("core/html", "<!-- wp:html -->\n<span>Your HTML</span>\n<!-- /wp:html -->", "<span>Your HTML</span>"); break;
    case "Component":
      if (ref <= 0) return fail("A component item needs the component's id");
      id = c.block("core/block", "Component", `{"ref":${ref}}`);
      break;
    default: return fail("Only builder items can be created");
  }
  c.named(ITEM[kind].label, id);
  let n = c.nodes[id]!;
  if (menu && ITEM[kind].role) n = { ...n, bind: menu.bind };
  if (kind === "Logo") n = { ...n, css: LOGO_CSS };
  else if (kind === "Category") n = { ...n, text: NAV_DEPT_LABEL };
  const rest = { ...c.nodes };
  delete rest[id];
  return ok([n, rest]);
}

// ---- presets -------------------------------------------------------------------------------------

export interface RowSpec { kind: RowKind; start?: ItemKind[]; center?: ItemKind[]; end?: ItemKind[]; height?: number; tone?: Tone; divider?: boolean }
export interface HeaderPreset {
  id: string; label: string; hint: string; desktop: RowSpec[]; mobile: RowSpec[]; tablet?: TabletMode; tabletRows?: RowSpec[]; sticky?: Sticky;
}
export const specSlot = (r: RowSpec, s: Slot): ItemKind[] => (s === "start" ? r.start : s === "center" ? r.center : r.end) ?? [];
const presetRows = (p: HeaderPreset, bp: Bp) => (bp === "desktop" ? p.desktop : bp === "tablet" ? p.tabletRows ?? [] : p.mobile);
const presetLayouts = (p: HeaderPreset): Bp[] => ["desktop", ...((p.tablet ?? "mobile") === "own" ? ["tablet" as Bp] : []), "mobile"];
const mapPreset = (p: HeaderPreset, f: (k: ItemKind[]) => ItemKind[]): HeaderPreset => {
  const m = (r: RowSpec): RowSpec => ({ ...r, start: f(r.start ?? []), center: f(r.center ?? []), end: f(r.end ?? []) });
  return { ...p, desktop: p.desktop.map(m), mobile: p.mobile.map(m), tabletRows: (p.tabletRows ?? []).map(m) };
};

const phone: RowSpec[] = [{ kind: "main", start: ["MenuButton"], center: ["Logo"], end: ["SearchIcon", "Cart"] }];
const phoneWithSearch: RowSpec[] = [...phone, { kind: "bottom", start: ["SearchField"], height: 56 }];

/** The six storefront layouts. */
export const HEADER_PRESETS: readonly HeaderPreset[] = [
  { id: "marketplace", label: "Marketplace", hint: "Logo, a wide search and the shop's icons; categories and the menu on the row below",
    desktop: [{ kind: "main", start: ["Logo"], center: ["SearchField"], end: ["Account", "Wishlist", "Cart"] }, { kind: "bottom", start: ["Category", "Menu"], divider: false, tone: "muted" }],
    mobile: phoneWithSearch },
  { id: "compact", label: "Compact", hint: "One row: logo and menu, then search, account and cart",
    desktop: [{ kind: "main", start: ["Logo", "Menu"], end: ["SearchIcon", "Account", "Cart"], height: 64 }], mobile: phone },
  { id: "centered", label: "Centered", hint: "Logo in the middle, icons on both sides, the menu centred below",
    desktop: [{ kind: "main", start: ["SearchIcon"], center: ["Logo"], end: ["Account", "Wishlist", "Cart"] }, { kind: "bottom", center: ["Menu"], divider: true }], mobile: phone },
  { id: "utility", label: "Utility", hint: "A top bar with a message and links, the main row with search, then categories and the menu",
    desktop: [{ kind: "top", start: ["Text"], end: ["Social"], tone: "dark" }, { kind: "main", start: ["Logo"], center: ["SearchField"], end: ["Account", "Cart"] },
      { kind: "bottom", start: ["Category", "Menu"], divider: true }], mobile: phoneWithSearch },
  { id: "nav-first", label: "Nav-first", hint: "Logo, menu and icons; a full-width search on its own row",
    desktop: [{ kind: "main", start: ["Logo"], center: ["Menu"], end: ["Account", "Cart"] }, { kind: "bottom", center: ["SearchField"], height: 56, tone: "muted" }], mobile: phoneWithSearch },
  { id: "boutique", label: "Boutique", hint: "Menu, a centred logo, and search on demand",
    desktop: [{ kind: "main", start: ["Menu"], center: ["Logo"], end: ["SearchIcon", "Account", "Cart"], height: 80 }], mobile: phone },
];

/** HeaderPresets.Variant: the legacy ready headers. */
export type Variant = "classic" | "store" | "centered" | "split" | "minimal" | "megastore";
export const VARIANT_HINT: Record<Variant, string> = {
  classic: "Logo left, menu in the middle, icons right",
  store: "Logo, a wide search and icons; the menu on a row below",
  centered: "Logo in the middle, menu on a row below",
  split: "Menu left, logo in the middle, icons right",
  minimal: "Logo left; menu and icons together on the right",
  megastore: "Promo and links on top; logo, a wide search with categories and icons; a Shop by categories button and the menu below",
};
const legacyPhone: RowSpec[] = [{ kind: "main", start: ["MenuButton", "Logo"], end: ["SearchIcon", "Account", "Cart"], height: 64 }];
export const HEADER_LEGACY_LAYOUTS: readonly [Variant, HeaderPreset][] = [
  ["classic", { id: "legacy-classic", label: "Classic", hint: VARIANT_HINT.classic,
    desktop: [{ kind: "main", start: ["Logo"], center: ["Menu"], end: ["SearchIcon", "Account", "Wishlist", "Cart"] }], mobile: legacyPhone }],
  ["store", { id: "legacy-store", label: "Store", hint: VARIANT_HINT.store,
    desktop: [{ kind: "main", start: ["Logo"], center: ["SearchField"], end: ["Account", "Wishlist", "Cart"] }, { kind: "bottom", start: ["Menu"], divider: true }], mobile: legacyPhone }],
  ["centered", { id: "legacy-centered", label: "Centered", hint: VARIANT_HINT.centered,
    desktop: [{ kind: "main", start: ["SearchIcon"], center: ["Logo"], end: ["Account", "Wishlist", "Cart"] }, { kind: "bottom", center: ["Menu"], divider: true }], mobile: legacyPhone }],
  ["split", { id: "legacy-split", label: "Split", hint: VARIANT_HINT.split,
    desktop: [{ kind: "main", start: ["Menu"], center: ["Logo"], end: ["SearchIcon", "Account", "Wishlist", "Cart"] }], mobile: legacyPhone }],
  ["minimal", { id: "legacy-minimal", label: "Minimal", hint: VARIANT_HINT.minimal,
    desktop: [{ kind: "main", start: ["Logo"], end: ["Menu", "SearchIcon", "Account", "Wishlist", "Cart"] }], mobile: legacyPhone }],
  ["megastore", { id: "legacy-megastore", label: "Megastore", hint: VARIANT_HINT.megastore,
    desktop: [{ kind: "main", start: ["Logo"], center: ["SearchField"], end: ["Account", "Wishlist", "Cart"] }, { kind: "bottom", start: ["Category", "Menu"], divider: true }], mobile: legacyPhone }],
];

/** A ready (legacy) header's configuration, read from its root's class tokens (HeaderPresets.read), what conversion needs. */
export interface LegacyHeader {
  variant: Variant; topBar: boolean; search: "off" | "icon" | "field"; account: boolean; wishlist: boolean; cart: boolean; dark: boolean; sticky: Sticky;
  /** A commerce v2 header's layout token, when it is one. */
  commerce?: string;
}
const VARIANTS: readonly Variant[] = ["classic", "store", "centered", "split", "minimal", "megastore"];
export function readLegacyHeader(className: string): LegacyHeader | undefined {
  const cs = new Set(className.split(/\s+/));
  const base: LegacyHeader = { variant: "store", topBar: true, search: "field", account: true, wishlist: false, cart: true, dark: false, sticky: "Shrink" };
  if (cs.has("auvyx-sf-header-config-v2"))
    return { ...base, commerce: ["marketplace", "compact", "centered", "utility", "nav-first", "boutique"].find((l) => cs.has(`auvyx-sf-header-layout-${l}`)) ?? "marketplace" };
  const cs1 = new Set(className.split(" "));
  if (!cs1.has("auvyx-hv")) return undefined;
  return {
    variant: VARIANTS.find((v) => cs1.has(`auvyx-hv-${v}`)) ?? "store", topBar: cs1.has("auvyx-hv-topbar"),
    search: cs1.has("auvyx-hv-search-icon") ? "icon" : cs1.has("auvyx-hv-search-field") ? "field" : "off",
    account: !cs1.has("auvyx-hv-no-account"), wishlist: cs1.has("auvyx-hv-wishlist"), cart: !cs1.has("auvyx-hv-no-cart"), dark: cs1.has("auvyx-hv-dark"),
    sticky: readHeaderOptions(className).sticky,
  };
}

/** A legacy configuration as a builder preset: the variant's rows, with the parts it switched off removed. */
export function legacyPreset(cfg: LegacyHeader): HeaderPreset {
  const p = (HEADER_LEGACY_LAYOUTS.find(([v]) => v === cfg.variant) ?? HEADER_LEGACY_LAYOUTS[0]!)[1];
  const parts = (items: ItemKind[]) => items.flatMap((k): ItemKind[] => {
    if ((k === "SearchIcon" || k === "SearchField") && cfg.search === "off") return [];
    if (k === "SearchField" && cfg.search === "icon") return ["SearchIcon"];
    if (k === "Account" && !cfg.account) return [];
    if (k === "Wishlist" && !cfg.wishlist) return [];
    if (k === "Cart" && !cfg.cart) return [];
    return [k];
  });
  const tone: Tone = cfg.dark ? "dark" : "plain";
  const shaped = mapPreset(p, parts);
  const top: RowSpec[] = cfg.topBar ? [{ kind: "top", start: ["Text"], tone: cfg.dark ? "plain" : "dark" }] : [];
  return { ...shaped, desktop: [...top, ...shaped.desktop.map((r) => ({ ...r, tone }))], mobile: shaped.mobile.map((r) => ({ ...r, tone })), sticky: cfg.sticky };
}

export const headerPresetById = (id: string) => [...HEADER_PRESETS, ...HEADER_LEGACY_LAYOUTS.map(([, p]) => p)].find((p) => p.id === id);

// ---- edits (HeaderBuilderOps) --------------------------------------------------------------------

export interface Env { newId: () => string; platform: Platform }

const NOT_BUILDER = "This header is not a builder header: pick a builder preset first";
export const NO_HEADER = "This document has no header";

const checked = (doc: Doc): Result<Doc> => { const why = validate(doc); return why ? fail(why) : ok(doc); };

export function editHeader(doc: Doc, rootId: string, f: (l: HeaderLayout) => Result<HeaderLayout>): Result<Doc> {
  const l = readHeader(doc, rootId);
  if (!l) return fail(NOT_BUILDER);
  const r = f(l);
  return r.ok ? checked(writeHeader(doc, r.value)) : r;
}

const section = (env: Env) => el(env.newId(), "Section", { tag: "div" });
const emptySlot = (s: Slot, env: Env): SlotView => ({ el: section(env), slot: s, align: SLOT_ALIGN[s], items: [] });
const emptyRow = (bp: Bp, r: RowKind, env: Env): RowView => {
  const e = section(env);
  return { el: e, kind: r, height: defaultHeight(bp, r), tone: "plain", divider: false, hidden: new Set(), slots: SLOTS.map((s) => emptySlot(s, env)), extras: [] };
};

const mapTree = (l: HeaderLayout, bp: Bp, env: Env, f: (t: TreeView) => Result<TreeView>): Result<HeaderLayout> => {
  const r = f(treeOf(l, bp) ?? { el: section(env), bp, rows: [], extras: [] });
  return r.ok ? ok({ ...l, trees: [...l.trees.filter((t) => t.bp !== bp), r.value].sort((a, b) => bpOrdinal(a.bp) - bpOrdinal(b.bp)) }) : r;
};
const mapRow = (t: TreeView, kind: RowKind, env: Env, f: (r: RowView) => Result<RowView>): Result<TreeView> => {
  const r = f(t.rows.find((x) => x.kind === kind) ?? emptyRow(t.bp, kind, env));
  return r.ok ? ok({ ...t, rows: [...t.rows.filter((x) => x.kind !== kind), r.value].sort((a, b) => ROWS.indexOf(a.kind) - ROWS.indexOf(b.kind)) }) : r;
};
const mapSlot = (row: RowView, s: Slot, env: Env, f: (v: SlotView) => Result<SlotView>): Result<RowView> => {
  const r = f(row.slots.find((x) => x.slot === s) ?? emptySlot(s, env));
  return r.ok ? ok({ ...row, slots: [...row.slots.filter((x) => x.slot !== s), r.value].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)) }) : r;
};
const at = (l: HeaderLayout, bp: Bp, r: RowKind, s: Slot, env: Env, f: (v: SlotView) => Result<SlotView>) =>
  mapTree(l, treeFor(l, bp), env, (t) => mapRow(t, r, env, (row) => mapSlot(row, s, env, f)));

const mapItems = (l: HeaderLayout, f: (i: ItemView) => ItemView): HeaderLayout =>
  ({ ...l, trees: l.trees.map((t) => ({ ...t, rows: t.rows.map((r) => ({ ...r, slots: r.slots.map((s) => ({ ...s, items: s.items.map(f) })) })) })) });
const without = (l: HeaderLayout, item: string): HeaderLayout =>
  ({ ...l, trees: l.trees.map((t) => ({ ...t, rows: t.rows.map((r) => ({ ...r, slots: r.slots.map((s) => ({ ...s, items: s.items.filter((i) => i.el.id !== item) })) })) })) });
const insertAt = <T>(items: T[], item: T, index?: number): T[] => {
  const i = index === undefined ? items.length : Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, i), item, ...items.slice(i)];
};
const minus = (s: Set<Bp>, b: Bp) => new Set([...s].filter((x) => x !== b));
const plus = (s: Set<Bp>, b: Bp) => new Set([...s, b]);
const toggled = (s: Set<Bp>, b: Bp, on: boolean) => (on ? minus(s, b) : plus(s, b));
const noItem = (id: string) => `No item '${id}' in this header`;

export interface AddItem { row: RowKind; bp: Bp; slot: Slot; item: ItemKind; index?: number; ref?: number }
export interface MoveItem { item: string; row: RowKind; bp: Bp; slot: Slot; index?: number }

/** Adds a new item; also answers its element id (to select it). */
export function addItem(doc: Doc, rootId: string, input: AddItem, env: Env): Result<[Doc, string]> {
  let added = "";
  const r = editHeader(doc, rootId, (l) => {
    const tree = treeFor(l, input.bp);
    const why = refuse(input.item, env.platform, tree, covers(l, tree));
    if (why) return fail(why);
    const role = ITEM[input.item].role;
    const made = createItem(input.item, env.platform, env.newId, role ? menus(l).get(role) : undefined, undefined, input.ref ?? 0);
    if (!made.ok) return made;
    const [n, kids] = made.value;
    added = n.id;
    return at({ ...l, pool: { ...l.pool, ...kids, [n.id]: n } }, input.bp, input.row, input.slot, env,
      (s) => ok({ ...s, items: insertAt(s.items, { el: n, kind: input.item, hidden: new Set<Bp>() }, input.index) }));
  });
  return r.ok ? ok([r.value, added]) : r;
}

/** Moves an item to a row and slot of the layout `bp` shows (another breakpoint layout included): its id stays. */
export function moveItem(doc: Doc, rootId: string, input: MoveItem, env: Env): Result<Doc> {
  return editHeader(doc, rootId, (l) => {
    const found = findItem(l, input.item);
    if (!found) return fail(noItem(input.item));
    const item = found[3];
    const tree = treeFor(l, input.bp);
    const cov = covers(l, tree);
    const why = item.kind === "Custom" ? undefined : refuse(item.kind, env.platform, tree, cov);
    if (why) return fail(why);
    const moved = { ...item, hidden: new Set([...item.hidden].filter((b) => cov.has(b))) };
    return at(without(l, input.item), input.bp, input.row, input.slot, env, (s) => ok({ ...s, items: insertAt(s.items, moved, input.index) }));
  });
}

export const removeItem = (doc: Doc, rootId: string, item: string): Result<Doc> =>
  editHeader(doc, rootId, (l) => (findItem(l, item) ? ok(without(l, item)) : fail(noItem(item))));

export const setRowVisible = (doc: Doc, rootId: string, input: { row: RowKind; bp: Bp; on: boolean }, env: Env): Result<Doc> =>
  editHeader(doc, rootId, (l) => mapTree(l, treeFor(l, input.bp), env, (t) => mapRow(t, input.row, env, (r) => ok({ ...r, hidden: toggled(r.hidden, input.bp, input.on) }))));

export function setItemVisible(doc: Doc, rootId: string, input: { item: string; bp: Bp; on: boolean }): Result<Doc> {
  return editHeader(doc, rootId, (l) => {
    const found = findItem(l, input.item);
    if (!found) return fail(noItem(input.item));
    const [tree, , , item] = found;
    if (item.kind === "Custom") return fail("Only builder items can be hidden per breakpoint");
    if (!covers(l, tree.bp).has(input.bp)) return fail(`This item is not in the ${BP_LABEL[input.bp].toLowerCase()} layout`);
    return ok(mapItems(l, (i) => (i.el.id === input.item ? { ...i, hidden: toggled(i.hidden, input.bp, input.on) } : i)));
  });
}

export function setRowOptions(doc: Doc, rootId: string, input: { row: RowKind; bp: Bp; height?: number; tone?: Tone; divider?: boolean }, env: Env): Result<Doc> {
  if (input.height !== undefined && !HEIGHTS.includes(input.height)) return fail(`Row heights are ${HEIGHTS.join(", ")} px`);
  return editHeader(doc, rootId, (l) => mapTree(l, treeFor(l, input.bp), env, (t) => mapRow(t, input.row, env, (r) =>
    ok({ ...r, height: input.height ?? r.height, tone: input.tone ?? r.tone, divider: input.divider ?? r.divider }))));
}

export const setSticky = (doc: Doc, rootId: string, input: { sticky: Sticky; overlay?: boolean }): Result<Doc> =>
  editHeader(doc, rootId, (l) => ok({ ...l, options: { sticky: input.sticky, overlay: input.overlay ?? l.options.overlay } }));

export const setSlotAlign = (doc: Doc, rootId: string, input: { row: RowKind; bp: Bp; slot: Slot; align: Align }, env: Env): Result<Doc> =>
  editHeader(doc, rootId, (l) => at(l, input.bp, input.row, input.slot, env, (s) => ok({ ...s, align: input.align })));

/** The tablet follows the desktop or mobile layout, or gets its own: a copy of the one it followed. */
export function setTablet(doc: Doc, rootId: string, mode: TabletMode, env: Env): Result<Doc> {
  return editHeader(doc, rootId, (l) => {
    const cleared: HeaderLayout = { ...l, trees: l.trees.map((t) => ({ ...t, rows: t.rows.map((r) => ({ ...r, hidden: minus(r.hidden, "tablet"),
      slots: r.slots.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, hidden: minus(i.hidden, "tablet") })) })) })) })) };
    if (mode === l.tablet) return ok(l);
    if (mode !== "own") return ok({ ...cleared, tablet: mode, trees: cleared.trees.filter((t) => t.bp !== "tablet") });
    const from = treeOf(l, treeFor(l, "tablet"));
    let pool = l.pool;
    const copyEl = (n: El): El => {
      const [id, nodes] = copySubtree(l.pool, n.id, env.newId);
      pool = { ...pool, ...nodes };
      return nodes[id]!;
    };
    const onlyTablet = (s: Set<Bp>) => new Set([...s].filter((b) => b === "tablet"));
    const forTablet: TreeView[] = [];
    if (from) {
      const treeEl = section(env);
      const rows = from.rows.map((r): RowView => {
        const rowEl = { ...section(env), label: r.el.label, styles: r.el.styles, className: r.el.className };
        return { ...r, el: rowEl, hidden: onlyTablet(r.hidden), extras: [], slots: r.slots.map((s) => {
          const slotEl = { ...section(env), label: s.el.label, styles: s.el.styles, className: s.el.className };
          return { ...s, el: slotEl, items: s.items.map((i) => ({ ...i, el: copyEl(i.el), hidden: onlyTablet(i.hidden) })) };
        }) };
      });
      forTablet.push({ el: treeEl, bp: "tablet", rows, extras: [] });
    }
    return ok({ ...cleared, tablet: "own", trees: [...cleared.trees.filter((t) => t.bp !== "tablet"), ...forTablet].sort((a, b) => bpOrdinal(a.bp) - bpOrdinal(b.bp)), pool });
  });
}

const SOURCE = /^[a-z][a-z0-9_-]{0,40}(:[A-Za-z0-9_-]{1,64})?$/;

/** One source for a menu role, written to every placement of it. */
export function setMenu(doc: Doc, rootId: string, input: { role: MenuRole; source: string }): Result<Doc> {
  if (!SOURCE.test(input.source)) return fail("A menu source is pages, categories, nav:ID or menu:ID");
  return editHeader(doc, rootId, (l) => ok(mapItems(l, (i) => (ITEM[i.kind].role === input.role ? { ...i, el: { ...i.el, src: input.source } } : i))));
}

/** `legacy` converts a ready (legacy or commerce v2) header as it is configured. */
export function setPreset(doc: Doc, rootId: string, preset: string, env: Env): Result<Doc> {
  let p: HeaderPreset | undefined;
  if (preset === "legacy") {
    const n = doc.nodes[rootId];
    const c = n ? readLegacyHeader(n.className) : undefined;
    if (!c) return fail("This header is not a ready header: pick a preset");
    if (c.commerce !== undefined) {
      p = headerPresetById(c.commerce);
      if (!p) return fail(`Unknown header preset '${c.commerce}'`);
    } else p = legacyPreset(c);
  } else {
    p = headerPresetById(preset);
    if (!p) return fail(`Unknown header preset '${preset}'`);
  }
  return rebuildHeader(doc, rootId, p, env);
}

/** WordPress's search block is the search icon with its button only and the search field otherwise. */
const sameShape = (old: El, kind: ItemKind) =>
  kind === "SearchIcon" ? old.raw.includes('"button-only"') : kind === "SearchField" ? !old.raw.includes('"button-only"') : true;

/** Rebuilds the header under `rootId` (builder, legacy or hand-made) as `preset` (see the Scala `rebuild`). */
export function rebuildHeader(doc: Doc, rootId: string, preset: HeaderPreset, env: Env): Result<Doc> {
  const root = doc.nodes[rootId];
  if (!root || root.kind !== "Section") return fail("Header root is missing or is not a section");
  const old = readHeader(doc, rootId);
  const oldEls = subtreeIds(doc, rootId).slice(1).map((i) => doc.nodes[i]).filter((n): n is El => !!n);
  const firstNav = oldEls.find((n) => n.kind === "Nav");
  const ms: Map<MenuRole, Binding> = old ? menus(old) : new Map(firstNav ? [["main", { src: firstNav.src, bind: firstNav.bind }]] : []);
  const legacyAnchor = old ? "" : firstNav?.anchor ?? "";
  const topText = (old ? old.trees.flatMap((t) => { const r = t.rows.find((x) => x.kind === "top"); return r ? rowItems(r) : []; }).find((i) => i.kind === "Text")?.el.text : undefined)
    ?? oldEls.find((n) => { if (n.kind !== "Text") return false; const p = parentOf(doc, n.id); return p !== null && doc.nodes[p]?.label === "Top bar"; })?.text;
  const raws = oldEls.filter((n) => n.kind === "Raw");
  const reuse = new Map<string, ItemView[]>();
  if (old) for (const t of old.trees) for (const i of treeItems(t)) { const k = `${t.bp}/${i.kind}`; reuse.set(k, [...(reuse.get(k) ?? []), i]); }
  let pool: Record<string, El> = { ...doc.nodes };
  let anchorUsed = false;
  let error: string | undefined;
  const item = (bp: Bp, row: RowKind, kind: ItemKind): ItemView | undefined => {
    const k = `${bp}/${kind}`;
    const found = reuse.get(k)?.[0];
    if (found) { reuse.set(k, reuse.get(k)!.slice(1)); return { ...found, hidden: new Set() }; }
    const text = kind === "Text" && row === "top" ? topText : undefined;
    const role = ITEM[kind].role;
    const made = createItem(kind, env.platform, env.newId, role ? ms.get(role) : undefined, text);
    if (!made.ok) { if (kind !== "Compare") error ??= made.error; return undefined; }
    const [n0, kids] = made.value;
    const r = n0.kind === "Raw" ? raws.find((x) => x.label === n0.label && x.blockName === n0.blockName && sameShape(x, kind)) : undefined;
    const carried = r ? { ...n0, raw: r.raw, html: r.html, mediaId: r.mediaId } : n0;
    let n = carried;
    if (role === "main" && legacyAnchor && !anchorUsed) { anchorUsed = true; n = { ...carried, anchor: legacyAnchor }; }
    pool = { ...pool, ...kids, [n.id]: n };
    return { el: n, kind, hidden: new Set() };
  };
  const trees = presetLayouts(preset).map((bp): TreeView => {
    const previous = old ? treeOf(old, bp) : undefined;
    const rows = ROWS.map((kind): RowView => {
      const spec = presetRows(preset, bp).find((r) => r.kind === kind) ?? { kind };
      const prevRow = previous?.rows.find((r) => r.kind === kind);
      const slots = SLOTS.map((s): SlotView => {
        const items = specSlot(spec, s).map((k) => item(bp, kind, k));
        return { el: prevRow?.slots.find((x) => x.slot === s)?.el ?? section(env), slot: s, align: SLOT_ALIGN[s], items: items.filter((i): i is ItemView => !!i) };
      });
      return { el: prevRow?.el ?? section(env), kind, height: spec.height ?? defaultHeight(bp, kind), tone: spec.tone ?? "plain", divider: spec.divider ?? false,
        hidden: new Set(), slots, extras: prevRow?.extras ?? [] };
    });
    return { el: previous?.el ?? section(env), bp, rows, extras: previous?.extras ?? [] };
  });
  if (error) return fail(error);
  const baseRoot = old ? old.root : { ...root, styles: {} };
  const layout: HeaderLayout = { root: baseRoot, tablet: preset.tablet ?? "mobile", options: { sticky: preset.sticky ?? "On", overlay: readHeaderOptions(root.className).overlay },
    trees, extras: old?.extras ?? [], pool };
  return checked(writeHeader(doc, layout));
}

/** A fresh header document for `preset`. */
export function newHeader(preset: HeaderPreset, env: Env): Doc {
  const root = el(env.newId(), "Section", { tag: "header", label: "Header" });
  const r = rebuildHeader({ roots: [root.id], nodes: { [root.id]: root } }, root.id, preset, env);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

// ---- the board's view (BuilderActions.headerView) ------------------------------------------------

export interface BuilderItemView { id: string; kind: string; label: string; hidden: Bp[] }
export interface HeaderSlotView { slot: Slot; align: Align; items: BuilderItemView[] }
export interface HeaderRowView { row: RowKind; height: number; tone: Tone; divider: boolean; hidden: Bp[]; slots: HeaderSlotView[] }
export interface HeaderTreeView { layout: Bp; shows: Bp[]; rows: HeaderRowView[] }
export interface HeaderView {
  root: string; tablet: TabletMode; sticky: string; overlay: boolean; layouts: HeaderTreeView[]; heights: Record<Bp, number>; menus: Record<string, string>;
}

const sortedBps = (s: Set<Bp>) => BPS.filter((b) => s.has(b));

export function headerView(l: HeaderLayout): HeaderView {
  const it = (i: ItemView): BuilderItemView => ({ id: i.el.id, kind: enumName(i.kind), label: i.el.label, hidden: sortedBps(i.hidden) });
  const ms = menus(l);
  return {
    root: l.root.id, tablet: l.tablet, sticky: enumName(l.options.sticky), overlay: l.options.overlay,
    layouts: l.trees.map((t) => ({ layout: t.bp, shows: sortedBps(covers(l, t.bp)), rows: t.rows.map((r) => ({
      row: r.kind, height: r.height, tone: r.tone, divider: r.divider, hidden: sortedBps(r.hidden),
      slots: r.slots.map((s) => ({ slot: s.slot, align: s.align, items: s.items.map(it) })),
    })) })),
    heights: { desktop: headerHeight(l, "desktop"), tablet: headerHeight(l, "tablet"), mobile: headerHeight(l, "mobile") },
    menus: Object.fromEntries(MENU_ROLES.filter((r) => ms.has(r)).map((r) => [r, ms.get(r)!.src])),
  };
}

export const headerKindOf = (name: string): ItemKind => ITEM_KINDS.find((k) => enumName(k) === name) ?? "Custom";
