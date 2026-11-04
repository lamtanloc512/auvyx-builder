/**
 * WordPress block markup → the block tree `decodeTree` reads: a port of Auvyx Builder's PHP `Studio::tree()` (and `inner()`)
 * on top of `parseBlocks()` (parse_blocks()). Used where the editor has markup but no server round trip, such as the
 * template library (products/builder/patterns/generated).
 *
 * One difference with the PHP, on purpose: a platform block (one Auvyx does not model) keeps its source text as `raw`
 * instead of WordPress's re-serialization (`serialize_block()`), so markup goes back byte for byte (a `core/` namespace
 * and the JSON spelling stay as written). A self-closing platform block whose comment ends with Auvyx styles
 * (`"auvyx":{"v":1,"styles":…}`, ADR 0036) gets them as its `styles`, without them in `raw`, as the PHP does for a styleable
 * block, when writing it back (`rawBlock`) gives the same text; otherwise it stays verbatim. The `html` preview is the
 * server's (render_block): here it is left empty, the canvas renders platform blocks on the site.
 */
import { parseBlocks, type ParsedBlock } from "./blockParser";
import { rawBlock } from "./markup";
import { el } from "./model";
import type { TreeNode } from "./tree";

/** Auvyx blocks the Studio models (Studio::BLOCKS). */
const BLOCKS = ["auvyx/section", "auvyx/heading", "auvyx/text", "auvyx/snippet", "auvyx/button", "auvyx/image", "auvyx/icon", "auvyx/divider", "auvyx/video", "auvyx/vector", "auvyx/accordion", "auvyx/loop", "auvyx/carousel", "auvyx/nav"];
/** Auvyx blocks whose inner blocks are Studio children (Studio::CONTAINERS). */
const CONTAINERS = ["auvyx/section", "auvyx/accordion", "auvyx/loop"];

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
/** PHP's is_array: a decoded JSON object or list. */
const isArr = (v: unknown): v is Record<string, unknown> | unknown[] => v !== null && typeof v === "object";
const at = (v: unknown, ...path: string[]): unknown => path.reduce<unknown>((x, k) => (isArr(x) ? (x as Record<string, unknown>)[k] : undefined), v);
/** PHP `(string)` of a decoded JSON value. */
const phpString = (v: unknown): string => (v === undefined || v === null || v === false ? "" : v === true ? "1" : typeof v === "object" ? "Array" : String(v));
const phpInt = (v: unknown, fallback: number): number => {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return Math.trunc(v);
  const m = /^\s*[+-]?\d+/.exec(String(v));
  return m ? parseInt(m[0], 10) : 0;
};
/** PHP's `empty()`. */
const empty = (v: unknown) => v === undefined || v === null || v === false || v === 0 || v === "" || v === "0" || (Array.isArray(v) && v.length === 0);

/** Named references html_entity_decode() knows that Auvyx markup can hold (the escapes it writes, and a few common ones). */
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " ", hellip: "…", mdash: "—", ndash: "–", copy: "©", reg: "®", trade: "™", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", middot: "·", times: "×", euro: "€" };

/** html_entity_decode($s, ENT_QUOTES): numeric references and the named ones above. */
export const decodeEntities = (s: string): string =>
  s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
    }
    return Object.hasOwn(NAMED, ref) ? NAMED[ref]! : whole;
  });

/** Studio::inner(): inner HTML and href of a leaf block's single root element. */
const inner = (html: string): [string, string] => {
  const m = /^\s*<([a-z0-9]+)([^>]*)>([^]*)<\/\1>\s*$/i.exec(html);
  if (!m) return ["", ""];
  const h = /\shref="([^"]*)"/i.exec(m[2]!);
  return [m[3]!, h ? decodeEntities(h[1]!) : ""];
};

/** Studio::bindings(): `auvyx/data` bindings of a block, attribute → field key. */
const bindings = (attrs: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {};
  const all = at(attrs, "metadata", "bindings");
  if (!isArr(all)) return out;
  for (const [attr, b] of Object.entries(all)) {
    if (isArr(b) && at(b, "source") === "auvyx/data" && at(b, "args", "key") !== undefined && at(b, "args", "key") !== null) out[attr] = phpString(at(b, "args", "key"));
  }
  return out;
};

/** Studio::scalar(): a loop query value as the Studio stores it. */
const scalar = (v: unknown): string => (typeof v === "boolean" ? (v ? "true" : "false") : v === null || typeof v === "object" ? "" : String(v));

/** A self-closing platform block whose comment ends with Auvyx styles: its markup without them, and the styles. */
const RAW_STYLED = /^([^]*?<!--\s+wp:[a-z0-9_\-/]+)\s+(\{[^]*\})(\s+\/-->\s*)$/;
const splitStyles = (source: string): { raw: string; styles: unknown } | null => {
  const m = RAW_STYLED.exec(source);
  if (!m) return null;
  const json = m[2]!;
  const tail = /(?:^\{|,)"auvyx":\{"v":1,"styles":([^]*)\}\}$/.exec(json);
  if (!tail) return null;
  let styles: unknown;
  try { styles = JSON.parse(tail[1]!); } catch { return null; }
  if (!isObj(styles)) return null;
  const rest = json.slice(0, tail.index) ;
  const raw = `${m[1]}${rest.length > 0 && rest !== "{" ? ` ${rest}}` : ""}${m[3]}`;
  return { raw, styles };
};

const rawItem = (b: ParsedBlock, source: string): TreeNode => {
  const text = source.slice(b.start, b.end);
  const split = b.innerBlocks.length === 0 ? splitStyles(text) : null;
  if (split) {
    const back = rawBlock(el("x", "Raw", { raw: split.raw, styles: split.styles as never }));
    if (back === text) return { block: b.blockName!, raw: split.raw, html: "", styles: split.styles };
  }
  return { block: b.blockName!, raw: text, html: "" };
};

/** Studio::tree() of parsed blocks. */
export const blocksToTree = (blocks: ParsedBlock[], source: string): TreeNode[] => {
  const out: TreeNode[] = [];
  for (const block of blocks) {
    const name = block.blockName;
    if (name === null) {
      if (block.innerHTML.trim() !== "") out.push({ block: "core/freeform", raw: block.innerHTML, html: block.innerHTML });
      continue;
    }
    if (!BLOCKS.includes(name)) {
      out.push(rawItem(block, source));
      continue;
    }
    const attrs: Record<string, unknown> = { ...block.attrs };
    const html = block.innerHTML;
    let [text, href] = inner(html);
    let src = "";
    let alt = "";
    if (name === "auvyx/image") {
      const m = /<a\b[^>]*\shref="([^"]*)"/i.exec(html);
      href = m ? decodeEntities(m[1]!) : "";
      const img = /<img\b([^>]*)>/i.exec(html);
      if (img) {
        const s = /\ssrc="([^"]*)"/i.exec(img[1]!);
        const a = /\salt="([^"]*)"/i.exec(img[1]!);
        src = s ? decodeEntities(s[1]!) : "";
        alt = a ? decodeEntities(a[1]!) : "";
      }
    }
    if (name === "auvyx/icon") href = phpString(attrs.href ?? "");
    if (name === "auvyx/accordion") {
      const m = /<summary[^>]*>([^]*?)<\/summary>/i.exec(html);
      text = m ? m[1]! : "";
    }
    if (name === "auvyx/video") src = phpString(attrs.url ?? "");
    if (name === "auvyx/nav") {
      src = phpString(attrs.source ?? "pages");
      alt = phpString(attrs.toggleAt ?? "mobile");
    }
    if (name === "auvyx/vector") {
      src = phpString(attrs.path ?? "");
      alt = phpString(attrs.viewBox ?? "0 0 100 100");
    }
    if (name === "auvyx/snippet") {
      text = phpString(attrs.code ?? "");
      if (text === "") {
        const m = /<code[^>]*>([^]*?)<\/code>/i.exec(html);
        // wp_strip_all_tags(): script and style elements go with their content, then every tag
        if (m) text = decodeEntities(m[1]!.replace(/<(script|style)[^>]*?>[^]*?<\/\1>/gi, "").replace(/<[^>]*>/g, "").trim());
      }
      alt = phpString(attrs.language ?? "sql");
      attrs.className = `${phpString(attrs.className ?? "")} ${!empty(attrs.theme) && attrs.theme === "light" ? "auvyx-snippet--light" : "auvyx-snippet--dark"}`.trim();
    }
    const auvyx = attrs.auvyx;
    let target = at(auvyx, "target") !== undefined && at(auvyx, "target") !== null ? phpString(at(auvyx, "target")) : "";
    if (target === "" && name === "auvyx/button" && html.includes('target="_blank"')) target = "_blank";
    const arr = (k: string) => (isArr(at(auvyx, k)) ? at(auvyx, k) : null);
    const query = attrs.query;
    out.push({
      block: name,
      styles: isArr(at(auvyx, "styles")) ? at(auvyx, "styles") : {},
      tag: phpString(attrs.tagName ?? "section"),
      level: phpInt(attrs.level ?? 2, 2),
      align: phpString(attrs.align ?? ""),
      className: phpString(attrs.className ?? ""),
      anchor: phpString(attrs.anchor ?? ""),
      text: name === "auvyx/section" ? "" : text,
      href: ["auvyx/button", "auvyx/image", "auvyx/icon"].includes(name) ? href : "",
      label: phpString(at(auvyx, "label") ?? ""),
      css: phpString(at(auvyx, "css") ?? ""),
      code: arr("code"),
      game: typeof at(auvyx, "game") === "string" ? at(auvyx, "game") : "",
      runtime: arr("runtime"),
      sandbox: arr("sandbox"),
      defs: arr("defs"),
      presets: arr("presets"),
      target,
      src,
      alt,
      icon: phpString(attrs.icon ?? ""),
      mediaId: phpInt(attrs.id ?? 0, 0),
      bind: bindings(attrs),
      locked: !empty(at(attrs, "lock", "move")),
      query: (name === "auvyx/loop" || name === "auvyx/carousel") && isArr(query) ? Object.fromEntries(Object.entries(query).map(([k, v]) => [k, scalar(v)])) : {},
      children: CONTAINERS.includes(name) ? blocksToTree(block.innerBlocks, source) : [],
    });
  }
  return out;
};

/** Block markup → the tree `Studio::tree(parse_blocks($markup))` gives (with platform blocks kept as written). */
export const markupToTree = (markup: string): TreeNode[] => blocksToTree(parseBlocks(markup), markup);
