/**
 * Elementor exports → Auvyx (ElementorImport.scala, ported line by line so the same file makes the same document). Reads
 * the JSON Elementor writes when a page or a template is exported (`{"content": [...], "type": "page", "title"}`), a
 * page's stored `_elementor_data` (the bare element array) and an exported kit's files, and builds the same page from
 * Auvyx's own pieces: sections and containers become boxes with their layout, background, spacing and breakpoints;
 * widgets become Auvyx elements; HTML and shortcode widgets are kept as blocks. A widget with no Auvyx counterpart becomes a
 * marked placeholder and is listed in `kept`, never dropped silently. Pure.
 *
 * Elements are created in the order Scala creates them (arguments before the call, values before what uses them), so
 * an id generator counting up gives the same ids as the Studio's.
 */
import { composeBackground } from "../background";
import { javaTrim } from "../json";
import type { El } from "../model";
import { Ctx, type Decl, NONE, S, css, sOf } from "./ctx";
import { type JObj, type JVal, EMPTY, WSC, arr, capitalize, fixed, get, isObj, obj, split, str, toDouble, toInt } from "./jvm";
import {
  FORM_BLOCK, FORM_MAX_FIELDS, FORM_MAX_OPTIONS, type Form, type FormField, animateClass, cardGrid, cardLoop, countdownClass,
  embedFile, embedUrl, field, formMarkup, formPreview, markLinked, sliderClass, slugify,
} from "./pieces";

/** One page or template from the export. `docType`: Elementor's document type (page, header, footer, section…). */
export interface Piece { id: string; title: string; docType: string; elements: JVal[] }
/** The kit's global colours (Elementor id → CSS colour) and fonts (id → family), and the boxed content width. */
export interface Globals { colors: Map<string, string>; fonts: Map<string, string>; width: number; name: string }
export interface Result { roots: string[]; nodes: Record<string, El>; kept: string[] }

export const emptyGlobals = (): Globals => ({ colors: new Map(), fonts: new Map(), width: 1140, name: "" });

// ---- reading the files --------------------------------------------------------------------------

const elementLike = (v: JVal): boolean => obj(v).has("elType");

/** True when the JSON is something Elementor wrote: a page or template export, a kit page, a kit manifest or its site settings. */
export function detect(json: JVal): boolean {
  const m = obj(json);
  const content = m.get("content");
  return (content !== undefined && arr(content).some(elementLike)) || (m.has("elementor_version") && m.has("templates")) ||
    [...obj(m.get("settings") ?? null).keys()].some((k) => k === "system_colors" || k === "system_typography") ||
    arr(json).some(elementLike);
}

const lastSegment = (name: string) => { const parts = split(name, /\//); return parts[parts.length - 1] ?? ""; };
const stripSuffix = (s: string, x: string) => (s.endsWith(x) ? s.slice(0, s.length - x.length) : s);
const stripPrefix = (s: string, x: string) => (s.startsWith(x) ? s.slice(x.length) : s);

/** The page or template in one exported file; `name` is the file's name, used for the id and as a fallback title. */
export function piece(json: JVal, name: string): Piece | undefined {
  const m = obj(json);
  const content = m.get("content");
  const elements = (content !== undefined ? arr(content) : arr(json).some(elementLike) ? arr(json) : []).filter(elementLike);
  if (!elements.length) return undefined;
  const id = stripSuffix(lastSegment(name), ".json");
  const meta = obj(m.get("metadata") ?? null);
  const title = [get(m, "title"), get(meta, "title")].find((t) => javaTrim(t) !== "") ?? capitalize(id.replaceAll("-", " ").replaceAll("_", " "));
  return { id, title: javaTrim(title), docType: [get(m, "type"), get(meta, "template_type"), get(meta, "doc_type")].find((t) => t !== "") ?? "page", elements };
}

/** A kit's `manifest.json`: its name, and for each exported page or template id, its title and document type. */
export function manifest(json: JVal): [string, Map<string, [string, string]>] {
  const m = obj(json);
  const known = new Map<string, [string, string]>();
  for (const [id, t] of obj(m.get("templates") ?? null)) known.set(id, [get(obj(t), "title"), get(obj(t), "doc_type")]);
  for (const [kind, items] of obj(m.get("content") ?? null))
    for (const [id, t] of obj(items)) known.set(id, [get(obj(t), "title"), kind === "page" ? "page" : kind]);
  return [[get(m, "title"), get(m, "name")].find((x) => x !== "") ?? "", known];
}

/** A kit's `site-settings.json`: the global colours and fonts, and the content width. */
export function globals(json: JVal): Globals | undefined {
  const s = obj(obj(json).get("settings") ?? null);
  if (!s.has("system_colors") && !s.has("system_typography")) return undefined;
  const colors = new Map<string, string>();
  for (const c of [...arr(s.get("system_colors") ?? []), ...arr(s.get("custom_colors") ?? [])]) {
    const v = get(obj(c), "color");
    if (SAFE_COLOR.test(v)) colors.set(get(obj(c), "_id"), v);
  }
  const fonts = new Map<string, string>();
  for (const f of [...arr(s.get("system_typography") ?? []), ...arr(s.get("custom_typography") ?? [])]) {
    const v = get(obj(f), "typography_font_family");
    if (SAFE_FAMILY.test(v)) fonts.set(get(obj(f), "_id"), v);
  }
  const size = obj(s.get("container_width") ?? null).get("size");
  const d = size === undefined ? undefined : toDouble(str(size));
  const w = d === undefined ? undefined : Math.trunc(d);
  return { colors, fonts, width: w !== undefined && w >= 600 && w <= 2400 ? w : 1140, name: get(s, "site_name") };
}

/** The design brief (DESIGN.md front matter) from the kit's globals. */
export function brief(g: Globals): string {
  const c = (id: string) => g.colors.get(id);
  const colors = ([["primary", c("primary")], ["secondary", c("secondary")], ["on-background", c("text")], ["tertiary", c("accent")]] as const)
    .filter(([, v]) => v !== undefined).map(([k, v]) => `  ${k}: "${v}"`);
  const heading = g.fonts.get("primary") ?? g.fonts.get("secondary");
  const body = g.fonts.get("text") ?? heading;
  if (!colors.length && heading === undefined) return "";
  return [
    "---", `name: ${g.name || "Imported from Elementor"}`,
    ...(colors.length ? ["colors:"] : []), ...colors,
    ...(heading !== undefined || body !== undefined ? ["typography:"] : []),
    ...(heading !== undefined ? [`  headline-lg: { fontFamily: ${heading}, fontSize: 48px }`] : []),
    ...(body !== undefined ? [`  body-md: { fontFamily: ${body}, fontSize: 16px }`] : []),
    "---", "Imported from an Elementor kit: its global colours and fonts.",
  ].join("\n") + "\n";
}

// ---- values -------------------------------------------------------------------------------------

const SAFE_COLOR = new RegExp(`^(#[0-9a-fA-F]{3,8}|rgba?\\([\\d${WSC}.,%]+\\)|hsla?\\([\\d${WSC}.,%deg]+\\))$`);
const SAFE_FAMILY = /^[A-Za-z0-9 _-]{1,60}$/;
const SAFE_URL = new RegExp(`^(https?:\\/\\/|\\/)[^${WSC}"'()<>]+$`, "i");
const UNITS = new Set(["px", "%", "em", "rem", "vh", "vw", "vmin", "vmax"]);
const DOTLESS = "[^\\n\\r\\u0085\\u2028\\u2029]";

const token = (slug: string) => `var(--wp--preset--color--${slug})`;
/** Elementor's system colours → Auvyx's design tokens, so a recoloured brief recolours the import too. */
const SYSTEM_COLORS = new Map([["primary", token("auvyx-primary")], ["secondary", token("auvyx-secondary")], ["text", token("auvyx-text")], ["accent", token("auvyx-accent")]]);

const len = (d: number, unit: string) => `${stripSuffix(fixed(d, 2), ".00")}${unit}`;
const trimmedDouble = (s: string) => { const t = javaTrim(s); return t ? toDouble(t) : undefined; };

/** `{size, unit}` → a CSS length. */
function dim(v: JVal | undefined): string | undefined {
  const m = obj(v);
  const size = javaTrim(get(m, "size"));
  const unit = get(m, "unit") || "px";
  if (!size || !UNITS.has(unit)) return undefined;
  const d = toDouble(size);
  return d === undefined ? undefined : len(d, unit);
}

/** `{top, right, bottom, left, unit}` → four logical sides of `prop` (padding, margin). */
function sides(v: JVal, prop: string): Decl[] {
  const m = obj(v);
  const u = get(m, "unit");
  const unit = UNITS.has(u) ? u : "px";
  const one = (k: string) => { const d = trimmedDouble(get(m, k)); return d === undefined ? undefined : len(d, unit); };
  const out: Decl[] = [];
  for (const [k, x] of [[`${prop}-block-start`, one("top")], [`${prop}-inline-end`, one("right")], [`${prop}-block-end`, one("bottom")], [`${prop}-inline-start`, one("left")]] as const)
    if (x !== undefined) out.push([k, x]);
  return out;
}

/** `{top, right, bottom, left, unit}` → `border-radius`. */
function radius(v: JVal): string | undefined {
  const m = obj(v);
  const u = get(m, "unit");
  const unit = UNITS.has(u) ? u : "px";
  const vs = ["top", "right", "bottom", "left"].map((k) => toDouble(javaTrim(get(m, k))) ?? 0);
  if (!vs.some((d) => d !== 0)) return undefined;
  return new Set(vs).size === 1 ? len(vs[0]!, unit) : vs.map((d) => len(d, unit)).join(" ");
}

const LINKISH = new RegExp(`^(https?:|\\/|#|mailto:|tel:)${DOTLESS}*$`, "i");
const linkText = (url: string) => { const u = javaTrim(url); return !u ? "" : LINKISH.test(u) ? u : ""; };
const link = (v: JVal | undefined): string => linkText(get(obj(v), "url"));

const W = `[${WSC}]`;
/** Inline HTML from Elementor as text an Auvyx text or heading can hold: no scripts, no handlers, no `javascript:`. */
export function clean(html: string): string {
  return javaTrim(html
    .replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed)\b[^>]*\/?>/gi, "")
    .replace(new RegExp(`${W}+on[a-z]+${W}*=${W}*("[^"]*"|'[^']*'|[^${WSC}>]+)`, "gi"), "")
    .replace(new RegExp(`(href|src)${W}*=${W}*(["'])${W}*javascript:[^"']*\\2`, "gi"), "$1=\"#\"")
    .replace(/<\/?(div|span|font)\b[^>]*>/gi, "")
    .replaceAll(" ", " "));
}

const TAGS = /<[^>]+>/g;
const visible = (t: string) => javaTrim(t.replace(TAGS, "")) !== "";
const some = <A>(a: A | undefined): A[] => (a === undefined ? [] : [a]);
const decl = (k: string, v: string | undefined): Decl[] => (v === undefined ? [] : [[k, v]]);
/** `(?i)…` matched against the whole string, as Java's `matches`. */
const whole = (pattern: string) => new RegExp(`^(?:${pattern})$`, "i");
/** `(?i)…` found anywhere, as Scala's `findFirstIn`. */
const within = (pattern: string) => new RegExp(pattern, "i");

// ---- building -----------------------------------------------------------------------------------

/** A role: the keys that hold it (first non-empty wins) and the prefixes of its style keys. */
interface Role { keys: string[]; style: string }
const role = (keys: string[], style: string): Role => ({ keys, style });
const INK = "var(--wp--preset--color--auvyx-text)";
const TITLE_ROLE = role(["title", "heading", "heading_title", "title_text", "name"], "^(title|heading|name)");
const SUB_ROLE = role(["sub_title", "subtitle", "sub_heading", "subheading", "tagline"], "^(sub|tagline)");
const PRE_ROLE = role(["before_title", "pre_title", "before_heading"], "^(before|pre)_?(title|heading)");
const AFTER_ROLE = role(["after_title", "after_heading"], "^after_?(title|heading)");
const LEAD_ROLE = role(["before_desc", "before_description"], "^before_?desc");
const DESC_ROLE = role(["description", "desc", "description_text", "text", "content", "editor"], "^(desc|description|content|text)");
const BUTTON_ROLE = role(["button_text", "btn_text", "button_label", "button"], "^(btn|button)");
const PICTURE = new RegExp(`^(https?:\\/\\/|\\/)[^${WSC}]+\\.(jpe?g|png|webp|gif|avif|svg)(\\?[^${WSC}]*)?$`, "i");
const BLOCK = /<(h[1-6]|p|ul|ol|blockquote|figure|table)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const m0: Decl[] = [["margin-block-start", "0"], ["margin-block-end", "0"]];
const sortedKeys = (m: JObj) => [...m.keys()].sort();

export function build(elements: JVal[], g: Globals, assets: string, newId: () => string): Result {
  const c = new Ctx(newId, assets);
  const kept: string[] = [];
  const boxed = `${g.width}px`;

  /** A colour setting: the global it points at (as an Auvyx token or the kit's value), else its own value. */
  const colorOf = (s: JObj, key: string): string | undefined => {
    const ref = obj(s.get("__globals__") ?? null).get(key);
    if (ref !== undefined && str(ref) !== "") {
      const id = split(str(ref), /id=/)[1] ?? "";
      const global = SYSTEM_COLORS.get(id) ?? g.colors.get(id);
      if (global !== undefined) return global;
    }
    const own = s.get(key);
    if (own === undefined) return undefined;
    const t = javaTrim(str(own));
    return SAFE_COLOR.test(t) ? t : undefined;
  };

  /** One setting at each breakpoint (`key`, `key_tablet`, `key_mobile`) → declarations per breakpoint. */
  const resp = (s: JObj, key: string, f: (v: JVal) => Decl[]): S => {
    const at = (sfx: string) => { const v = s.get(key + sfx); return v === undefined || v === null ? [] : f(v); };
    return sOf({ base: at(""), tablet: at("_tablet"), mobile: at("_mobile") });
  };
  const respDim = (s: JObj, key: string, prop: string) => resp(s, key, (v) => decl(prop, dim(v)));

  const HEADING_FONT: Decl = ["font-family", "var(--wp--preset--font-family--auvyx-heading)"];
  const typography = (s: JObj, prefix = "typography"): S => {
    const ref = obj(s.get("__globals__") ?? null).get(`${prefix}_typography`);
    const gid = ref === undefined ? undefined : split(str(ref), /id=/)[1];
    let family: Decl[];
    if (gid === "primary" || gid === "secondary") family = [HEADING_FONT];
    else {
      const f = get(s, `${prefix}_font_family`);
      family = f && g.fonts.get("primary") === f ? [HEADING_FONT] : [];
    }
    const weight = get(s, `${prefix}_font_weight`);
    const transform = get(s, `${prefix}_text_transform`);
    const style = get(s, `${prefix}_font_style`);
    return sOf({ base: [...family,
      ...(/^(\d{3}|normal|bold)$/.test(weight) ? [["font-weight", weight] as Decl] : []),
      ...(["uppercase", "lowercase", "capitalize", "none"].includes(transform) ? [["text-transform", transform] as Decl] : []),
      ...(["italic", "normal"].includes(style) ? [["font-style", style] as Decl] : [])] })
      .plus(respDim(s, `${prefix}_font_size`, "font-size"))
      .plus(respDim(s, `${prefix}_line_height`, "line-height"))
      .plus(respDim(s, `${prefix}_letter_spacing`, "letter-spacing"));
  };

  const textAlign = (s: JObj, key = "align"): S =>
    resp(s, key, (v) => (["left", "center", "right", "justify", "start", "end"].includes(str(v)) ? [["text-align", str(v)]] : []));

  /** Background (classic or gradient) and its overlay. */
  const background = (s: JObj, p = "background"): Decl[] => {
    switch (get(s, `${p}_background`)) {
      case "classic": {
        const u = get(obj(s.get(`${p}_image`) ?? null), "url");
        const img = SAFE_URL.test(u) ? u : undefined;
        let overlay: string | undefined;
        if (get(s, `${p}_overlay_background`) === "classic") {
          const col = colorOf(s, `${p}_overlay_color`);
          if (col !== undefined) {
            const size = obj(s.get(`${p}_overlay_opacity`) ?? null).get("size");
            const op = (size === undefined ? undefined : toDouble(str(size))) ?? 0.5;
            overlay = `color-mix(in srgb, ${col} ${Math.round(op * 100)}%, transparent)`;
          }
        }
        const sz = get(s, `${p}_size`);
        const pos = get(s, `${p}_position`);
        const rep = get(s, `${p}_repeat`);
        return [
          ...decl("background-color", colorOf(s, `${p}_color`)),
          ...decl("background-image", composeBackground({ overlay: overlay ?? "", image: img ?? "" })),
          ...(img !== undefined ? [
            ["background-size", ["cover", "contain", "auto"].includes(sz) ? sz : "cover"],
            ["background-position", /^[a-z ]{1,30}$/.test(pos) ? pos : "center center"],
            ["background-repeat", /^[a-z-]{1,12}$/.test(rep) ? rep : "no-repeat"]] as Decl[] : []),
        ];
      }
      case "gradient": {
        const a = colorOf(s, `${p}_color`);
        const b = colorOf(s, `${p}_color_b`);
        if (a !== undefined && b !== undefined) {
          const size = obj(s.get(`${p}_gradient_angle`) ?? null).get("size");
          const angle = Math.trunc((size === undefined ? undefined : toDouble(str(size))) ?? 180);
          return [["background-image", `linear-gradient(${angle}deg, ${a}, ${b})`]];
        }
        return a !== undefined ? [["background-color", a]] : [];
      }
      default: return [];
    }
  };

  const border = (s: JObj, p = "border"): S => {
    const style = get(s, `${p}_border`);
    let line: Decl[] = [];
    if (["solid", "dashed", "dotted", "double"].includes(style)) {
      // one `border-width` (top right bottom left): the allowlist takes the shorthand, not the four sides
      const m = obj(s.get(`${p}_width`) ?? null);
      const u = get(m, "unit");
      const unit = UNITS.has(u) ? u : "px";
      const vs = ["top", "right", "bottom", "left"].map((k) => toDouble(javaTrim(get(m, k))) ?? 0);
      const w: Decl[] = vs.some((d) => d !== 0) ? [["border-width", vs.map((d) => len(d, unit)).join(" ")]] : [];
      line = [["border-style", style], ...decl("border-color", colorOf(s, `${p}_color`)), ...(w.length ? w : [["border-width", "1px"] as Decl])];
    }
    return sOf({ base: line }).plus(resp(s, `${p}_radius`, (v) => decl("border-radius", radius(v))));
  };

  const ANIMS: [RegExp, string][] = [
    [/^(fadeinup|slideinup)$/, "up"], [/^(fadeindown|slideindown)$/, "down"], [/^(fadeinleft|slideinleft)$/, "left"],
    [/^(fadeinright|slideinright)$/, "right"], [/^fadein$/, "fade"], [/^zoomin/, "zoom"], [/^bouncein/, "bounce"], [/^flipinx$/, "flip-x"], [/^flipiny$/, "flip-y"],
  ];

  /** What every element can carry in Elementor's Advanced tab: margin, padding, width, hide per device, an id, classes
   * and an entrance animation. */
  const advanced = (s: JObj, id: string, widget: boolean): string => {
    const pre = widget ? "_" : "";
    let width = NONE;
    if (widget) {
      const w = respDim(s, "_element_custom_width", "width");
      width = !w.empty ? w.plus(css(["max-width", "100%"])) : w;
    }
    const st = resp(s, `${pre}margin`, (v) => sides(v, "margin")).plus(resp(s, `${pre}padding`, (v) => sides(v, "padding"))).plus(width)
      .plus(sOf({ tablet: get(s, "hide_tablet") ? [["display", "none"]] : [], mobile: get(s, "hide_mobile") ? [["display", "none"]] : [] }));
    if (!st.empty) c.styled(st, id);
    const a = [get(s, "_animation"), get(s, "animation")].find((x) => x !== "")?.toLowerCase();
    const anim = a === undefined ? undefined : ANIMS.find(([re]) => re.test(a))?.[1];
    const cls = [get(s, "_css_classes"), get(s, "css_classes")].find((x) => x !== "");
    const classes = cls === undefined ? "" : split(cls, new RegExp(`${W}+`)).filter((x) => /^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(x)).join(" ");
    const withClasses = classes ? c.classed(classes, id) : id;
    const animated = anim === undefined ? withClasses : c.classed(animateClass(anim), withClasses);
    const anchor = [get(s, "_element_id"), get(s, "css_id")].find((x) => x !== "") ?? "";
    return /^[A-Za-z][A-Za-z0-9_-]{0,60}$/.test(anchor) ? c.anchored(anchor, animated) : animated;
  };

  // ---- rich text: headings and paragraphs become Auvyx text; lists and tables stay HTML ----
  const richText = (html: string, st: S): string[] => {
    const out: string[] = [];
    let last = 0;
    const loose = (x: string) => {
      const t = clean(x.replace(new RegExp(`<br${W}*\\/?>`, "gi"), "<br>"));
      if (visible(t)) out.push(c.text(t, st.plus(css(...m0))));
    };
    for (const m of html.matchAll(BLOCK)) {
      loose(html.substring(last, m.index!));
      last = m.index! + m[0].length;
      const tag = m[1]!.toLowerCase();
      if (tag.startsWith("h")) out.push(c.heading(clean(m[3]!), Number(tag.slice(1)), st.plus(css(...m0))));
      else if (tag === "p") { if (visible(clean(m[3]!))) out.push(c.text(clean(m[3]!), st.plus(css(...m0)))); }
      else {
        const raw = clean(m[0]);
        out.push(c.keep("core/html", `<!-- wp:html -->\n${raw}\n<!-- /wp:html -->`, raw));
      }
    }
    loose(html.substring(last));
    return out;
  };

  const placeholder = (widget: string): string => {
    kept.push(widget);
    return c.named(`Elementor: ${widget}`, c.div(css(["padding-block-start", "20px"], ["padding-block-end", "20px"], ["padding-inline-start", "20px"], ["padding-inline-end", "20px"],
      ["border", "1px dashed currentColor"], ["opacity", "0.7"], ["text-align", "center"]), [
      c.text(`Elementor widget “${widget}”: no Auvyx counterpart yet. Rebuild it here, then delete this box.`, css(["font-size", "0.875rem"], ...m0))]));
  };

  /** Font Awesome's common list marks as text, so a list keeps its ticks without the icon font. */
  const glyph = (icon: string): string | undefined => {
    const parts = split(icon, new RegExp(`${W}+`));
    const n = stripPrefix(parts[parts.length - 1] ?? "", "fa-");
    if (["check", "check-circle", "check-square", "check-double", "circle-check", "square-check"].includes(n)) return "✓";
    if (["star", "star-half-alt"].includes(n)) return "★";
    if (["circle", "dot-circle", "circle-dot"].includes(n)) return "•";
    if (["arrow-right", "angle-right", "chevron-right", "long-arrow-alt-right", "caret-right", "arrow-right-long"].includes(n)) return "→";
    if (n === "heart") return "♥";
    if (["times", "xmark", "times-circle"].includes(n)) return "✕";
    if (n === "minus") return "–";
    return undefined;
  };

  const picture = (v: JVal | undefined): [string, string] | undefined => {
    const m = obj(v);
    const u = get(m, "url");
    return SAFE_URL.test(u) ? [u, get(m, "alt")] : undefined;
  };

  // ---- theme widgets: the add-on widgets themes ship, read by rules, never by a list of names ----

  const textFor = (m: JObj, r: Role): string => {
    // `text` names the title when there is no title key but a description beside it or a title style (an image box)
    const textIsTitle = !TITLE_ROLE.keys.some((k) => javaTrim(get(m, k)) !== "") && javaTrim(get(m, "text")) !== "" &&
      (["description", "desc"].some((k) => javaTrim(get(m, k)) !== "") || [...m.keys()].some((k) => k.startsWith("title_")));
    if (r === TITLE_ROLE) return textIsTitle ? get(m, "text") : r.keys.map((k) => get(m, k)).find((t) => javaTrim(t) !== "") ?? "";
    return r.keys.filter((k) => !(textIsTitle && k === "text")).map((k) => get(m, k)).find((t) => javaTrim(t) !== "") ?? "";
  };
  /** The first key (in the widget's own order) whose value is a picture, preferring backgrounds and images. */
  const pictureIn = (m: JObj): [string, string] | undefined => {
    const all: [string, [string, string]][] = [];
    for (const [k, v] of m) { const p = picture(v); if (p && PICTURE.test(p[0])) all.push([k, p]); }
    const rank = (k: string) => (/(background|bg)/i.test(k) ? 0 : /(image|img|photo|picture)/i.test(k) ? 1 : 2);
    return all.sort((a, b) => rank(a[0]) - rank(b[0]))[0]?.[1];
  };
  /** A link: `link`, then any key that ends in link or url, as a value or `{url}`. */
  const linkIn = (m: JObj): string => {
    const vs = [...some(m.get("link")), ...[...m].filter(([k]) => k !== "link" && /(link|url)$/i.test(k) && !/(video|youtube|vimeo)/i.test(k)).map(([, v]) => v)];
    return vs.map((v) => (typeof v === "string" ? linkText(v) : link(v))).find((u) => u !== "") ?? "";
  };
  /** The repeater: the longest array of objects that hold text or pictures. */
  const repeater = (m: JObj): JObj[] => {
    const lists = [...m.values()].map(arr).filter((a) => a.length && a.every(isObj)).map((a) => a.map(obj))
      .filter((a) => a.some((it) => [...it.values()].some((v) => javaTrim(str(v)) !== "" || picture(v) !== undefined)));
    return lists.sort((a, b) => b.length - a.length)[0] ?? [];
  };
  /** The first key (in name order) where `pattern` is found, case-insensitively, whose value is set. */
  const keyLike = (m: JObj, pattern: string): string | undefined => {
    const r = within(pattern);
    return sortedKeys(m).find((k) => {
      if (!r.test(k)) return false;
      const v = m.get(k);
      if (v === undefined) return false;
      const size = obj(v).get("size");
      const top = obj(v).get("top");
      return javaTrim(str(v)) !== "" || (size !== undefined && str(size) !== "") || (top !== undefined && str(top) !== "");
    });
  };
  const dimAt = (s: JObj, pattern: string) => { const k = keyLike(s, pattern); return k === undefined ? undefined : dim(s.get(k)); };
  const colorAt = (m: JObj, pattern: string) => { const k = keyLike(m, pattern); return k === undefined ? undefined : colorOf(m, k); };
  /** A text colour of a part: `<part>…color`, never a fill, an edge, a shadow or a hover state. */
  const textColor = (m: JObj, prefix: string): string | undefined => {
    const r = whole(`${prefix}[a-z_]*color`);
    for (const k of sortedKeys(m)) {
      if (!r.test(k) || /(bg|background|border|shadow|hover|overlay)/i.test(k)) continue;
      const col = colorOf(m, k);
      if (col !== undefined) return col;
    }
    return undefined;
  };
  /** A role's look: its colour (the item's own first, as repeaters override it) and its typography. */
  const lookOf = (s: JObj, item: JObj, r: Role): S => {
    const own = item === s ? undefined : textColor(item, r.style);
    // a title the widget does not colour is drawn dark by its theme's widget styles, so it keeps the ink
    const color = own ?? textColor(s, r.style) ?? (r === TITLE_ROLE ? INK : undefined);
    const re = whole(`${r.style}[a-z_]*_typography_typography`);
    const typo = sortedKeys(s).find((k) => re.test(k));
    const base = css(...decl("color", color), ...m0);
    return typo === undefined ? base : base.plus(typography(s, stripSuffix(typo, "_typography")));
  };
  const textOf = (t: string, st: S, level = 0): string | undefined => {
    const x = clean(t).replace(new RegExp(`<br${W}*\\/?>${W}*\\n`, "gi"), "<br>").replaceAll("\n", "<br>");
    if (!visible(x)) return undefined;
    return level > 0 ? c.heading(x, level, st) : c.text(x, st);
  };
  /** A length or four sides of the first key matching `pattern`. */
  const spaced = (s: JObj, pattern: string, prop: string): S => {
    const k = keyLike(s, pattern);
    return k === undefined ? NONE : resp(s, k, (v) => { const x = dim(v); return x === undefined ? sides(v, prop) : [[prop, x]]; });
  };
  /** The action: an underlined link unless the widget gives it a fill. */
  const actionOf = (s: JObj, label: string, href: string, item: JObj = EMPTY): string | undefined => {
    const t = javaTrim(clean(label).replace(TAGS, ""));
    if (!t) return undefined;
    const find = (m: JObj, pattern: string) => { const k = keyLike(m, pattern); return k === undefined || k.includes("hover") ? undefined : colorOf(m, k); };
    const bgPattern = "^(btn|button)[a-z_]*(bg|background)[a-z_]*color$|^background_color$";
    const fgPattern = "^(btn|button)(_custom)?(_text)?_color$|^(btn|button)_[a-z_]*text_color$";
    const clear = new RegExp(`^(?:#[0-9a-f]{6}00$|^rgba\\(${DOTLESS}*,${W}*0\\)$|^transparent)$`, "i");
    const bg0 = find(item, bgPattern) ?? find(s, bgPattern);
    const bg = bg0 !== undefined && !clear.test(bg0) ? bg0 : undefined;
    const fg = find(item, fgPattern) ?? find(s, fgPattern);
    const underline = whole(`${DOTLESS}*(underline|link|style_2)${DOTLESS}*`).test(get(s, "button_style")) || bg === undefined;
    const l = lookOf(s, s, BUTTON_ROLE);
    const st = css(["width", "fit-content"], ["font-weight", "500"],
      ...(underline ? [["background-color", "transparent"], ["padding-inline-start", "0"], ["padding-inline-end", "0"], ["padding-block-start", "4px"], ["padding-block-end", "4px"],
        ["text-decoration", "underline"], ["color", fg ?? "inherit"]] as Decl[]
        : [["background-color", bg!], ["color", fg ?? "var(--wp--preset--color--auvyx-inverse)"], ["padding-block-start", "12px"], ["padding-block-end", "12px"],
          ["padding-inline-start", "32px"], ["padding-inline-end", "32px"]] as Decl[]))
      .plus(sOf({ tablet: l.tablet, mobile: l.mobile, base: l.base.filter(([k]) => !(k === "color" || k.startsWith("margin"))) }))
      .plus(spaced(s, "^(btn|button|text)_padding$", "padding"));
    return c.button(t, st, href || "#");
  };
  /** Words over a picture (or a colour): a banner, a slide, a promo. */
  const banner = (s: JObj, item: JObj, label: string): string => {
    // the slide's picture, not one meant for its words' panel or its title
    const img = pictureIn(new Map([...item].filter(([k]) => !/(content|title)/i.test(k))))?.[0];
    const slide = item !== s;
    const hk = keyLike(item, "horizontal_position$") ?? keyLike(s, "horizontal_position$");
    const hpos = hk === undefined ? "left" : get(item.has(hk) ? item : s, hk);
    const vk = keyLike(s, "vertical_position$");
    const vpos = vk === undefined ? "middle" : get(s, vk);
    const tk = keyLike(s, "(text_align|content_align)$");
    const tv = tk === undefined ? undefined : get(s, tk);
    const talign = tv !== undefined && /^(left|center|right|flex-start|flex-end)$/.test(tv) ? tv : hpos;
    const items0 = hpos === "center" ? "center" : hpos === "right" || hpos === "flex-end" ? "flex-end" : "flex-start";
    const justify = vpos === "top" || vpos === "flex-start" ? "flex-start" : vpos === "bottom" || vpos === "flex-end" ? "flex-end" : "center";
    // a slide's title stands large and a banner's at a heading's size when the widget leaves them to the theme
    const titleSize = slide ? css(["font-size", "clamp(1.75rem, 1rem + 2.2vw, 2.75rem)"], ["font-weight", "500"]) : css(["font-size", "1.5rem"], ["font-weight", "500"]);
    const sub = some(textOf(textFor(item, SUB_ROLE), lookOf(s, item, SUB_ROLE)));
    const entries = [...item];
    const hasSale = entries.some(([k, v]) => /sale[\s\S]*price/i.test(k) && str(v) !== "");
    const price = [
      ...entries.filter(([k, v]) => whole(`${DOTLESS}*sale${DOTLESS}*price${DOTLESS}*`).test(k) && str(v) !== "").map(([, v]) => `<strong>${clean(str(v))}</strong>`),
      ...entries.filter(([k, v]) => whole(`${DOTLESS}*regular${DOTLESS}*price${DOTLESS}*`).test(k) && str(v) !== "").map(([, v]) => (hasSale ? `<del>${clean(str(v))}</del>` : `<strong>${clean(str(v))}</strong>`)),
    ];
    // a banner's subtitle stands over its title, a slide's under it (how themes draw them)
    const parts: string[] = [];
    parts.push(...some(textOf(textFor(item, PRE_ROLE), lookOf(s, item, PRE_ROLE))));
    if (!slide) parts.push(...sub);
    parts.push(...some(textOf(textFor(item, LEAD_ROLE), lookOf(s, item, LEAD_ROLE))));
    parts.push(...some(textOf(textFor(item, TITLE_ROLE), titleSize.plus(css(["line-height", "1.25"])).plus(lookOf(s, item, TITLE_ROLE)), 3)));
    parts.push(...some(textOf(textFor(item, AFTER_ROLE), lookOf(s, item, AFTER_ROLE))));
    if (slide) parts.push(...sub);
    const desc = textFor(item, DESC_ROLE);
    parts.push(...some(textOf(desc.startsWith("#") ? "" : desc, lookOf(s, item, DESC_ROLE))));
    if (price.length) parts.push(c.text(price.join(" "), css(...m0)));
    const action = actionOf(s, textFor(item, BUTTON_ROLE), linkIn(item), item);
    if (action !== undefined) parts.push(c.styled(css(["margin-block-start", "14px"]), action));
    const heightKey = keyLike(s, "^(slides?_|banner_)?height$");
    const height = heightKey === undefined ? css(["min-height", "300px"]) : respDim(s, heightKey, "min-height");
    // words on their own panel (a white box over the picture) when the widget gives the panel a fill
    const panelPattern = "^content_(bg|background)(_color)?$";
    const pi = keyLike(item, panelPattern);
    const ps = pi === undefined ? keyLike(s, panelPattern) : undefined;
    const panel = pi !== undefined ? colorOf(item, pi) : ps !== undefined ? colorOf(s, ps) : undefined;
    const bgImage = img !== undefined ? decl("background-image", composeBackground({ overlay: "", image: img })) : [];
    if (panel !== undefined) {
      const inner = c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "10px"], ["align-items", "flex-start"], ["text-align", "left"], ["background-color", panel],
        ["color", "var(--wp--preset--color--auvyx-text)"], ["max-width", "100%"], ["padding-block-start", "30px"], ["padding-block-end", "30px"], ["padding-inline-start", "32px"], ["padding-inline-end", "32px"])
        .plus(spaced(s, "^content_(padding|spacing)$", "padding")), parts);
      const outer = css(["display", "flex"], ["flex-direction", "column"], ["justify-content", justify], ["align-items", items0], ["min-width", "0"],
        ["padding-block-start", "40px"], ["padding-block-end", "40px"], ["padding-inline-start", "40px"], ["padding-inline-end", "40px"], ["background-size", "cover"], ["background-position", "center center"],
        ...bgImage).plus(height).plus(spaced(s, "^(banner|slides?|box)_padding$", "padding"));
      return c.named(label, c.div(outer, [inner]));
    }
    const st = css(["display", "flex"], ["flex-direction", "column"], ["gap", "10px"], ["justify-content", justify], ["align-items", items0], ["text-align", talign],
      ["padding-block-start", "30px"], ["padding-block-end", "30px"], ["padding-inline-start", "40px"], ["padding-inline-end", "40px"], ["min-width", "0"],
      ...(img !== undefined ? [["background-size", "cover"], ["background-position", "center center"]] as Decl[] : []),
      ...bgImage, ...decl("background-color", colorAt(item, "^((slide|item|banner)_)?(bg|background)_?color$")))
      .plus(height).plus(spaced(s, "^(banner|slides?|content|box)_padding$", "padding"));
    return c.named(label, c.div(st, parts));
  };
  /** A loop of posts or products; a carousel shows one row of them, as its first view does. */
  const loop = (postType: string, s: JObj, title: string, carousel = false): string[] => {
    const ints = (re: RegExp) => [...s].filter(([k]) => re.test(k)).map(([, v]) => toInt(str(v))).filter((n): n is number => n !== undefined);
    const first = ints(/^(columns|slidestoshow|per_row)$/i)[0];
    const cols = first !== undefined ? Math.max(1, Math.min(6, first)) : postType === "post" ? 3 : 4;
    let count = Math.min(24, Math.max(1, ints(/^(per_page|limit|posts_per_page|number)$/i)[0] ?? cols * 2));
    if (carousel) count = Math.min(count, cols);
    const products = get(s, "products");
    const source = postType !== "product" ? ""
      : products === "featured" ? "woo/featured" : products === "sale" || products === "on_sale" ? "woo/on_sale"
      : products === "best_selling" || products === "best_sellers" ? "woo/best_sellers" : products === "top_rated" ? "woo/top_rated" : "";
    // the widget's order, else WooCommerce's own (menu order, then name) for products, and newest first for posts
    const ob = get(s, "orderby");
    const orderBy = ["date", "title", "menu_order", "rand", "modified"].includes(ob) ? ob : postType === "product" ? "menu_order" : "date";
    const o = get(s, "order").toLowerCase();
    const order = o === "asc" || o === "desc" ? o : orderBy === "date" || orderBy === "modified" ? "desc" : "asc";
    // categories the widget picks, by slug
    const terms = split(["product_cats", "product_cat", "category", "categories", "cat"].map((k) => get(s, k)).find((x) => javaTrim(x) !== "") ?? "", /,/)
      .map(javaTrim).filter((x) => /^[a-z0-9-]+$/.test(x)).slice(0, 20).join(",");
    const head = some(textOf(title, css(["text-align", "center"]).plus(lookOf(s, s, TITLE_ROLE)), 2));
    const query: Decl[] = [["orderBy", orderBy], ["order", order], ...(source ? [["source", source] as Decl] : []),
      ...(terms ? [["taxonomy", postType === "product" ? "product_cat" : "category"], ["terms", terms]] as Decl[] : [])];
    if (postType === "product") {
      // Auvyx's own product card, at the widget's columns
      const style = { key: "imported", name: "Imported", columns: [cols, Math.min(cols, 3), 2] as [number, number, number] };
      return [...head, c.named("Products", cardLoop(c, style, count, cardGrid(style, "30px 24px"), query))];
    }
    const card = c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "8px"]), [
      c.bind(c.linkedImage("landscape", "", "#", css(["width", "100%"], ["aspect-ratio", "16 / 10"], ["object-fit", "cover"], ["display", "block"])),
        ["url", "featured_image"], ["alt", "post_title"], ["href", "post_url"]),
      c.bind(c.heading("Post title", 3, css(["font-size", "1rem"], ["font-weight", "500"], ...m0)), ["content", "post_title"]),
    ]);
    return [...head, c.named("Posts", c.loop([["postType", postType], ["perPage", String(count)], ...query],
      css(["display", "grid"], ["grid-template-columns", `repeat(${cols}, minmax(0, 1fr))`], ["gap", "30px"], ["width", "100%"])
        .t(["grid-template-columns", `repeat(${Math.min(cols, 3)}, minmax(0, 1fr))`]).m(["grid-template-columns", "repeat(1, minmax(0, 1fr))"], ["gap", "16px"]), [card]))];
  };
  const stars = (n: number) => { const k = Math.max(0, Math.min(5, n)); return `<span aria-label="${n} out of 5">${"★".repeat(k)}${"☆".repeat(5 - k)}</span>`; };
  const stack = (gap: string, center: boolean, ids: string[]) =>
    c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", gap], ...(center ? [["align-items", "center"], ["text-align", "center"]] as Decl[] : [])), ids);
  const cells = (n: number, gap: string, tablet: number | undefined, mobile: number | undefined, ids: string[]) =>
    c.div(css(["display", "grid"], ["grid-template-columns", `repeat(${Math.max(n, 1)}, minmax(0, 1fr))`], ["gap", gap], ["width", "100%"])
      .t(["grid-template-columns", `repeat(${Math.max(tablet ?? Math.min(n, 2), 1)}, minmax(0, 1fr))`]).m(["grid-template-columns", `repeat(${Math.max(mobile ?? 1, 1)}, minmax(0, 1fr))`]), ids);
  /** A small picture with its words under it: a card, a logo, a category. */
  const card = (s: JObj, it: JObj, center: boolean): string | undefined => {
    const href = linkIn(it);
    const round = dimAt(s, "(img|image)[a-z_]*(radius|_ra)$");
    const thumb = get(s, "image_size") === "thumbnail";
    const cw = get(obj(s.get("image_custom_dimension") ?? null), "width");
    const customWidth = /^\d+$/.test(cw) ? `${cw}px` : undefined;
    const mk = keyLike(s, "(img|image)_(max_)?width$");
    const maxWidth = mk === undefined ? NONE : respDim(s, mk, "width");
    const iconUrl = get(obj(obj(it.get("icon") ?? null).get("value") ?? null), "url");
    const pic = pictureIn(it) ?? (PICTURE.test(iconUrl) ? [iconUrl, ""] as [string, string] : undefined);
    const t0 = textFor(it, TITLE_ROLE);
    const label = t0 || textFor(it, BUTTON_ROLE);
    const img = pic ? [c.imageAt(pic[0], pic[1] || clean(label).replace(TAGS, ""),
      css(["display", "block"], ["max-width", "100%"], ["height", "auto"], ...(center ? [["margin-inline-start", "auto"], ["margin-inline-end", "auto"]] as Decl[] : []),
        ...(thumb ? [["width", "150px"], ["aspect-ratio", "1 / 1"], ["object-fit", "cover"]] as Decl[] : []),
        ...(round !== undefined ? [["aspect-ratio", "1 / 1"], ["object-fit", "cover"]] as Decl[] : []), ...decl("border-radius", round)).plus(maxWidth), 0, href)] : [];
    const words: string[] = [];
    words.push(...some(textOf(href && label && !img.length ? `<a href="${href}">${clean(label)}</a>` : label, lookOf(s, it, TITLE_ROLE))));
    const d = textFor(it, DESC_ROLE);
    words.push(...some(textOf(d.startsWith("#") ? "" : d, lookOf(s, it, DESC_ROLE))));
    for (const sub of repeater(it)) {
      // a sub-list (sub-categories): plain lines, linked where the item has an address
      const l = clean([...sub].filter(([k]) => !k.startsWith("_")).map(([, v]) => str(v)).find((x) => javaTrim(x) !== "") ?? "").replace(TAGS, "");
      const look = lookOf(s, s, role([], "^sub"));
      const u = linkIn(sub);
      const made = u && javaTrim(l) ? c.link(l, u, css(["padding", "0"], ["background", "none"], ["color", "inherit"], ["font-size", "inherit"], ["font-weight", "inherit"],
        ["line-height", "inherit"], ["text-decoration", "none"], ["justify-content", "flex-start"]).plus(look)) : textOf(l, look);
      words.push(...some(made));
    }
    const gap = dimAt(s, "^(img|image)_spacing$") ?? "12px";
    const sk = keyLike(s, "^(position|image_position|img_position|content_position)$");
    const side = sk === undefined ? "" : get(s, sk);
    const beside = img.length > 0 && (repeater(it).length > 0 || ["row", "left", "right", "image-left", "image-right"].includes(side));
    if (!img.length && !words.length) return undefined;
    if (beside) {
      const pics = img.map((i) => c.styled(css(["flex", "0 0 auto"], ["width", customWidth ?? "min(140px, 40%)"], ["margin-inline-start", "0"], ["margin-inline-end", "0"])
        .plus(css(...(side === "right" || side === "image-right" ? [["order", "2"]] as Decl[] : []))), i));
      const text = c.styled(css(["flex", "1 1 0"], ["align-self", "center"]), stack("8px", false, words));
      return c.div(css(["display", "flex"], ["gap", "20px"], ["align-items", "flex-start"]), [...pics, text]);
    }
    return stack(gap, center, [...img, ...words]);
  };

  /** A video the settings point at (a YouTube or Vimeo page, a video file), playable first. */
  const videoIn = (...ms: JObj[]): string | undefined => {
    const found = ms.flatMap((m) => [...m.values()].flatMap((v) => [str(v), get(obj(v), "url")])).map(javaTrim).filter(Boolean);
    return found.find((u) => embedUrl(u) !== undefined) ?? found.find((u) => embedFile(u) !== undefined);
  };

  const ENDINGS = new Set(["", "s", "es", "r", "rs", "er", "ers", "d", "ed", "ing"]);
  const themeWidget = (name: string, s: JObj, e: JObj): string[] | undefined => {
    const words = new Set(split(name.toLowerCase(), /[^a-z0-9]+/));
    // a word of the name, or that word with an ending ("slides", "slider", "featured"); "table" is not "tab"
    const has = (...ws: string[]) => ws.some((w) => [...words].some((x) => x.startsWith(w) && ENDINGS.has(x.slice(w.length))));
    const list = repeater(s);
    const title = textFor(s, TITLE_ROLE);
    // slides of its own (a picture and a title each) make a slider, even when a slide also points at a product
    const ownSlides = has("slide") && list.some((it) => pictureIn(it) !== undefined && textFor(it, TITLE_ROLE) !== "");
    let headMemo: string[] | undefined;
    const head = () => (headMemo ??= some(textOf(title, css(["text-align", "center"]).plus(lookOf(s, s, TITLE_ROLE)), 2)));
    let moreMemo: string[] | undefined;
    const more = () => {
      if (moreMemo === undefined) {
        const a = actionOf(s, textFor(s, BUTTON_ROLE), linkIn(s));
        moreMemo = a === undefined ? [] : [c.styled(css(["align-self", "center"]), a)];
      }
      return moreMemo;
    };
    // a picture with its words beside or under it: an image box, a category (with its sub-list), a card
    const pictureCard = (): string[] => {
      const box = decl("background-color", colorAt(s, "(box|content)_(bg|background)_color$"));
      const sk = sortedKeys(s).find((k) => k.endsWith("box_shadow_box_shadow"));
      const sm = sk === undefined ? EMPTY : obj(s.get(sk));
      const shadow: Decl[] = sm.size ? (() => {
        const px = (k: string) => `${String(Math.round(toDouble(get(sm, k)) ?? 0)).replace(/^-0$/, "0")}px`;
        return [["box-shadow", `${px("horizontal")} ${px("vertical")} ${px("blur")} ${px("spread")} ${get(sm, "color") || "rgba(0,0,0,0.5)"}`] as Decl];
      })() : [];
      const rk = keyLike(s, "^(content|box)_border_radius$");
      const round = rk === undefined ? NONE : resp(s, rk, (v) => decl("border-radius", radius(v)));
      // a card with a shadow or rounded corners sits on a fill even when the theme's stylesheet gives it
      const fill = !box.length && (shadow.length || Object.keys(round.styles).length) ? [["background-color", "var(--wp--preset--color--auvyx-base)"] as Decl] : box;
      const id = card(s, s, list.length === 0);
      if (id === undefined) return [];
      const bk = keyLike(s, "^[a-z_]*box_border_border$");
      return [c.styled(css(...fill, ...shadow).plus(round).plus(border(s, bk === undefined ? "border" : stripSuffix(bk, "_border")))
        .plus(spaced(s, "^(img_box|box|content)_padding$", "padding")), id)];
    };
    let made: string[];
    if (has("countdown", "timer")) {
      const dueEntry = [...s].find(([k, v]) => whole(`${DOTLESS}*(due|date|end)${DOTLESS}*`).test(k) && new RegExp(`^\\d{4}-\\d{2}-\\d{2}${DOTLESS}*$`).test(str(v)));
      const due = dueEntry ? javaTrim(str(dueEntry[1])).replaceAll(" ", "T") : "2027-01-01T00:00";
      const color = decl("color", colorAt(s, "^digit[a-z_]*color$"));
      const cell = (n0: string, unit: string) => stack("2px", true, [
        c.text(n0, css(["font-size", "2rem"], ["font-weight", "600"], ["line-height", "1"], ...color, ...m0)),
        c.text(unit, css(["font-size", "0.8125rem"], ...color, ...m0))]);
      made = [c.classed(countdownClass(due.slice(0, 16)), c.named("Countdown", c.div(css(["display", "flex"], ["gap", "20px"], ["justify-content", "center"]),
        [cell("00", "Days"), cell("00", "Hours"), cell("00", "Mins"), cell("00", "Secs")])))];
    } else if (has("newsletter", "subscribe", "mailchimp", "mc4wp")) {
      const form: Form = { id: slugify(`newsletter-${get(e, "id")}`).slice(0, 60), fields: [field("email", "Email", "email", true, [], "Your email address")],
        submit: textFor(s, BUTTON_ROLE) || "Subscribe", success: "Thank you for subscribing." };
      const widthKey = keyLike(s, "^form_width$");
      // its band: the widget's picture or fill behind it, its padding, its alignment
      const ak = keyLike(s, "^(text_align|content_align|align)$");
      const left = ak !== undefined && ["left", "flex-start"].includes(get(s, ak));
      const fill = decl("background-color", colorAt(s, "^((content|box|wrapper|banners?|section)_)?(bg|background)_color$"));
      const p = pictureIn(s);
      const band: Decl[] = [...(p ? [["background-image", `url("${p[0]}")`], ["background-size", "cover"], ["background-position", "center center"]] as Decl[] : []), ...fill];
      const title0 = some(textOf(title, css(...(left ? [] : [["text-align", "center"] as Decl])).plus(lookOf(s, s, TITLE_ROLE)), 2));
      const desc = some(textOf(textFor(s, DESC_ROLE), lookOf(s, s, DESC_ROLE)));
      const kept0 = c.keep(FORM_BLOCK, formMarkup(form), formPreview(form));
      const formBox = c.styled(css(["width", "100%"], ["max-width", "560px"]).plus(widthKey === undefined ? NONE : respDim(s, widthKey, "max-width")), kept0);
      const inner = stack("16px", !left, [...title0, ...desc, formBox]);
      made = [c.named("Newsletter", band.length ? c.styled(css(...band).plus(spaced(s, "^content_padding$", "padding")), inner) : inner)];
    } else if (has("testimonial", "review", "quote")) {
      const cardsOut = list.map((it) => {
        const p = pictureIn(it);
        const img = p ? [c.imageAt(p[0], p[1], css(["width", "64px"], ["height", "64px"], ["border-radius", "50%"], ["object-fit", "cover"]))] : [];
        const who = [...it].filter(([k, v]) => /^(customer|name|author|client|date|job|position|role|company)$/i.test(k) && javaTrim(str(v)) !== "").map(([, v]) => javaTrim(clean(str(v))));
        const rk = [...it].find(([k]) => /^(rate|rating|stars?)$/i.test(k));
        const rd = rk === undefined ? undefined : toDouble(str(rk[1]));
        const rate = rd === undefined ? undefined : Math.round(rd);
        const parts = [...img,
          ...some(textOf(textFor(it, TITLE_ROLE), lookOf(s, it, TITLE_ROLE), 3)),
          ...some(textOf(textFor(it, DESC_ROLE), lookOf(s, it, DESC_ROLE))),
          ...(rate !== undefined ? [c.text(stars(rate), css(["color", "#F6BC3E"], ...m0))] : []),
          ...some(textOf(who.join(" "), css(["font-size", "0.8125rem"])))];
        return c.named("Testimonial", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "12px"], ["align-items", "center"], ["text-align", "center"],
          ["padding-block-start", "30px"], ["padding-block-end", "30px"], ["padding-inline-start", "24px"], ["padding-inline-end", "24px"],
          ...decl("background-color", colorAt(s, "^content_bg_color$|^(item|box)_(bg|background)_color$"))), parts));
      });
      const h = head();
      const grid = cardsOut.length ? [cells(Math.min(3, cardsOut.length), "30px", undefined, undefined, cardsOut)] : [];
      made = [...h, ...grid, ...more()];
    } else if (has("product", "deal", "shop", "woo") && !ownSlides) made = loop("product", s, title, has("carousel", "slider", "slide"));
    else if (has("post", "blog", "news")) made = loop("post", s, title, has("carousel", "slider", "slide"));
    else if (keyLike(s, "^(price|amount|cost)$") !== undefined || has("price", "pricing")) {
      // a plan: its name, price and period, what it includes and the action, on a card
      const pk = keyLike(s, "^(price|amount|cost)$");
      const price = pk === undefined ? "" : get(s, pk);
      const dk = keyLike(s, "^(after_price|period|price_suffix|duration|per)$");
      const period = dk === undefined ? "" : get(s, dk);
      const fill = colorAt(s, "^(content|box|table)_(bg|background)_color$") ?? "var(--wp--preset--color--auvyx-base)";
      const amount = some(textOf(`${price}${period ? `<span style="font-size:0.875rem;font-weight:400">${clean(period)}</span>` : ""}`,
        css(["font-size", "2.5rem"], ["font-weight", "600"], ["line-height", "1.1"], ["margin-block-start", "0"], ["margin-block-end", "0"]).plus(lookOf(s, s, role([], "^price")))));
      const parts = [...some(textOf(title, lookOf(s, s, TITLE_ROLE), 3)), ...amount];
      parts.push(...richText(textFor(s, DESC_ROLE), lookOf(s, s, DESC_ROLE)));
      parts.push(...some(actionOf(s, textFor(s, BUTTON_ROLE), linkIn(s))));
      made = [c.named("Price table", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "20px"], ["align-items", "center"], ["text-align", "center"],
        ["padding-block-start", "40px"], ["padding-block-end", "40px"], ["padding-inline-start", "30px"], ["padding-inline-end", "30px"], ["background-color", fill],
        ["border", "1px solid var(--wp--preset--color--auvyx-border)"], ["border-radius", "var(--wp--custom--radius--md, 12px)"]), parts))];
    } else if (has("faq", "accordion", "toggle", "tab")) {
      const h = head();
      made = [...h, ...list.map((it) => {
        const t = clean(textFor(it, TITLE_ROLE)).replace(TAGS, "");
        return c.accordion(t, NONE, richText(textFor(it, DESC_ROLE).replaceAll("\n", "<br>"), NONE));
      })];
    } else if (has("map") && get(s, "address") !== "") {
      const q = get(s, "address").replaceAll(" ", "+").replace(/[^A-Za-z0-9+,.-]/g, "");
      made = [c.keep("core/html", `<!-- wp:html -->\n<iframe src="https://maps.google.com/maps?q=${q}&amp;output=embed" width="100%" height="400" style="border:0" loading="lazy" title="Map"></iframe>\n<!-- /wp:html -->`, "")];
    } else if (has("video") && videoIn(s) !== undefined) made = [c.video(videoIn(s)!)];
    else if (has("slide", "slider", "carousel", "hero") && list.some((it) => pictureIn(it) !== undefined && textFor(it, TITLE_ROLE) !== "") &&
      (ownSlides || keyLike(s, "^(slides?_|banner_)?height$") !== undefined || list.some((it) => textFor(it, BUTTON_ROLE) !== ""))) {
      const slides = list.map((it) => c.styled(css(["flex", "0 0 100%"], ["scroll-snap-align", "start"]), banner(s, it, "Slide")));
      const nav = get(s, "navigation");
      const cls = sliderClass({ autoplay: get(s, "autoplay") === "yes" ? 5 : 0, arrows: nav.includes("arrow"), dots: nav === "" || nav.includes("dot") });
      made = [c.classed(cls, c.named("Slider", c.div(css(["display", "flex"], ["flex-wrap", "nowrap"], ["gap", "0"], ["overflow-x", "auto"],
        ["scroll-snap-type", "x mandatory"], ["scrollbar-width", "none"], ["width", "100%"]), slides)))];
    } else if (pictureIn(s) !== undefined && (has("banner", "promo", "cta", "hero", "sale", "lookbook", "collection") ||
      ((title !== "" || textFor(s, BUTTON_ROLE) !== "") &&
        [...s.keys()].some((k) => whole(`^((banner|slides?|box|content|wrapper|item)_)?(min_)?height(_tablet|_mobile)?$|${DOTLESS}*horizontal_position${DOTLESS}*`).test(k)))))
      made = [banner(s, s, "Banner")];
    else if (pictureIn(s) !== undefined && list.length && !list.some((it) => pictureIn(it) !== undefined || it.has("icon")))
      // its own picture over a list without pictures (a category and its sub-categories): one card
      made = pictureCard();
    else if (list.length && list.some((it) => pictureIn(it) !== undefined || it.has("icon"))) {
      // a row of small pictures with their words: logos, categories, a carousel of images
      const tiles = list.flatMap((it) => some(card(s, it, true)));
      const count = (suffix: string) => {
        const re = new RegExp(`^(columns|slidestoshow|limit|per_row)${suffix}$`, "i");
        return [...s].filter(([k]) => re.test(k)).map(([, v]) => toInt(str(v))).find((n) => n !== undefined);
      };
      const cols = count("") ?? Math.min(5, tiles.length);
      const h = head();
      // small tiles keep two to a row on a phone unless the widget says otherwise
      const gallery = tiles.length ? [c.named("Gallery", cells(Math.max(Math.min(cols, tiles.length), 1), "24px", count("_tablet"), count("_mobile") ?? Math.min(2, tiles.length), tiles))] : [];
      made = [...h, ...gallery, ...more()];
    } else if (list.length) {
      // a list of links (keywords, categories)
      const links = list.flatMap((it) => { const u = linkIn(it); return u ? [c.link(clean(textFor(it, TITLE_ROLE)).replace(TAGS, ""), u, lookOf(s, it, TITLE_ROLE))] : []; });
      const h = head();
      made = [...h, ...(links.length ? [c.div(css(["display", "flex"], ["flex-wrap", "wrap"], ["gap", "12px 24px"]), links)] : [])];
    } else if (has("heading", "title") && title !== "") {
      const hs = get(s, "header_size");
      const level = /^h[1-6]$/.test(hs) ? Number(hs.slice(1)) : 2;
      const href = linkIn(s);
      const t = clean(title).replace(new RegExp(`<br${W}*\\/?>${W}*\\n`, "gi"), "<br>").replaceAll("\n", "<br>");
      const h = c.heading(href ? `<a href="${href}">${t}</a>` : t, level, lookOf(s, s, TITLE_ROLE).plus(typography(s)).plus(textAlign(s)));
      const sub = [...some(textOf(textFor(s, SUB_ROLE), lookOf(s, s, SUB_ROLE))), ...some(textOf(textFor(s, PRE_ROLE), lookOf(s, s, PRE_ROLE)))];
      made = !sub.length ? [h] : [c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", dimAt(s, "^sub[a-z_]*spacing$") ?? "12px"]).plus(textAlign(s)), [...sub, h])];
    } else if (has("button", "btn")) {
      const align = get(s, "align");
      const a = actionOf(s, [get(s, "text"), textFor(s, BUTTON_ROLE)].find((x) => javaTrim(x) !== "") ?? "", linkIn(s));
      const am = get(s, "align_mobile");
      made = a === undefined ? [] : [c.styled(typography(s)
        .plus(css(...(align === "center" ? [["align-self", "center"]] : align === "right" ? [["align-self", "flex-end"]] : align === "left" ? [["align-self", "flex-start"]] : []) as Decl[]))
        .plus(sOf({ mobile: am === "center" ? [["align-self", "center"]] : am === "left" ? [["align-self", "flex-start"]] : [] })), a)];
    } else if (has("icon", "feature", "service", "info") && pictureIn(s) === undefined) {
      const iconUrl = [get(obj(obj(s.get("selected_icon") ?? null).get("value") ?? null), "url"), ...[...s].filter(([k]) => /icon[\s\S]*url$/i.test(k)).map(([, v]) => str(v))]
        .find((u) => PICTURE.test(u));
      const size = dimAt(s, "^icon_size$") ?? "32px";
      const icon = iconUrl !== undefined ? [c.imageAt(iconUrl, "", css(["display", "block"], ["width", size], ["height", "auto"], ["flex-shrink", "0"]))] : [];
      const texts = [...some(textOf(title, lookOf(s, s, TITLE_ROLE))), ...some(textOf(textFor(s, DESC_ROLE), lookOf(s, s, DESC_ROLE)))];
      const side = get(s, "position") === "left" || get(s, "position") === "right";
      made = [c.named("Icon box", c.div(css(["display", "flex"], ["flex-direction", side ? "row" : "column"], ["gap", dimAt(s, "^icon_space$") ?? "16px"],
        ["align-items", "center"]).plus(textAlign(s, "text_align")), [...icon, stack("4px", false, texts)]))];
    } else if (pictureIn(s) !== undefined) made = pictureCard();
    else {
      const parts = [...some(textOf(title, lookOf(s, s, TITLE_ROLE), 3)), ...some(textOf(textFor(s, DESC_ROLE), lookOf(s, s, DESC_ROLE)))];
      parts.push(...some(actionOf(s, textFor(s, BUTTON_ROLE), linkIn(s))));
      made = parts.length ? [stack("12px", false, parts)] : [];
    }
    // nothing to read: a video it points at (its own, or an item's) is what it shows
    let shown = made;
    if (!shown.length) { const v = videoIn(s, ...list); shown = v === undefined ? [] : [c.video(v)]; }
    // a theme's widget draws its words with its own styles, dark ones as a rule. What it colours itself keeps its colour.
    const inked = (id: string): string => {
      // (words over a picture are the theme's light ones: a banner is left as it is)
      const base = (c.nodes.get(id)?.styles.base?.default ?? {}) as Record<string, string>;
      return "color" in base || "background-image" in base ? id : c.styled(css(["color", INK]), id);
    };
    return shown.length ? shown.map(inked) : undefined;
  };

  const SOCIAL = new Map([["facebook", "Facebook"], ["instagram", "Instagram"], ["twitter", "X"], ["x-twitter", "X"], ["youtube", "YouTube"], ["linkedin", "LinkedIn"],
    ["tiktok", "TikTok"], ["pinterest", "Pinterest"], ["whatsapp", "WhatsApp"], ["telegram", "Telegram"], ["github", "GitHub"]]);
  const level = (v: string, d: number) => (/^h[1-6]$/.test(v) ? Number(v.slice(1)) : d);
  const words = (h: string) => clean(h).replace(TAGS, "");

  const widget = (e: JObj): string[] => {
    const s = obj(e.get("settings") ?? null);
    const name = get(e, "widgetType");
    const color = (key: string) => decl("color", colorOf(s, key));
    let made: string[];
    switch (name) {
      case "heading": {
        const tag = get(s, "header_size");
        const href = link(s.get("link") ?? null);
        const title = clean(get(s, "title"));
        const text = href ? `<a href="${href}">${title}</a>` : title;
        const st = css(...color("title_color"), ...m0).plus(typography(s)).plus(textAlign(s));
        made = /^h[1-6]$/.test(tag) ? [c.heading(text, Number(tag.slice(1)), st)] : tag === "" ? [c.heading(text, 2, st)] : [c.text(text, st)];
        break;
      }
      case "text-editor": {
        const st = css(...color("text_color")).plus(typography(s)).plus(textAlign(s));
        const parts = richText(get(s, "editor"), st);
        made = parts.length === 1 ? parts : [c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "16px"]), parts)];
        break;
      }
      case "image": {
        const p = picture(s.get("image") ?? null);
        if (!p) { made = [placeholder("image without a picture")]; break; }
        const [url, alt] = p;
        const lt = get(s, "link_to");
        const href = lt === "custom" ? link(s.get("link") ?? null) : lt === "file" ? url : "";
        const align = get(s, "align");
        const st = css(["display", "block"], ["height", "auto"], ["max-width", "100%"],
          ...(align === "center" ? [["margin-inline-start", "auto"], ["margin-inline-end", "auto"]] as Decl[] : align === "right" ? [["margin-inline-start", "auto"]] as Decl[] : []))
          .plus(respDim(s, "width", "width")).plus(border(s, "image_border"));
        const img = c.imageAt(url, alt || get(s, "caption"), st, 0, href);
        const cap = get(s, "caption");
        made = get(s, "caption_source") === "custom" && cap !== ""
          ? [c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "8px"]), [img, c.text(clean(cap), css(["font-size", "0.875rem"], ...m0))])]
          : [img];
        break;
      }
      case "button": {
        const align = get(s, "align");
        // no alignment of its own: the button follows its box's, as in Elementor
        const self = align === "center" ? "center" : align === "right" ? "flex-end" : align === "justify" ? "stretch" : align === "left" ? "flex-start" : undefined;
        const sz = get(s, "size");
        const size: Decl[] =
          sz === "xs" ? [["padding-block-start", "10px"], ["padding-block-end", "10px"], ["padding-inline-start", "20px"], ["padding-inline-end", "20px"], ["font-size", "0.8125rem"]]
          : sz === "md" ? [["padding-block-start", "15px"], ["padding-block-end", "15px"], ["padding-inline-start", "30px"], ["padding-inline-end", "30px"]]
          : sz === "lg" ? [["padding-block-start", "20px"], ["padding-block-end", "20px"], ["padding-inline-start", "40px"], ["padding-inline-end", "40px"], ["font-size", "1.125rem"]]
          : sz === "xl" ? [["padding-block-start", "25px"], ["padding-block-end", "25px"], ["padding-inline-start", "50px"], ["padding-inline-end", "50px"], ["font-size", "1.25rem"]]
          : [];
        const st = sOf({
          base: [...decl("align-self", self), ["width", align === "justify" ? "100%" : "fit-content"], ...size,
            ...decl("background-color", colorOf(s, "background_color")), ...color("button_text_color")],
          hover: [...decl("background-color", colorOf(s, "button_background_hover_color")), ...decl("color", colorOf(s, "hover_color"))],
        }).plus(typography(s)).plus(border(s)).plus(resp(s, "text_padding", (v) => sides(v, "padding")));
        made = [c.button(words(get(s, "text")) || "Button", st, link(s.get("link") ?? null) || "#")];
        break;
      }
      case "spacer": {
        const st = respDim(s, "space", "height");
        made = [c.named("Spacer", c.div(st.base.length ? st : css(["height", "50px"]).plus(st), []))];
        break;
      }
      case "divider": {
        const ws = obj(s.get("weight") ?? null).get("size");
        const w = (ws === undefined ? undefined : toDouble(str(ws))) ?? 1;
        const style = get(s, "style");
        const line = ["solid", "dashed", "dotted", "double"].includes(style) ? style : "solid";
        made = [c.divider(css(["border-top", `${stripSuffix(fixed(w, 1), ".0")}px ${line} ${colorOf(s, "color") ?? "currentColor"}`]).plus(respDim(s, "width", "width")))];
        break;
      }
      case "video": {
        const vt = get(s, "video_type");
        const url = vt === "vimeo" ? get(s, "vimeo_url") : vt === "dailymotion" ? get(s, "dailymotion_url") : vt === "hosted" ? get(obj(s.get("hosted_url") ?? null), "url") : get(s, "youtube_url");
        const u = javaTrim(url);
        made = embedUrl(u) !== undefined || embedFile(u) !== undefined ? [c.video(u)] : [placeholder("video")];
        break;
      }
      case "icon-list": {
        const iconSize = dim(s.get("icon_size") ?? null) ?? "14px";
        const items = arr(s.get("icon_list") ?? []).map(obj).map((it) => {
          const t = clean(get(it, "text"));
          const href = link(it.get("link") ?? null);
          const text = c.text(href ? `<a href="${href}">${t}</a>` : t, css(...color("text_color"), ...m0).plus(typography(s, "icon_typography")));
          const gl = glyph(get(obj(it.get("selected_icon") ?? null), "value"));
          return gl === undefined ? text : c.div(css(["display", "flex"], ["align-items", "baseline"], ["gap", "10px"]), [
            c.text(gl, css(["font-size", iconSize], ["line-height", "1"], ["flex-shrink", "0"], ...decl("color", colorOf(s, "icon_color")), ...m0)), text]);
        });
        const inline = get(s, "view") === "inline";
        const between = dim(s.get("space_between") ?? null) ?? (inline ? "20px" : "8px");
        made = [c.named("List", c.div(css(["display", "flex"], ["flex-direction", inline ? "row" : "column"], ["flex-wrap", "wrap"], ["gap", between]), items))];
        break;
      }
      case "image-box": case "icon-box": {
        const href = link(s.get("link") ?? null);
        const title = clean(get(s, "title_text"));
        const lv = level(get(s, "title_size"), 3);
        // Elementor's image box draws its picture at 30% of the box unless told otherwise
        const p = name === "image-box" ? picture(s.get("image") ?? null) : undefined;
        const img = p ? [c.imageAt(p[0], p[1] || title, css(["display", "block"], ["height", "auto"], ["max-width", "100%"])
          .plus(((w: S) => (w.base.length ? w : css(["width", "30%"]).plus(w)))(respDim(s, "image_size", "width")))
          .plus(css(...decl("margin-block-end", dim(s.get("image_space") ?? null)))).plus(border(s, "image_border")))] : [];
        const head = title ? [c.heading(href ? `<a href="${href}">${title}</a>` : title, lv, css(...color("title_color"), ...m0).plus(typography(s, "title_typography")))] : [];
        const d = get(s, "description_text");
        const body = javaTrim(d) ? [c.text(clean(d), css(...color("description_color"), ...m0).plus(typography(s, "description_typography")))] : [];
        const side = ["left", "right"].includes(get(s, "position"));
        const st = css(["display", "flex"], ["flex-direction", side && img.length ? "row" : "column"], ["gap", "16px"]).plus(textAlign(s, "text_align"));
        made = [c.named(name === "image-box" ? "Image box" : "Icon box", c.div(st, [...img, ...head, ...body]))];
        break;
      }
      case "testimonial": {
        const p = picture(s.get("testimonial_image") ?? null);
        const img = p ? [c.imageAt(p[0], p[1] || get(s, "testimonial_name"), css(["width", "60px"], ["height", "60px"], ["border-radius", "50%"], ["object-fit", "cover"]))] : [];
        const ta = get(s, "testimonial_alignment");
        const align = ta === "left" ? "flex-start" : ta === "right" ? "flex-end" : "center";
        const nameText = c.text(clean(get(s, "testimonial_name")), css(["font-weight", "600"], ...color("name_text_color"), ...m0).plus(typography(s, "name_typography")));
        const job = get(s, "testimonial_job");
        const jobText = job ? [c.text(clean(job), css(["font-size", "0.875rem"], ...color("job_text_color"), ...m0).plus(typography(s, "job_typography")))] : [];
        const who = c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "2px"]), [nameText, ...jobText]);
        const content = c.text(clean(get(s, "testimonial_content")), css(...color("content_content_color"), ...m0).plus(typography(s, "content_typography")));
        const row = c.div(css(["display", "flex"], ["align-items", "center"], ["gap", "14px"], ["text-align", "start"]), [...img, who]);
        made = [c.named("Testimonial", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "20px"], ["align-items", align]).plus(textAlign(s, "testimonial_alignment")), [content, row]))];
        break;
      }
      case "counter": {
        const n = `${get(s, "prefix")}${get(s, "ending_number")}${get(s, "suffix")}`;
        const num = c.text(clean(n), css(["font-size", "3rem"], ["font-weight", "600"], ["line-height", "1"], ...color("number_color"), ...m0).plus(typography(s, "typography_number")));
        const t = c.text(clean(get(s, "title")), css(...color("title_color"), ...m0));
        made = [c.named("Counter", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "4px"], ["align-items", "center"], ["text-align", "center"]), [num, t]))];
        break;
      }
      case "progress": {
        const ps = obj(s.get("percent") ?? null).get("size");
        const pct = ps === undefined ? "" : str(ps);
        made = [c.named("Progress", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "6px"]), [
          c.text(`${clean(get(s, "title"))}${pct ? ` — ${pct}%` : ""}`, css(...m0))]))];
        break;
      }
      case "accordion": case "toggle":
        made = arr(s.get("tabs") ?? []).map(obj).map((t) => { const title = words(get(t, "tab_title")); return c.accordion(title, NONE, richText(get(t, "tab_content"), NONE)); });
        break;
      case "tabs": {
        const panels = arr(s.get("tabs") ?? []).map(obj).map((t) => {
          const h = c.heading(clean(get(t, "tab_title")), 3, css(...m0));
          return c.named("Tab panel", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "12px"]), [h, ...richText(get(t, "tab_content"), NONE)]));
        });
        made = [c.classed("auvyx-tabs", c.named("Tabs", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "24px"]), panels)))];
        break;
      }
      case "alert":
        made = [c.named("Alert", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "4px"], ["padding-block-start", "16px"], ["padding-block-end", "16px"],
          ["padding-inline-start", "20px"], ["padding-inline-end", "20px"], ["background-color", "color-mix(in srgb, currentColor 8%, transparent)"]), [
          c.text(`<strong>${clean(get(s, "alert_title"))}</strong>`, css(...m0)), c.text(clean(get(s, "alert_description")), css(...m0))]))];
        break;
      case "image-gallery": case "image-carousel": case "gallery": {
        const pics = arr(s.get(name === "image-carousel" ? "carousel" : name === "gallery" ? "gallery" : "wp_gallery") ?? []).flatMap((v) => some(picture(v)));
        const n = toInt(get(s, "gallery_columns")) ?? toInt(get(s, "slides_to_show"));
        const cols = n !== undefined ? Math.max(1, Math.min(6, n)) : 4;
        made = !pics.length ? [placeholder(name)] : [c.named("Gallery", c.div(css(["display", "grid"], ["grid-template-columns", `repeat(${cols}, minmax(0, 1fr))`], ["gap", "12px"])
          .m(["grid-template-columns", "repeat(2, minmax(0, 1fr))"]), pics.map(([u, a]) => c.imageAt(u, a, css(["display", "block"], ["width", "100%"], ["aspect-ratio", "1 / 1"], ["object-fit", "cover"])))))];
        break;
      }
      case "html": {
        const h = get(s, "html");
        made = !javaTrim(h) ? [] : [c.keep("core/html", `<!-- wp:html -->\n${h}\n<!-- /wp:html -->`, clean(h))];
        break;
      }
      case "shortcode": {
        const code = javaTrim(get(s, "shortcode"));
        made = !code ? [] : [c.keep("core/shortcode", `<!-- wp:shortcode -->\n${code}\n<!-- /wp:shortcode -->`,
          `<div style="padding:16px;border:1px dashed currentColor;opacity:.6;font:13px/1.4 system-ui;text-align:center">${code.replaceAll("<", "&lt;")}</div>`)];
        break;
      }
      case "google_maps": {
        const q = [...new TextEncoder().encode(get(s, "address"))].map((b) => {
          const ch = String.fromCharCode(b);
          return b < 128 && /[A-Za-z0-9]/.test(ch) ? ch : ch === " " ? "+" : `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
        }).join("");
        const h = `<iframe src="https://maps.google.com/maps?q=${q}&amp;output=embed" width="100%" height="400" style="border:0" loading="lazy" title="${get(s, "address").replaceAll("\"", "")}"></iframe>`;
        made = [c.keep("core/html", `<!-- wp:html -->\n${h}\n<!-- /wp:html -->`, h)];
        break;
      }
      // ---- Elementor Pro ----
      case "form": {
        const KINDS: Record<string, string> = { textarea: "textarea", email: "email", tel: "tel", number: "number", date: "date", url: "url", select: "select",
          radio: "radio", checkbox: "checkbox", acceptance: "checkbox", text: "text", "": "text" };
        const fields = arr(s.get("form_fields") ?? []).map(obj).flatMap((f, i): FormField[] => {
          const kind = Object.hasOwn(KINDS, get(f, "field_type")) ? KINDS[get(f, "field_type")]! : "";
          if (!kind) return [];
          const l = words(get(f, "field_label"));
          const label = l || get(f, "placeholder");
          const cid = get(f, "custom_id");
          const key = /^[a-z][a-z0-9_]{0,40}$/.test(cid) ? cid : `field_${i + 1}`;
          const options = split(get(f, "field_options"), /\r?\n/).map((o) => javaTrim(split(o, /\|/)[0] ?? "")).filter(Boolean).slice(0, FORM_MAX_OPTIONS);
          return [field(key, label || `Field ${i + 1}`, kind, get(f, "required") !== "", options, get(f, "placeholder"))];
        }).slice(0, FORM_MAX_FIELDS);
        if (!fields.length) { made = [placeholder("form")]; break; }
        const success = get(s, "success_message");
        const form: Form = { id: slugify(`elementor-${get(s, "form_name") || "form"}-${get(e, "id")}`).slice(0, 60), fields,
          submit: clean(get(s, "button_text")).replace(TAGS, "") || "Send", success: javaTrim(success) ? success : "Thank you. We received your message." };
        made = [c.keep(FORM_BLOCK, formMarkup(form), formPreview(form))];
        break;
      }
      case "slides": {
        const slides = arr(s.get("slides") ?? []).map(obj).map((sl) => {
          const img = picture(sl.get("background_image") ?? null)?.[0];
          const bg: Decl[] = [["background-color", colorOf(sl, "background_color") ?? "var(--wp--preset--color--auvyx-secondary)"],
            ...(img !== undefined ? decl("background-image", composeBackground({ overlay: "color-mix(in srgb, #000000 35%, transparent)", image: img })) : []),
            ...(img !== undefined ? [["background-size", "cover"], ["background-position", "center center"]] as Decl[] : [])];
          const href = link(sl.get("link") ?? null);
          const h = clean(get(sl, "heading"));
          const d = clean(get(sl, "description"));
          const bt = words(get(sl, "button_text"));
          const parts = [
            ...(h ? [c.heading(h, 2, css(["color", "var(--wp--preset--color--auvyx-inverse)"], ...m0))] : []),
            ...(d ? [c.text(d, css(["color", "var(--wp--preset--color--auvyx-inverse)"], ...m0))] : []),
            ...(bt ? [c.button(bt, css(["align-self", "center"]), href || "#")] : [])];
          return c.named("Slide", c.div(css(["flex", "0 0 100%"], ["scroll-snap-align", "start"], ["min-height", "480px"], ["display", "flex"], ["flex-direction", "column"],
            ["justify-content", "center"], ["align-items", "center"], ["text-align", "center"], ["gap", "16px"], ["padding-inline-start", "40px"], ["padding-inline-end", "40px"], ...bg)
            .m(["min-height", "360px"]), parts));
        });
        if (!slides.length) { made = [placeholder("slides")]; break; }
        const speed = toInt(get(s, "autoplay_speed"));
        const nav = get(s, "navigation");
        const cls = sliderClass({ autoplay: get(s, "autoplay") === "no" ? 0 : speed !== undefined ? Math.max(2, Math.round(speed / 1000)) : 5,
          fade: get(s, "transition") === "fade", arrows: !["dots", "none"].includes(nav), dots: !["arrows", "none"].includes(nav) });
        made = [c.classed(cls, c.named("Slider", c.div(css(["display", "flex"], ["flex-wrap", "nowrap"], ["gap", "0"], ["overflow-x", "auto"],
          ["scroll-snap-type", "x mandatory"], ["scrollbar-width", "none"]), slides)))];
        break;
      }
      case "price-table": {
        const href = link(s.get("link") ?? null);
        const features = arr(s.get("features_list") ?? []).map(obj).map((f) => c.text(clean(get(f, "item_text")), css(...m0)));
        const cs = get(s, "currency_symbol");
        const symbol = cs === "dollar" ? "$" : cs === "euro" ? "€" : cs === "pound" ? "£" : cs === "custom" ? get(s, "currency_symbol_custom") : cs === "" ? "$" : "";
        const price = `${symbol}${get(s, "price")}`;
        const parts = [c.heading(clean(get(s, "heading")), 3, css(...m0))];
        const sub = get(s, "sub_heading");
        if (sub) parts.push(c.text(clean(sub), css(...m0)));
        const period = get(s, "period");
        parts.push(c.text(`<strong>${clean(price)}</strong>${period ? ` ${clean(period)}` : ""}`, css(["font-size", "2.5rem"], ["line-height", "1.1"], ...m0)));
        if (features.length) parts.push(c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "8px"]), features));
        const bt = words(get(s, "button_text"));
        if (bt) parts.push(c.button(bt, css(["align-self", "center"]), href || "#"));
        made = [c.named("Price table", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "16px"], ["align-items", "center"], ["text-align", "center"],
          ["padding-block-start", "32px"], ["padding-block-end", "32px"], ["padding-inline-start", "24px"], ["padding-inline-end", "24px"],
          ["border", "1px solid var(--wp--preset--color--auvyx-border)"], ["border-radius", "var(--wp--custom--radius--md, 12px)"]), parts))];
        break;
      }
      case "call-to-action": {
        const href = link(s.get("link") ?? null);
        const img = picture(s.get("bg_image") ?? null)?.[0];
        const parts = [c.heading(clean(get(s, "title")), 2, css(["color", "inherit"], ...m0))];
        const d = get(s, "description");
        if (d) parts.push(c.text(clean(d), css(...m0)));
        const bt = words(get(s, "button"));
        if (bt) parts.push(c.button(bt, css(["align-self", "flex-start"]), href || "#"));
        made = [c.named("Call to action", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "16px"], ["justify-content", "center"], ["min-height", "320px"],
          ["padding-block-start", "40px"], ["padding-block-end", "40px"], ["padding-inline-start", "40px"], ["padding-inline-end", "40px"], ["color", "var(--wp--preset--color--auvyx-inverse)"],
          ["background-color", "var(--wp--preset--color--auvyx-secondary)"],
          ...(img !== undefined ? decl("background-image", composeBackground({ overlay: "color-mix(in srgb, #000000 40%, transparent)", image: img })) : []),
          ...(img !== undefined ? [["background-size", "cover"], ["background-position", "center center"]] as Decl[] : [])), parts))];
        break;
      }
      case "flip-box": {
        const href = link(s.get("link") ?? null);
        const parts = [c.heading(clean(get(s, "title_text_a")), 3, css(...m0)), c.text(clean(get(s, "description_text_a")), css(...m0))];
        const b = clean(get(s, "description_text_b"));
        if (b) parts.push(c.text(b, css(...m0)));
        const bt = words(get(s, "button_text"));
        if (bt) parts.push(c.button(bt, css(["align-self", "center"]), href || "#"));
        made = [c.named("Flip box", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "12px"], ["padding-block-start", "32px"], ["padding-block-end", "32px"],
          ["padding-inline-start", "24px"], ["padding-inline-end", "24px"], ["text-align", "center"], ["background-color", "var(--wp--preset--color--auvyx-surface)"],
          ["border-radius", "var(--wp--custom--radius--md, 12px)"]), parts))];
        break;
      }
      case "animated-headline": {
        const middle = get(s, "headline_style") === "rotate" ? split(get(s, "rotating_text"), /\r?\n/)[0] ?? "" : get(s, "highlighted_text");
        const text = [get(s, "before_text"), middle ? `<em>${clean(middle)}</em>` : "", get(s, "after_text")].filter(Boolean).map(clean).join(" ");
        made = [c.heading(text, level(get(s, "tag"), 3), css(...m0).plus(textAlign(s, "alignment")))];
        break;
      }
      case "blockquote": {
        const parts = [c.text(clean(get(s, "blockquote_content")), css(["font-size", "1.25rem"], ...m0))];
        const a = get(s, "author_name");
        if (a) parts.push(c.text(`— ${clean(a)}`, css(["font-size", "0.875rem"], ...m0)));
        made = [c.named("Quote", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "8px"], ["padding-inline-start", "20px"],
          ["border-inline-start", "4px solid var(--wp--preset--color--auvyx-accent)"]), parts))];
        break;
      }
      case "star-rating": {
        const scale = Math.min(10, Math.max(1, toInt(get(s, "rating_scale")) ?? 5));
        const rs = obj(s.get("rating") ?? null).get("size");
        const r = toDouble(rs !== undefined ? str(rs) : get(s, "rating")) ?? 5;
        const rating = Math.min(scale, Math.max(0, r));
        const n = Math.round(rating);
        const starsText = "★".repeat(n) + "☆".repeat(Math.max(0, scale - n));
        made = [c.text([clean(get(s, "title")), `<span aria-label="${fixed(rating, 1)} out of ${scale}">${starsText}</span>`].filter(Boolean).join(" "),
          css(["color", "var(--wp--preset--color--auvyx-accent)"], ...m0))];
        break;
      }
      case "countdown": {
        const due = javaTrim(get(s, "due_date")).replaceAll(" ", "T");
        const cell = (n: string, unit: string) => c.named(unit, c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "2px"], ["align-items", "center"], ["min-width", "64px"]), [
          c.text(n, css(["font-size", "2rem"], ["font-weight", "700"], ["line-height", "1"], ...m0)), c.text(unit, css(["font-size", "0.75rem"], ...m0))]));
        const until = new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}${DOTLESS}*$`).test(due) ? due.slice(0, 16) : "2027-01-01T00:00";
        made = [c.classed(countdownClass(until), c.named("Countdown", c.div(css(["display", "flex"], ["gap", "16px"], ["justify-content", "center"]),
          [cell("00", "Days"), cell("00", "Hours"), cell("00", "Min"), cell("00", "Sec")])))];
        break;
      }
      case "social-icons": {
        const links = arr(s.get("social_icon_list") ?? []).map(obj).flatMap((it) => {
          const parts = split(get(obj(it.get("social_icon") ?? null), "value"), new RegExp(`${W}+`));
          const icon = stripPrefix(parts[parts.length - 1] ?? "", "fa-").replaceAll("-square", "").replaceAll("-f", "");
          const href = link(it.get("link") ?? null);
          return href ? [c.link(SOCIAL.get(icon) ?? capitalize(icon), href, css(["font-size", "0.875rem"]))] : [];
        });
        made = !links.length ? [] : [c.named("Social links", c.div(css(["display", "flex"], ["flex-wrap", "wrap"], ["gap", "16px"]), links))];
        break;
      }
      case "posts": case "portfolio": case "archive-posts": {
        const n = toInt(get(s, "classic_columns")) ?? toInt(get(s, "columns"));
        const cols = n !== undefined ? Math.max(1, Math.min(4, n)) : 3;
        const count = toInt(get(s, "classic_posts_per_page")) ?? toInt(get(s, "posts_per_page")) ?? cols * 2;
        const card = c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "8px"]), [
          c.bind(c.linkedImage("landscape", "", "#", css(["width", "100%"], ["aspect-ratio", "16 / 10"], ["object-fit", "cover"], ["display", "block"])), ["url", "featured_image"], ["alt", "post_title"], ["href", "post_url"]),
          c.bind(c.heading("Post title", 3, css(["font-size", "1.125rem"], ...m0)), ["content", "post_title"]),
          c.bind(c.text("Excerpt", css(...m0)), ["content", "post_excerpt"])]);
        made = [c.named("Posts", c.loop([["postType", "post"], ["perPage", String(count)]], css(["display", "grid"], ["grid-template-columns", `repeat(${cols}, minmax(0, 1fr))`], ["gap", "24px"])
          .m(["grid-template-columns", "minmax(0, 1fr)"]), [card]))];
        break;
      }
      case "woocommerce-products": case "wc-products": case "products": {
        const n = toInt(get(s, "columns"));
        const cols = n !== undefined ? Math.max(1, Math.min(6, n)) : 4;
        const rows = toInt(get(s, "rows"));
        const count = (rows !== undefined ? rows * cols : undefined) ?? toInt(get(s, "posts_per_page")) ?? cols * 2;
        const card = c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "8px"]), [
          c.bind(c.linkedImage("portrait", "", "#", css(["width", "100%"], ["aspect-ratio", "1 / 1"], ["object-fit", "cover"], ["display", "block"])), ["url", "featured_image"], ["alt", "post_title"], ["href", "post_url"]),
          c.bind(c.heading("Product name", 3, css(["font-size", "0.9375rem"], ...m0)), ["content", "post_title"]),
          c.bind(c.text("$0.00", css(["font-weight", "600"], ...m0)), ["content", "product_price"])]);
        made = [c.named("Products", c.loop([["postType", "product"], ["perPage", String(count)], ["orderBy", "date"]], css(["display", "grid"], ["grid-template-columns", `repeat(${cols}, minmax(0, 1fr))`], ["gap", "24px"])
          .t(["grid-template-columns", `repeat(${Math.min(cols, 3)}, minmax(0, 1fr))`]).m(["grid-template-columns", "repeat(2, minmax(0, 1fr))"]), [card]))];
        break;
      }
      case "testimonial-carousel": case "reviews": {
        const items = arr(s.get("slides") ?? []).map(obj).map((sl) => {
          const t = get(sl, "title");
          const content = c.text(clean(get(sl, "content")), css(...m0));
          const who = c.text(`<strong>${clean(get(sl, "name"))}</strong>${t ? `, ${clean(t)}` : ""}`, css(["font-size", "0.875rem"], ...m0));
          return c.named("Testimonial", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "10px"]), [content, who]));
        });
        made = !items.length ? [placeholder(name)] : [c.named("Testimonials", c.div(css(["display", "grid"], ["grid-template-columns", `repeat(${Math.min(3, items.length)}, minmax(0, 1fr))`], ["gap", "24px"])
          .m(["grid-template-columns", "minmax(0, 1fr)"]), items))];
        break;
      }
      case "search-form": case "wp-widget-search": made = [c.block("core/search", "Search")]; break;
      case "theme-post-title": case "post-title": made = [c.block("core/post-title", "Post title")]; break;
      case "theme-post-featured-image": made = [c.block("core/post-featured-image", "Featured image")]; break;
      case "nav-menu": case "wp-widget-nav_menu": made = [c.nav("main")]; break;
      case "theme-site-logo": case "site-logo": made = [markLinked(c, "44px")]; break;
      case "theme-site-title": case "site-title": made = [c.block("core/site-title", "Site title")]; break;
      case "theme-post-content": case "post-content": made = [c.block("core/post-content", "Post content")]; break;
      case "": made = []; break;
      default: made = themeWidget(name, s, e) ?? [placeholder(name)];
    }
    // a widget is one box in Elementor: its spacing, width and animation hold all it made, not each piece
    const boxedWidget = [...s.keys()].some((k) => /^(_margin|_padding|_element_custom_width|hide_|_animation|_css_classes|_element_id)/.test(k));
    return (made.length > 1 && boxedWidget ? [c.div(NONE, made)] : made).map((id) => advanced(s, id, true));
  };

  // ---- layout: legacy sections and columns, and flexbox containers ----
  const children = (e: JObj): JObj[] => arr(e.get("elements") ?? []).map(obj);

  const element = (e: JObj, top: boolean): string[] => {
    switch (get(e, "elType")) {
      case "section": return [section(e, top)];
      case "column": return [column(e)];
      case "container": return [container(e, top)];
      case "widget": return widget(e);
      default: return children(e).flatMap((x) => element(x, false));
    }
  };

  const frame = (s: JObj): S => css(...background(s)).plus(border(s)).plus(respDim(s, "min_height", "min-height"));
  const settings = (e: JObj) => obj(e.get("settings") ?? null);

  const section = (e: JObj, top: boolean): string => {
    const s = settings(e);
    const cols = children(e).filter((x) => get(x, "elType") === "column");
    const gp = get(s, "gap");
    const gap = gp === "no" ? "0px" : gp === "narrow" ? "10px" : gp === "extended" ? "30px" : gp === "wide" ? "40px" : gp === "wider" ? "60px" : "20px";
    // a column dragged to a width keeps it in `_inline_size`; `_column_size` is only the preset it started from
    const sizes = cols.map(settings).map((cs) => toDouble(get(cs, "_inline_size")) ?? toDouble(get(cs, "_column_size")) ?? 100 / Math.max(1, cols.length));
    const tablet = cols.map((col) => toDouble(get(settings(col), "_inline_size_tablet")));
    // on a phone the columns stack, or share a row when they are given a width there (50% → two to a row)
    const phones = cols.map((col) => toDouble(get(settings(col), "_inline_size_mobile"))).filter((p): p is number => p !== undefined && p > 0);
    const phone = phones.length ? Math.max(1, Math.trunc(Math.round(100 / Math.min(...phones)))) : 1;
    const cp = get(s, "content_position");
    const valign = cp === "middle" ? "center" : cp === "bottom" ? "end" : cp === "top" ? "start" : "stretch";
    const fr = (x: number) => `minmax(0, ${stripSuffix(fixed(x, 2), ".00")}fr)`;
    const grid = sOf({
      base: [["display", "grid"], ["grid-template-columns", sizes.map(fr).join(" ")], ["column-gap", gap], ["row-gap", gap], ["align-items", valign], ["width", "100%"]],
      tablet: tablet.some((t) => t !== undefined) ? [["grid-template-columns", tablet.map((t) => fr(t ?? 100)).join(" ")]] : [],
      mobile: [["grid-template-columns", phone === 1 ? "minmax(0, 1fr)" : `repeat(${phone}, minmax(0, 1fr))`]],
    });
    const width = get(s, "layout") === "full_width" ? undefined : dim(s.get("content_width") ?? null) ?? boxed;
    // Elementor pads every column by half the gap unless the column sets its own padding
    const gd = toDouble(stripSuffix(gap, "px"));
    const half = gd !== undefined && gd / 2 > 0 ? `${stripSuffix(fixed(gd / 2, 2), ".00")}px` : undefined;
    const laid = cols.flatMap((col) => {
      const own = [...settings(col).keys()].some((k) => k.startsWith("padding"));
      return element(col, false).map((id) => (half !== undefined && !own ? c.styled(sOf({ mobile: [["padding-inline-start", half], ["padding-inline-end", half]] }), id) : id));
    });
    const inner = c.named("Columns", c.div(grid.plus(css(...(width !== undefined ? [["max-width", width], ["margin-inline-start", "auto"], ["margin-inline-end", "auto"]] as Decl[] : []))), laid));
    const hk = get(s, "height");
    const height: Decl[] = hk === "full" ? [["min-height", "100vh"]] : hk === "min-height" ? decl("min-height", dim(s.get("custom_height") ?? null)) : [];
    const st = css(["display", "flex"], ["flex-direction", "column"], ["justify-content", "center"], ...height,
      ...(top ? [["padding-inline-start", "20px"], ["padding-inline-end", "20px"]] as Decl[] : [])).plus(frame(s)).plus(resp(s, "padding", (v) => sides(v, "padding")));
    const id = top && !get(e, "isInner").includes("true") ? c.named("Section", c.section(st, "section", "full", [inner])) : c.named("Inner section", c.div(st, [inner]));
    return advanced(s, id, false);
  };

  const column = (e: JObj): string => {
    const s = settings(e);
    const cp = get(s, "content_position");
    const v = cp === "center" ? "center" : cp === "bottom" ? "flex-end" : "flex-start";
    const gs = obj(s.get("space_between_widgets") ?? null).get("size");
    const gd = gs === undefined ? undefined : toDouble(str(gs));
    const gap = gd !== undefined ? `${Math.trunc(gd)}px` : "20px";
    const st = css(["display", "flex"], ["flex-direction", "column"], ["gap", gap], ["justify-content", v], ["min-width", "0"]).plus(frame(s)).plus(resp(s, "padding", (x) => sides(x, "padding")));
    return advanced(s, c.named("Column", c.div(st, children(e).flatMap((x) => element(x, false)))), false);
  };

  const container = (e: JObj, top: boolean): string => {
    const s = settings(e);
    const flex = (key: string, prop: string, ok: string[]) => resp(s, key, (v) => (ok.includes(str(v)) ? [[prop, str(v)]] : []));
    const dir = flex("flex_direction", "flex-direction", ["row", "column", "row-reverse", "column-reverse"]);
    const gapS = resp(s, "flex_gap", (v) => {
      const col = obj(v).get("column");
      const x = dim(v) ?? (col !== undefined && str(col) !== "" ? `${str(col)}px` : undefined);
      return decl("gap", x);
    });
    const layout = sOf({ base: [["display", "flex"], ...(dir.base.length ? [] : [["flex-direction", "column"]] as Decl[])] }).plus(dir)
      .plus(flex("flex_justify_content", "justify-content", ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"]))
      .plus(flex("flex_align_items", "align-items", ["flex-start", "center", "flex-end", "stretch", "baseline"]))
      .plus(flex("flex_wrap", "flex-wrap", ["wrap", "nowrap"]))
      .plus(gapS.base.length ? gapS : gapS.plus(css(["gap", "20px"])));
    const w = respDim(s, "width", "width");
    const sized = !w.empty ? w.plus(sOf({ mobile: w.mobile.length ? [] : [["width", "100%"]] })) : w;
    const kids = children(e).flatMap((x) => element(x, false));
    const boxedInner = get(s, "content_width") !== "full";
    let id: string;
    if (top) {
      const innerWidth = dim(s.get("boxed_width") ?? null) ?? boxed;
      const inner = c.named("Content", c.div(layout.plus(css(["width", "100%"], ["max-width", boxedInner ? innerWidth : "none"], ["margin-inline-start", "auto"], ["margin-inline-end", "auto"])), kids));
      const st = css(["display", "flex"], ["flex-direction", "column"], ["padding-block-start", "10px"], ["padding-block-end", "10px"],
        ["padding-inline-start", "20px"], ["padding-inline-end", "20px"]).plus(frame(s)).plus(resp(s, "padding", (v) => sides(v, "padding")));
      id = c.named("Section", c.section(st, "section", "full", [inner]));
    } else id = c.named("Container", c.div(layout.plus(sized).plus(css(["min-width", "0"])).plus(frame(s)).plus(resp(s, "padding", (v) => sides(v, "padding"))), kids));
    return advanced(s, id, false);
  };

  const roots = elements.map(obj).flatMap((e) => {
    const t = get(e, "elType");
    if (t === "section" || t === "container") return element(e, true);
    return element(e, false).map((id) => c.section(css(["display", "flex"], ["flex-direction", "column"], ["gap", "20px"], ["padding-block-start", "40px"], ["padding-block-end", "40px"],
      ["padding-inline-start", "20px"], ["padding-inline-end", "20px"]), "section", "full", [id]));
  });
  const nodes = dedupeTitles(Object.fromEntries(c.nodes));
  return { roots, nodes, kept };
}

/** A widget with a title of its own placed right under a heading saying the same: the heading the author placed stays,
 * the widget's copy goes. Compared by words, ignoring case and markup; only headings are dropped. */
export function dedupeTitles(nodes: Record<string, El>): Record<string, El> {
  const words = (n: El) => n.text.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(" ");
  const texty = (n: El) => n.kind === "Heading" || n.kind === "Text";
  const last = (id: string): El | undefined => {
    const n = nodes[id];
    if (!n) return undefined;
    for (let i = n.children.length - 1; i >= 0; i--) { const x = last(n.children[i]!); if (x) return x; }
    return texty(n) ? n : undefined;
  };
  const first = (id: string): El | undefined => {
    const n = nodes[id];
    if (!n) return undefined;
    if (texty(n)) return n;
    for (const ch of n.children) { const x = first(ch); if (x) return x; }
    return undefined;
  };
  const drop = new Set<string>();
  for (const n of Object.values(nodes))
    for (let i = 0; i + 1 < n.children.length; i++) {
      const prev = last(n.children[i]!);
      const cur = first(n.children[i + 1]!);
      if (prev && cur && cur.kind === "Heading" && cur.id !== prev.id && words(cur).length >= 3 && words(cur) === words(prev)) drop.add(cur.id);
    }
  if (!drop.size) return nodes;
  const out: Record<string, El> = {};
  for (const [k, n] of Object.entries(nodes)) if (!drop.has(k)) out[k] = { ...n, children: n.children.filter((ch) => !drop.has(ch)) };
  return out;
}

