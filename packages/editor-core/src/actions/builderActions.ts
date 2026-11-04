/**
 * The header and footer builders as registry actions (the Scala `BuilderActions` + `BuilderSchemas`): the same inputs
 * (enums in snake_case), descriptions and reports, running editor-core's builder edits (`callBuilder`, already checked
 * against the Scala core by builder.test.ts).
 */
import type { Doc } from "../model";
import { builderRoot, callBuilder } from "../builderActions";
import { ITEM, ROW_LABEL, headerKindOf, headerView, readHeader } from "../headerBuilder";
import { FOOTER_ITEM, FOOTER_ROW_LABEL, footerKindOf, footerView, readFooter } from "../footerBuilder";
import { type Action, type ActionContext, type Outcome, type Result, ActionErrors, action, element, err, ok, report } from "./action";
import { boolean, cases, dv, f, int, obj, opt, string } from "./schema";

const BP = cases(["desktop", "tablet", "mobile"], "A width: desktop, tablet or mobile");
const TONE = cases(["plain", "muted", "dark", "brand"], "Colours from the site's tokens: plain (page colours), muted (surface), dark, brand (primary)");
const HROW = cases(["top", "main", "bottom"], "top (the top bar), main or bottom");
const SLOT = cases(["start", "center", "end"], "A row's start (left in LTR), center or end");
const HALIGN = cases(["start", "center", "end", "between"], "How a slot lines up its items");
const HITEM = cases(["logo", "menu", "category", "search_icon", "search_field", "account", "cart", "wishlist", "compare", "social", "text", "html", "component", "menu_button"],
  "logo, menu, category (category menu), search_icon, search_field, account, cart, wishlist, compare, social, text, html, component (a synced pattern), menu_button (the menu in a drawer: tablet and mobile layouts only)");
const TABLET = cases(["desktop", "mobile", "own"], "desktop or mobile (the tablet shows that layout), own (a layout of its own)");
const ROLE = cases(["main", "category"], "main (every Menu and Menu button) or category (every Category menu)");
const STICKY = cases(["off", "on", "shrink"], "off, on (stays at the top) or shrink (sticky, slimmer once scrolled, top bar folded)");
const FROW = cases(["top", "main", "bottom"], "top, main (the columns) or bottom (the last line)");
const FALIGN = cases(["start", "center", "end"], "How a column lines up its items");
const FITEM = cases(["logo", "about", "links", "newsletter", "social", "payments", "contact", "copyright", "text", "html"],
  "logo, about (tagline), links (a titled menu), newsletter, social, payments, contact, copyright, text, html");

const ITEM_ID = f(string, "The item's element id");
const NO_INPUT = obj([]);

type In = Record<string, unknown>;
const s = (i: In, k: string) => i[k] as string;
const n = (i: In, k: string) => i[k] as number;
const row = (i: In) => ROW_LABEL[s(i, "row") as keyof typeof ROW_LABEL].toLowerCase();
const frow = (i: In) => FOOTER_ROW_LABEL[s(i, "row") as keyof typeof FOOTER_ROW_LABEL].toLowerCase();
const shown = (i: In) => (i.on ? "Showed" : "Hid");

const builderCtx = (ctx: ActionContext, doc: Doc = ctx.doc) =>
  ({ doc, newId: ctx.newId, selected: ctx.view.selected[0] ?? null, kind: ctx.view.kind, platform: ctx.platform });

/** One builder edit: the root first, then the item the input names, then the index, then the edit itself. */
function edit(name: string, description: string, input: ReturnType<typeof obj>, step: (i: In) => string, checks: { item?: boolean; index?: boolean } = {}): Action {
  return action(name, description, input, (i, ctx): Result<Outcome> => {
    const tag = name.startsWith("header_") ? "header" : "footer";
    const root = builderRoot(builderCtx(ctx), tag);
    if (!root.ok) return err(ActionErrors.invalid(root.error));
    if (checks.item) { const e = element(ctx, s(i, "item")); if (!e.ok) return e; }
    if (checks.index && i.index !== undefined && n(i, "index") < 0) return err(ActionErrors.invalid("index is 0 or more"));
    const called = callBuilder(name, i, builderCtx(ctx));
    if (!called.ok) return err(ActionErrors.invalid(called.error));
    const c = called.value;
    const value: Record<string, unknown> = { root: c.root };
    if (c.item !== undefined) value.item = c.item;
    return ok({ value, doc: c.doc, report: report({ changed: [c.root], added: c.added, removed: c.removed, steps: [step(i)] }) });
  });
}

const headerLayout = action("header_layout",
  "The open document's header as the builder sees it: layouts per width, rows (top, main, bottom), slots (start, center, end) and their items with ids. builder false: a ready or hand-made header, convert it with header_set_preset first.",
  NO_INPUT, (_, ctx) => {
    const r = builderRoot(builderCtx(ctx), "header");
    if (!r.ok) return ok({ value: { builder: false }, report: report() });
    const l = readHeader(ctx.doc, r.value.id);
    const value: Record<string, unknown> = { builder: !!l, root: r.value.id };
    if (l) value.layout = headerView(l);
    return ok({ value, report: report() });
  }, { readOnly: true });

const footerLayout = action("footer_layout",
  "The open document's footer as the builder sees it: rows (top, main, bottom), their columns and items with ids. builder false: a ready or hand-made footer, convert it with footer_set_preset first.",
  NO_INPUT, (_, ctx) => {
    const r = builderRoot(builderCtx(ctx), "footer");
    if (!r.ok) return ok({ value: { builder: false }, report: report() });
    const l = readFooter(ctx.doc, r.value.id);
    const value: Record<string, unknown> = { builder: !!l, root: r.value.id };
    if (l) value.layout = footerView(l);
    return ok({ value, report: report() });
  }, { readOnly: true });

export const HEADER_ACTIONS: readonly Action[] = [
  headerLayout,
  edit("header_set_preset",
    "Lay the header out as a preset (also converts a ready or hand-made header to a builder header). Keeps the root, items of the same kind with their settings, menus and the top bar's text; replaces the rest.",
    obj([["preset", f(string, "A preset id: marketplace, compact, centered, utility, nav-first, boutique, legacy-classic, legacy-store, legacy-centered, legacy-split, legacy-minimal, legacy-megastore; or legacy: convert a ready (legacy) header as it is configured")]]),
    (i) => `Header laid out as ${s(i, "preset")}`),
  edit("header_add_item", "Add an item (logo, menu, search, cart…) to a row and slot of the layout a width shows.",
    obj([
      ["row", f(HROW, "The row to add to")],
      ["bp", f(BP, "The width whose layout gets the item (a tablet that follows another layout adds to that one)")],
      ["slot", f(SLOT, "The slot of the row")],
      ["item", f(HITEM, "What to add")],
      ["index", f(opt(int), "Position in the slot, from 0; default: the end")],
      ["ref", f(int, "component only: the synced pattern's id", dv(0))],
    ]),
    (i) => `Added ${ITEM[headerKindOf(s(i, "item"))].label} to the ${row(i)} (${s(i, "slot")}, ${s(i, "bp")})`, { index: true }),
  edit("header_move_item",
    "Move an item to a row and slot, in its own layout or another width's (it keeps its id and settings). To change the tablet alone, header_set_tablet own first.",
    obj([
      ["item", ITEM_ID],
      ["row", f(HROW, "The row to move it to")],
      ["bp", f(BP, "The width whose layout gets it; it may be another layout than the item's own")],
      ["slot", f(SLOT, "The slot to move it to")],
      ["index", f(opt(int), "Position in the slot, counted without the item; default: the end")],
    ]),
    (i) => `Moved ${s(i, "item")} to the ${row(i)} (${s(i, "slot")}, ${s(i, "bp")})`, { item: true, index: true }),
  edit("header_remove_item", "Remove an item from the header.", obj([["item", ITEM_ID]]), (i) => `Removed ${s(i, "item")}`, { item: true }),
  edit("header_set_row_visible", "Show or hide a row at one width.",
    obj([["row", f(HROW, "The row")], ["bp", f(BP, "The width it shows or hides at (in the layout that width shows)")], ["on", f(boolean, "true shows the row, false hides it")]]),
    (i) => `${shown(i)} the ${row(i)} (${s(i, "bp")})`),
  edit("header_set_item_visible", "Show or hide an item at one width its layout covers.",
    obj([["item", ITEM_ID], ["bp", f(BP, "The width; the item's layout must cover it")], ["on", f(boolean, "true shows the item, false hides it at that width")]]),
    (i) => `${shown(i)} ${s(i, "item")} (${s(i, "bp")})`, { item: true }),
  edit("header_set_row_options", "Set a row's height, colours or divider (in the layout a width shows).",
    obj([
      ["row", f(HROW, "The row")],
      ["bp", f(BP, "The width whose layout has the row")],
      ["height", f(opt(int), "Minimum height in px: 32, 36, 40, 44, 48, 56, 64, 72, 80 or 96")],
      ["tone", f(opt(TONE), "The row's colours")],
      ["divider", f(opt(boolean), "A line under the row")],
    ]),
    (i) => `Changed the ${row(i)} (${s(i, "bp")})`),
  edit("header_set_sticky", "Make the header sticky, shrinking or static, and sit over the home page's first section or not.",
    obj([["sticky", f(STICKY, "How the header follows the scroll")], ["overlay", f(opt(boolean), "Over the home page's first section, transparent until scrolled")]]),
    (i) => `Sticky: ${s(i, "sticky")}`),
  edit("header_set_slot_align", "How a slot lines up its items.",
    obj([["row", f(HROW, "The row")], ["bp", f(BP, "The width whose layout has the row")], ["slot", f(SLOT, "The slot")], ["align", f(HALIGN, "start, center, end or between (spread)")]]),
    (i) => `Aligned ${s(i, "slot")} of the ${row(i)} (${s(i, "bp")}): ${s(i, "align")}`),
  edit("header_set_tablet",
    "What the tablet shows: the desktop layout, the mobile one, or its own (a copy of the one it followed, with new ids). Leaving own drops the tablet layout.",
    obj([["mode", f(TABLET, "What the tablet shows; own copies the layout it followed")]]),
    (i) => `Tablet: ${s(i, "mode")}`),
  edit("header_set_menu", "Pick the menu every Menu and Menu button (main) or every Category menu (category) shows.",
    obj([["role", f(ROLE, "Which menus")], ["source", f(string, "pages, categories, nav:ID or menu:ID")]]),
    (i) => `Menu ${s(i, "role")}: ${s(i, "source")}`),
];

export const FOOTER_ACTIONS: readonly Action[] = [
  footerLayout,
  edit("footer_set_preset",
    "Lay the footer out as a preset (also converts a ready or hand-made footer to a builder footer). Keeps the root, items of the same kind and the link lists' menus; replaces the rest.",
    obj([["preset", f(string, "A preset id: columns, simple, centered, minimal, store; or legacy: convert a ready (legacy) footer as it is configured")]]),
    (i) => `Footer laid out as ${s(i, "preset")}`),
  edit("footer_add_item", "Add an item (logo, links, newsletter, social…) to a column of a row.",
    obj([["row", f(FROW, "The row to add to")], ["column", f(int, "The column, from 0")], ["item", f(FITEM, "What to add")], ["index", f(opt(int), "Position in the column, from 0; default: the end")]]),
    (i) => `Added ${FOOTER_ITEM[footerKindOf(s(i, "item"))].label} to column ${n(i, "column") + 1} of the ${frow(i)}`, { index: true }),
  edit("footer_move_item", "Move an item to a column of a row (it keeps its id and settings).",
    obj([["item", ITEM_ID], ["row", f(FROW, "The row to move it to")], ["column", f(int, "The column, from 0")], ["index", f(opt(int), "Position in the column, counted without the item; default: the end")]]),
    (i) => `Moved ${s(i, "item")} to column ${n(i, "column") + 1} of the ${frow(i)}`, { item: true, index: true }),
  edit("footer_remove_item", "Remove an item from the footer.", obj([["item", ITEM_ID]]), (i) => `Removed ${s(i, "item")}`, { item: true }),
  edit("footer_set_columns", "Set how many columns a row has (1 to 6); items of columns that go away move to the last one.",
    obj([["row", f(FROW, "The row")], ["columns", f(int, "1 to 6 on desktop (2 at most on tablets, 1 on phones); items of dropped columns move to the last one")]]),
    (i) => `${n(i, "columns")} column(s) in the ${frow(i)}`),
  edit("footer_set_column_align", "How a column lines up its items.",
    obj([["row", f(FROW, "The row")], ["column", f(int, "The column, from 0")], ["align", f(FALIGN, "start, center or end")]]),
    (i) => `Aligned column ${n(i, "column") + 1} of the ${frow(i)}: ${s(i, "align")}`),
  edit("footer_set_row_visible", "Show or hide a footer row at one width.",
    obj([["row", f(FROW, "The row")], ["bp", f(BP, "The width")], ["on", f(boolean, "true shows the row, false hides it at that width")]]),
    (i) => `${shown(i)} the ${frow(i)} (${s(i, "bp")})`),
  edit("footer_set_row_divider", "A line above a footer row, or none.",
    obj([["row", f(FROW, "The row")], ["on", f(boolean, "A line above the row")]]),
    (i) => `Divider of the ${frow(i)}: ${i.on}`),
  edit("footer_set_item_visible", "Show or hide a footer item at one width.",
    obj([["item", ITEM_ID], ["bp", f(BP, "The width")], ["on", f(boolean, "true shows the item, false hides it at that width")]]),
    (i) => `${shown(i)} ${s(i, "item")} (${s(i, "bp")})`, { item: true }),
  edit("footer_set_tone", "The footer's colours, from the site's tokens.", obj([["tone", f(TONE, "The footer's colours")]]), (i) => `Footer tone: ${s(i, "tone")}`),
  edit("footer_set_links", "Pick the menu a links item shows.",
    obj([["item", f(string, "A links item's element id")], ["source", f(string, "pages, nav:ID or menu:ID")]]),
    (i) => `Links ${s(i, "item")}: ${s(i, "source")}`, { item: true }),
];

