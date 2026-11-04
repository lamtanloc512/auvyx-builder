/**
 * What the Scala core decides about special elements before writing them: data bindings and loop queries
 * (`DataFields`), carousel settings (`Carousel`), vector data (`VectorPath`), the code widget's highlighting
 * (`SnippetHighlight`), code, game and sandboxed sections. Each function says which Scala one it mirrors.
 */
import codeLibraries from "../../../shared/code-libraries.json";
import slotContext from "../../../shared/storefront/slot-context.json";
import { DOT, NOT_WS, WS, intOption, isJavaWhitespace, isRecord, javaTrim, jsonString } from "./json";
import type { El, Kind } from "./model";

// ---- DataFields -------------------------------------------------------------------------------

/** The WordPress `auvyx/data` keys (DataFields.all). */
const DATA_KEYS = new Set([
  "post_title", "post_excerpt", "post_date", "post_author", "post_categories", "post_url", "featured_image",
  "featured_image_alt", "site_title", "site_tagline", "site_url", "site_logo", "archive_title", "product_price",
  "product_sku", "product_add_to_cart_url", "product_add_to_cart_text",
]);

/** `store/<field>` keys: the bind keys of the store context catalogue, media fields included (as gen-shared.mjs reads it). */
const STORE_KEYS = new Set<string>(slotContext.fields.flatMap((f): string[] => {
  const field = f as { bind?: string; type: string; bindings?: Record<string, string> };
  if (field.type === "media") return slotContext.mediaFields.map((m) => field.bindings?.[m.name]).filter((k): k is string => !!k);
  return field.bind ? [field.bind] : [];
}));

const EXTENSION_KEY = /^[a-z0-9-]{1,30}\/[a-z0-9_]{1,60}$/;
const META = "meta:";

/** DataFields.bindable: the block attributes of a kind that can be bound, in the order they are saved. */
export const bindable = (kind: Kind): readonly string[] => {
  switch (kind) {
    case "Heading": return ["content", "href"];
    case "Text": return ["content"];
    case "Button": return ["text", "url"];
    case "Image": return ["url", "alt", "href"];
    default: return [];
  }
};

/** DataFields.valid: a known field, a plugin's field or a custom field that is not protected. */
export const validBinding = (key: string): boolean => {
  if (key.startsWith("store/")) return STORE_KEYS.has(key);
  if (DATA_KEYS.has(key) || EXTENSION_KEY.test(key)) return true;
  if (!key.startsWith(META)) return false;
  const name = key.slice(META.length);
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(javaTrim(name)) && !name.startsWith("_");
};

const QUERY_DEFAULTS: readonly [string, string][] = [
  ["postType", "post"], ["perPage", "3"], ["orderBy", "date"], ["order", "desc"], ["offset", "0"], ["inherit", "false"],
  ["excludeCurrent", "false"], ["taxonomy", ""], ["terms", ""], ["paginate", "false"], ["source", ""], ["include", ""], ["more", ""],
];
const ORDER_BY = new Set(["date", "modified", "title", "menu_order", "comment_count", "rand", "popularity"]);

const clampInt = (v: string, d: string, min: number, max: number) => {
  const n = intOption(v);
  return n === undefined ? d : String(Math.max(min, Math.min(max, n)));
};

/** DataFields.normalizeQuery: known keys only, in their order, values clamped like render.php. */
export const normalizeQuery = (q: Readonly<Record<string, string>>): [string, string][] =>
  QUERY_DEFAULTS.map(([k, d]): [string, string] => {
    const v = Object.hasOwn(q, k) ? q[k]! : d;
    switch (k) {
      case "postType": return [k, /^[a-z0-9_-]{1,20}$/.test(v) ? v : d];
      case "perPage": return [k, clampInt(v, d, 1, 50)];
      case "offset": return [k, clampInt(v, d, 0, 100)];
      case "orderBy": return [k, ORDER_BY.has(v) ? v : d];
      case "order": return [k, v === "asc" ? "asc" : "desc"];
      case "inherit": case "excludeCurrent": case "paginate": return [k, v === "true" ? "true" : "false"];
      case "taxonomy": return [k, /^[a-z0-9_-]{0,32}$/.test(v) ? v : d];
      case "source": return [k, v === "" || EXTENSION_KEY.test(v) ? v : d];
      case "include": return [k, [...new Set(v.split(",").map(javaTrim).filter((x) => /^\d{1,10}$/.test(x)))].slice(0, 50).join(",")];
      case "terms": return [k, v.split(",").map(javaTrim).filter((x) => /^[a-z0-9_\-%]{1,200}$/.test(x)).slice(0, 20).join(",")];
      case "more": return [k, v === "button" || v === "scroll" ? v : ""];
      default: return [k, v];
    }
  }).filter(([k, v]) => !(k === "more" && v === ""));

// ---- Carousel ---------------------------------------------------------------------------------

const CAROUSEL_DEFAULTS: readonly [string, string][] = [
  ["layout", "banner"], ["size", "full"], ["height", "480"], ["arrows", "on"], ["gap", "0"], ["slides", ""],
];
const FALLBACK_COLOR = "var(--wp--preset--color--auvyx-surface)";
const TOKEN_COLOR =
  /^(?:#[0-9a-fA-F]{6}|var\(--wp--preset--color--auvyx-[a-z0-9-]+\)|color-mix\(in srgb, var\(--wp--preset--color--auvyx-[a-z0-9-]+\) \d{1,3}%, var\(--wp--preset--color--auvyx-[a-z0-9-]+\)\))$/;
const HTTP_HREF = new RegExp(`^https?://${NOT_WS}+$`, "i");
const IMAGE_URL = new RegExp(`^(https?://|/)${DOT}+$`, "i");

const safeHref = (h: string) => (h === "" || h.startsWith("#") || h.startsWith("/") || HTTP_HREF.test(h) ? h : "#");
const safeImage = (u: string) => (IMAGE_URL.test(u) && ![...u].some((c) => c === '"' || c === ")" || c === "(" || isJavaWhitespace(c)) ? u : "");
const oneOf = (v: string, ...allowed: string[]) => (allowed.includes(v) ? v : allowed[0]!);
const percent = (v: string, fallback = "0") => {
  const n = intOption(v);
  return n === undefined ? fallback : String(Math.max(0, Math.min(100, n)));
};

const SLIDE_KEYS = ["eyebrow", "title", "body", "button", "href", "image", "color", "alt", "hover", "depth", "depthHover", "parallax", "animate", "posX", "posY", "target", "imageHref"] as const;
type Slide = Record<(typeof SLIDE_KEYS)[number], string>;

class BadSlides extends Error {}

/** Carousel.parse: up to 12 slides, every field bounded and made safe; anything malformed → no slides at all. */
const parseSlides = (raw: string): Slide[] => {
  if (raw === "") return [];
  try {
    const items: unknown = JSON.parse(raw);
    if (!Array.isArray(items)) return [];
    return items.map((item): Slide => {
      if (!isRecord(item)) throw new BadSlides();
      const s = (k: string, n: number) => {
        if (!Object.hasOwn(item, k)) return "";
        const v = item[k];
        if (typeof v !== "string") throw new BadSlides();
        return v.slice(0, n);
      };
      return {
        eyebrow: s("eyebrow", 80), title: s("title", 160), body: s("body", 400), button: s("button", 80),
        href: safeHref(s("href", 500)), image: safeImage(s("image", 500)),
        color: TOKEN_COLOR.test(s("color", 220)) ? s("color", 220) : FALLBACK_COLOR,
        alt: s("alt", 160), hover: oneOf(s("hover", 12), "none", "zoom", "darken"),
        depth: percent(s("depth", 3)), depthHover: percent(s("depthHover", 3)), parallax: percent(s("parallax", 3)),
        animate: oneOf(s("animate", 8), "none", "fade", "left", "right", "up"),
        posX: percent(s("posX", 3), "50"), posY: percent(s("posY", 3), "50"),
        target: s("target", 8) === "_blank" ? "_blank" : "", imageHref: safeHref(s("imageHref", 500)),
      };
    }).slice(0, 12);
  } catch {
    return [];
  }
};

const encodeSlides = (slides: Slide[]) =>
  "[" + slides.map((s) => "{" + SLIDE_KEYS.map((k) => `${jsonString(k)}:${jsonString(s[k])}`).join(",") + "}").join(",") + "]";

/** Carousel.normalize: every setting, in order, with the slide list re-encoded. */
export const normalizeCarousel = (q: Readonly<Record<string, string>>): [string, string][] =>
  CAROUSEL_DEFAULTS.map(([k, d]): [string, string] => {
    const v = Object.hasOwn(q, k) ? q[k]! : d;
    switch (k) {
      case "layout": return [k, v === "centered" || v === "split" || v === "banner" ? v : d];
      case "size": return [k, v === "half" || v === "third" || v === "full" ? v : d];
      case "height": return [k, v === "320" || v === "480" || v === "640" ? v : d];
      case "arrows": return [k, v === "off" ? "off" : "on"];
      case "gap": return [k, /^\d{1,3}px$/.test(v) ? v : "0"];
      case "slides": return [k, encodeSlides(parseSlides(v))];
      default: return [k, d];
    }
  });

// ---- VectorPath, NavMarkup --------------------------------------------------------------------

export const DEFAULT_BOX = "0 0 100 100";
const PATH = new RegExp(`^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\\-${WS.slice(1, -1)}]*$`);
const BOX = new RegExp(`^-?\\d+(\\.\\d+)?(${WS}+-?\\d+(\\.\\d+)?){3}$`);

/** VectorPath.safePath: path commands and numbers only (like blocks/vector/render.php), else empty. */
export const safePath = (d: string) => (d.length <= 50000 && PATH.test(d) ? d : "");
/** VectorPath.safeBox: four numbers, else the default box. */
export const safeBox = (b: string) => (BOX.test(javaTrim(b)) ? javaTrim(b) : DEFAULT_BOX);

/** NavMarkup.toggles: where a menu bar turns into a menu button. */
export const NAV_TOGGLES = ["mobile", "tablet", "never"] as const;

// ---- SnippetHighlight -------------------------------------------------------------------------

const TOKEN = new RegExp(
  `(\\/\\/[^\\n]*|--[^\\n]*|'(?:\\\\${DOT}|[^'\\\\])*'|"(?:\\\\${DOT}|[^"\\\\])*"|\`(?:\\\\${DOT}|[^\`\\\\])*\`|\\b(?:import|from|const|let|await|return|select|where|as|function)\\b)`,
  "gi",
);

const escapeText = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** SnippetHighlight.html: keywords, strings and comments become spans; everything else is escaped text. */
export const highlight = (code: string): string => {
  let out = "";
  let i = 0;
  for (const m of code.matchAll(TOKEN)) {
    const raw = m[0];
    if (m.index > i) out += escapeText(code.slice(i, m.index));
    const kind = raw.startsWith("//") || raw.startsWith("--") ? "token-comment"
      : raw.startsWith("'") || raw.startsWith('"') || raw.startsWith("`") ? "token-string" : "token-keyword";
    out += `<span class="${kind}">${escapeText(raw)}</span>`;
    i = m.index + raw.length;
  }
  return i < code.length ? out + escapeText(code.slice(i)) : out;
};

// ---- code, game and sandboxed sections --------------------------------------------------------

const LIBRARIES = new Set(codeLibraries.libraries.map((l) => l.name));
const classes = (n: El) => n.className.split(" ");

/** CodeElement.isCode: a section with its own markup and module. */
export const isCode = (n: El) => n.kind === "Section" && (classes(n).includes("auvyx-code") || n.script !== "" || n.markup !== "");
/** CodeElement.libs: known library names only, once each. */
export const codeLibs = (names: readonly string[]) => [...new Set(names.map(javaTrim).filter((n) => LIBRARIES.has(n)))];
/** PlayElement.isGame. */
export const isGame = (n: El) => n.kind === "Section" && n.game !== "";
/** SandboxCode.is: custom code that runs in an iframe; the saved element stays empty. */
export const isSandbox = (n: El) => n.kind === "Section" && classes(n).includes("auvyx-sandbox");

const SANDBOX_MAX = 20000;
/** SandboxCode.attrJson. */
export const sandboxJson = (fields: Readonly<Record<string, string>>) => {
  const f = (k: string, max: number) => jsonString((Object.hasOwn(fields, k) ? fields[k]! : "").slice(0, max));
  return `{"html":${f("html", SANDBOX_MAX)},"css":${f("css", SANDBOX_MAX)},"js":${f("js", SANDBOX_MAX)},"allow":${f("allow", 500)}}`;
};
