/**
 * Document → WordPress block markup (post_content), byte for byte what the Scala `BlockMarkup` writes, so the block
 * editor and Auvyx Builder's PHP accept a page Auvyx Editor saved, and Auvyx Studio reads back what it wrote. Every kind and every
 * feature a Studio document can hold is written: loops, carousels, code and sandboxed sections, runtime blocks…
 */
import { normalizeStyles, type Styles } from "@auvyx/style-engine";
import { type Doc, type El, type Kind, KINDS, SECTION_TAGS } from "./model";
import { WS, javaTrim, jsonString, stylesJson } from "./json";
import { blockJson, presetJson } from "./runtime";
import {
  DEFAULT_BOX, NAV_TOGGLES, bindable, codeLibs, highlight, isCode, isGame, isSandbox, normalizeCarousel, normalizeQuery,
  safeBox, safePath, sandboxJson, validBinding,
} from "./elements";

/** Kinds Auvyx Editor's own inspector edits. serialize() writes every kind. */
export const EDITOR_KINDS: readonly Kind[] = ["Section", "Heading", "Text", "Button", "Image", "Divider", "Accordion", "Icon", "Video", "Raw"];

/** Dynamic blocks (PHP renders them from attributes): a self-closing comment. A loop is dynamic too but keeps its template. */
const DYNAMIC: readonly Kind[] = ["Icon", "Video", "Path", "Nav", "Carousel"];

/** Kept for callers that catch it; serialize() no longer throws it, every kind is written. */
export class UnsupportedKind extends Error {}

export const escapeText = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const escapeAttr = (t: string) => escapeText(t).replace(/"/g, "&quot;");

/** WordPress serializeAttributes(): keeps the JSON valid inside an HTML comment. */
export const escapeComment = (json: string) =>
  json.replace(/--/g, "\\u002d\\u002d").replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\\"/g, "\\u0022");

const str = jsonString;

/** Marker classes stay in the block attribute (the editor finds components by them); they are not page classes. */
const htmlClass = (n: El) =>
  n.className.split(" ").filter((c) => c && !/^auvyx-(ui|variant|size|type|flag)-/.test(c)).join(" ");

/** The first root written through `auvyxAttr`: a raw block is written verbatim, so the catalog would be lost on it. */
const catalogRoot = (doc: Doc): string | undefined => doc.roots.find((id) => doc.nodes[id] && doc.nodes[id].kind !== "Raw");

/** Document-level definitions, on the catalog root. */
const catalogAttr = (doc: Doc): string[] => [
  ...(doc.defs?.length ? [`"defs":[${doc.defs.map((b) => blockJson(b)).join(",")}]`] : []),
  ...(doc.presets?.length ? [`"presets":[${doc.presets.map(presetJson).join(",")}]`] : []),
];

/** The runtime block's schema travels with each use, so a reload rebuilds the same definition. */
const definedAttr = (doc: Doc, n: El): string | null => {
  const block = n.runtime ? doc.defs?.find((b) => b.id === n.runtime) : undefined;
  return block ? `"runtime":${blockJson(block, n.fields)}` : null;
};

/** Label, new tab, free CSS and code live in the auvyx comment so a reload keeps them without touching the page HTML. */
const auvyxAttr = (doc: Doc, n: El, styles: Styles): string | null => {
  const catalog = catalogRoot(doc) === n.id ? catalogAttr(doc) : [];
  const parts = ['"v":1'];
  if (Object.keys(styles).length) parts.push(`"styles":${stylesJson(styles)}`);
  if (n.label) parts.push(`"label":${str(n.label)}`);
  if (n.target === "_blank") parts.push('"target":"_blank"');
  if (javaTrim(n.css)) parts.push(`"css":${str(n.css)}`);
  if (isCode(n))
    parts.push(`"code":{"markup":${str(n.markup)},"script":${str(n.script)},"libs":[${codeLibs(n.libs).map(str).join(",")}],"uses":[${n.uses.map(str).join(",")}]}`);
  if (isGame(n)) parts.push(`"game":${str(n.game)}`);
  const defined = definedAttr(doc, n);
  if (defined) parts.push(defined);
  if (isSandbox(n)) parts.push(`"sandbox":${sandboxJson(n.fields)}`);
  parts.push(...catalog);
  return parts.length > 1 ? `"auvyx":{${parts.join(",")}}` : null;
};

/** metadata.bindings of the bindable attributes, in DataFields order. */
const bindings = (n: El): string | null => {
  const entries = bindable(n.kind).filter((a) => Object.hasOwn(n.bind, a) && validBinding(n.bind[a]!));
  return entries.length
    ? "{" + entries.map((a) => `${str(a)}:{"source":"auvyx/data","args":{"key":${str(n.bind[a]!)}}}`).join(",") + "}"
    : null;
};

/** The loop query with typed values (numbers, booleans), always complete; `include` only when set. */
const queryJson = (n: El): string =>
  "{" + normalizeQuery(n.query).filter(([k, v]) => !(k === "include" && v === "")).map(([k, v]) =>
    `${str(k)}:${["perPage", "offset", "inherit", "excludeCurrent", "paginate"].includes(k) ? v : str(v)}`).join(",") + "}";

/** Carousel settings are all strings, the slide list included. */
const carouselQueryJson = (n: El): string =>
  "{" + normalizeCarousel(n.query).map(([k, v]) => `${str(k)}:${str(v)}`).join(",") + "}";

/** Only non-default attributes, in the order the block editor writes them. */
export const attributes = (n: El, doc: Doc = { roots: [], nodes: {} }): string => {
  const styles = normalizeStyles(n.styles);
  const f: string[] = [];
  const add = (when: boolean, field: () => string) => { if (when) f.push(field()) };
  add(n.kind === "Section" && n.tag !== "section", () => `"tagName":${str(n.tag)}`);
  add(n.kind === "Heading" && n.level !== 2, () => `"level":${n.level}`);
  add(n.kind === "Snippet" && n.text !== "", () => `"code":${str(n.text)}`);
  add(n.kind === "Snippet" && n.alt !== "" && n.alt !== "sql", () => `"language":${str(n.alt)}`);
  add(n.kind === "Snippet" && n.className.includes("auvyx-snippet--light"), () => '"theme":"light"');
  add(n.kind === "Icon" && n.icon !== "", () => `"icon":${str(n.icon)}`);
  add(n.kind === "Icon" && n.href !== "", () => `"href":${str(n.href)}`);
  add(n.kind === "Image" && n.mediaId > 0, () => `"id":${n.mediaId}`);
  add(n.kind === "Video" && n.src !== "", () => `"url":${str(n.src)}`);
  add(n.kind === "Path" && n.src !== "", () => `"path":${str(safePath(n.src))}`);
  add(n.kind === "Path" && n.alt !== "" && safeBox(n.alt) !== DEFAULT_BOX, () => `"viewBox":${str(safeBox(n.alt))}`);
  add(n.kind === "Nav" && n.src !== "" && n.src !== "pages", () => `"source":${str(n.src)}`);
  add(n.kind === "Nav" && (NAV_TOGGLES as readonly string[]).includes(n.alt) && n.alt !== "mobile", () => `"toggleAt":${str(n.alt)}`);
  add(n.align !== "", () => `"align":${str(n.align)}`);
  add(n.kind === "Loop", () => `"query":${queryJson(n)}`);
  add(n.kind === "Carousel", () => `"query":${carouselQueryJson(n)}`);
  add(n.className !== "", () => `"className":${str(n.className)}`);
  add(n.anchor !== "", () => `"anchor":${str(n.anchor)}`);
  add(n.locked, () => '"lock":{"move":true}');
  add(n.kind === "Button" && n.target === "_blank", () => '"linkTarget":"_blank"');
  add(n.kind === "Button" && n.target === "_blank", () => '"rel":"noopener noreferrer"');
  const auvyx = auvyxAttr(doc, n, styles);
  if (auvyx) f.push(auvyx);
  const bound = bindings(n);
  if (bound) f.push(`"metadata":{"bindings":${bound}}`);
  return f.length ? escapeComment(`{${f.join(",")}}`) : "";
};

/** A self-closing platform block. `\s` is Java's (ASCII) whitespace, as the Scala core matches it. */
const SELF_CLOSING_RAW = new RegExp(`^(${WS}*<!--${WS}+wp:[a-z0-9_\\-/]+)(?:${WS}+(\\{[\\s\\S]*\\}))?(${WS}+/-->${WS}*)$`);

/** A platform block, verbatim; one that takes Auvyx styles (ADR 0036) gets them as its `auvyx` attribute. */
export const rawBlock = (n: El): string => {
  const styles = normalizeStyles(n.styles);
  if (!Object.keys(styles).length) return n.raw;
  const m = SELF_CLOSING_RAW.exec(n.raw);
  if (!m || (m[2] !== undefined && m[2].includes('"auvyx":'))) return n.raw;
  const auvyx = `"auvyx":{"v":1,"styles":${stylesJson(styles)}}`;
  const json = m[2] === undefined ? undefined : javaTrim(m[2]);
  return `${m[1]} ${json !== undefined && json.length > 2 ? json.slice(0, -1) + "," + auvyx + "}" : `{${auvyx}}`}${m[3]}`;
};

const blockClasses = (n: El, extra: string[] = []) =>
  [`wp-block-${KINDS[n.kind].block.replace("/", "-")}`, ...extra, ...(htmlClass(n) ? [htmlClass(n)] : []), ...(n.align ? [`align${n.align}`] : [])].join(" ");

const block = (doc: Doc, n0: El): string => {
  if (n0.kind === "Raw") return rawBlock(n0);
  // tag and level become element names: never trusted from storage
  const n: El = { ...n0, tag: (SECTION_TAGS as readonly string[]).includes(n0.tag) ? n0.tag : "section", level: Math.max(1, Math.min(6, n0.level)) };
  const name = KINDS[n.kind].block;
  const attrs = attributes(n, doc);
  const open = `<!-- wp:${name}${attrs ? " " + attrs : ""}`;
  if (DYNAMIC.includes(n.kind)) return `${open} /-->`;
  const id = n.anchor ? ` id="${escapeAttr(n.anchor)}"` : "";
  const common = ` class="${escapeAttr(blockClasses(n))}"${id}`;
  const inner = () => n.children.map((c) => doc.nodes[c]).filter((c): c is El => !!c).map((c) => block(doc, c)).join("\n\n");
  const wrap = (i: string) => (i ? `\n${i}\n` : "");
  let html: string;
  switch (n.kind) {
    // a sandboxed custom-code section saves an empty element: its source stays in the auvyx attribute, run in an iframe
    case "Section": html = `<${n.tag}${common}>${wrap(isSandbox(n) ? "" : inner())}</${n.tag}>`; break;
    case "Heading": html = `<h${n.level}${common}>${n.text}</h${n.level}>`; break;
    case "Text": html = `<p${common}>${n.text}</p>`; break;
    case "Snippet": {
      const lang = n.alt ? escapeAttr(n.alt) : "plain";
      const theme = n.className.includes("auvyx-snippet--light") ? "light" : "dark";
      // save() always adds these; a className that already names them is not repeated
      const present = new Set(htmlClass(n).split(" "));
      const extra = ["auvyx-snippet", `auvyx-snippet--${theme}`].filter((c) => !present.has(c));
      html = `<div class="${escapeAttr(blockClasses(n, extra))}"${id} data-auvyx-snippet="1" data-theme="${theme}"><pre><code class="language-${lang}">${highlight(n.text)}</code></pre><button type="button" class="auvyx-snippet__copy" aria-label="Copy code">Copy</button></div>`;
      break;
    }
    case "Button": {
      const href = n.href ? ` href="${escapeAttr(n.href)}"` : "";
      const blank = n.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : "";
      html = `<a${common}${href}${blank}>${n.text}</a>`;
      break;
    }
    case "Image": {
      const src = n.src ? ` src="${escapeAttr(n.src)}"` : "";
      // a linked image: the link is the block root (classes, id), the <img> sits inside
      html = n.href ? `<a${common} href="${escapeAttr(n.href)}"><img${src} alt="${escapeAttr(n.alt)}"/></a>` : `<img${common}${src} alt="${escapeAttr(n.alt)}"/>`;
      break;
    }
    case "Divider": html = `<hr${common}/>`; break;
    case "Accordion": html = `<details${common}><summary>${n.text}</summary>${wrap(inner())}</details>`; break;
    // dynamic with inner blocks: the saved wrapper holds the template, PHP repeats it per post
    case "Loop": html = `<div${common}>${wrap(inner())}</div>`; break;
    default: html = "";
  }
  return `${open} -->\n${html}\n<!-- /wp:${name} -->`;
};

/** The page's post_content. */
export const serialize = (doc: Doc): string =>
  doc.roots.map((r) => doc.nodes[r]).filter((n): n is El => !!n).map((n) => block(doc, n)).join("\n\n");
