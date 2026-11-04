/**
 * The header and footer builders as actions (the Scala `BuilderActions`): the header or footer root an edit is for, the
 * edit by its action name with the same JSON input (enums in snake_case), and what it added and removed. The board calls
 * these; one call is one commit, one Undo.
 */
import { type Doc, type El, subtreeIds } from "./model";
import { type Bp, type Platform, type Result, type Tone, fail, ok } from "./builderParts";
import {
  type Align, type Env, type MenuRole, type RowKind, type Slot, type Sticky, type TabletMode, NO_HEADER, addItem, headerKindOf, isHeaderBuilder, moveItem,
  removeItem, setItemVisible, setMenu, setPreset, setRowOptions, setRowVisible, setSlotAlign, setSticky, setTablet,
} from "./headerBuilder";
import {
  type FooterAlign, type FooterRowKind, NO_FOOTER, footerAddItem, footerKindOf, footerMoveItem, footerRemoveItem, footerSetColumnAlign, footerSetColumns,
  footerSetItemVisible, footerSetLinks, footerSetPreset, footerSetRowDivider, footerSetRowVisible, footerSetTone, isFooterBuilder,
} from "./footerBuilder";

/** What the user is looking at: the document, the selection, what kind of document it is ("page", "header", "footer", "component"). */
export interface BuilderContext { doc: Doc; newId: () => string; selected: string | null; kind: string; platform: Platform }

/** An edit that landed: the next document, the root it was for, the item an add created, the elements it added and removed. */
export interface Called { doc: Doc; root: string; item?: string; added: string[]; removed: string[] }

const isAncestor = (doc: Doc, a: string, id: string): boolean => subtreeIds(doc, a).slice(1).includes(id);

/**
 * The header or footer root the edit is for: among the document's root sections that are builder ones, carry the tag, or
 * make the whole document a header / footer part, the one holding the selection, else the first builder one, else the first.
 */
export function builderRoot(ctx: BuilderContext, tag: "header" | "footer"): Result<El> {
  const builder = tag === "header" ? isHeaderBuilder : isFooterBuilder;
  const rs = ctx.doc.roots.map((r) => ctx.doc.nodes[r]).filter((n): n is El => !!n && n.kind === "Section");
  const candidates = rs.filter((r) => builder(r.className) || r.tag === tag || ctx.kind === tag);
  const sel = ctx.selected;
  const holds = (r: El) => sel !== null && (sel === r.id || isAncestor(ctx.doc, r.id, sel));
  const found = candidates.find(holds) ?? candidates.find((r) => builder(r.className)) ?? candidates[0];
  return found ? ok(found) : fail(tag === "header" ? NO_HEADER : NO_FOOTER);
}

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const pascal = (s: string) => camel(s).replace(/^[a-z]/, (c) => c.toUpperCase());

type In = Record<string, unknown>;
const str = (i: In, k: string) => String(i[k] ?? "");
const num = (i: In, k: string) => (i[k] === undefined || i[k] === null ? undefined : Number(i[k]));
const bool = (i: In, k: string) => (i[k] === undefined || i[k] === null ? undefined : i[k] === true);

/** Runs a builder action (header_* / footer_*) by name; a refusal is the reason, nothing changes. */
export function callBuilder(name: string, input: In, ctx: BuilderContext): Result<Called> {
  const env: Env = { newId: ctx.newId, platform: ctx.platform };
  const header = name.startsWith("header_");
  const root = builderRoot(ctx, header ? "header" : "footer");
  if (!root.ok) return root;
  const r = root.value.id;
  const doc = ctx.doc;
  const index = num(input, "index");
  if (index !== undefined && index < 0) return fail("index is 0 or more");
  const item = str(input, "item");
  if (["header_move_item", "header_remove_item", "header_set_item_visible", "footer_move_item", "footer_remove_item", "footer_set_item_visible", "footer_set_links"].includes(name)
    && !doc.nodes[item]) return fail(`No element '${item}' in the document`);
  let next: Result<Doc>;
  let added: string | undefined;
  switch (name) {
    case "header_set_preset": next = setPreset(doc, r, str(input, "preset"), env); break;
    case "header_add_item": {
      const a = addItem(doc, r, { row: str(input, "row") as RowKind, bp: str(input, "bp") as Bp, slot: str(input, "slot") as Slot, item: headerKindOf(item), index,
        ref: num(input, "ref") ?? 0 }, env);
      if (!a.ok) return a;
      next = ok(a.value[0]);
      added = a.value[1];
      break;
    }
    case "header_move_item": next = moveItem(doc, r, { item, row: str(input, "row") as RowKind, bp: str(input, "bp") as Bp, slot: str(input, "slot") as Slot, index }, env); break;
    case "header_remove_item": next = removeItem(doc, r, item); break;
    case "header_set_row_visible": next = setRowVisible(doc, r, { row: str(input, "row") as RowKind, bp: str(input, "bp") as Bp, on: input.on === true }, env); break;
    case "header_set_item_visible": next = setItemVisible(doc, r, { item, bp: str(input, "bp") as Bp, on: input.on === true }); break;
    case "header_set_row_options":
      next = setRowOptions(doc, r, { row: str(input, "row") as RowKind, bp: str(input, "bp") as Bp, height: num(input, "height"),
        tone: input.tone === undefined ? undefined : (str(input, "tone") as Tone), divider: bool(input, "divider") }, env);
      break;
    case "header_set_sticky": next = setSticky(doc, r, { sticky: pascal(str(input, "sticky")) as Sticky, overlay: bool(input, "overlay") }); break;
    case "header_set_slot_align":
      next = setSlotAlign(doc, r, { row: str(input, "row") as RowKind, bp: str(input, "bp") as Bp, slot: str(input, "slot") as Slot, align: str(input, "align") as Align }, env);
      break;
    case "header_set_tablet": next = setTablet(doc, r, str(input, "mode") as TabletMode, env); break;
    case "header_set_menu": next = setMenu(doc, r, { role: str(input, "role") as MenuRole, source: str(input, "source") }); break;
    case "footer_set_preset": next = footerSetPreset(doc, r, str(input, "preset"), env); break;
    case "footer_add_item": {
      const a = footerAddItem(doc, r, { row: str(input, "row") as FooterRowKind, column: num(input, "column") ?? 0, item: footerKindOf(item), index }, env);
      if (!a.ok) return a;
      next = ok(a.value[0]);
      added = a.value[1];
      break;
    }
    case "footer_move_item": next = footerMoveItem(doc, r, { item, row: str(input, "row") as FooterRowKind, column: num(input, "column") ?? 0, index }, env); break;
    case "footer_remove_item": next = footerRemoveItem(doc, r, item); break;
    case "footer_set_columns": next = footerSetColumns(doc, r, { row: str(input, "row") as FooterRowKind, columns: num(input, "columns") ?? 0 }, env); break;
    case "footer_set_column_align":
      next = footerSetColumnAlign(doc, r, { row: str(input, "row") as FooterRowKind, column: num(input, "column") ?? 0, align: str(input, "align") as FooterAlign }, env);
      break;
    case "footer_set_row_visible": next = footerSetRowVisible(doc, r, { row: str(input, "row") as FooterRowKind, bp: str(input, "bp") as Bp, on: input.on === true }, env); break;
    case "footer_set_row_divider": next = footerSetRowDivider(doc, r, { row: str(input, "row") as FooterRowKind, on: input.on === true }, env); break;
    case "footer_set_item_visible": next = footerSetItemVisible(doc, r, { item, bp: str(input, "bp") as Bp, on: input.on === true }); break;
    case "footer_set_tone": next = footerSetTone(doc, r, str(input, "tone") as Tone); break;
    case "footer_set_links": next = footerSetLinks(doc, r, { item, source: str(input, "source") }); break;
    default: return fail(`Unknown action '${name}'`);
  }
  if (!next.ok) return next;
  const after = next.value;
  const fresh = subtreeIds(after, r).filter((id) => !doc.nodes[id]);
  return ok({
    doc: after, root: r, item: added,
    added: [...(added ? [added] : []), ...fresh.filter((id) => id !== added)],
    removed: subtreeIds(doc, r).filter((id) => !after.nodes[id]),
  });
}
