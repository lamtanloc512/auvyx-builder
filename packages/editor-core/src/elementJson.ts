/**
 * Element trees (`{"kind": "box", "styles": …, "children": […]}`) → elements: the Scala `ElementJson` decoder
 * (S/ElementJson.scala). Site templates are written in them (docs/site-templates.md), as are the agent's edits. Lenient on
 * the way in (numbers as strings, flat styles, `"desktop"`), sanitized like every other edit: unknown kinds, blocks the
 * site does not offer and code without the right to script are dropped.
 */
import { normalizeStyles, type Styles } from "@auvyx/style-engine";
import icons from "../../../shared/icons.json";
import { type Doc, type El, type Kind, SECTION_TAGS, el } from "./model";
import { WS, isRecord, javaTrim, jsonString } from "./json";
import { NAV_TOGGLES, bindable, codeLibs, normalizeQuery, safeBox, safePath, validBinding } from "./elements";
import { setStyle } from "./ops";
import { escapeComment } from "./markup";

/** What the site allows (ElementJson.Context). `block` answers a block the site offers with its registered name. */
export interface Context {
  newId: () => string;
  canScript?: boolean;
  block?: (name: string) => string | undefined;
  field?: (key: string) => boolean;
  /** A block element may carry its whole markup (site templates). */
  rawMarkup?: boolean;
  /** The platform keeps `core/html` blocks (WordPress). */
  html?: boolean;
}

export const KIND_NAMES: readonly [Kind, string][] = [
  ["Section", "box"], ["Heading", "heading"], ["Text", "text"], ["Button", "button"], ["Image", "image"], ["Icon", "icon"],
  ["Divider", "divider"], ["Video", "video"], ["Accordion", "accordion"], ["Path", "vector"], ["Loop", "loop"],
  ["Nav", "navigation"], ["Raw", "block"],
];
export const nameOf = (k: Kind) => KIND_NAMES.find(([x]) => x === k)?.[1] ?? "box";
export const kindOf = (name: string): Kind | undefined => KIND_NAMES.find(([, n]) => n === name.toLowerCase())?.[0];

const ICONS = new Set(Object.keys((icons as { icons: Record<string, string> }).icons));
const SPLIT = new RegExp(`${WS}+`);

// ---- JSON helpers ----------------------------------------------------------------------

/** ujson.write: compact JSON, strings as the Scala core writes them. */
export const writeJson = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return jsonString(v);
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(writeJson).join(",")}]`;
  return `{${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${jsonString(k)}:${writeJson(x)}`).join(",")}}`;
};

/** A scalar as the agent meant it: `2` and `"2"` are the same level, `true` and `"true"` the same flag. */
export const text = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isInteger(v) && Math.abs(v) < 1e15 ? String(v) : String(v);
  if (typeof v === "boolean") return String(v);
  return writeJson(v);
};

/** A key's value; absent and `null` are both undefined. */
export const field = (o: unknown, key: string): unknown =>
  isRecord(o) && Object.hasOwn(o, key) && o[key] !== null ? o[key] : undefined;

export const str = (o: unknown, key: string): string | undefined => text(field(o, key));

export const strs = (o: unknown, key: string): string[] => {
  const v = field(o, key);
  return Array.isArray(v) ? v.flatMap((x) => text(x) ?? []) : [];
};

/** Every entry, `null` values included. */
export const entries = (o: unknown): [string, unknown][] => (isRecord(o) ? Object.entries(o) : []);

const nested = (v: unknown) => v === null || typeof v === "object";

// ---- pieces ----------------------------------------------------------------------------

/** Styles from model JSON; lenient ({bp: {prop: v}} means the default state), then sanitized; shorthands first. */
export function styles(v: unknown): Styles {
  const raw: Record<string, Record<string, Record<string, string>>> = {};
  for (const [bp, states] of entries(v)) {
    const id = bp === "desktop" ? "base" : bp;
    const decls = (o: unknown) => Object.fromEntries(entries(o).flatMap(([p, x]) => { const t = text(x); return t === undefined ? [] : [[p, t]]; }));
    const flat = entries(states).every(([, x]) => !nested(x));
    raw[id] = flat ? { default: decls(states) } : Object.fromEntries(entries(states).map(([st, d]) => [st, decls(d)]));
  }
  const out: Styles = {};
  for (const [bp, states] of Object.entries(normalizeStyles(raw))) {
    const next: Record<string, Record<string, string>> = {};
    for (const [st, decls] of Object.entries(states ?? {})) {
      const keys = Object.keys(decls ?? {});
      const sorted = Object.entries(decls ?? {}).map((e, i) => [e, keys.some((k) => k.startsWith(e[0] + "-")) ? 0 : 1, i] as const)
        .sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([e]) => e);
      next[st] = Object.fromEntries(sorted);
    }
    out[bp] = next;
  }
  return out;
}

// NavDrawer
const DRAWER = "auvyx-drawer-";
const DRAWER_STYLES = ["dropdown", "left", "right", "full", "sheet"];
const DRAWER_WIDTHS = ["narrow", "default", "wide"];
const DRAWER_BACKDROPS = ["dim", "blur", "none"];
interface DrawerOptions { style: string; width: string; backdrop: string; fold: boolean }

export function readDrawer(className: string): DrawerOptions {
  const cs = new Set(className.split(" "));
  const pick = (list: string[], prefix: string, d: string) => list.find((v) => cs.has(prefix + v)) ?? d;
  return { style: pick(DRAWER_STYLES.slice(1), DRAWER, "dropdown"), width: pick(DRAWER_WIDTHS, DRAWER + "w-", "default"),
    backdrop: pick(DRAWER_BACKDROPS, DRAWER + "bg-", "dim"), fold: cs.has(DRAWER + "fold") };
}

export function writeDrawer(className: string, o: DrawerOptions): string {
  const rest = className.split(" ").filter((c) => c !== "" && !c.startsWith(DRAWER));
  const drawer = o.style !== "dropdown" && DRAWER_STYLES.includes(o.style);
  const tokens = !drawer ? [] : [
    DRAWER + o.style,
    ...(o.width !== "default" && DRAWER_WIDTHS.includes(o.width) ? [`${DRAWER}w-${o.width}`] : []),
    ...(o.backdrop !== "dim" && DRAWER_BACKDROPS.includes(o.backdrop) ? [`${DRAWER}bg-${o.backdrop}`] : []),
    ...(o.fold ? [DRAWER + "fold"] : []),
  ];
  return [...rest, ...tokens].join(" ");
}

/** A navigation's menu drawer (`"drawer": {"style", "width", "backdrop", "fold"}`), over what it has. */
export function drawer(current: string, d: unknown): string {
  if (d === null || d === undefined) return current;
  const now = readDrawer(current);
  const s = (k: string) => str(d, k);
  return writeDrawer(current, { style: s("style") ?? now.style, width: s("width") ?? now.width, backdrop: s("backdrop") ?? now.backdrop,
    fold: s("fold") !== undefined ? s("fold") === "true" : now.fold });
}

/** BoxEffects.toggle. */
export const toggleClass = (className: string, token: string, on: boolean) =>
  [...className.split(" ").filter((c) => c !== "" && c !== token), ...(on ? [token] : [])].join(" ");

// InteractionRecipes
const RECIPES = ["auto", "button", "link", "card", "control", "disclosure", "none"];
const VARIANTS = ["default", "subtle", "expressive"];
const recipesFor = (k: Kind): string[] => {
  switch (k) {
    case "Button": return ["auto", "button", "link", "none"];
    case "Image": case "Icon": return ["auto", "link", "card", "none"];
    case "Section": return ["auto", "card", "control", "none"];
    case "Accordion": return ["auto", "disclosure", "none"];
    case "Text": case "Heading": case "Nav": return ["auto", "link", "none"];
    default: return ["auto", "none"];
  }
};
const isMarker = (t: string) =>
  t.startsWith("auvyx-ix-v-") ? VARIANTS.includes(t.slice(11)) : t.startsWith("auvyx-ix-") && RECIPES.includes(t.slice(9));
const tokens = (className: string) => className.split(SPLIT).filter((t) => t !== "");
interface Choice { recipe: string; variant: string }
const readChoice = (className: string): Choice => {
  const t = tokens(className);
  return {
    recipe: t.find((x) => !x.startsWith("auvyx-ix-v-") && x.startsWith("auvyx-ix-") && RECIPES.includes(x.slice(9)))?.slice(9) ?? "auto",
    variant: t.find((x) => x.startsWith("auvyx-ix-v-") && VARIANTS.includes(x.slice(11)))?.slice(11) ?? "default",
  };
};
const writeChoice = (className: string, c: Choice) =>
  [...tokens(className).filter((t) => !isMarker(t)), ...(c.recipe !== "auto" ? [`auvyx-ix-${c.recipe}`] : []),
    ...(c.variant !== "default" ? [`auvyx-ix-v-${c.variant}`] : [])].join(" ");
const choiceFromJson = (v: unknown, base: Choice): Choice | undefined => {
  if (typeof v === "string") return { ...base, recipe: javaTrim(v).toLowerCase() };
  if (isRecord(v)) {
    if (Object.keys(v).some((k) => k !== "recipe" && k !== "variant")) return undefined;
    const s = (k: string) => { const x = str(v, k); return x === undefined ? undefined : javaTrim(x).toLowerCase(); };
    return { recipe: s("recipe") ?? base.recipe, variant: s("variant") ?? base.variant };
  }
  return undefined;
};
const validChoice = (k: Kind, c: Choice) => RECIPES.includes(c.recipe) && recipesFor(k).includes(c.recipe) && VARIANTS.includes(c.variant);

// Embed
const AUTOPLAY = "auvyx-video-autoplay";
const CROP = "auvyx-video-crop";
const FRAMES: readonly { id: string; ratio: string; maxWidth?: string }[] = [
  { id: "16:9", ratio: "16 / 9" }, { id: "9:16", ratio: "9 / 16", maxWidth: "420px" }, { id: "1:1", ratio: "1 / 1", maxWidth: "640px" },
  { id: "4:5", ratio: "4 / 5", maxWidth: "520px" },
];
/** Embed.withFrame: the player in a frame's shape, cropping unless it is wide. */
export function withFrame(n: El, id: string): El {
  const f = FRAMES.find((x) => x.id === javaTrim(id));
  if (!f) return n;
  const wide = f === FRAMES[0];
  let s = n.styles;
  s = setStyle(s, "base", "default", "aspect-ratio", wide ? undefined : f.ratio);
  s = setStyle(s, "base", "default", "max-width", f.maxWidth);
  s = setStyle(s, "base", "default", "margin-inline", wide ? undefined : "auto");
  return { ...n, styles: s, className: toggleClass(n.className, CROP, !wide) };
}

/** Bindings asked for: attributes the kind can bind, keys the site knows. `null` unbinds. */
export function bindings(kind: Kind, current: Record<string, string>, o: unknown, ctx: Context): Record<string, string> {
  const allowed = new Set(bindable(kind));
  const acc = { ...current };
  for (const [attr, v] of entries(o)) {
    if (!allowed.has(attr)) continue;
    const k = text(v);
    if (k === undefined) delete acc[attr];
    else if (validBinding(k) || ctx.field?.(k)) acc[attr] = k;
  }
  return acc;
}

/** A loop query merged into `current` and normalized. `null` removes a key. */
export function loopQuery(current: Record<string, string>, o: unknown): Record<string, string> {
  const acc = { ...current };
  for (const [k, v] of entries(o)) {
    const t = text(v);
    if (t === undefined) delete acc[k]; else acc[k] = t;
  }
  return Object.fromEntries(normalizeQuery(acc));
}

/** An element's HTML id as the element spec keeps it. */
export const ANCHOR = /^[A-Za-z][A-Za-z0-9_-]{0,80}$/;
export const HTML_BLOCK = "core/html";
const OPENING = new RegExp(`^<!-- wp:([a-z0-9-]+(?:/[a-z0-9-]+)?)[${WS.slice(1, -1)}/-]`);

/** The block a piece of markup opens with (`<!-- wp:paragraph` is `core/paragraph`). */
export function markupBlock(markup: string): string | undefined {
  const m = OPENING.exec(markup);
  if (!m || !markup.startsWith("<!-- wp:")) return undefined;
  return m[1]!.includes("/") ? m[1] : `core/${m[1]}`;
}

/** EzyBlocks.equivalents: the same site piece on the other platform. */
const EQUIVALENTS: readonly [string, string][] = [
  ["core/site-title", "ezy/site-logo"], ["core/site-logo", "ezy/site-logo"], ["core/site-tagline", "ezy/site-tagline"],
  ["core/search", "ezy/search"], ["woocommerce/customer-account", "ezy/account-link"], ["woocommerce/mini-cart", "ezy/cart-link"],
  ["auvyx-woo/wishlist-link", "ezy/wishlist-link"],
];
export const equivalents = (name: string): string[] =>
  [...new Set(EQUIVALENTS.flatMap(([wp, ezy]) => (wp === name ? [ezy] : ezy === name ? [wp] : [])))];

// Forms (parse + markup: a form's fields are a list, which the generic attributes leave out)
const FORM = "auvyx/form";
const FORM_KINDS = ["text", "email", "tel", "number", "date", "textarea", "select", "radio", "checkbox", "url"];
const FORM_MARKUP = /^[ \t\n\x0B\f\r]*<!--[ \t\n\x0B\f\r]+wp:auvyx\/form(?:[ \t\n\x0B\f\r]+(\{[\s\S]*\}))?[ \t\n\x0B\f\r]+\/-->[ \t\n\x0B\f\r]*$/;
const FORM_EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,253}\.[^\s@<>"']{2,}$/;
const recipients = (to: string) =>
  [...new Set(to.split(/[,;\s]+/).map(javaTrim).filter((a) => a !== "" && a.length <= 320 && FORM_EMAIL.test(a)))].slice(0, 5).join(", ");
const formUrl = (url: string, allowPath: boolean) => {
  const u = javaTrim(url);
  const ok = u.length <= 300 && ![...u].some((c) => /\s/.test(c) || c === '"' || c === "'" || c === "<" || c === ">" || c === "\\" || c < " ") &&
    (/^https?:\/\/[^/?#]+[\s\S]*$/i.test(u) || (allowPath && u.startsWith("/") && !u.startsWith("//")));
  return ok ? u : "";
};

function formMarkup(raw: string): string | undefined {
  const m = FORM_MARKUP.exec(raw);
  if (!m || m[1] === undefined) return undefined;
  let o: unknown;
  try { o = JSON.parse(m[1]); } catch { return undefined; }
  if (!isRecord(o)) return undefined;
  const s = (v: unknown, max: number) => (typeof v === "string" ? javaTrim(v).slice(0, max) : "");
  const id = s(o.id, 60);
  if (!/^[a-z0-9][a-z0-9_-]{2,40}$/.test(id)) return undefined;
  const seen = new Set<string>();
  const fields = (Array.isArray(o.fields) ? o.fields : []).flatMap((f) => {
    if (!isRecord(f)) return [];
    const name = s(f.name, 40), kind = s(f.kind, 20);
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(name) || !FORM_KINDS.includes(kind) || seen.has(name)) return [];
    seen.add(name);
    const options = [...new Set((Array.isArray(f.options) ? f.options : []).flatMap((x) => (typeof x === "string" ? [javaTrim(x).slice(0, 300)] : [])).filter((x) => x !== ""))].slice(0, 30);
    const out: Record<string, unknown> = { name, label: s(f.label, 120) || name, kind };
    if (f.required === true) out.required = true;
    if (options.length) out.options = options;
    const ph = s(f.placeholder, 120);
    if (ph) out.placeholder = ph;
    return [out];
  }).slice(0, 30);
  const json: Record<string, unknown> = { id, fields, submit: s(o.submit, 60) || "Send", success: s(o.success, 300) || "Thank you. We received your message." };
  if (o.mail === false) json.mail = false;
  const extra: [string, string][] = [["to", recipients(s(o.to, 2000))], ["subject", javaTrim(s(o.subject, 150)).slice(0, 150)],
    ["redirect", formUrl(s(o.redirect, 400), true)], ["webhook", formUrl(s(o.webhook, 400), false)]];
  for (const [k, v] of extra) if (v) json[k] = v;
  return `<!-- wp:${FORM} ${escapeComment(writeJson(json))} /-->`;
}

/** A block the agent may create: one the site offers, with scalar attributes the server re-renders. */
export function rawBlock(name: string, attrs: unknown, ctx: Context): string | undefined {
  if (name === FORM) return ctx.block?.(name) !== undefined ? formMarkup(`<!-- wp:${FORM} ${writeJson(attrs)} /-->`) : undefined;
  const registered = ctx.block?.(name);
  if (registered === undefined) return undefined;
  const clean = entries(attrs).filter(([k, v]) => /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(k) && ["string", "number", "boolean"].includes(typeof v));
  const json = clean.length ? " " + writeJson(Object.fromEntries(clean)) : "";
  return `<!-- wp:${registered}${json} /-->`;
}

/** Class tokens as the element keeps them: names only, at most 40, no duplicates. */
export const classes = (value: string) =>
  [...new Set(value.split(SPLIT).filter((c) => /^[A-Za-z_][A-Za-z0-9_-]{0,80}$/.test(c)))].slice(0, 40).join(" ");

const GAME_KEY = /^[a-z0-9][a-z0-9-]{5,63}$/;
const toLevel = (s: string | undefined) => {
  if (s === undefined) return 2;
  const t = javaTrim(s);
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[dDfF]?$/.test(t)) return 2;
  const l = Math.trunc(parseFloat(t));
  return l >= 1 && l <= 6 ? l : 2;
};

// ---- element tree → elements -------------------------------------------------------------

/**
 * One element tree → its root and every node below it, or undefined for unknown kinds, blocks the site does not offer,
 * code without the right to script. `pageLevel`: a page's own section (full width, `section` tag by default).
 */
export function decode(o: unknown, pageLevel: boolean, ctx: Context): [El, Record<string, El>] | undefined {
  const stylesOf = () => { const s = field(o, "styles"); return s === undefined ? {} : styles(s); };
  const alignOf = (d: string) => { const a = str(o, "align"); return a === "full" || a === "wide" ? a : d; };
  const kind = str(o, "kind");
  if (kind === "game") {
    // The editor keeps no game sources: a game element names one the site already has.
    const written = ["html", "js"].some((k) => javaTrim(str(o, k) ?? "") !== "");
    const named = str(o, "game");
    if (written || named === undefined || !GAME_KEY.test(named)) return undefined;
    return [el(ctx.newId(), "Section", { tag: pageLevel ? "section" : "div", className: "auvyx-game", align: alignOf(pageLevel ? "full" : ""),
      game: named, css: str(o, "css") ?? "", styles: stylesOf(), label: str(o, "label") ?? "Game" }), {}];
  }
  if (kind === "code") {
    if (!ctx.canScript) return undefined;
    const tag = str(o, "tag");
    return [el(ctx.newId(), "Section", {
      tag: tag !== undefined && (SECTION_TAGS as readonly string[]).includes(tag) ? tag : pageLevel ? "section" : "div",
      className: "auvyx-code", align: alignOf(pageLevel ? "full" : ""), markup: str(o, "html") ?? "", script: str(o, "js") ?? "",
      libs: codeLibs(strs(o, "libs")), uses: strs(o, "data"), css: str(o, "css") ?? "", styles: stylesOf(), label: str(o, "label") ?? "Code",
    }), {}];
  }
  if (kind === "block") {
    const known = (name: string) => ctx.block?.(name) ?? (ctx.rawMarkup && ctx.html && name === HTML_BLOCK ? name : undefined);
    const own = (name: string) => {
      const m = str(o, "markup");
      const r = known(name);
      return m !== undefined && ctx.rawMarkup && r !== undefined && markupBlock(m) === r ? m : undefined;
    };
    const name = str(o, "block");
    if (name === undefined) return undefined;
    let found: [string, string] | undefined;
    if (known(name) !== undefined) {
      const raw = own(name) ?? rawBlock(name, field(o, "attrs") ?? null, ctx);
      if (raw !== undefined) found = [name, raw];
    } else {
      const other = equivalents(name).find((x) => ctx.block?.(x) !== undefined);
      const raw = other === undefined ? undefined : rawBlock(other, null, ctx);
      if (other !== undefined && raw !== undefined) found = [other, raw];
    }
    if (!found) return undefined;
    return [el(ctx.newId(), "Raw", { blockName: known(found[0]) ?? found[0], raw: found[1], html: "", align: alignOf(""), styles: stylesOf() }), {}];
  }
  const k = kind === undefined ? undefined : kindOf(kind);
  if (k === undefined || k === "Raw") return undefined;
  const rawKids = field(o, "children");
  const kids = Array.isArray(rawKids) ? rawKids.flatMap((c) => { const d = decode(c, false, ctx); return d ? [d] : []; }) : [];
  const own = classes(str(o, "class") ?? "");
  const withBehaviour = k === "Nav" ? drawer(own, field(o, "drawer"))
    : k === "Video" && str(o, "autoplay") === "true" ? toggleClass(own, AUTOPLAY, true) : own;
  const ix = field(o, "interaction");
  const choice = ix === undefined ? undefined : choiceFromJson(ix, readChoice(withBehaviour));
  const className = choice && validChoice(k, choice) ? writeChoice(withBehaviour, choice) : withBehaviour;
  const tag = str(o, "tag");
  const icon = str(o, "icon");
  const anchor = str(o, "anchor");
  const toggleAt = str(o, "toggleAt");
  const b = field(o, "bind");
  const node = el(ctx.newId(), k, {
    text: str(o, "text") ?? "",
    tag: tag !== undefined && (SECTION_TAGS as readonly string[]).includes(tag) ? tag : pageLevel ? "section" : "div",
    level: toLevel(str(o, "level")),
    href: str(o, "href") ?? "",
    src: k === "Path" ? safePath(str(o, "path") ?? "") : k === "Nav" ? str(o, "menu") ?? "pages" : str(o, "src") ?? "",
    alt: k === "Path" ? safeBox(str(o, "viewBox") ?? "") : k === "Nav" ? (toggleAt !== undefined && (NAV_TOGGLES as readonly string[]).includes(toggleAt) ? toggleAt : "mobile") : str(o, "alt") ?? "",
    className,
    anchor: anchor !== undefined && ANCHOR.test(anchor) ? anchor : "",
    icon: icon !== undefined && ICONS.has(icon) ? icon : k === "Icon" ? "star" : "",
    align: alignOf(pageLevel && k === "Section" ? "full" : ""),
    styles: stylesOf(),
    css: str(o, "css") ?? "",
    children: kids.map(([c]) => c.id),
    bind: b === undefined ? {} : bindings(k, {}, b, ctx),
    query: k === "Loop" ? loopQuery({}, field(o, "query") ?? {}) : {},
  });
  const frame = str(o, "frame");
  const framed = k === "Video" && frame !== undefined ? withFrame(node, frame) : node;
  const rest: Record<string, El> = {};
  for (const [c, below] of kids) { Object.assign(rest, below); rest[c.id] = c; }
  return [framed, rest];
}

/** Page-level element trees → a document. */
export function decodePage(trees: readonly unknown[], ctx: Context): Doc {
  const roots = trees.flatMap((t) => { const d = decode(t, true, ctx); return d ? [d] : []; });
  const nodes: Record<string, El> = {};
  for (const [r, rest] of roots) { Object.assign(nodes, rest); nodes[r.id] = r; }
  return { roots: roots.map(([r]) => r.id), nodes };
}
