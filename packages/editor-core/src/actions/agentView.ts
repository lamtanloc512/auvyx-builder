/**
 * What the user is looking at, sent with every message to the agent (the Scala `AgentView`): the document, the width and
 * state being edited, the selection, and the builder header or footer the selection is in. Compact on purpose: the
 * model reads it with every turn.
 *
 *   <view>
 *   document: header "Main header" (id 1426)
 *   editing: tablet, state default
 *   selected: n12 block core/search — header item search_field (desktop layout, main/center)
 *   header n1: builder, tablet follows mobile, sticky none
 *     desktop (desktop): top[end: social n9] main[start: logo n2 | center: search_field n12 | end: account n4, cart n5]
 *   </view>
 */
import { type El, ancestors } from "../model";
import { builderRoot as rootOf } from "../builderActions";
import { type HeaderView, type BuilderItemView, headerView, isHeaderBuilder, readHeader } from "../headerBuilder";
import { type FooterView, footerView, isFooterBuilder, readFooter } from "../footerBuilder";
import type { ActionContext } from "./action";
import { labelOf, preview } from "./docActions";

export const OPEN = "<view>";
export const CLOSE = "</view>";
const MAX_SELECTED = 5;

export const block = (ctx: ActionContext) => `${OPEN}\n${lines(ctx).join("\n")}\n${CLOSE}`;

/** A message as the model gets it: the user's words, then the view. */
export const withView = (text: string, ctx: ActionContext) => `${text}\n\n${block(ctx)}`;

/** The user's words without the view (and without the selection note older Studios added). */
export const strip = (text: string) => text.replace(/\n\n<view>\n[\s\S]*<\/view>$/, "").replace(/\n\n\(Selected: [^)]*\)$/, "");

const isAncestor = (ctx: ActionContext, a: string, id: string) => ancestors(ctx.doc, id).includes(a);

/** The header (footer) worth describing: the one holding the selection, or, in a header (footer) document, its own. */
function builderRoot(ctx: ActionContext, tag: "header" | "footer", builder: (c: string) => boolean): El | undefined {
  const sel = ctx.view.selected.find((s) => ctx.doc.nodes[s]);
  if (sel !== undefined) {
    const chain = [sel, ...ancestors(ctx.doc, sel)];
    const top = ctx.doc.nodes[chain[chain.length - 1]!];
    if (top && top.kind === "Section" && (builder(top.className) || top.tag === tag)) return top;
  }
  if (ctx.view.kind !== tag) return undefined;
  const r = rootOf({ doc: ctx.doc, newId: ctx.newId, selected: ctx.view.selected[0] ?? null, kind: ctx.view.kind, platform: ctx.platform }, tag);
  return r.ok ? r.value : undefined;
}

const items = (is: BuilderItemView[]) => is.map((i) => `${i.kind} ${i.id}${i.hidden.length ? ` (hidden ${i.hidden.join(", ")})` : ""}`).join(", ");
const hidden = (at: readonly string[]) => (at.length ? ` (hidden ${at.join(", ")})` : "");

function headerLines(root: El, view: HeaderView | undefined): string[] {
  if (!view) return [`header ${root.id}: not a builder header (a ready or hand-made one); header_set_preset converts it`];
  const tablet = view.tablet === "own" ? "tablet has its own layout" : `tablet follows ${view.tablet}`;
  return [
    `header ${view.root}: builder, ${tablet}, sticky ${view.sticky}${view.overlay ? ", over the first section" : ""}`,
    ...view.layouts.map((t) => {
      const rows = t.rows.filter((r) => r.slots.some((s) => s.items.length)).map((r) =>
        `${r.row}${hidden(r.hidden)}[${r.slots.filter((s) => s.items.length).map((s) => `${s.slot}: ${items(s.items)}`).join(" | ")}]`);
      return `  ${t.layout} (${t.shows.join(", ")}): ${rows.length ? rows.join(" ") : "empty"}`;
    }),
  ];
}

function footerLines(root: El, view: FooterView | undefined): string[] {
  if (!view) return [`footer ${root.id}: not a builder footer (a ready or hand-made one); footer_set_preset converts it`];
  return [
    `footer ${view.root}: builder, tone ${view.tone}`,
    ...view.rows.filter((r) => r.columns.some((c) => c.items.length)).map((r) =>
      `  ${r.row}${hidden(r.hidden)}[${r.columns.map((c, n) => [c, n] as const).filter(([c]) => c.items.length).map(([c, n]) => `${n + 1}: ${items(c.items)}`).join(" | ")}]`),
  ];
}

export function lines(ctx: ActionContext): string[] {
  const v = ctx.view;
  const doc = ctx.doc;
  const title = v.title !== "" ? ` "${v.title.slice(0, 60)}"` : "";
  const id = v.document !== "" ? ` (id ${v.document})` : "";
  const selected = v.selected.filter((s) => doc.nodes[s]);
  const header = builderRoot(ctx, "header", isHeaderBuilder);
  const footer = builderRoot(ctx, "footer", isFooterBuilder);
  const hl = header ? readHeader(doc, header.id) : undefined;
  const fl = footer ? readFooter(doc, footer.id) : undefined;
  const hv = hl ? headerView(hl) : undefined;
  const fv = fl ? footerView(fl) : undefined;
  const inHeader = (id: string) => {
    for (const t of hv?.layouts ?? []) for (const r of t.rows) for (const s of r.slots) for (const i of s.items)
      if (i.id === id) return ` — header item ${i.kind} (${t.layout} layout, ${r.row}/${s.slot})`;
    return undefined;
  };
  const inFooter = (id: string) => {
    for (const r of fv?.rows ?? []) for (const [n, c] of r.columns.entries()) for (const i of c.items)
      if (i.id === id) return ` — footer item ${i.kind} (${r.row}, column ${n + 1})`;
    return undefined;
  };
  const inside = (id: string, root: El | undefined, what: string) =>
    root && (root.id === id || isAncestor(ctx, root.id, id)) ? (root.id === id ? ` — the ${what}` : ` — inside the ${what} ${root.id}`) : undefined;
  const where = (id: string) => inHeader(id) ?? inFooter(id) ?? inside(id, header, "header") ?? inside(id, footer, "footer") ?? "";
  const named = (id: string) => {
    const n = doc.nodes[id];
    if (!n) return id;
    const t = preview(n).slice(0, 40);
    return `${id} ${labelOf(n)}${t !== "" ? ` "${t}"` : ""}${where(id)}`;
  };
  const sel = selected.length === 0 ? "selected: nothing"
    : `selected: ${selected.slice(0, MAX_SELECTED).map(named).join("; ")}${selected.length > MAX_SELECTED ? ` (+${selected.length - MAX_SELECTED} more)` : ""}`;
  return [
    `document: ${v.kind}${title}${id}`,
    `editing: ${v.breakpoint}, state ${v.state}`,
    sel,
    ...(header ? headerLines(header, hv) : []),
    ...(footer ? footerLines(footer, fv) : []),
  ];
}
