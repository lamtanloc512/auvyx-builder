/**
 * Flatsome UX Builder pages → Auvyx elements (FlatsomeImport.scala, ported line by line). Reads the shortcodes Flatsome
 * saves (`[section]`, `[row]`, `[col]`, `[ux_banner]`, `[text_box]`, `[ux_slider]`, `[button]`, `[title]`,
 * `[ux_image]`, `[ux_products]`…) and builds the same page from Auvyx's own pieces. What has no Auvyx counterpart is kept
 * verbatim as a shortcode block, never dropped. Pure: picture URLs come from `media` (attachment id → URL).
 */
import { javaTrim } from "../json";
import { composeBackground } from "../background";
import type { El } from "../model";
import { Ctx, type Decl, S, css, sOf } from "./ctx";
import { animateClass, boxPosition, embedUrl, sliderClass } from "./pieces";
import { WSC, split, toDouble, toInt } from "./jvm";

// ---- parsing ------------------------------------------------------------------------------------

export type Node = Tag | Html;
export interface Tag { type: "tag"; name: string; attrs: Map<string, string>; children: Node[]; source: string }
export interface Html { type: "html"; html: string }

const TAG_RE = /\[(\/?)([a-zA-Z][a-zA-Z0-9_-]*)((?:[^[\]"']|"[^"]*"|'[^']*')*)\]/g;
const ATTR_RE = new RegExp(`([a-zA-Z_][a-zA-Z0-9_-]*)[${WSC}]*=[${WSC}]*(?:"([^"]*)"|'([^']*)'|([^${WSC}"'\\]]+))`, "g");
const DETECT = new RegExp(`\\[(ux_[a-z_]+|section|row|col|text_box|title)[${WSC}\\]]`);

/** True when the text holds Flatsome's layout shortcodes. */
export const detect = (text: string): boolean => DETECT.test(text);

export function attrs(s: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of s.matchAll(ATTR_RE)) out.set(m[1]!.toLowerCase(), m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

/** Shortcodes become a tree. A tag is a container when its closing tag follows (balanced); otherwise it stands alone. */
export function parse(src: string): Node[] {
  const toks = [...src.matchAll(TAG_RE)].map((m) => ({ start: m.index!, end: m.index! + m[0].length, close: m[1]!, name: m[2]!, rest: m[3]! }));
  const closes = (from: number, name: string): number | undefined => {
    let depth = 0;
    for (let j = from; j < toks.length; j++) {
      const t = toks[j]!;
      if (t.name !== name) continue;
      if (t.close === "/") { if (depth === 0) return j; depth -= 1; }
      else depth += 1;
    }
    return undefined;
  };
  const run = (i0: number, end: number, pos0: number, stop: number): Node[] => {
    const out: Node[] = [];
    let i = i0;
    let pos = pos0;
    const text = (upto: number) => { if (upto > pos) { const h = src.substring(pos, upto); if (javaTrim(h)) out.push({ type: "html", html: h }); } };
    while (i < end) {
      const t = toks[i]!;
      text(t.start);
      if (t.close === "/") { pos = t.end; i += 1; continue; } // a stray closing tag
      const j = closes(i + 1, t.name);
      if (j !== undefined && j < end) {
        out.push({ type: "tag", name: t.name.toLowerCase(), attrs: attrs(t.rest), children: run(i + 1, j, t.end, toks[j]!.start), source: src.substring(t.start, toks[j]!.end) });
        pos = toks[j]!.end;
        i = j + 1;
      } else {
        out.push({ type: "tag", name: t.name.toLowerCase(), attrs: attrs(t.rest), children: [], source: src.substring(t.start, t.end) });
        pos = t.end;
        i += 1;
      }
    }
    text(stop);
    return out;
  };
  return run(0, toks.length, 0, src.length);
}

// ---- building -----------------------------------------------------------------------------------

export interface Result { roots: string[]; nodes: Record<string, El>; kept: string[] }

const token = (slug: string) => `var(--wp--preset--color--${slug})`;
const inverse = token("auvyx-inverse");
const ink = token("auvyx-text");

const num = (v: string): number | undefined => {
  let t = javaTrim(v);
  if (t.endsWith("%")) t = t.slice(0, -1);
  if (t.endsWith("px")) t = t.slice(0, -2);
  return toDouble(t);
};
const px = (v: string): string | undefined => {
  const t = javaTrim(v);
  if (!t || t === "undefined") return undefined;
  if (/^-?\d+(\.\d+)?$/.test(t)) return `${t}px`;
  if (/^-?\d+(\.\d+)?(px|em|rem|vh|vw|%)$/.test(t)) return t;
  return undefined;
};
/** Flatsome padding "60px" or "60px 0px 30px 0px" → logical paddings. */
const padding = (v: string): Decl[] => {
  const p = split(javaTrim(v), new RegExp(`[${WSC}]+`)).map(px).filter((x): x is string => x !== undefined);
  switch (p.length) {
    case 1: return [["padding-block-start", p[0]!], ["padding-block-end", p[0]!], ["padding-inline-start", p[0]!], ["padding-inline-end", p[0]!]];
    case 2: return [["padding-block-start", p[0]!], ["padding-block-end", p[0]!], ["padding-inline-start", p[1]!], ["padding-inline-end", p[1]!]];
    case 3: return [["padding-block-start", p[0]!], ["padding-block-end", p[2]!], ["padding-inline-start", p[1]!], ["padding-inline-end", p[1]!]];
    case 4: return [["padding-block-start", p[0]!], ["padding-inline-end", p[1]!], ["padding-block-end", p[2]!], ["padding-inline-start", p[3]!]];
    default: return [];
  }
};
const link = (v: string): string => {
  const t = javaTrim(v);
  if (!t) return "#";
  if (/^(https?:|\/|#|mailto:|tel:)[^\n\r\u0085\u2028\u2029]*$/i.test(t)) return t;
  return `/${t.startsWith("/") ? t.slice(1) : t}/`;
};
const SAFE_COLOR = new RegExp(`^(#[0-9a-fA-F]{3,8}|rgba?\\([\\d${WSC}.,%]+\\)|hsla?\\([\\d${WSC}.,%deg]+\\))$`);
const color = (v: string): string | undefined => { const t = javaTrim(v); return SAFE_COLOR.test(t) ? t : undefined; };

const BLOCK = /<(h[1-6]|p|ul|ol|blockquote|figure|table)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const SPACES = new RegExp(`[${WSC}]+`, "g");
const URLISH = new RegExp(`^https?:\\/\\/[^${WSC}]+$`, "i");
const m0: Decl[] = [["margin-block-start", "0"], ["margin-block-end", "0"]];
const clampInt = (s: string | undefined, lo: number, hi: number): number | undefined => {
  const n = s === undefined ? undefined : toInt(s);
  return n === undefined ? undefined : Math.max(lo, Math.min(hi, n));
};

export function build(text: string, media: ReadonlyMap<string, string>, assets: string, newId: () => string): Result {
  const c = new Ctx(newId, assets);
  const kept: string[] = [];

  const picture = (id: string): string | undefined => media.get(javaTrim(id)) ?? (URLISH.test(javaTrim(id)) ? javaTrim(id) : undefined);
  const mediaId = (id: string): number => { const n = toInt(javaTrim(id)); return n !== undefined && media.has(javaTrim(id)) ? n : 0; };

  const keepTag = (t: Tag): string => {
    kept.push(t.name);
    return c.keep("core/shortcode", `<!-- wp:shortcode -->\n${t.source}\n<!-- /wp:shortcode -->`,
      `<div style="padding:16px;border:1px dashed currentColor;opacity:.6;font:13px/1.4 system-ui;text-align:center">Flatsome [${t.name}] (kept as it was)</div>`);
  };

  // ---- HTML content: headings and paragraphs become Auvyx text; anything else is kept as HTML ----
  const inlineHtml = (h: string) =>
    javaTrim(h.replace(/<\/?span\b[^>]*>/gi, "").replace(/<\/?div\b[^>]*>/gi, "").replace(SPACES, " "));
  const classStyles = (cls: string): Decl[] => {
    const cs = new Set(split(cls, new RegExp(`[${WSC}]+`)));
    return [
      ...(cs.has("uppercase") ? [["text-transform", "uppercase"] as Decl] : []),
      ...(cs.has("alt-font") ? [["font-style", "italic"] as Decl] : []),
      ...(cs.has("lead") ? [["font-size", "1.25rem"] as Decl] : []),
      ...(cs.has("text-center") ? [["text-align", "center"] as Decl] : []),
    ];
  };
  const visible = (h: string) => javaTrim(h.replace(/<[^>]+>/g, "")) !== "";
  const html = (h: string, extra: readonly Decl[]): string[] => {
    const out: string[] = [];
    let last = 0;
    const loose = (s: string) => {
      const t = inlineHtml(s.replace(new RegExp(`<br[${WSC}]*\\/?>`, "gi"), " "));
      if (visible(t)) out.push(c.text(t, css(...extra, ...m0)));
    };
    for (const m of h.matchAll(BLOCK)) {
      loose(h.substring(last, m.index!));
      last = m.index! + m[0].length;
      const cls = new RegExp(`class[${WSC}]*=[${WSC}]*"([^"]*)"`).exec(m[2]!)?.[1] ?? "";
      const st = [...extra, ...classStyles(cls), ...m0];
      const tag = m[1]!.toLowerCase();
      if (tag.startsWith("h")) out.push(c.heading(inlineHtml(m[3]!), Number(tag.slice(1)), css(...st)));
      else if (tag === "p") { if (visible(inlineHtml(m[3]!))) out.push(c.text(inlineHtml(m[3]!), css(...st))); }
      else {
        const raw = m[0];
        out.push(c.keep("core/html", `<!-- wp:html -->\n${raw}\n<!-- /wp:html -->`, raw));
      }
    }
    loose(h.substring(last));
    return out;
  };

  const kids = (t: Tag, extra: readonly Decl[] = []): string[] =>
    t.children.flatMap((n) => (n.type === "html" ? html(n.html, extra) : node(n, extra)));

  const background = (a: Map<string, string>): Decl[] => {
    const bg = a.get("bg");
    const img = bg === undefined ? undefined : picture(bg);
    const ov = a.get("bg_overlay");
    const overlay = ov === undefined ? undefined : color(ov);
    const layers = composeBackground({ overlay: overlay ?? "", image: img ?? "" });
    const bc = a.get("bg_color");
    const bgColor = bc === undefined ? undefined : color(bc);
    return [
      ...(bgColor !== undefined ? [["background-color", bgColor] as Decl] : []),
      ...(layers !== undefined ? [["background-image", layers] as Decl] : []),
      ...(img !== undefined ? [["background-size", "cover"], ["background-position", (a.get("bg_pos") ?? "center").replace(/[^0-9a-z% .-]/g, "")]] as Decl[] : []),
    ];
  };

  const banner = (t: Tag, inSlider: boolean): string => {
    const a = t.attrs;
    const h = a.get("height");
    const height = (h !== undefined && !h.endsWith("%") ? px(h) : undefined) ?? (inSlider ? "560px" : "400px");
    const hs = a.get("height__sm");
    const mobileHeight = hs === undefined ? undefined : px(hs);
    const dark = a.get("text_color") === "dark";
    const s = css(["position", "relative"], ["overflow", "hidden"], ["display", "flex"], ["flex-direction", "column"], ["justify-content", "center"],
      ["align-items", "center"], ["min-height", height], ["color", dark ? ink : inverse], ...background(a),
      ...(inSlider ? [["flex", "0 0 100%"], ["scroll-snap-align", "start"]] as Decl[] : []));
    const withMobile = s.m(["min-height", mobileHeight ?? (inSlider ? "420px" : "320px")]);
    const id = c.named("Banner", c.div(withMobile, kids(t)));
    return a.get("hover")?.includes("zoom") ? c.classed("auvyx-bg-zoom", id) : id;
  };

  const textBox = (t: Tag): string => {
    const a = t.attrs;
    const xy = (sfx: string): [number, number] | undefined => {
      const xs = a.get(`position_x${sfx}`);
      const x = xs === undefined ? undefined : num(xs);
      if (x === undefined) return undefined;
      const ys = a.get(`position_y${sfx}`);
      const y = ys === undefined ? undefined : num(ys);
      return y === undefined ? undefined : [x, y];
    };
    const align = a.get("text_align") ?? "center";
    const items = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
    const pos = (o: [number, number] | undefined): Decl[] => (o ? boxPosition(o[0], o[1]) : []);
    const width = (k: string): Decl[] => { const v = a.get(k); const w = v === undefined ? undefined : num(v); return w === undefined ? [] : [["width", `${Math.trunc(w)}%`]]; };
    const base: Decl[] = [["display", "flex"], ["flex-direction", "column"], ["gap", "12px"], ["align-items", items], ["text-align", align],
      ...width("width"), ...(a.get("text_color") === "dark" ? [["color", ink] as Decl] : []),
      ...(a.has("padding") ? padding(a.get("padding")!) : []), ...pos(xy("") ?? [50, 50])];
    const mobile: Decl[] = [...width("width__sm"), ...pos(xy("__sm"))];
    return c.named("Text box", c.div(sOf({ base, mobile }), kids(t)));
  };

  const slider = (t: Tag): string => {
    const a = t.attrs;
    const timer = a.get("timer");
    const ms = timer === undefined ? undefined : toInt(timer);
    const auto = a.get("auto_slide") === "false" ? 0 : ms !== undefined ? Math.max(2, Math.trunc(Math.round(ms / 1000))) : 6;
    const cls = sliderClass({ autoplay: auto, fade: a.get("type") === "fade", arrows: a.get("arrows") !== "false", dots: a.get("bullets") !== "false" });
    const slides = t.children.flatMap((b): string[] => {
      if (b.type !== "tag") return [];
      if (b.name === "ux_banner") return [banner(b, true)];
      return [node(b, [])[0] ?? ""];
    }).filter(Boolean);
    return c.classed(cls, c.named("Slider", c.div(css(["display", "flex"], ["flex-wrap", "nowrap"], ["gap", "0"], ["overflow-x", "auto"],
      ["scroll-snap-type", "x mandatory"], ["scrollbar-width", "none"]), slides)));
  };

  const row = (t: Tag): string => {
    const a = t.attrs;
    const style = a.get("style") ?? "";
    const gap = style === "collapse" ? "0px" : style === "small" ? "16px" : style === "large" ? "48px" : "30px";
    const full = a.get("width")?.startsWith("full") ?? false;
    const va = a.get("v_align");
    const s = css(["display", "grid"], ["grid-template-columns", "repeat(12, minmax(0, 1fr))"], ["gap", gap], ["width", "100%"],
      ...(full ? [] : [["max-width", "1200px"], ["margin-inline-start", "auto"], ["margin-inline-end", "auto"]] as Decl[]),
      ...(a.get("h_align") === "center" ? [["justify-content", "center"] as Decl] : []),
      ...(va === "middle" ? [["align-items", "center"] as Decl] : va === "bottom" ? [["align-items", "end"] as Decl] : []));
    const cols = t.children.flatMap((n): string[] => {
      if (n.type === "html") return html(n.html, []);
      if (n.name.startsWith("col")) return animated(n, [column(n)]);
      return node(n, []);
    });
    return c.named("Row", c.div(s, cols));
  };

  const column = (t: Tag): string => {
    const a = t.attrs;
    const span = clampInt(a.get("span"), 1, 12) ?? 12;
    const tablet = clampInt(a.get("span__md"), 1, 12);
    const phone = clampInt(a.get("span__sm"), 1, 12) ?? 12;
    const al = a.get("align");
    const align = al === "left" || al === "center" || al === "right" ? al : undefined;
    const bg = a.get("bg_color");
    const bgColor = bg === undefined ? undefined : color(bg);
    const s = sOf({
      base: [["display", "flex"], ["flex-direction", "column"], ["gap", "16px"], ["grid-column", `span ${span}`], ["min-width", "0"],
        ...(align ? [["text-align", align] as Decl] : []), ...(align === "center" ? [["align-items", "center"] as Decl] : []),
        ...(a.has("padding") ? padding(a.get("padding")!) : []), ...(bgColor !== undefined ? [["background-color", bgColor] as Decl] : [])],
      tablet: tablet !== undefined ? [["grid-column", `span ${tablet}`]] : [],
      mobile: [["grid-column", `span ${phone}`]],
    });
    return c.named("Column", c.div(s, kids(t)));
  };

  const section = (t: Tag): string => {
    const a = t.attrs;
    const dark = a.get("dark") === "true";
    const h = a.get("height");
    const minH = h === undefined ? undefined : px(h);
    const s = css(["display", "flex"], ["flex-direction", "column"], ["gap", "24px"],
      ...(a.has("padding") ? padding(a.get("padding")!) : []),
      ...(a.has("padding") ? [] : [["padding-block-start", "48px"], ["padding-block-end", "48px"], ["padding-inline-start", "24px"], ["padding-inline-end", "24px"]] as Decl[]),
      ...(minH !== undefined ? [["min-height", minH] as Decl] : []), ...background(a), ...(dark ? [["color", inverse] as Decl] : []));
    return c.named(a.get("label") ?? "Section", c.section(s, "section", "full", kids(t)));
  };

  const button = (t: Tag): string => {
    const a = t.attrs;
    const style = a.get("style") ?? "";
    const white = a.get("color") === "white";
    const r = a.get("radius");
    const rad = r === undefined ? undefined : px(r);
    const size = a.get("size");
    const look: Decl[] =
      style === "outline" ? [["background-color", "transparent"], ["border", "2px solid currentColor"], ["color", white ? inverse : "inherit"]]
      : style === "link" || style === "underline" ? [["background-color", "transparent"], ["padding-inline-start", "0"], ["padding-inline-end", "0"], ["color", "inherit"], ["text-decoration", "underline"]]
      : white ? [["background-color", inverse], ["color", ink]] : [];
    const s = css(...look, ...(rad !== undefined ? [["border-radius", rad] as Decl] : []),
      ...(size === "small" ? [["font-size", "0.8125rem"] as Decl] : size === "large" || size === "larger" ? [["font-size", "1.125rem"] as Decl] : []),
      ...(a.get("expand") === "true" ? [["width", "100%"] as Decl] : []),
      ["text-transform", "uppercase"], ["letter-spacing", "0.04em"]);
    return c.button(a.get("text") ?? "Button", s, link(a.get("link") ?? ""));
  };

  const products = (t: Tag): string => {
    const a = t.attrs;
    const cols = clampInt(a.get("columns"), 1, 6) ?? 4;
    const p = a.get("products");
    const count = (p === undefined ? undefined : toInt(p)) ?? cols * 2;
    const show = a.get("show");
    const source = show === "featured" ? "woo/featured" : show === "onsale" ? "woo/on_sale" : "";
    const ob = a.get("orderby");
    const order = ob === "rand" ? "rand" : ob === "title" || ob === "name" ? "title" : ob === "menu_order" ? "menu_order" : "date";
    const grid = css(["display", "grid"], ["grid-template-columns", `repeat(${cols}, minmax(0, 1fr))`], ["gap", "24px"])
      .t(["grid-template-columns", `repeat(${Math.min(cols, 3)}, minmax(0, 1fr))`]).m(["grid-template-columns", "repeat(2, minmax(0, 1fr))"]);
    const card = c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "8px"]), [
      c.bind(c.linkedImage("portrait", "", "#", css(["width", "100%"], ["aspect-ratio", "1 / 1"], ["object-fit", "cover"], ["display", "block"])), ["url", "featured_image"], ["alt", "post_title"], ["href", "post_url"]),
      c.bind(c.heading("Product name", 3, css(["font-size", "0.9375rem"], ...m0)), ["content", "post_title"]),
      c.bind(c.text("$0.00", css(["font-weight", "600"], ...m0)), ["content", "product_price"]),
    ]);
    return c.named("Products", c.loop([["postType", "product"], ["perPage", String(count)], ["orderBy", order], ["source", source]], grid, [card]));
  };

  const featuredBox = (t: Tag): string => {
    const a = t.attrs;
    const pos = a.get("pos");
    const center = !(pos === "left" || pos === "right");
    const im = a.get("img");
    const url = im === undefined ? undefined : picture(im);
    const iw = a.get("img_width");
    const img = url !== undefined ? [c.imageAt(url, a.get("title") ?? "", css(["width", (iw === undefined ? undefined : px(iw)) ?? "64px"], ["height", "auto"]), mediaId(a.get("img") ?? ""))] : [];
    const tt = a.get("title");
    const title = tt ? [c.heading(tt, 3, css(["font-size", "1.125rem"], ...m0))] : [];
    return c.named("Icon box", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "12px"],
      ...(center ? [["align-items", "center"], ["text-align", "center"]] as Decl[] : [])), [...img, ...title, ...kids(t)]));
  };

  const posts = (t: Tag): string => {
    const a = t.attrs;
    const cols = clampInt(a.get("columns"), 1, 4) ?? 3;
    const p = a.get("posts");
    const count = (p === undefined ? undefined : toInt(p)) ?? cols;
    const grid = css(["display", "grid"], ["grid-template-columns", `repeat(${cols}, minmax(0, 1fr))`], ["gap", "24px"]).m(["grid-template-columns", "minmax(0, 1fr)"]);
    const card = c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "8px"]), [
      c.bind(c.linkedImage("landscape", "", "#", css(["width", "100%"], ["aspect-ratio", "16 / 10"], ["object-fit", "cover"], ["display", "block"])), ["url", "featured_image"], ["alt", "post_title"], ["href", "post_url"]),
      c.bind(c.heading("Post title", 3, css(["font-size", "1.0625rem"], ...m0)), ["content", "post_title"]),
      c.bind(c.text("Excerpt", css(...m0)), ["content", "post_excerpt"]),
    ]);
    return c.named("Posts", c.loop([["postType", "post"], ["perPage", String(count)]], grid, [card]));
  };

  /** Flatsome's "animate" names → Auvyx entrances (Animate). */
  const animated = (t: Tag, ids: string[]): string[] => {
    const an = t.attrs.get("animate")?.toLowerCase();
    const name = an === undefined ? undefined
      : an === "fadeinup" ? "up" : an === "fadeindown" ? "down" : an === "fadeinleft" ? "left" : an === "fadeinright" ? "right" : an === "fadein" ? "fade"
      : an.startsWith("bouncein") ? "bounce" : an === "blurin" ? "blur" : an === "flipinx" ? "flip-x" : an === "flipiny" ? "flip-y" : undefined;
    return name === undefined ? ids : ids.map((id) => c.classed(animateClass(name), id));
  };

  const node = (t: Tag, extra: readonly Decl[]): string[] => animated(t, convert(t, extra));

  const convert = (t: Tag, extra: readonly Decl[]): string[] => {
    const n = t.name;
    switch (n) {
      case "section": return [section(t)];
      case "row": case "row_inner": case "row_inner_1": case "row_inner_2": return [row(t)];
    }
    if (n.startsWith("col")) return [column(t)];
    switch (n) {
      case "ux_banner": return [banner(t, false)];
      case "text_box": return [textBox(t)];
      case "ux_slider": return [slider(t)];
      case "button": return [button(t)];
      case "title": {
        const tn = t.attrs.get("tag_name");
        const lv = tn !== undefined && tn.startsWith("h") ? toInt(tn.slice(1)) : undefined;
        const level = lv ?? 3;
        const center = t.attrs.get("style")?.includes("center") ?? false;
        return [c.heading(t.attrs.get("text") ?? "Title", level, css(...(center ? [["text-align", "center"] as Decl] : []), ...m0))];
      }
      case "gap": {
        const h = t.attrs.get("height");
        return [c.named("Gap", c.div(css(["height", (h === undefined ? undefined : px(h)) ?? "30px"]), []))];
      }
      case "divider": {
        const w = t.attrs.get("width");
        const wp = w === undefined ? undefined : px(w);
        return [c.divider(css(...(wp !== undefined ? [["width", wp] as Decl] : [])))];
      }
      case "ux_image": {
        const id = t.attrs.get("id") ?? "";
        const wv = t.attrs.get("width");
        const wn = wv === undefined ? undefined : num(wv);
        const w: Decl = wn !== undefined ? ["width", `${Math.trunc(wn)}%`] : ["width", "100%"];
        const l = t.attrs.get("link");
        return [c.imageAt(picture(id) ?? `${assets}/landscape.svg`, t.attrs.get("caption") ?? "", css(w, ["height", "auto"]), mediaId(id), l === undefined ? "" : link(l))];
      }
      case "ux_video": {
        const u = t.attrs.get("url");
        return u !== undefined && embedUrl(u) !== undefined ? [c.video(u)] : [keepTag(t)];
      }
      case "ux_products": return [products(t)];
      case "accordion": return kids(t);
      case "accordion-item": case "accordion_item": {
        const title = t.attrs.get("title") ?? "Question";
        return [c.accordion(title, new S(), kids(t))];
      }
      case "tabgroup": {
        const panels = t.children.flatMap((tab): string[] => {
          if (tab.type !== "tag" || tab.name !== "tab") return [];
          const head = c.heading(tab.attrs.get("title") ?? "Tab", 3, css(...m0));
          return [c.named("Tab panel", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "12px"]), [head, ...kids(tab)]))];
        });
        return [c.classed("auvyx-tabs", c.named("Tabs", c.div(css(["display", "flex"], ["flex-direction", "column"], ["gap", "24px"]), panels)))];
      }
      case "ux_text": case "ux_stack": case "ux_html": return kids(t, extra);
      case "featured_box": return [featuredBox(t)];
      case "blog_posts": return [posts(t)];
      default: return [keepTag(t)];
    }
  };

  const roots = parse(text).flatMap((n) => (n.type === "html" ? html(n.html, []) : node(n, [])));
  // Loose top-level pieces (a title, a row) go into page sections, so the page keeps its rhythm.
  const pageRoots = roots.map((id) => {
    const n = c.nodes.get(id);
    if (n && n.kind === "Section" && n.tag === "section") return id;
    if (n && n.label === "Slider") return c.named("Slider section", c.section(css(["padding-block-start", "0"], ["padding-block-end", "0"]), "section", "full", [id]));
    return c.section(css(["display", "flex"], ["flex-direction", "column"], ["gap", "24px"], ["padding-block-start", "32px"], ["padding-block-end", "32px"],
      ["padding-inline-start", "24px"], ["padding-inline-end", "24px"]), "section", "full", [id]);
  });
  return { roots: pageRoots, nodes: Object.fromEntries(c.nodes), kept };
}

/** The ids of shortcode attributes that name pictures (for the platform to look up). */
export function mediaIds(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TAG_RE))
    for (const [k, v] of attrs(m[3]!)) if ((k === "bg" || k === "id" || k === "img" || k === "image") && /^\d{1,10}$/.test(v)) out.push(v);
  return [...new Set(out)];
}
