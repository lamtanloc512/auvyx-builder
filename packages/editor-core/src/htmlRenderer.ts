/**
 * The Studio's framework-neutral HTML renderer (S/HtmlRenderer.scala), as `WebExport` and the canvas use it: a document →
 * the page's HTML (publish mode, or canvas mode with the editor's `data-auvyx-*` ids) and its CSS. Byte for byte the Scala
 * core's output, checked by test/htmlRenderer.test.ts against apps/studio/packages/mcp/dist/core.js.
 *
 * Ported with the helpers it needs (Corners, FrontEnd.isSlider, Embed, Carousel.track, SandboxCode.iframe, IconSet,
 * DesignDefaults). Not ported: a host's store context (`store/<field>` bindings, which keep their static sample, as in the
 * Studio without one), the navigation-menu and commerce-header hooks (refused with the Scala messages) and marked code
 * profiles (`auvyx-code-template-v1` / `auvyx-code-module-v1`, SlotTemplate + CodeCssScope): refused, naming the element.
 */
import { compileBlockStyles, compileScopedCss, type Breakpoint, type CompiledBlockStyles, type Styles } from "@auvyx/style-engine";
import designSystem from "../../../shared/defaults/design-system.json";
import iconsJson from "../../../shared/icons.json";
import { MAX_DEPTH, MAX_NODES } from "./docjson";
import { codeLibs, highlight, isCode, isGame, isSandbox, normalizeCarousel, validBinding, bindable } from "./elements";
import { FOOTER_MARKERS } from "./footerBuilder";
import { HEADER_MARKERS } from "./headerBuilder";
import { WS, intOption, javaTrim, jsonString } from "./json";
import { KINDS, SECTION_TAGS, flatten, type Doc, type El, type Kind } from "./model";

export type Item = Record<string, string>;

/** CodeMode: what a render does with authored code. Stopped unless a host says otherwise. */
export type CodeMode = "enabled" | "stopped" | "disabled";
const runs = (c: CodeMode) => c === "enabled";
const authoredCss = (c: CodeMode) => c !== "disabled";

/** HtmlRenderer.Hooks, without the store, navigation-menu and commerce-header hooks (see the file's note). */
export interface Hooks {
  raw?: (n: El) => string | undefined;
  rawOuter?: (n: El) => string | undefined;
  loop?: (n: El) => readonly Item[] | undefined;
  data?: (source: string) => readonly Item[];
  game?: (key: string) => string | undefined;
  code?: CodeMode;
}

export type RenderMode = "publish" | "canvas";

export interface RenderOptions {
  items?: readonly Item[];
  sanitizeRichText?: (text: string) => string;
  breakpoints?: readonly Breakpoint[];
  hooks?: Hooks;
  mode?: RenderMode;
}

export type Result = { ok: true; value: string } | { ok: false; error: string };

// ---- DesignDefaults, IconSet, TokenCss (shared/*.json, as gen-shared.mjs writes Generated.scala) -------------------

export const DEFAULT_BREAKPOINTS: readonly Breakpoint[] = designSystem.breakpoints as Breakpoint[];
const ICONS: Readonly<Record<string, string>> = iconsJson.icons;

/** IconSet.svg */
export const iconSvg = (name: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${Object.hasOwn(ICONS, name) ? ICONS[name] : ""}</svg>`;

/** TokenCss.vars(DesignDefaults…) */
const tokenVars = (): string =>
  [
    ...designSystem.tokens.color.map((t) => `--wp--preset--color--${t.slug}:${t.color}`),
    ...designSystem.tokens.spacing.map((t) => `--wp--preset--spacing--${t.slug}:${t.size}`),
    ...designSystem.tokens.fontSize.map((t) => `--wp--preset--font-size--${t.slug}:${t.size}`),
  ].join(";");

// ---- small JVM-like helpers --------------------------------------------------------------------------------------

const SPLIT_WS = new RegExp(`${WS}+`);
/** Java's `split("\\s+")`: a leading empty token stays, trailing ones go. */
const splitWs = (s: string): string[] => {
  const parts = s.split(SPLIT_WS);
  while (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  return parts;
};
const lowerAscii = (s: string) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
/** Scala's `toDoubleOption` for the plain decimals the callers hand it. */
const toDouble = (s: string): number | undefined => (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s) ? Number(s) : undefined);
/** A Double in a Scala.js string: as JavaScript prints it (`1`, `1.066`, `0` for -0.0), not as the JVM would. */
const showDouble = (d: number): string => String(d);

// ---- HtmlRenderer.escape / safeUrl -------------------------------------------------------------------------------

export const escape = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"));

export function safeUrl(raw: string, media = false): string | undefined {
  const s = javaTrim(raw);
  if (s === "") return undefined;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 32 || c === 127 || c === 92) return undefined;
  }
  const colon = s.indexOf(":");
  const boundary = s.search(/[/?#]/);
  if (colon >= 0 && (boundary < 0 || colon < boundary)) {
    const scheme = lowerAscii(s.slice(0, colon));
    if ((scheme === "http" || scheme === "https") && s.slice(colon + 1).startsWith("//")) return s;
    if (!media && (scheme === "mailto" || scheme === "tel")) return s;
    return undefined;
  }
  return s;
}

// ---- Corners, FrontEnd.isSlider, WebExport.utilityClasses --------------------------------------------------------

export const SQUIRCLE = "auvyx-squircle";
const NUMBER = /(-?\d*\.?\d+)(px|rem|em|%)?/g;
const NUMBER_FULL = /^(-?\d*\.?\d+)(px|rem|em|%)?$/;

/** Corners.smooth */
const smooth = (value: string): boolean => {
  const v = javaTrim(value).toLowerCase();
  if (v === "" || v.includes("full") || v.includes("%")) return false;
  const pill = [...v.matchAll(NUMBER)].some((m) => (toDouble(m[1]!) ?? 0) >= 999 && (m[2] === undefined || m[2] === "px"));
  const square = splitWs(v).every((part) => {
    if (!NUMBER_FULL.test(part)) return false;
    let i = 0;
    while (i < part.length && /[0-9.-]/.test(part[i]!)) i++;
    return toDouble(part.slice(0, i)) === 0;
  });
  return !pill && !square;
};

/** Corners.squircle(n) */
export function squircle(n: El): boolean {
  if (n.kind === "Raw") return false;
  const radii: string[] = [];
  for (const states of Object.values(n.styles)) for (const decls of Object.values(states ?? {})) {
    for (const [p, v] of Object.entries(decls ?? {})) if (p.startsWith("border") && p.endsWith("radius")) radii.push(v);
  }
  return radii.length === 0 ? n.kind === "Button" || n.kind === "Video" : radii.some(smooth);
}

/** FrontEnd.isSlider */
export const isSlider = (n: El): boolean =>
  n.kind === "Section" && Object.values(n.styles).some((s) => { const v = s?.default?.["scroll-snap-type"]; return v !== undefined && javaTrim(v).startsWith("x"); });

const PRESET = /^var\(--wp--preset--(?:color|font-size|font-family)--([a-z0-9-]+)\)$/;

/** WebExport.utilityClasses */
export function utilityClasses(decls: Readonly<Record<string, string>>): string[] {
  const map: [string, string, string][] = [["color", "has-text-color", "color"], ["background-color", "has-background", "background-color"], ["font-size", "", "font-size"], ["font-family", "", "font-family"]];
  return map.flatMap(([property, flag, name]) => {
    const raw = Object.hasOwn(decls, property) ? javaTrim(decls[property]!) : "";
    if (raw === "") return [];
    const m = PRESET.exec(raw);
    return [...(flag ? [flag] : []), ...(m ? [`has-${m[1]}-${name}`] : [])];
  });
}

/** WebExport.utilityClassesOf */
export const utilityClassesOf = (styles: Styles): string[] => utilityClasses(styles.base?.default ?? {});

const COLOUR_FLAG_KINDS = new Set<Kind>(["Button", "Section", "Heading", "Text", "Accordion"]);

/** HtmlRenderer.ownColourFlags */
export function ownColourFlags(n: El): string[] {
  if (!COLOUR_FLAG_KINDS.has(n.kind)) return [];
  const own = new Set(splitWs(n.className));
  return utilityClassesOf(n.styles).filter((c) => (c === "has-text-color" || c === "has-background") && !own.has(c));
}

// ---- Embed ---------------------------------------------------------------------------------------------------------

const YOUTUBE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/;
const VIMEO = /vimeo\.com\/(?:video\/)?(\d{5,12})/;
// `\s` of a Java regex is ASCII whitespace only
const VIDEO_FILE = /^https?:\/\/[^ \t\n\x0B\f\r"'<>]+\.(?:mp4|webm|ogv)(?:\?[^ \t\n\x0B\f\r"'<>]*)?$/i;
const BG_CLASS = "auvyx-bg-video";
const AUTOPLAY_CLASS = "auvyx-video-autoplay";
// `.` in a Java regex stops at line terminators; JavaScript's at LF, CR, LS and PS too, but not at NEL (U+0085).
const javaDot = (re: RegExp, s: string) => (s.includes("\u0085") ? new RegExp(re.source.replace(/\.\*/g, "[^\\n\\r\\u0085\\u2028\\u2029]*"), re.flags).exec(s) : re.exec(s));
const youtube = (v: string) => javaDot(YOUTUBE, v)?.[1];
const vimeo = (v: string) => VIMEO.exec(v)?.[1];
const isFile = (v: string) => VIDEO_FILE.test(v);

const embedUrl = (v: string): string | undefined => {
  const y = youtube(v);
  if (y !== undefined) return `https://www.youtube-nocookie.com/embed/${y}`;
  const m = vimeo(v);
  return m !== undefined ? `https://player.vimeo.com/video/${m}` : undefined;
};
const embedFile = (v: string): string | undefined => { const t = javaTrim(v); return isFile(t) ? t : undefined; };
const autoplayUrl = (v: string): string | undefined => {
  const y = youtube(v);
  if (y !== undefined) return `https://www.youtube-nocookie.com/embed/${y}?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1`;
  const m = vimeo(v);
  return m !== undefined ? `https://player.vimeo.com/video/${m}?autoplay=1&muted=1&playsinline=1` : undefined;
};
const hasToken = (n: El, t: string) => splitWs(n.className).includes(t);
const isAutoplay = (n: El) => n.kind === "Video" && !hasToken(n, BG_CLASS) && hasToken(n, AUTOPLAY_CLASS);
const backgroundSound = (n: El) => n.kind === "Video" && hasToken(n, BG_CLASS) && hasToken(n, AUTOPLAY_CLASS);
type Background = { file: string } | { frame: string };
const background = (video: string, sound: boolean): Background | undefined => {
  const v = javaTrim(video);
  if (isFile(v)) return { file: v };
  const y = youtube(v);
  if (y !== undefined) return { frame: `https://www.youtube-nocookie.com/embed/${y}?autoplay=1&mute=1&loop=1&playlist=${y}&controls=0&playsinline=1&rel=0${sound ? "&enablejsapi=1" : ""}` };
  const m = vimeo(v);
  if (m !== undefined) return { frame: sound ? `https://player.vimeo.com/video/${m}?autoplay=1&loop=1&muted=1&controls=0&playsinline=1` : `https://player.vimeo.com/video/${m}?background=1&autoplay=1&loop=1&muted=1` };
  return undefined;
};

// ---- Carousel.track ----------------------------------------------------------------------------------------------

const escText = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const esc = (s: string) => escText(s).replace(/"/g, "&quot;");
const num = (v: string, fallback = "0") => { const n = intOption(v); return n === undefined ? fallback : String(Math.max(0, Math.min(100, n))); };

type Slide = Record<"eyebrow" | "title" | "body" | "button" | "href" | "image" | "color" | "alt" | "hover" | "depth" | "depthHover" | "parallax" | "animate" | "posX" | "posY" | "target" | "imageHref", string>;

function slideHtml(s: Slide, layout: string, basis: string, height: string): string {
  const [align, text, padEnd] = layout === "centered" ? ["center", "center", "64px"] : layout === "split" ? ["center", "left", "52%"] : ["flex-start", "left", "64px"];
  const scale = 1 + Number(num(s.depth)) / 500.0;
  const hoverScale = s.depthHover === "0" ? scale : 1 + Number(num(s.depthHover)) / 500.0;
  const shift = -(Number(num(s.parallax)) * 0.4);
  const imgStyle = `--auvyx-scale:${showDouble(scale)};--auvyx-scale-hover:${showDouble(hoverScale)};--auvyx-shift:${showDouble(shift)}px;object-position:${num(s.posX)}% ${num(s.posY)}%`;
  let picture = "";
  if (s.image !== "") {
    const img = `<img class="auvyx-carousel__img auvyx-carousel__img--${s.hover}" src="${esc(s.image)}" alt="${esc(s.alt)}" style="${imgStyle}">`;
    if (s.imageHref === "" || s.imageHref === "#") picture = img;
    else picture = `<a class="auvyx-carousel__imglink" href="${esc(s.imageHref)}"${s.target === "_blank" ? ' target="_blank" rel="noopener"' : ""}>${img}</a>`;
  }
  const hex = s.color.startsWith("#");
  const ink = hex ? "#fff" : "var(--wp--preset--color--auvyx-text)";
  const radius = hex ? "" : ";border-radius:var(--wp--custom--radius--md, 0)";
  const style = `position:relative;overflow:hidden;display:flex;flex-direction:column;gap:16px;justify-content:center;align-items:${align};text-align:${text};flex:0 0 ${basis};scroll-snap-align:start;min-width:0;min-height:${height}px;padding:64px;padding-inline-end:${padEnd};color:${ink};background-color:${s.color}${radius}`;
  const anim = (s.animate === "none" ? "" : ` auvyx-anim-${s.animate}`) + (layout === "split" ? " auvyx-carousel__slide--split" : "");
  const eyebrow = s.eyebrow === "" ? "" : `<p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8">${esc(s.eyebrow)}</p>`;
  const title = s.title === "" ? "" : `<h2 style="margin:0;font-size:40px;line-height:1.1">${esc(s.title)}</h2>`;
  const body = s.body === "" ? "" : `<p style="margin:0;max-width:36rem">${esc(s.body)}</p>`;
  const buttonBg = hex ? "#fff" : "var(--wp--preset--color--auvyx-primary)";
  const buttonFg = hex ? "#0f172a" : "var(--wp--preset--color--auvyx-on-primary)";
  const button = s.button === "" ? "" : `<a href="${esc(s.href)}" style="display:inline-block;margin-block-start:8px;padding:12px 20px;background:${buttonBg};color:${buttonFg};text-decoration:none;border-radius:var(--wp--custom--radius--md, 0)">${esc(s.button)}</a>`;
  return `<article class="auvyx-carousel__slide${anim}" style="${style}">${picture}<div class="auvyx-carousel__copy">${eyebrow}${title}${body}${button}</div></article>`;
}

/** Carousel.track: the scroll strip (the wrapper is the caller's). Slides come out of `normalize` already parsed and clean. */
export function carouselTrack(n: El): string {
  const q = Object.fromEntries(normalizeCarousel(n.query));
  const basis = q.size === "half" ? "50%" : q.size === "third" ? "33.333%" : "100%";
  const slides = (JSON.parse(q.slides!) as Slide[]).map((s) => slideHtml(s, q.layout!, basis, q.height!)).join("");
  return `<div class="auvyx-carousel__track" style="display:flex;gap:${q.gap};overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none">${slides}</div>`;
}

// ---- SandboxCode ---------------------------------------------------------------------------------------------------

const SANDBOX_MAX = 20000;
const ORIGIN = /^https:\/\/[a-z0-9][a-z0-9.-]*[a-z0-9](?::[0-9]{2,5})?$|^https:\/\/[a-z0-9](?::[0-9]{2,5})?$/;
const originOk = (value: string) => {
  const t = javaTrim(value);
  return ORIGIN.test(t) && !t.includes("..") && !t.includes("@") && !t.includes("\\") && !t.slice(8).includes("/");
};

/** SandboxCode.themeVars */
export const themeVars = (): string =>
  tokenVars() + ";" + [["sm", "0"], ["md", "0"], ["lg", "0"], ["xl", "0"], ["full", "9999px"]].map(([slug, v]) => `--wp--custom--radius--${slug}:${v}`).join(";") + ";" +
  [["auvyx-body", "Geist, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"], ["auvyx-heading", "Geist, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"]]
    .map(([slug, v]) => `--wp--preset--font-family--${slug}:${v}`).join(";");

const field = (fields: Readonly<Record<string, string>>, k: string) => (Object.hasOwn(fields, k) ? fields[k]! : "");
const sealTag = (text: string, tag: string) => text.slice(0, SANDBOX_MAX).replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1");
const csp = (allow: string[]) =>
  `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src ${allow.length === 0 ? "'none'" : allow.join(" ")}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;

function sandboxIframe(fields: Readonly<Record<string, string>>): string {
  const allow = splitWs(field(fields, "allow")).filter(originOk);
  const srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp(allow)}"><style>:root{${themeVars()}}${sealTag(field(fields, "css"), "style")}</style></head><body>${field(fields, "html").slice(0, SANDBOX_MAX)}<script>${sealTag(field(fields, "js"), "script")}</script></body></html>`;
  return `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" data-auvyx-sandbox="1" style="width:100%;height:240px;border:0;display:block;pointer-events:none" srcdoc="${esc(srcdoc)}"></iframe>`;
}

// ---- CodeElement (legacy profile), SlotCode markers ------------------------------------------------------------------

const MAX_CODE = 60000;
const rawScript = (text: string) => text.replace(/<\/(script)/gi, "<\\/$1");
const isMarker = (token: string) => token.startsWith("auvyx-code-") && /^auvyx-code-[a-z0-9]+-v[0-9]+$/.test(token);
/** SlotCode.hasMarker */
const hasMarker = (n: El) => n.kind === "Section" && n.className.includes("auvyx-code-") && isCode(n) && n.className.split(SPLIT_WS).filter((t) => t !== "").some(isMarker);

function legacyInner(n: El, data: (u: string) => readonly Item[]): string {
  let out = n.markup.slice(0, MAX_CODE);
  if (javaTrim(n.script) !== "") out += `<script type="text/auvyx-module" data-auvyx-js>${rawScript(n.script.slice(0, MAX_CODE))}</script>`;
  if (n.uses.length > 0) {
    const json = "{" + n.uses.map((u) => `${jsonString(u)}:[${data(u).map((item) => "{" + Object.entries(item).map(([k, v]) => `${jsonString(k)}:${jsonString(v)}`).join(",") + "}").join(",")}]`).join(",") + "}";
    out += `<script type="application/json" data-auvyx-data>${rawScript(json)}</script>`;
  }
  return out;
}
const codeAttributes = (n: El) => { const ls = codeLibs(n.libs); return " data-auvyx-code" + (ls.length ? ` data-auvyx-libs="${ls.join(" ")}"` : ""); };

// ---- DocJson.validate (the checks the TypeScript tree validation leaves out) -----------------------------------------

const QUERY_KEYS: Partial<Record<Kind, ReadonlySet<string>>> = {
  Loop: new Set(["postType", "perPage", "orderBy", "order", "offset", "inherit", "excludeCurrent", "taxonomy", "terms", "paginate", "source", "include", "more"]),
  Carousel: new Set(["layout", "size", "height", "arrows", "gap", "slides"]),
};
const SANDBOX_FIELDS = new Set(["html", "css", "js", "allow"]);

/** DocJson.validate, node by node in document order as Scala visits them (the runtime block definitions themselves, checked by
 * RuntimeBlocks when the document is decoded, are not checked again here). */
function checked(doc: Doc): void {
  const count = Object.keys(doc.nodes).length;
  if (count > MAX_NODES) throw new Error(`Document exceeds ${MAX_NODES} nodes`);
  const seen = new Set<string>();
  const need = (ok: boolean, why: string) => { if (!ok) throw new Error(why); };
  const visit = (id: string, depth: number): void => {
    need(depth <= MAX_DEPTH, `Document exceeds depth ${MAX_DEPTH}`);
    need(!seen.has(id), `Cycle or multiple parents for '${id}'`);
    const n = Object.hasOwn(doc.nodes, id) ? doc.nodes[id]! : undefined;
    if (!n) throw new Error(`Missing node '${id}'`);
    need(n.id === id && id !== "", `Invalid node id '${id}'`);
    need(KINDS[n.kind].container || n.children.length === 0, `Leaf '${id}' has children`);
    need((SECTION_TAGS as readonly string[]).includes(n.tag), `Invalid section tag '${n.tag}'`);
    need(n.level >= 1 && n.level <= 6, "Heading level must be 1 through 6");
    need(n.mediaId >= 0, "Negative media id");
    const attrs = new Set(bindable(n.kind));
    need(Object.entries(n.bind).every(([a, k]) => attrs.has(a) && validBinding(k)), `Invalid binding on '${id}'`);
    const keys = QUERY_KEYS[n.kind] ?? new Set<string>();
    need(Object.keys(n.query).every((k) => keys.has(k)), `Unknown query key on '${id}'`);
    if (n.runtime !== "") {
      const def = (doc.defs ?? []).find((d) => d.id === n.runtime);
      if (!def) throw new Error(`Unknown runtime block '${n.runtime}' on '${id}'`);
      need(Object.keys(n.fields).every((k) => def.props.some((p) => p.name === k)), `Unknown field on runtime block '${id}'`);
    } else if (isSandbox(n)) need(Object.keys(n.fields).every((k) => SANDBOX_FIELDS.has(k)), `Unknown custom-code field on '${id}'`);
    else need(Object.keys(n.fields).length === 0, `Fields on '${id}' need a runtime block or custom code`);
    seen.add(id);
    n.children.forEach((c) => visit(c, depth + 1));
  };
  doc.roots.forEach((r) => visit(r, 1));
  need(seen.size === count, "Unreachable nodes or rootless cycle");
}

/** The order Scala iterates an immutable `Map[String, El]` in (`find` over `doc.nodes`): insertion order up to four entries,
 * else the CHAMP trie's (Scala 2.13 HashMap: at each level the entries stored there by their 5-bit hash chunk, then the
 * sub-tries). It decides which of several unsupported blocks a refusal names. */
export function scalaMapOrder(keys: readonly string[]): string[] {
  if (keys.length <= 4) return [...keys];
  const javaHash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; };
  // scala.collection.Hashing.improve
  const improve = (code: number) => {
    let h = (code + ~(code << 9)) | 0;
    h ^= h >>> 14;
    h = (h + (h << 4)) | 0;
    return h ^ (h >>> 10);
  };
  const hashed = keys.map((k) => ({ k, h: improve(javaHash(k)) }));
  const level = (group: { k: string; h: number }[], shift: number): string[] => {
    if (shift >= 32) return group.map((e) => e.k);
    const chunks = new Map<number, { k: string; h: number }[]>();
    for (const e of group) { const c = (e.h >>> shift) & 31; chunks.set(c, [...(chunks.get(c) ?? []), e]); }
    const order = [...chunks.keys()].sort((a, b) => a - b);
    return [
      ...order.filter((c) => chunks.get(c)!.length === 1).map((c) => chunks.get(c)![0]!.k),
      ...order.filter((c) => chunks.get(c)!.length > 1).flatMap((c) => level(chunks.get(c)!, shift + 5)),
    ];
  };
  return level(hashed, 0);
}

function publishable(doc: Doc, hooks: Hooks): void {
  const marked = Object.values(doc.nodes).filter(hasMarker).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (marked.length > 0) throw new Error(`Code element '${marked[0]!.id}' uses a code template or page module, which Auvyx Editor does not render yet`);
  const raw = scalaMapOrder(Object.keys(doc.nodes)).map((id) => doc.nodes[id]!).find((n) => n.kind === "Raw" && hooks.rawOuter?.(n) === undefined && hooks.raw?.(n) === undefined);
  if (raw) throw new Error(`Unsupported block '${raw.blockName}' (${raw.id}): host rendering is required`);
}

// ---- CSS ---------------------------------------------------------------------------------------------------------

const freeCss = (n: El, code: CodeMode): CompiledBlockStyles | null =>
  hasMarker(n) || (isCode(n) && !authoredCss(code)) ? null : compileScopedCss(n.css);

/** HtmlRenderer.nodeCss: one element's rules. */
export const nodeCss = (n: El, breakpoints: readonly Breakpoint[] = DEFAULT_BREAKPOINTS, code: CodeMode = "stopped"): string[] =>
  [compileBlockStyles(n.styles, breakpoints)?.css, freeCss(n, code)?.css].filter((c): c is string => c !== undefined);

/** HtmlRenderer.styleClasses */
export const styleClasses = (n: El, breakpoints: readonly Breakpoint[] = DEFAULT_BREAKPOINTS, code: CodeMode = "stopped"): string[] =>
  [compileBlockStyles(n.styles, breakpoints)?.className, freeCss(n, code)?.className, squircle(n) ? SQUIRCLE : undefined].filter((c): c is string => c !== undefined);

export function renderCss(doc: Doc, breakpoints: readonly Breakpoint[] = DEFAULT_BREAKPOINTS, hooks: Hooks = {}): Result {
  try {
    checked(doc);
    publishable(doc, hooks);
    return { ok: true, value: [...new Set(flatten(doc).flatMap(({ el }) => nodeCss(el, breakpoints, hooks.code ?? "stopped")))].join("") };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Cannot render CSS" };
  }
}

// ---- HTML --------------------------------------------------------------------------------------------------------

const MAX_ITEMS = 100;
const MAX_OUTPUT = 16 * 1024 * 1024;
const COMMERCE_MARKER = "auvyx-sf-header-config-v2";
const COMMERCE_MARKERS = new Set([
  COMMERCE_MARKER, ...["marketplace", "compact", "centered", "utility", "nav-first", "boutique"].map((l) => `auvyx-sf-header-layout-${l}`),
  ...["dropdown", "flyout", "mega", "drawer"].map((p) => `auvyx-sf-header-menu-${p}`), ...["off", "icon", "field"].map((s) => `auvyx-sf-header-search-${s}`),
  "auvyx-sf-header-has-topbar", "auvyx-sf-header-has-account", "auvyx-sf-header-has-wishlist", "auvyx-sf-header-has-cart", "auvyx-sf-header-is-sticky", "auvyx-sf-header-home-expanded",
]);
const CLASS_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const PATH_D = new RegExp(`^[MmLlHhVvCcSsQqTtAaZz0-9.,+eE${WS.slice(1, -1)}-]*$`);
const VIEW_BOX = new RegExp(`^[0-9.,+eE${WS.slice(1, -1)}-]{1,200}$`);

export const renderHtml = (doc: Doc, options: RenderOptions = {}): Result => render(doc, options, null);

/** HtmlRenderer.renderNode: one element and what is inside it, in canvas mode. */
export const renderNode = (doc: Doc, id: string, options: Omit<RenderOptions, "mode"> = {}): Result =>
  Object.hasOwn(doc.nodes, id) ? render(doc, { ...options, mode: "canvas" }, id) : { ok: false, error: `Unknown element '${id}'` };

function render(doc: Doc, options: RenderOptions, from: string | null): Result {
  const items = options.items ?? [];
  const sanitize = options.sanitizeRichText ?? escape;
  const breakpoints = options.breakpoints ?? DEFAULT_BREAKPOINTS;
  const hooks = options.hooks ?? {};
  const code = hooks.code ?? "stopped";
  const canvas = options.mode === "canvas";
  try {
    checked(doc);
    publishable(doc, hooks);
    if (items.length > MAX_ITEMS) throw new Error(`At most ${MAX_ITEMS} items are allowed`);
    if (items.some((i) => Object.keys(i).some((k) => k.startsWith("store/")))) throw new Error("Reserved store field in item");
    if (items.some((i) => Object.keys(i).some((k) => !validBinding(k)))) throw new Error("Unknown item field");
    const out: string[] = [];
    let length = 0;
    let rendered = 0;
    const append = (s: string) => {
      if (length + s.length > MAX_OUTPUT) throw new Error("Rendered HTML is too large");
      length += s.length;
      out.push(s);
    };
    const attr = (key: string, v: string) => ` ${key}="${escape(v)}"`;
    const urlAttr = (key: string, v: string, media = false) => { const u = safeUrl(v, media); return u === undefined ? "" : attr(key, u); };

    const walk = (id: string, item: Item, repeated: boolean, marked: boolean, place: string): void => {
      rendered++;
      if (rendered > MAX_NODES * MAX_ITEMS) throw new Error("Loop expansion is too large");
      const n = doc.nodes[id]!;
      const markers = hasMarker(n);
      const bound = (attrName: string, fallback: string) => {
        const key = Object.hasOwn(n.bind, attrName) ? n.bind[attrName]! : undefined;
        return key !== undefined && !key.startsWith("store/") && Object.hasOwn(item, key) ? item[key]! : fallback;
      };
      const richText = (attrName: string, fallback: string) => sanitize(bound(attrName, fallback));
      const own = splitWs(n.className).filter((c) =>
        CLASS_NAME.test(c) && !COMMERCE_MARKERS.has(c) && !HEADER_MARKERS.has(c) && !FOOTER_MARKERS.has(c) && !c.startsWith("auvyx-ui-") &&
        !c.startsWith("auvyx-variant-") && !c.startsWith("auvyx-size-") && !c.startsWith("auvyx-type-") && !c.startsWith("auvyx-flag-") && !(markers && isMarker(c)));
      const style = compileBlockStyles(n.styles, breakpoints);
      const free = freeCss(n, code);
      const classes = [
        `auvyx-${lowerAscii(n.kind)}`, `wp-block-${KINDS[n.kind].block.replace(/\//g, "-")}`, ...own,
        ...(style ? [style.className] : []), ...(free ? [free.className] : []), ...ownColourFlags(n),
        ...(n.align === "full" || n.align === "wide" ? [`align${n.align}`] : []), ...(isSlider(n) ? ["auvyx-slider"] : []), ...(squircle(n) ? [SQUIRCLE] : []),
      ].join(" ");
      const base = attr("class", classes) + (n.anchor !== "" && !repeated ? attr("id", n.anchor) : "");
      const mark = !canvas ? "" : marked ? attr("data-auvyx-id", id) : attr("data-auvyx-clone", id);
      const part = canvas ? attr("data-auvyx-part", id) : "";
      const common = base + mark;
      const open = (tag: string, extra = "") => append(`<${tag}${common}${extra}>`);
      const close = (tag: string) => append(`</${tag}>`);
      const children = () => n.children.forEach((c) => walk(c, item, repeated, marked, place));
      const link = (content: string, href: string) => { append("<a" + urlAttr("href", href) + mark + ">"); append(content); append("</a>"); };

      switch (n.kind) {
        case "Section": {
          const slider = isSlider(n);
          if (slider) append('<div class="auvyx-slider-wrap"' + mark + ">");
          const openSection = (extra = "") => append(`<${n.tag}${slider ? base + part : common}${extra}>`);
          if (splitWs(n.className).includes(COMMERCE_MARKER)) throw new Error("Commerce v2 header projection is not available from this host");
          else if (isSandbox(n)) { openSection(); append(sandboxIframe(n.fields)); close(n.tag); }
          else if (isGame(n)) { openSection(); append(hooks.game?.(n.game) ?? ""); close(n.tag); }
          else if (isCode(n)) {
            if (runs(code)) { openSection(codeAttributes(n)); append(legacyInner(n, hooks.data ?? (() => []))); close(n.tag); }
            else { openSection(` data-auvyx-code-off="${code}"`); close(n.tag); }
          } else { openSection(); children(); close(n.tag); }
          if (slider) append("</div>");
          break;
        }
        case "Heading": { const tag = `h${n.level}`; open(tag); append(richText("content", n.text)); close(tag); break; }
        case "Text": open("p"); append(richText("content", n.text)); close("p"); break;
        case "Snippet": {
          const theme = n.className.includes("auvyx-snippet--light") ? "light" : "dark";
          const lang = n.alt === "" ? "plain" : n.alt;
          open("div", ` data-auvyx-snippet="1" data-theme="${theme}"`);
          append(`<pre><code class="language-${escape(lang)}">${highlight(n.text)}</code></pre>`);
          append('<button type="button" class="auvyx-snippet__copy" aria-label="Copy code">Copy</button>');
          close("div");
          break;
        }
        case "Button": {
          const blank = n.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : "";
          open("a", urlAttr("href", bound("url", n.href)) + blank);
          append(richText("text", n.text)); close("a");
          break;
        }
        case "Image": {
          const src = bound("url", n.src);
          if (safeUrl(src, true) !== undefined) {
            const href = bound("href", n.href);
            const linked = safeUrl(href) !== undefined;
            const image = "<img" + (linked ? base + part : common) + urlAttr("src", src, true) + attr("alt", bound("alt", n.alt)) + ' loading="lazy">';
            if (linked) link(image, href); else append(image);
          }
          break;
        }
        case "Icon":
          if (!Object.hasOwn(ICONS, n.icon)) throw new Error(`Unknown icon '${n.icon}'`);
          if (safeUrl(n.href) !== undefined) { open("a", urlAttr("href", n.href) + attr("aria-label", n.icon)); append(iconSvg(n.icon)); close("a"); }
          else { open("span", ' aria-hidden="true"'); append(iconSvg(n.icon)); close("span"); }
          break;
        case "Divider": append(`<hr${common}>`); break;
        case "Video":
          if (hasToken(n, BG_CLASS)) {
            const sound = backgroundSound(n);
            const media = background(n.src, sound);
            if (media) {
              open("div", ' aria-hidden="true"' + (sound ? ' data-auvyx-autoplay="1"' : ""));
              if ("file" in media) append("<video" + urlAttr("src", media.file, true) + ' autoplay muted loop playsinline preload="metadata"></video>');
              else append("<iframe" + urlAttr("src", media.frame, true) + ' title="" tabindex="-1" loading="lazy" allow="autoplay; encrypted-media"></iframe>');
              close("div");
            }
          } else if (isAutoplay(n)) {
            const title = attr("title", n.alt === "" ? "Video" : n.alt);
            const frame = autoplayUrl(n.src);
            const file = frame === undefined ? embedFile(n.src) : undefined;
            const media = frame !== undefined
              ? "<iframe" + urlAttr("src", frame, true) + title + ' sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>'
              : file !== undefined ? "<video" + urlAttr("src", file, true) + ' autoplay muted playsinline controls preload="metadata"></video>' : undefined;
            if (media !== undefined) { open("div", ' data-auvyx-autoplay="1"'); append(media); close("div"); }
          } else {
            const src = embedUrl(n.src);
            if (src !== undefined) {
              open("iframe", urlAttr("src", src, true) + attr("title", n.alt === "" ? "Video" : n.alt) + ' loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" allowfullscreen');
              close("iframe");
            } else { open("video", urlAttr("src", n.src, true) + " controls"); close("video"); }
          }
          break;
        case "Path":
          if (n.src.length > 65536 || !PATH_D.test(n.src) || !VIEW_BOX.test(n.alt)) throw new Error("Invalid vector geometry");
          open("svg", attr("viewBox", n.alt) + ' xmlns="http://www.w3.org/2000/svg"');
          append("<path" + attr("d", n.src) + "></path>"); close("svg");
          break;
        case "Accordion":
          open("details"); append("<summary>"); append(sanitize(n.text)); append("</summary>");
          children(); close("details");
          break;
        case "Loop":
          open("div");
          (hooks.loop?.(n) ?? items).forEach((data, i) => n.children.forEach((c) => walk(c, data, true, marked && i === 0, `${place}#${i}`)));
          close("div");
          break;
        case "Carousel": open("div"); append(carouselTrack(n)); close("div"); break;
        case "Nav":
          if (n.src !== "") throw new Error("Navigation sources require resolved menu data");
          open("nav", attr("aria-label", n.alt === "" ? "Navigation" : n.alt));
          if (n.text !== "") link(escape(n.text), n.href);
          close("nav");
          break;
        case "Raw": {
          const outer = hooks.rawOuter?.(n);
          if (outer !== undefined) append(canvas ? markOuter(outer, marked ? "data-auvyx-id" : "data-auvyx-clone", id) : outer);
          else {
            const rawHtml = hooks.raw?.(n);
            if (rawHtml === undefined) throw new Error(`Unsupported block '${n.blockName}' (${n.id})`);
            const html = n.blockName === "ezy/search" ? rawHtml.split("auvyx-header-search").join("auvyx-header-search-" + [...id].filter((c) => /[\p{L}\p{Nd}-]/u.test(c)).join("")) : rawHtml;
            open("div"); append(html); close("div");
          }
          break;
        }
      }
    };
    const context = items[0] ?? {};
    (from === null ? doc.roots : [from]).forEach((r) => walk(r, context, false, true, ""));
    return { ok: true, value: out.join("") };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Cannot render HTML" };
  }
}

/** HtmlRenderer.markOuter: a canvas id on the first tag of trusted host markup, replacing one it already has. */
export function markOuter(html: string, key: string, id: string): string {
  const m = /<[A-Za-z][A-Za-z0-9:-]*(?=[\s/>])/.exec(html);
  if (!m) return html;
  const end = m.index + m[0].length;
  const close = html.indexOf(">", end);
  const head = close < 0 ? html.slice(end) : html.slice(end, close);
  const rest = close < 0 ? "" : html.slice(close);
  return html.slice(0, end) + ` ${key}="${escape(id)}"` + head.replace(/\s+data-auvyx-(?:id|clone)="[^"]*"/g, "") + rest;
}
