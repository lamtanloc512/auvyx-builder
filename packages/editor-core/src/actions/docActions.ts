/**
 * The document actions (the Scala `DocActions`, Where doc): pure, on editor-core's ops, every refusal an error instead of
 * a skipped op. Inputs, descriptions and error texts are the Scala core's (the oracle test compares them).
 */
import { STATES, isAllowedProperty, isSafeValue, normalizeStyles, compileScopedCss, type Styles } from "@auvyx/style-engine";
import icons from "../../../../shared/icons.json";
import { type Doc, type El, type Kind, KINDS, SECTION_TAGS, flatten, indexIn, parentOf, subtreeIds, ancestors } from "../model";
import * as Ops from "../ops";
import { ANCHOR, decode as decodeTree, equivalents, kindOf, nameOf } from "../elementJson";
import { NAV_TOGGLES } from "../elements";
import { javaTrim } from "../json";
import {
  type Action, type ActionContext, type Result, ActionErrors, action, element, err, ok, report,
} from "./action";
import { RECIPE_IDS, VARIANT_IDS, encode, interaction, isCode, isGame, isInteractionMarker, recipesFor } from "./encode";
import { withGames } from "./games";
import { type Json, type JsonObj, arr, boolean, cases, dv, f, int, map, obj, object, opt, string } from "./schema";

const ICONS = new Set(Object.keys((icons as { icons: Record<string, string> }).icons));
const trimAscii = (v: string) => v.replace(/^[ \t\n\r\0\v]+|[ \t\n\r\0\v]+$/g, "");
const isAncestor = (doc: Doc, a: string, id: string) => ancestors(doc, id).includes(a);

// ---- reading -------------------------------------------------------------------------------------

/** A short, stable name of an element: its kind (and tag or level), its layer name when it has one. */
export function labelOf(n: El): string {
  const kind = n.kind === "Raw" ? `block ${n.blockName}`
    : isCode(n) ? "code"
    : isGame(n) ? "game"
    : n.kind === "Section" ? `box ${n.tag}`
    : n.kind === "Heading" ? `heading h${n.level}`
    : nameOf(n.kind);
  return n.label !== "" ? `${kind} (${n.label})` : kind;
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** What a reader sees of some HTML: tags dropped, the common entities decoded, spaces collapsed. */
export function plain(html: string): string {
  const noTags = html.replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/g, " ").replace(/<[^>]*>/g, " ");
  const decoded = noTags.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/g, (m, e: string) => {
    try {
      if (e.startsWith("#x")) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith("#")) return String.fromCodePoint(parseInt(e.slice(1), 10));
    } catch { return m; }
    return NAMED_ENTITIES[e] ?? m;
  });
  return javaTrim(decoded.replace(/[ \t\n\x0B\f\r]+/g, " "));
}

export function preview(n: El): string {
  const bound = n.bind.content ?? n.bind.text;
  const raw = n.kind === "Raw" ? n.html
    : n.kind === "Image" ? n.alt
    : n.kind === "Icon" ? n.icon
    : n.kind === "Video" ? n.src
    : n.kind === "Path" ? ""
    : n.kind === "Loop" ? n.query.postType ?? "post"
    : bound !== undefined ? `{${n.bind.content ?? n.bind.text ?? ""}}`
    : n.text;
  return plain(raw);
}

export function outline(doc: Doc): string {
  const lines = flatten(doc).map(({ el: n, depth }) => {
    const t = preview(n).slice(0, 60);
    return `${"  ".repeat(depth)}${n.id} ${labelOf(n)}${t !== "" ? ` "${t}"` : ""}${Object.keys(n.bind).length ? " [bound]" : ""}`;
  });
  return lines.length ? lines.join("\n") : "(empty page)";
}

export function named(n: El): string {
  const p = preview(n).slice(0, 40);
  return p === "" ? labelOf(n) : `${labelOf(n)} “${p}”`;
}

const readPage = action("read_page",
  "The open document as an outline (ids, kinds, text), or one element in full (with styles and children) when id is given.",
  obj([["id", f(opt(string), "An element id: that element in full (with styles and children). Omit for the outline of the whole document.")]]),
  (input, ctx) => {
    const selected = ctx.view.selected.filter((s) => ctx.doc.nodes[s]);
    const id = input.id as string | undefined;
    if (id === undefined) return ok({ value: { outline: outline(ctx.doc), selected }, report: report() });
    const e = element(ctx, id);
    if (!e.ok) return e;
    const tree = encode(ctx.doc, [id], ctx.raw)[0];
    const value: JsonObj = { outline: "" };
    if (tree !== undefined) value.element = tree;
    value.selected = selected;
    return ok({ value, report: report() });
  }, { readOnly: true });

// ---- styles --------------------------------------------------------------------------------------

/** The breakpoint a caller means: "desktop" is base, none is the one being edited; the site must have it. */
export function breakpoint(asked: string | undefined, ctx: ActionContext): Result<string> {
  const t = asked === undefined ? "" : javaTrim(asked);
  const raw = t !== "" ? t : ctx.view.breakpoint;
  const id = raw === "desktop" ? "base" : raw;
  if (ctx.view.breakpoints.length === 0 || ctx.view.breakpoints.includes(id)) return ok(id);
  return err(ActionErrors.invalid(`No breakpoint "${raw}". Breakpoints: ${ctx.view.breakpoints.join(", ")}.`));
}

export function state(asked: string | undefined, ctx: ActionContext): Result<string> {
  const t = asked === undefined ? "" : javaTrim(asked);
  const st = t !== "" ? t : ctx.view.state;
  if ((STATES as readonly string[]).includes(st)) return ok(st);
  return err(ActionErrors.invalid(`No state "${st}". States: ${STATES.join(", ")}.`));
}

/** One element's styles after a set: the patch on (breakpoint, state), then the style engine's normalisation, once. */
export function styled(styles: Styles, bp: string, st: string, patch: readonly [string, string | undefined][]): Styles {
  let s = styles;
  for (const [p, v] of patch) s = Ops.setStyle(s, bp, st, p, v);
  return normalizeStyles(s);
}

/** Declarations the style engine would drop, with why. */
export function refused(patch: readonly [string, string | undefined][]): string[] {
  return patch.flatMap(([p, v]) => {
    if (v === undefined || javaTrim(v) === "") return [];
    if (!isAllowedProperty(p)) return [`${p} (not a supported property)`];
    if (!isSafeValue(trimAscii(v))) return [`${p}: ${v} (not a safe value)`];
    return [];
  });
}

const sameStyles = (a: Styles, b: Styles) => JSON.stringify(a) === JSON.stringify(b);

const setStyle = action("set_style",
  "Set or remove CSS declarations of an element on one breakpoint and state (one change, one undo step). Values null remove.",
  obj([
    ["id", f(string, "The element to style")],
    ["values", f(map(opt(string)), "CSS property → value; null removes that declaration. Standard properties and custom properties (--x).")],
    ["breakpoint", f(opt(string), "Breakpoint id: base applies everywhere, tablet and mobile override it (\"desktop\" means base). Default: the breakpoint being edited.")],
    ["state", f(opt(string), "default, hover, focus or active. Default: the state being edited.")],
    ["also", f(arr(string), "More elements to style the same way (a multi-selection), all in the same change", dv([]))],
  ]),
  (input, ctx) => {
    const bp = breakpoint(input.breakpoint as string | undefined, ctx);
    if (!bp.ok) return bp;
    const st = state(input.state as string | undefined, ctx);
    if (!st.ok) return st;
    const ids = [...new Set([input.id as string, ...(input.also as string[])])];
    for (const id of ids) { const e = element(ctx, id); if (!e.ok) return e; }
    const values = input.values as [string, string | undefined][];
    if (values.length === 0) return err(ActionErrors.invalid("set_style: no values"));
    const bad = refused(values);
    if (bad.length) return err(ActionErrors.invalid(`Not applied, the style engine refuses: ${bad.join("; ")}`));
    let doc = ctx.doc;
    for (const id of ids) doc = Ops.update(doc, id, (n) => ({ ...n, styles: styled(n.styles, bp.value, st.value, values) }));
    const changed = ids.filter((id) => !sameStyles(doc.nodes[id]!.styles, ctx.doc.nodes[id]!.styles));
    const after = ((doc.nodes[input.id as string]!.styles[bp.value] as Record<string, Record<string, string>> | undefined)?.[st.value]) ?? {};
    return ok({
      value: { ids, breakpoint: bp.value, state: st.value, values: { ...after } },
      doc,
      report: report({ changed, steps: [`Styled ${ids.map((i) => named(doc.nodes[i]!)).join(", ")} (${bp.value}, ${st.value})`] }),
    });
  });

// ---- fields --------------------------------------------------------------------------------------

/** The fields update_element may change, by kind. */
export function updatable(n: El): string[] {
  const own = isCode(n) || isGame(n) ? []
    : n.kind === "Heading" ? ["text", "level"]
    : n.kind === "Text" ? ["text"]
    : n.kind === "Button" ? ["text", "href", "target"]
    : n.kind === "Image" ? ["src", "alt", "href"]
    : n.kind === "Icon" ? ["icon"]
    : n.kind === "Video" ? ["src"]
    : n.kind === "Section" ? ["tag"]
    : n.kind === "Accordion" ? ["text"]
    : n.kind === "Nav" ? ["menu", "toggleAt"]
    : [];
  const common = n.kind === "Raw" || isGame(n) ? ["align", "label"] : ["align", "label", "css", "anchor"];
  const ix = n.kind !== "Raw" && !isCode(n) && !isGame(n) ? ["interaction"] : [];
  return [...own, ...common, ...ix];
}

type Choice = { recipe: string; variant: string };

/** InteractionRecipes.fromJson then validate: the recipe an element would have after `json`. */
export function interactionOf(kind: Kind, current: string, json: Json): Result<Choice> {
  const base = interaction(current);
  let c: Choice;
  if (typeof json === "string") c = { ...base, recipe: javaTrim(json).toLowerCase() };
  else if (json !== null && typeof json === "object" && !Array.isArray(json)) {
    const o = json as Record<string, unknown>;
    const unknown = Object.keys(o).filter((k) => k !== "recipe" && k !== "variant");
    if (unknown.length) return err(ActionErrors.invalid(`interaction: unknown key ${unknown.join(", ")} (recipe, variant)`));
    const s = (k: string) => (o[k] === undefined || o[k] === null ? undefined : javaTrim(String(o[k])).toLowerCase());
    c = { recipe: s("recipe") ?? base.recipe, variant: s("variant") ?? base.variant };
  } else return err(ActionErrors.invalid('interaction is a recipe name or {"recipe", "variant"}'));
  if (!RECIPE_IDS.includes(c.recipe)) return err(ActionErrors.invalid(`interaction.recipe is one of ${RECIPE_IDS.join(", ")}, not "${c.recipe}"`));
  if (!recipesFor(kind).includes(c.recipe))
    return err(ActionErrors.invalid(`interaction.recipe "${c.recipe}" does not apply to a ${nameOf(kind)} (its recipes: ${recipesFor(kind).join(", ")})`));
  if (!VARIANT_IDS.includes(c.variant)) return err(ActionErrors.invalid(`interaction.variant is one of ${VARIANT_IDS.join(", ")}, not "${c.variant}"`));
  return ok(c);
}

export const writeInteraction = (className: string, c: Choice) =>
  [...className.split(/[ \t\n\x0B\f\r]+/).filter((t) => t !== "" && !isInteractionMarker(t)), ...(c.recipe !== "auto" ? [`auvyx-ix-${c.recipe}`] : []),
    ...(c.variant !== "default" ? [`auvyx-ix-v-${c.variant}`] : [])].join(" ");

/** The input of an interaction (only the parts given), as InteractionIn.json writes it. */
const interactionInJson = (i: Record<string, unknown>): JsonObj => {
  const o: JsonObj = {};
  if (i.recipe !== undefined) o.recipe = i.recipe;
  if (i.variant !== undefined) o.variant = i.variant;
  return o;
};

const INTERACTION_IN = obj([
  ["recipe", f(opt(string), "auto (what the kind gets), button, link, card, control, disclosure or none; only the ones the kind has")],
  ["variant", f(opt(string), "default, subtle (colour only, no movement) or expressive (lift and shadow)")],
], "Ready interaction feedback (catalog interactions). The default (auto, default) needs nothing.");

const updateElement = action("update_element",
  "Change an element's content and attributes (text, link, picture, icon, heading level, tag, width, name, own CSS). Only the fields its kind has.",
  obj([
    ["id", f(string, "The element to change")],
    ["text", f(opt(string), "Heading, text, button, accordion: inline HTML (<strong>, <em>, <a href>, <br>)")],
    ["href", f(opt(string), "Button, image: the link address")],
    ["target", f(opt(string), "Button: \"_blank\" opens the link in a new tab, \"\" in the same one")],
    ["src", f(opt(string), "Image: picture URL; video: YouTube, Vimeo or .mp4 URL")],
    ["alt", f(opt(string), "Image: alternative text")],
    ["icon", f(opt(string), "Icon: an icon name of the site's set")],
    ["level", f(opt(int), "Heading: 1 to 6")],
    ["tag", f(opt(string), "Box: section, div, header, footer, main, article, aside or nav")],
    ["align", f(opt(string), "full, wide, or \"\" for the content width")],
    ["label", f(opt(string), "The element's name in the layers panel")],
    ["css", f(opt(string), "The element's own CSS (& is the element); \"\" removes it")],
    ["anchor", f(opt(string), "The element's HTML id, for links to it (#id): a letter, then letters, digits, - or _; \"\" removes it")],
    ["menu", f(opt(string), "Navigation: \"pages\" or a menu id (nav:<id>)")],
    ["toggleAt", f(opt(string), "Navigation: below which screen the links fold into a menu button: mobile, tablet or never")],
    ["interaction", f(opt(INTERACTION_IN), "The ready hover/focus/press feedback (catalog interactions); a part left out keeps its current value")],
  ]),
  (input, ctx) => {
    const e = element(ctx, input.id as string);
    if (!e.ok) return e;
    const n = e.value;
    const s = (k: string) => input[k] as string | undefined;
    const level = input.level as number | undefined;
    const ix = input.interaction as Record<string, unknown> | undefined;
    const asked = ([
      ["text", s("text")], ["href", s("href")], ["target", s("target")], ["src", s("src")], ["alt", s("alt")], ["icon", s("icon")],
      ["level", level === undefined ? undefined : String(level)], ["tag", s("tag")], ["align", s("align")], ["label", s("label")], ["css", s("css")],
      ["anchor", s("anchor")], ["menu", s("menu")], ["toggleAt", s("toggleAt")], ["interaction", ix === undefined ? undefined : ""],
    ] as [string, string | undefined][]).filter(([, v]) => v !== undefined) as [string, string][];
    const allowed = updatable(n);
    const fails = (why: string) => err(ActionErrors.invalid(why));
    if (asked.length === 0) return fails(`update_element: nothing to change (fields for ${labelOf(n)}: ${allowed.join(", ")})`);
    const wrong = asked.find(([k]) => !allowed.includes(k));
    if (wrong) return fails(`${wrong[0]} does not apply to ${labelOf(n)} (its fields: ${allowed.join(", ")})`);
    if (level !== undefined && !(level >= 1 && level <= 6)) return fails(`level is 1 to 6, not ${level}`);
    if (s("tag") !== undefined && !(SECTION_TAGS as readonly string[]).includes(s("tag")!)) return fails(`tag is one of ${SECTION_TAGS.join(", ")}`);
    if (s("align") !== undefined && !["", "full", "wide"].includes(s("align")!)) return fails('align is full, wide or ""');
    if (s("icon") !== undefined && !ICONS.has(s("icon")!)) return fails(`No icon "${s("icon")}" in the site's set`);
    if (s("target") !== undefined && !["", "_blank"].includes(s("target")!)) return fails('target is "_blank" or ""');
    if (s("anchor") !== undefined && s("anchor") !== "" && !ANCHOR.test(s("anchor")!)) return fails("anchor: a letter, then letters, digits, - or _ (at most 81 characters)");
    if (s("toggleAt") !== undefined && !(NAV_TOGGLES as readonly string[]).includes(s("toggleAt")!)) return fails(`toggleAt is one of ${NAV_TOGGLES.join(", ")}`);
    if (s("css") !== undefined && javaTrim(s("css")!) !== "" && compileScopedCss(s("css")) === null)
      return fails("css refused: it has <, a backslash, @import, unbalanced braces or a url() that is not https or a site path");
    let choice: Choice | undefined;
    if (ix !== undefined) { const c = interactionOf(n.kind, n.className, interactionInJson(ix)); if (!c.ok) return c; choice = c.value; }
    const next: El = {
      ...n,
      text: s("text") ?? n.text,
      href: s("href") ?? n.href,
      target: s("target") ?? n.target,
      src: n.kind === "Nav" ? s("menu") ?? n.src : s("src") ?? n.src,
      alt: n.kind === "Nav" ? s("toggleAt") ?? n.alt : s("alt") ?? n.alt,
      icon: s("icon") ?? n.icon,
      level: level ?? n.level,
      tag: s("tag") ?? n.tag,
      align: s("align") ?? n.align,
      label: s("label") ?? n.label,
      css: s("css") ?? n.css,
      anchor: s("anchor") ?? n.anchor,
      className: choice ? writeInteraction(n.className, choice) : n.className,
    };
    const fields = asked.map(([k]) => k).filter((k) => {
      switch (k) {
        case "text": return next.text !== n.text;
        case "href": return next.href !== n.href;
        case "target": return next.target !== n.target;
        case "src": case "menu": return next.src !== n.src;
        case "alt": case "toggleAt": return next.alt !== n.alt;
        case "icon": return next.icon !== n.icon;
        case "level": return next.level !== n.level;
        case "tag": return next.tag !== n.tag;
        case "align": return next.align !== n.align;
        case "label": return next.label !== n.label;
        case "anchor": return next.anchor !== n.anchor;
        case "interaction": return next.className !== n.className;
        default: return next.css !== n.css;
      }
    });
    const doc = Ops.update(ctx.doc, n.id, () => next);
    return ok({ value: { id: n.id, fields }, doc, report: report({ changed: fields.length ? [n.id] : [], steps: [`Edited ${named(n)}`] }) });
  });

// ---- tree ----------------------------------------------------------------------------------------

/** Where something goes: after or before a sibling, into a parent at an index, or the page level. One of the three. */
export function placement(ctx: ActionContext, doc: Doc, after?: string, before?: string, parent?: string, index?: number): Result<[string | null, number]> {
  const asked = ([["after", after], ["before", before], ["parent", parent]] as const).filter(([, v]) => v !== undefined);
  if (asked.length > 1) return err(ActionErrors.invalid(`Give one of after, before or parent, not ${asked.map(([k]) => k).join(" and ")}.`));
  if (index !== undefined && index < 0) return err(ActionErrors.invalid("index is 0 or more"));
  if ((after !== undefined || before !== undefined) && index !== undefined) return err(ActionErrors.invalid("index goes with parent, not with after or before"));
  const known = (id: string) => element({ ...ctx, doc }, id);
  if (after !== undefined) { const k = known(after); return k.ok ? ok([parentOf(doc, after), indexIn(doc, after) + 1]) : k; }
  if (before !== undefined) { const k = known(before); return k.ok ? ok([parentOf(doc, before), indexIn(doc, before)]) : k; }
  if (parent !== undefined) {
    const k = known(parent);
    if (!k.ok) return k;
    const n = k.value;
    if (!KINDS[n.kind].container || isCode(n) || isGame(n)) return err(ActionErrors.invalid(`${labelOf(n)} ${parent} holds no elements`));
    return ok([parent, Math.min(index ?? n.children.length, n.children.length)]);
  }
  return ok([null, Math.min(index ?? doc.roots.length, doc.roots.length)]);
}

const ELEMENT_KINDS = ["Box", "Heading", "Text", "Button", "Image", "Icon", "Divider", "Video", "Accordion", "Vector", "Loop", "Navigation", "Block", "Code", "Game"];
const CONTAINERS = new Set(["box", "accordion", "loop"]);

const DRAWER = obj([
  ["style", f(opt(string), "dropdown, left, right, full or sheet")],
  ["width", f(opt(string), "narrow, default or wide")],
  ["backdrop", f(opt(string), "dim, blur or none")],
  ["fold", f(opt(boolean), "Submenus behind a button")],
]);

/** FlatElement's fields, in the Scala order (the order they are written back for ElementJson). */
const FLAT_FIELDS: [string, ReturnType<typeof f>][] = [
  ["kind", f(cases(ELEMENT_KINDS))],
  ["ref", f(opt(string), "A name for this element within the list, for \"in\" of the elements it holds")],
  ["in", f(opt(string), "The ref of an element earlier in this list that holds this one")],
  ["text", f(opt(string), "Heading, text, button, accordion: inline HTML (<strong>, <em>, <a href>, <br>)")],
  ["tag", f(opt(string), "Box: section, div, header, footer, main, article, aside or nav")],
  ["level", f(opt(int), "Heading: 1 to 6")],
  ["href", f(opt(string), "Button, image: link address")],
  ["src", f(opt(string), "Image: picture URL; video: YouTube, Vimeo or .mp4 URL")],
  ["alt", f(opt(string), "Image: alternative text")],
  ["icon", f(opt(string), "Icon: an icon name")],
  ["path", f(opt(string), "Vector: SVG path data")],
  ["viewBox", f(opt(string), "Vector: \"0 0 w h\"")],
  ["menu", f(opt(string), "Navigation: \"pages\" or a menu id")],
  ["toggleAt", f(opt(string), "Navigation: mobile, tablet or never")],
  ["drawer", f(opt(DRAWER), "Navigation: how the menu button opens")],
  ["autoplay", f(opt(boolean), "Video: starts by itself")],
  ["frame", f(opt(string), "Video: 16:9, 9:16, 1:1 or 4:5")],
  ["align", f(opt(string), "full, wide, or \"\"")],
  ["class", f(opt(string), "Class names (behaviour markers, presets)")],
  ["interaction", f(opt(INTERACTION_IN), "Ready hover/focus/press feedback (catalog interactions); leave out for the kind's automatic one")],
  ["styles", f(opt(object), "{breakpoint: {state: {property: value}}}; {breakpoint: {property: value}} means the default state")],
  ["css", f(opt(string), "The element's own CSS, & is the element")],
  ["anchor", f(opt(string), "The element's HTML id, for links to it (#id): a letter, then letters, digits, - or _")],
  ["bind", f(opt(map(string)), "Block attribute → data field key")],
  ["query", f(opt(map(string)), "Loop: postType, perPage, orderBy, order, taxonomy, terms, source, inherit")],
  ["block", f(opt(string), "Block: its registered name")],
  ["attrs", f(opt(object), "Block: its attributes (scalars)")],
  ["html", f(opt(string), "Code, game: HTML")],
  ["js", f(opt(string), "Code, game: ES module")],
  ["libs", f(opt(arr(string)), "Code, game: library names")],
  ["data", f(opt(arr(string)), "Code: data source names")],
  ["title", f(opt(string), "Game: its title")],
  ["game", f(opt(string), "Game: the key of a game the site keeps")],
];

const FLAT = obj(FLAT_FIELDS, "One element of a flat list: the first ones without \"in\" are inserted, the others go into the element named by \"in\".");

type Flat = Record<string, unknown>;

/** A decoded flat element written back as JSON (Schema[FlatElement].write): fields in order, absent ones left out. */
function writeFlat(e: Flat): JsonObj {
  const o: JsonObj = {};
  for (const [k] of FLAT_FIELDS) {
    const v = e[k];
    if (v === undefined) continue;
    if (k === "drawer" || k === "interaction") o[k] = Object.fromEntries(Object.entries(v as Flat).filter(([, x]) => x !== undefined));
    else if (k === "bind" || k === "query") o[k] = Object.fromEntries(v as [string, string][]);
    else o[k] = v;
  }
  return o;
}

const insertElements = action("insert_elements",
  "Insert new elements, written as a flat list: \"ref\" names an element, \"in\" puts one into an earlier element of the list; the ones without \"in\" are inserted, in order, at one place (after or before a sibling, into a parent, or the page level).",
  obj([
    ["elements", f(arr(FLAT), "The elements, flat: [{\"ref\": \"s\", \"kind\": \"box\"}, {\"in\": \"s\", \"kind\": \"heading\", \"text\": \"…\"}]")],
    ["after", f(opt(string), "Insert right after this element")],
    ["before", f(opt(string), "Insert right before this element")],
    ["parent", f(opt(string), "Insert into this element (omit after, before and parent for the page level)")],
    ["index", f(opt(int), "Position within parent; default: the end")],
  ]),
  (input, ctx) => {
    const items = input.elements as Flat[];
    const refs = items.flatMap((e, i) => (e.ref !== undefined ? [[e.ref as string, i] as const] : []));
    const problem = (i: number, why: string) => err(ActionErrors.invalid(`elements[${i}]: ${why}`));
    for (let i = 0; i < items.length; i++) {
      const e = items[i]!;
      const kind = e.kind as string;
      const parentAt = e.in === undefined ? undefined : refs.find(([r]) => r === e.in);
      if (refs.filter(([r]) => r === (e.ref ?? "\u0000")).length > 1) return problem(i, `ref "${e.ref}" is used twice`);
      if (e.in !== undefined && parentAt === undefined) return problem(i, `in: no element with ref "${e.in}"`);
      if (parentAt !== undefined && parentAt[1] >= i) return problem(i, `in: "${e.in}" must come earlier in the list`);
      if (parentAt !== undefined && !CONTAINERS.has(items[parentAt[1]]!.kind as string)) return problem(i, `in: "${e.in}" is a ${items[parentAt[1]]!.kind}, which holds no elements`);
      if (kind === "code" && !ctx.canScript) return problem(i, "code elements need the right to add scripts");
      if (e.anchor !== undefined && !ANCHOR.test(e.anchor as string)) return problem(i, "anchor: a letter, then letters, digits, - or _ (at most 81 characters)");
      if (e.interaction !== undefined && (kind === "block" || kind === "code" || kind === "game")) return problem(i, `interaction does not apply to a ${kind}`);
      if (e.interaction !== undefined) {
        const c = interactionOf(kindOf(kind) ?? "Section", (e.class as string | undefined) ?? "", interactionInJson(e.interaction as Flat));
        if (!c.ok) return problem(i, c.error.message);
      }
      if (kind === "block") {
        const b = e.block as string | undefined;
        if (b === undefined || (ctx.block(b) === undefined && !equivalents(b).some((x) => ctx.block(x) !== undefined)))
          return problem(i, `block: this site has no block "${b ?? ""}"`);
      }
    }
    if (items.length === 0) return err(ActionErrors.invalid("insert_elements: no elements"));
    const place = placement(ctx, ctx.doc, input.after as string | undefined, input.before as string | undefined, input.parent as string | undefined, input.index as number | undefined);
    if (!place.ok) return place;
    const [parent, at] = place.value;
    const kidsOf = (i: number) => items.map((_, j) => j).filter((j) => items[j]!.in !== undefined && items[j]!.in === items[i]!.ref);
    const tree = (i: number): JsonObj => {
      const o = writeFlat(items[i]!);
      delete o.ref;
      delete o.in;
      const kids = kidsOf(i);
      if (kids.length) o.children = kids.map(tree);
      return o;
    };
    const roots = items.map((_, i) => i).filter((i) => items[i]!.in === undefined);
    const elCtx = { newId: ctx.newId, canScript: ctx.canScript, block: ctx.block, field: ctx.field, rawMarkup: false };
    const built = roots.map((i) => [i, decodeTree(ctx.game ? withGames(tree(i), ctx.game) : tree(i), parent === null, elCtx)] as const);
    const bad = built.find(([, b]) => b === undefined);
    if (bad) return problem(bad[0], `a ${items[bad[0]]!.kind} this site cannot build`);
    const made = built.map(([, b]) => b!);
    const nodes: [string, El][] = made.flatMap(([r, rest]) => [...Object.entries(rest), [r.id, r] as [string, El]]);
    const ids = nodes.map(([id]) => id);
    if (nodes.length !== items.length) return err(ActionErrors.invalid(`insert_elements: only ${nodes.length} of ${items.length} elements could be built (unknown kinds or blocks inside)`));
    if (ids.some((i) => i === "" || i.includes("~"))) return err(ActionErrors.invalid("insert_elements: the id generator made a canvas-only or empty id"));
    if (new Set(ids).size !== ids.length || ids.some((i) => ctx.doc.nodes[i])) return err(ActionErrors.invalid("insert_elements: the id generator repeated an id"));
    let doc = ctx.doc;
    made.forEach(([root, rest], k) => { doc = Ops.insert(doc, root, parent, at + k, rest); });
    const refsOf = (i: number, e: El, rest: Record<string, El>): [string, string][] => {
      const kids = kidsOf(i);
      const own: [string, string][] = items[i]!.ref !== undefined ? [[items[i]!.ref as string, e.id]] : [];
      return [...own, ...kids.map((j, k) => [j, e.children[k]] as const).flatMap(([j, c]) => (c !== undefined && rest[c] ? refsOf(j, rest[c]!, rest) : []))];
    };
    const refMap: JsonObj = {};
    roots.forEach((i, k) => { for (const [r, id] of refsOf(i, made[k]![0], made[k]![1])) refMap[r] = id; });
    const idSet = new Set(ids);
    return ok({
      value: { ids: made.map(([r]) => r.id), refs: refMap },
      doc,
      report: report({ added: flatten(doc).map(({ el: n }) => n.id).filter((i) => idSet.has(i)), steps: made.map(([r]) => `Added ${named(r)}`) }),
    });
  });

const moveElement = action("move_element",
  "Move an element (with what it holds) after or before a sibling, into a parent at an index, or to the page level.",
  obj([
    ["id", f(string, "The element to move")],
    ["after", f(opt(string), "Put it right after this element")],
    ["before", f(opt(string), "Put it right before this element")],
    ["parent", f(opt(string), "Put it into this element (omit after, before and parent for the page level)")],
    ["index", f(opt(int), "Position within parent, counted without the moved element; default: the end")],
  ]),
  (input, ctx) => {
    const e = element(ctx, input.id as string);
    if (!e.ok) return e;
    const n = e.value;
    const after = input.after as string | undefined, before = input.before as string | undefined, parentIn = input.parent as string | undefined;
    const without = Ops.remove(ctx.doc, n.id);
    const inside = [after, before, parentIn].filter((t): t is string => t !== undefined).find((t) => t === n.id || isAncestor(ctx.doc, n.id, t));
    if (inside !== undefined)
      return err(ActionErrors.invalid(`Cannot move ${n.id} ${inside === n.id ? "next to or into itself" : `into ${inside}, which is inside it`}.`));
    const place = placement(ctx, without, after, before, parentIn, input.index as number | undefined);
    if (!place.ok) return place;
    const [parent, at] = place.value;
    const doc = Ops.move(ctx.doc, n.id, parent, at);
    const value: JsonObj = { id: n.id };
    if (parent !== null) value.parent = parent;
    value.index = indexIn(doc, n.id);
    return ok({ value, doc, report: report({ changed: [n.id], steps: [`Moved ${named(n)}`] }) });
  });

const removeElements = action("remove_elements", "Remove elements and everything inside them.",
  obj([["ids", f(arr(string), "The elements to remove, with everything inside them")]]),
  (input, ctx) => {
    const ids = input.ids as string[];
    if (ids.length === 0) return err(ActionErrors.invalid("remove_elements: no ids"));
    const targets: El[] = [];
    for (const id of ids) { const e = element(ctx, id); if (!e.ok) return e; targets.push(e.value); }
    let doc = ctx.doc;
    for (const t of targets) if (doc.nodes[t.id]) doc = Ops.remove(doc, t.id);
    const removed = flatten(ctx.doc).map(({ el: n }) => n.id).filter((i) => !doc.nodes[i]);
    const seen = new Set<string>();
    const top = targets.filter((t) => !targets.some((o) => o.id !== t.id && isAncestor(ctx.doc, o.id, t.id))).filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
    return ok({ value: { ids: removed }, doc, report: report({ removed, steps: top.map((n) => `Removed ${named(n)}`) }) });
  });

const duplicateElement = action("duplicate_element", "Copy an element and what it holds; the copy goes right after it, with new ids.",
  obj([["id", f(string, "The element to copy; the copy goes right after it")]]),
  (input, ctx) => {
    const e = element(ctx, input.id as string);
    if (!e.ok) return e;
    const n = e.value;
    const fresh: string[] = [];
    const [doc, copy] = Ops.duplicate(ctx.doc, n.id, () => { const id = ctx.newId(); fresh.push(id); return id; });
    if (fresh.some((i) => i === "" || i.includes("~"))) return err(ActionErrors.invalid("duplicate_element: the id generator made a canvas-only or empty id"));
    if (new Set(fresh).size !== fresh.length || fresh.some((i) => ctx.doc.nodes[i])) return err(ActionErrors.invalid("duplicate_element: the id generator repeated an id"));
    if (copy === null) return err(ActionErrors.notFound(n.id));
    return ok({ value: { id: copy }, doc, report: report({ added: subtreeIds(doc, copy), steps: [`Duplicated ${named(n)}`] }) });
  });

export const DOC_ACTIONS: readonly Action[] = [readPage, setStyle, updateElement, insertElements, moveElement, removeElements, duplicateElement];

