/**
 * Page streams (the Scala `PageStream`, S/PageStream.scala): JSONL patches that build a page, one object per line, as
 * the agent's `edit` op `stream` sends them. The block catalog (shared/block-catalog.json, the export of the Scala
 * `BlockCatalog`) and the section library are the default; a `define` line may add a block or a preset (the Scala
 * `RuntimeBlocks`) that later lines use; `sandbox` adds custom code that runs in an opaque iframe (the Scala
 * `SandboxCode`). Malformed specs and unknown theme tokens are rejected, with the Scala messages.
 *
 * Templates come from the caller (`StreamTemplates`): Auvyx Editor builds them from the generated patterns, which read back
 * byte for byte as the Scala `Templates.build` (test/markupTree.test.ts).
 */
import { isAllowedProperty, isSafeValue } from "@auvyx/style-engine";
import catalog from "../../../shared/block-catalog.json";
import { intOption, isRecord, isWhole, javaTrim, toInt } from "./json";
import { type Doc, type El, type Kind, KINDS, el, subtreeIds } from "./model";
import { insert, setStyle, update } from "./ops";
import type { Piece, Preset, PropSpec, RuntimeBlock } from "./runtime";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });
type O = Record<string, unknown>;

/** What a stream needs of the template catalog (the Scala `Templates.byId` / `Templates.build`). */
export interface StreamTemplates {
  /** The template's title and whether it is a Section template; undefined when the build has no such template. */
  readonly byId: (id: string) => { title: string; section: boolean } | undefined;
  /** The template as elements with fresh ids (`Templates.build`); null when it cannot be built here. */
  readonly build: (id: string) => { root: El; nodes: Record<string, El> } | null;
}

export interface StreamContext {
  readonly newId: () => string;
  readonly templates: StreamTemplates;
  /** Session.canScript: custom code needs a user who may add scripts. */
  readonly allowSandbox?: boolean;
}

export interface StreamState { readonly doc: Doc; readonly refs: Readonly<Record<string, string>> }

// ---- BlockCatalog ------------------------------------------------------------------------------------------------

/** BlockCatalog.kindId ↔ Kind. */
const KIND_IDS: Record<Kind, string> = {
  Section: "section", Heading: "heading", Text: "text", Snippet: "snippet", Button: "button", Image: "image", Icon: "icon",
  Divider: "divider", Video: "video", Path: "vector", Accordion: "accordion", Loop: "loop", Carousel: "carousel", Nav: "navigation", Raw: "block",
};
export const kindId = (k: Kind) => KIND_IDS[k];
export const kindById = (id: string): Kind | undefined => (Object.keys(KIND_IDS) as Kind[]).find((k) => KIND_IDS[k] === id);

const KIND_PROPS = new Map<string, PropSpec[]>(
  catalog.blocks.map((b) => [b.kind, b.props.map((p) => ({ name: p.name, type: p.type, values: "values" in p ? (p.values as string[]) : [] }))]),
);
/** BlockCatalog.propsOf */
const propsOf = (k: Kind): readonly PropSpec[] => KIND_PROPS.get(kindId(k)) ?? [];
/** BlockCatalog.prop */
const propOf = (k: Kind, name: string) => propsOf(k).find((p) => p.name === name);
/** BlockCatalog.presetIds: the section library. */
export const PRESET_IDS: readonly string[] = catalog.presets.map((p) => p.id);
const PRESETS = new Set(PRESET_IDS);

const tokenSet = (list: { variable: string }[]) => new Set(list.map((t) => t.variable));
const COLOR = tokenSet(catalog.tokens.color);
const FONT_SIZE = tokenSet(catalog.tokens.fontSize);
const SPACING = tokenSet(catalog.tokens.spacing);
const RADIUS = tokenSet(catalog.tokens.radius);
const FONT_FAMILY = tokenSet(catalog.tokens.fontFamily);
const COLOR_PROPERTIES = new Set(["color", "background-color", "border-color", "outline-color", "text-decoration-color", "column-rule-color", "caret-color", "fill", "stroke"]);
const RADIUS_PROPERTIES = new Set([
  "border-radius", "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
  "border-start-start-radius", "border-start-end-radius", "border-end-start-radius", "border-end-end-radius",
]);
const RAW_COLOR = /#[0-9a-f]{3,8}|\brgba?\(|\bhsla?\(|\boklch\(/i;

/** BlockCatalog.styleValue: a declaration a page stream may write. Theme colors, type and radii must be tokens. */
export const styleValue = (property: string, value: string): Result<void> => {
  if (!isAllowedProperty(property)) return fail(`unknown property "${property}"`);
  if (!isSafeValue(value)) return fail(`unsafe value for ${property}`);
  if (COLOR_PROPERTIES.has(property)) return COLOR.has(value) ? ok(undefined) : fail(`${property} must be a theme color token, not ${value}`);
  if (property === "font-size") return FONT_SIZE.has(value) ? ok(undefined) : fail(`font-size must be a theme type token, not ${value}`);
  if (property === "font-family") return FONT_FAMILY.has(value) ? ok(undefined) : fail(`font-family must be a theme font token, not ${value}`);
  if (RADIUS_PROPERTIES.has(property)) return RADIUS.has(value) ? ok(undefined) : fail(`${property} must be a theme radius token, not ${value}`);
  return RAW_COLOR.test(value) ? fail(`${property} uses a raw color (${value})`) : ok(undefined);
};

// ---- JSON as ujson sees it -----------------------------------------------------------------------------------------

/** ujson's `render` of a value (compact JSON). */
const render = (v: unknown): string => JSON.stringify(v) ?? "null";
/** Scala.js Double.toString of a JSON number. */
const numText = (n: number) => (isWhole(n) ? String(toInt(n)) : String(n));
const has = (o: O, k: string) => Object.hasOwn(o, k);

// ---- RuntimeBlocks -------------------------------------------------------------------------------------------------

const ID = /^[a-z][a-z0-9-]{0,40}$/;
const PROP = /^[a-z][a-z0-9-]{0,32}$/;
const MAX_DEFS = 40;
const GROUP_IDS = new Set(["typography", "space", "appearance", "layout", "fill", "stroke", "effects", "color"]);
/** RuntimeBlocks.ClassName */
export const RUNTIME_CLASS = "auvyx-runtime";

const reserved = (id: string) => kindById(id) !== undefined || PRESETS.has(id);

/** RuntimeBlocks.string: a non-empty trimmed string. */
const string = (o: O, key: string): Result<string> => {
  const v = has(o, key) ? o[key] : undefined;
  const t = typeof v === "string" ? javaTrim(v) : "";
  return t ? ok(t) : fail(`missing ${key}`);
};
const stringListValue = (v: unknown, key: string): Result<string[]> => {
  if (!Array.isArray(v)) return fail(`${key} must be a list`);
  const texts = v.filter((x): x is string => typeof x === "string").map(javaTrim);
  return texts.length === v.length ? ok(texts.filter((s) => s !== "")) : fail(`${key} must be strings`);
};
const stringList = (o: O, key: string): Result<string[]> => (has(o, key) ? stringListValue(o[key], key) : ok([]));

const checkId = (id: string): Result<void> => (ID.test(id) ? ok(undefined) : fail(`invalid id "${id}"`));

const checkProps = (props: readonly PropSpec[]): Result<void> => {
  if (props.length > 12) return fail("a block has at most 12 props");
  if (new Set(props.map((p) => p.name)).size !== props.length) return fail("duplicate prop name");
  for (const p of props) {
    if (!PROP.test(p.name)) return fail(`invalid prop "${p.name}"`);
    if (p.type === "string" || p.type === "integer") continue;
    if (p.type === "enum") { if (p.values.length && p.values.every((v) => v.length <= 40)) continue; return fail(`enum "${p.name}" needs values`); }
    return fail(`unknown prop type "${p.type}"`);
  }
  return ok(undefined);
};

const checkGroups = (groups: readonly string[]): Result<void> => {
  if (!groups.length) return fail("a block needs at least one panel group");
  if (new Set(groups).size !== groups.length) return fail("duplicate panel group");
  const bad = groups.find((g) => !GROUP_IDS.has(g));
  return bad === undefined ? ok(undefined) : fail(`unknown panel group "${bad}"`);
};

/** RuntimeBlocks.readValue */
const readValue = (spec: PropSpec, raw: unknown): Result<string> => {
  if (spec.type === "integer") {
    const n = typeof raw === "number" ? (isWhole(raw) && raw >= -2147483648 && raw <= 2147483647 ? toInt(raw) : undefined)
      : typeof raw === "string" ? intOption(javaTrim(raw)) : undefined;
    return n === undefined ? fail(`${spec.name} must be an integer`) : ok(String(n));
  }
  if (spec.type === "enum") {
    const s = typeof raw === "string" ? raw : typeof raw === "number" && isWhole(raw) ? String(toInt(raw)) : undefined;
    return s !== undefined && spec.values.includes(s) ? ok(s) : fail(`unknown ${spec.name} "${s ?? render(raw)}"`);
  }
  if (typeof raw === "string") return raw.length <= 2000 ? ok(raw) : fail(`${spec.name} is too long`);
  if (typeof raw === "number") return ok(numText(raw));
  return fail(`${spec.name} must be a string, got ${render(raw)}`);
};

/** RuntimeBlocks.readProps: the values in the specs' order, "" for a prop not given. */
export const readProps = (specs: readonly PropSpec[], raw: O): Result<Record<string, string>> => {
  const unknown = Object.keys(raw).find((k) => !specs.some((s) => s.name === k));
  if (unknown !== undefined) return fail(`unknown prop "${unknown}"`);
  const out: Record<string, string> = {};
  for (const spec of specs) {
    if (!has(raw, spec.name)) { out[spec.name] = ""; continue; }
    const v = readValue(spec, raw[spec.name]);
    if (!v.ok) return v;
    out[spec.name] = v.value;
  }
  return ok(out);
};

/** RuntimeBlocks.specsFor */
export const specsFor = (kind: string, doc: Doc): Result<readonly PropSpec[]> => {
  const k = kindById(kind);
  if (k === "Raw") return fail(`unknown block "${kind}"`);
  if (k) return ok(propsOf(k));
  const b = (doc.defs ?? []).find((d) => d.id === kind);
  return b ? ok(b.props) : fail(`unknown block "${kind}"`);
};

const strObj = (m: Readonly<Record<string, string>>): O => ({ ...m });

const checkPiece = (piece: Piece, doc: Doc): Result<void> => {
  const specs = specsFor(piece.kind, doc);
  if (!specs.ok) return specs;
  const read = readProps(specs.value, strObj(piece.props));
  if (!read.ok) return read;
  for (const [property, value] of Object.entries(piece.style)) {
    const v = styleValue(property, value);
    if (!v.ok) return v;
  }
  return ok(undefined);
};

const objectMap = (o: O, key: string): Result<Record<string, string>> => {
  if (!has(o, key)) return ok({});
  const v = o[key];
  if (!isRecord(v)) return fail(`${key} must be an object`);
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) {
    if (typeof x === "string") out[k] = x;
    else if (typeof x === "number") out[k] = numText(x);
    else return fail(`${key} values must be strings`);
  }
  return ok(out);
};

/** RuntimeBlocks.parseBlock */
const parseBlock = (raw: O): Result<RuntimeBlock> => {
  const id = string(raw, "id");
  if (!id.ok) return id;
  const label = string(raw, "label");
  if (!label.ok) return label;
  const c = raw.container;
  if (has(raw, "container") && typeof c !== "boolean") return fail("container must be true or false");
  const props: PropSpec[] = [];
  if (has(raw, "props")) {
    if (!Array.isArray(raw.props)) return fail("props must be a list");
    for (const p of raw.props) {
      if (!isRecord(p)) return fail("a prop must be an object");
      const name = string(p, "name");
      if (!name.ok) return name;
      const type = string(p, "type");
      if (!type.ok) return type;
      const values = stringList(p, "values");
      if (!values.ok) return values;
      props.push({ name: name.value, type: type.value, values: values.value });
    }
  }
  if (!has(raw, "groups")) return fail("missing groups");
  const groups = stringListValue(raw.groups, "groups");
  if (!groups.ok) return groups;
  const cp = checkProps(props);
  if (!cp.ok) return cp;
  const cg = checkGroups(groups.value);
  if (!cg.ok) return cg;
  return ok({ id: id.value, label: label.value, container: c === true, props, groups: groups.value });
};

const notDefined = (id: string, doc: Doc): Result<void> =>
  (doc.defs ?? []).some((b) => b.id === id) || (doc.presets ?? []).some((p) => p.id === id) ? fail(`"${id}" is already defined`) : ok(undefined);

/** RuntimeBlocks.defineBlock */
export const defineBlock = (doc: Doc, raw: O): Result<Doc> => {
  const block = parseBlock(raw);
  if (!block.ok) return block;
  if ((doc.defs ?? []).length >= MAX_DEFS) return fail("too many block definitions");
  const b = block.value;
  for (const check of [
    () => checkId(b.id),
    () => (reserved(b.id) ? fail<void>(`"${b.id}" is already a catalog block or preset`) : ok(undefined)),
    () => notDefined(b.id, doc),
    () => (javaTrim(b.label) !== "" && b.label.length <= 80 ? ok(undefined) : fail<void>("a definition needs a label")),
    () => checkProps(b.props),
    () => checkGroups(b.groups),
  ]) { const r = check(); if (!r.ok) return r; }
  return ok({ ...doc, defs: [...(doc.defs ?? []), b] });
};

/** RuntimeBlocks.definePreset */
export const definePreset = (doc: Doc, raw: O): Result<Doc> => {
  const p = string(raw, "preset");
  const id = p.ok ? p : string(raw, "id");
  if (!id.ok) return id;
  const label = string(raw, "label");
  if (!label.ok) return label;
  const sections = stringList(raw, "sections");
  if (!sections.ok) return sections;
  const blocks: Piece[] = [];
  if (has(raw, "blocks")) {
    if (!Array.isArray(raw.blocks)) return fail("blocks must be a list");
    for (const b of raw.blocks) {
      if (!isRecord(b)) return fail("a preset block must be an object");
      const kind = string(b, "kind");
      if (!kind.ok) return kind;
      const props = objectMap(b, "props");
      if (!props.ok) return props;
      const style = objectMap(b, "style");
      if (!style.ok) return style;
      const piece = { kind: kind.value, props: props.value, style: style.value };
      const checked = checkPiece(piece, doc);
      if (!checked.ok) return checked;
      blocks.push(piece);
    }
  }
  if ((doc.presets ?? []).length >= MAX_DEFS) return fail("too many preset definitions");
  const preset: Preset = { id: id.value, label: label.value, sections: sections.value, blocks };
  for (const check of [
    () => checkId(preset.id),
    () => (reserved(preset.id) ? fail<void>(`"${preset.id}" is already a catalog block or preset`) : ok(undefined)),
    () => notDefined(preset.id, doc),
    () => (javaTrim(preset.label) !== "" && preset.label.length <= 80 ? ok(undefined) : fail<void>("a definition needs a label")),
    () => ((preset.sections.length > 0) !== (preset.blocks.length > 0) ? ok(undefined) : fail<void>("a preset is made of library sections or of blocks, not both")),
    () => { const bad = preset.sections.find((s) => !PRESETS.has(s)); return bad === undefined ? ok(undefined) : fail<void>(`unknown preset "${bad}"`); },
    () => { for (const piece of preset.blocks) { const r = checkPiece(piece, doc); if (!r.ok) return r; } return ok(undefined); },
  ]) { const r = check(); if (!r.ok) return r; }
  return ok({ ...doc, presets: [...(doc.presets ?? []), preset] });
};

/** RuntimeBlocks.materialize: a section holding one text per prop, labelled with the prop's name. */
export const materialize = (block: RuntimeBlock, values: Readonly<Record<string, string>>, newId: () => string): [El, Record<string, El>] => {
  const fields = Object.fromEntries(block.props.map((p) => [p.name, values[p.name] ?? ""]));
  const kids = block.props.map((p) => { const id = newId(); return el(id, "Text", { text: fields[p.name] ?? "", label: p.name }); });
  const id = newId();
  const n = el(id, "Section", { tag: "div", className: RUNTIME_CLASS, label: block.label, runtime: block.id, fields, children: kids.map((k) => k.id) });
  return [n, Object.fromEntries(kids.map((k) => [k.id, k]))];
};

/** RuntimeBlocks.paint: base styles, each checked as a theme declaration. */
export const paint = (n: El, style: Readonly<Record<string, string>>): Result<El> => {
  let cur = n;
  for (const [property, value] of Object.entries(style)) {
    const v = styleValue(property, value);
    if (!v.ok) return v;
    cur = { ...cur, styles: setStyle(cur.styles, "base", "default", property, value) };
  }
  return ok(cur);
};

/** RuntimeBlocks.holds: a container that is not a runtime block, or a runtime block declared as a container. */
export const holds = (parent: El, doc: Doc): boolean =>
  KINDS[parent.kind].container && (parent.runtime === "" || (doc.defs ?? []).some((b) => b.id === parent.runtime && b.container));

// ---- SandboxCode ---------------------------------------------------------------------------------------------------

/** SandboxCode.Max */
export const SANDBOX_MAX = 20000;
const SANDBOX_CLASS = "auvyx-sandbox";
const JAVA_SPACE = /[ \t\n\x0B\f\r]/g;
const ORIGIN = /^https:\/\/[a-z0-9][a-z0-9.-]*[a-z0-9](?::[0-9]{2,5})?$|^https:\/\/[a-z0-9](?::[0-9]{2,5})?$/;

/** SandboxCode.checkTokens: a theme variable must be one of the theme's tokens. */
export const checkTokens = (text: string): Result<void> => {
  for (const m of text.matchAll(/var\([ \t\n\x0B\f\r]*(--wp--[^)]+?)[ \t\n\x0B\f\r]*\)/g)) {
    const value = `var(${m[1]!.replace(JAVA_SPACE, "")})`;
    if (!COLOR.has(value) && !FONT_SIZE.has(value) && !SPACING.has(value) && !FONT_FAMILY.has(value) && !RADIUS.has(value)) return fail(`unknown token ${value}`);
  }
  return ok(undefined);
};

const originOk = (value: string) => {
  const t = javaTrim(value);
  return ORIGIN.test(t) && !t.includes("..") && !t.includes("@") && !t.includes("\\") && !t.slice(8).includes("/");
};

/** SandboxCode.origins */
export const origins = (raw: string): Result<string[]> => {
  const parts = [...new Set(raw.split(/[,\t\n\x0B\f\r ]+/).map(javaTrim).filter((s) => s !== ""))];
  if (parts.length > 8) return fail("at most 8 allowlisted origins");
  const bad = parts.find((o) => !originOk(o));
  return bad === undefined ? ok(parts) : fail(`allowlist entries must be https origins, not ${bad}`);
};

/** SandboxCode.element */
export const sandboxElement = (html: string, css: string, js: string, allow: readonly string[], id: string): El =>
  el(id, "Section", {
    tag: "div", className: SANDBOX_CLASS, label: "Custom code",
    fields: { html: html.slice(0, SANDBOX_MAX), css: css.slice(0, SANDBOX_MAX), js: js.slice(0, SANDBOX_MAX), allow: allow.join(" ") },
    styles: setStyle(setStyle({}, "base", "default", "min-height", "240px"), "base", "default", "width", "100%"),
  });

// ---- PageStream ----------------------------------------------------------------------------------------------------

const KNOWN = new Set(["clear", "insert", "set", "style", "element", "define", "sandbox"]);

/** PageStream.str: a trimmed non-empty string. */
const str = (o: O, key: string): string | undefined => {
  const v = has(o, key) ? o[key] : undefined;
  if (typeof v !== "string") return undefined;
  const t = javaTrim(v);
  return t === "" ? undefined : t;
};
const required = (o: O, key: string, where: string): Result<string> => { const s = str(o, key); return s === undefined ? fail(`${where}: missing ${key}`) : ok(s); };
const only = (o: O, allowed: readonly string[], where: string): Result<void> => {
  const k = Object.keys(o).find((x) => !allowed.includes(x));
  return k === undefined ? ok(undefined) : fail(`${where}: unknown field "${k}"`);
};
const parsed = (line: string, where: string): Result<O> => {
  try { const o: unknown = JSON.parse(line); return isRecord(o) ? ok(o) : fail(`${where}: not a JSON object`); } catch { return fail(`${where}: not a JSON object`); }
};
const prefixed = <T>(r: Result<T>, where: string): Result<T> => (r.ok ? r : fail(`${where}: ${r.error}`));

/** PageStream.summary: one line, as the agent's steps say it. */
export function summary(line: string, templates: StreamTemplates): string {
  let o: unknown;
  try { o = JSON.parse(line); } catch { return "Change"; }
  if (!isRecord(o)) return "Change";
  switch (str(o, "op") ?? "") {
    case "clear": return "Cleared the page";
    case "insert": {
      const id = str(o, "preset") ?? str(o, "kind");
      return `Added ${id === undefined ? "section" : templates.byId(id)?.title ?? id}`;
    }
    case "set": return "Updated the copy";
    case "style": return "Applied a theme token";
    case "element": return "Added a block";
    case "define": return str(o, "preset") !== undefined ? "Defined a preset" : "Defined a block";
    case "sandbox": return "Added custom code";
    default: return "Change";
  }
}

/** AiAgent.streamLines: an array of objects, or one string of lines. */
export function streamLines(lines: unknown): string[] {
  if (lines === undefined || lines === null) return [];
  if (Array.isArray(lines)) return lines.map((v) => JSON.stringify(v) ?? "undefined");
  return String(lines).split("\n").map(javaTrim).filter((s) => s !== "");
}

/** PageStream.applyAll: each successful line is a new document, in order. The first rejection fails the whole stream. */
export function applyAll(doc: Doc, lines: readonly string[], ctx: StreamContext): Result<Doc[]> {
  const usable = lines.map(javaTrim).filter((s) => s !== "");
  if (!usable.length) return fail("empty stream");
  const frames: Doc[] = [];
  let state: StreamState = { doc, refs: {} };
  for (const [i, line] of usable.entries()) {
    const next = applyLine(state, line, i, ctx);
    if (!next.ok) return next;
    state = next.value;
    frames.push(state.doc);
  }
  return ok(frames);
}

/** PageStream.applyLine */
export function applyLine(state: StreamState, line: string, index: number, ctx: StreamContext): Result<StreamState> {
  const where = `line ${index + 1}`;
  const p = parsed(line, where);
  if (!p.ok) return p;
  const o = p.value;
  const op = str(o, "op") ?? "";
  if (!KNOWN.has(op)) return fail(`${where}: unknown op "${op}"`);
  switch (op) {
    case "clear": {
      const r = only(o, ["op"], where);
      return r.ok ? ok({ doc: { ...state.doc, roots: [], nodes: {} }, refs: {} }) : r;
    }
    case "define": return define(state, o, where);
    case "insert": return insertLine(state, o, where, ctx);
    case "set": return edit(state, o, where, false);
    case "style": return edit(state, o, where, true);
    case "element": return element(state, o, where, ctx.newId);
    case "sandbox": return ctx.allowSandbox === false ? fail(`${where}: custom code requires a user who may add scripts`) : sandbox(state, o, where, ctx.newId);
    default: return fail(`${where}: unknown op "${op}"`);
  }
}

const withRef = (refs: Readonly<Record<string, string>>, ref: string | undefined, id: string | undefined) =>
  ref === undefined || id === undefined ? refs : { ...refs, [ref]: id };

function edit(state: StreamState, o: O, where: string, style: boolean): Result<StreamState> {
  const allowed = style ? ["op", "ref", "kind", "property", "value"] : ["op", "ref", "kind", "prop", "value"];
  const a = only(o, allowed, where);
  if (!a.ok) return a;
  const ref = required(o, "ref", where);
  if (!ref.ok) return ref;
  const root = state.refs[ref.value];
  if (root === undefined || !Object.hasOwn(state.refs, ref.value)) return fail(`${where}: unknown ref "${ref.value}"`);
  const target = resolve(state.doc, root, str(o, "kind"), where);
  if (!target.ok) return target;
  if (style) {
    const property = required(o, "property", where);
    if (!property.ok) return property;
    const value = required(o, "value", where);
    if (!value.ok) return value;
    const v = prefixed(styleValue(property.value, value.value), where);
    if (!v.ok) return v;
    return ok({ doc: update(state.doc, target.value.id, (n) => ({ ...n, styles: setStyle(n.styles, "base", "default", property.value, value.value) })), refs: state.refs });
  }
  const name = required(o, "prop", where);
  if (!name.ok) return name;
  if (!has(o, "value")) return fail(`${where}: missing value`);
  const next = writeTarget(state.doc, target.value, name.value, o.value, where);
  return next.ok ? ok({ doc: next.value, refs: state.refs }) : next;
}

function define(state: StreamState, o: O, where: string): Result<StreamState> {
  const isPreset = has(o, "preset");
  const a = only(o, isPreset ? ["op", "preset", "label", "sections", "blocks"] : ["op", "id", "label", "container", "props", "groups"], where);
  if (!a.ok) return a;
  const doc = prefixed(isPreset ? definePreset(state.doc, o) : defineBlock(state.doc, o), where);
  return doc.ok ? ok({ doc: doc.value, refs: state.refs }) : doc;
}

function insertLine(state: StreamState, o: O, where: string, ctx: StreamContext): Result<StreamState> {
  const a = only(o, ["op", "preset", "kind", "ref", "props", "style"], where);
  if (!a.ok) return a;
  let ref: string | undefined;
  if (has(o, "ref")) {
    const r = o.ref;
    if (typeof r === "string" && javaTrim(r) !== "") ref = javaTrim(r);
    else return fail(`${where}: ref must be a string`);
  }
  if (ref !== undefined && Object.hasOwn(state.refs, ref)) return fail(`${where}: duplicate ref "${ref}"`);
  const preset = str(o, "preset"), kind = str(o, "kind");
  if ((preset !== undefined) === (kind !== undefined)) return fail(`${where}: insert needs a preset or a defined block`);
  return preset !== undefined ? insertPreset(state, preset, ref, where, ctx) : insertDefined(state, kind ?? "", ref, o, where, ctx.newId);
}

function insertPreset(state: StreamState, id: string, ref: string | undefined, where: string, ctx: StreamContext): Result<StreamState> {
  const preset = (state.doc.presets ?? []).find((p) => p.id === id);
  if (preset && preset.sections.length) {
    const unknown = preset.sections.find((s) => ctx.templates.byId(s) === undefined);
    if (unknown !== undefined) return fail(`${where}: preset "${id}" has an unknown section "${unknown}"`);
    let doc = state.doc;
    let first: string | undefined;
    for (const section of preset.sections) {
      const built = ctx.templates.build(section);
      if (!built) return fail(`${where}: preset "${id}" has an unknown section "${section}"`);
      doc = insert(doc, built.root, null, doc.roots.length, built.nodes);
      first ??= built.root.id;
    }
    return ok({ doc, refs: withRef(state.refs, ref, first) });
  }
  if (preset) {
    const built = preset.blocks.map((piece) => placePiece(state.doc, piece, ctx.newId));
    const bad = built.find((b) => !b.ok);
    if (bad && !bad.ok) return fail(`${where}: ${bad.error}`);
    const pieces = built.map((b) => (b as { ok: true; value: [El, Record<string, El>] }).value);
    const wrapper = ctx.newId();
    const section = el(wrapper, "Section", { tag: "section", label: preset.label, children: pieces.map(([e]) => e.id) });
    const extra: Record<string, El> = {};
    for (const [e, more] of pieces) Object.assign(extra, more, { [e.id]: e });
    return ok({ doc: insert(state.doc, section, null, state.doc.roots.length, extra), refs: withRef(state.refs, ref, wrapper) });
  }
  if (!PRESETS.has(id)) return fail(`${where}: unknown preset "${id}"`);
  const t = ctx.templates.byId(id);
  if (!t || !t.section) return fail(`${where}: preset "${id}" is not a section`);
  const built = ctx.templates.build(id);
  if (!built) return fail(`${where}: preset "${id}" is not a section`);
  return ok({ doc: insert(state.doc, built.root, null, state.doc.roots.length, built.nodes), refs: withRef(state.refs, ref, built.root.id) });
}

const propsObj = (v: unknown, where: string): Result<O> => (isRecord(v) ? ok(v) : fail(`${where}: props must be an object`));
const styleObj = (v: unknown, where: string): Result<Record<string, string>> => {
  if (!isRecord(v)) return fail(`${where}: style must be an object`);
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) {
    if (typeof x !== "string") return fail(`${where}: style values must be strings`);
    out[k] = x;
  }
  return ok(out);
};

function insertDefined(state: StreamState, kind: string, ref: string | undefined, o: O, where: string, newId: () => string): Result<StreamState> {
  const block = (state.doc.defs ?? []).find((b) => b.id === kind);
  if (!block) return fail(`${where}: unknown block "${kind}"`);
  const props = has(o, "props") ? propsObj(o.props, where) : ok<O>({});
  if (!props.ok) return props;
  const values = prefixed(readProps(block.props, props.value), where);
  if (!values.ok) return values;
  const style = has(o, "style") ? styleObj(o.style, where) : ok<Record<string, string>>({});
  if (!style.ok) return style;
  const [made, extra] = materialize(block, values.value, newId);
  const painted = prefixed(paint(made, style.value), where);
  if (!painted.ok) return painted;
  return ok({ doc: insert(state.doc, painted.value, null, state.doc.roots.length, extra), refs: withRef(state.refs, ref, painted.value.id) });
}

function element(state: StreamState, o: O, where: string, newId: () => string): Result<StreamState> {
  const a = only(o, ["op", "kind", "ref", "props"], where);
  if (!a.ok) return a;
  const kindName = required(o, "kind", where);
  if (!kindName.ok) return kindName;
  const specs = prefixed(specsFor(kindName.value, state.doc), where);
  if (!specs.ok) return specs;
  const ref = required(o, "ref", where);
  if (!ref.ok) return ref;
  const pid = Object.hasOwn(state.refs, ref.value) ? state.refs[ref.value] : undefined;
  const parent = pid === undefined ? undefined : state.doc.nodes[pid];
  if (!parent) return fail(`${where}: unknown ref "${ref.value}"`);
  if (!holds(parent, state.doc)) return fail(`${where}: "${ref.value}" cannot hold a block`);
  const props = has(o, "props") ? propsObj(o.props, where) : ok<O>({});
  if (!props.ok) return props;
  const placed = placeElement(state.doc, kindName.value, props.value, newId, where);
  if (!placed.ok) return placed;
  const [made, extra] = placed.value;
  return ok({ doc: insert(state.doc, made, parent.id, parent.children.length, extra), refs: state.refs });
}

function optionalText(o: O, key: string, where: string): Result<string> {
  if (!has(o, key)) return ok("");
  const v = o[key];
  if (typeof v === "string") return ok(v);
  if (Array.isArray(v) && key === "allow") {
    const texts = v.filter((x): x is string => typeof x === "string").map(javaTrim);
    return texts.length === v.length ? ok(texts.filter((s) => s !== "").join(" ")) : fail(`${where}: allow must be a list of https origins`);
  }
  return fail(`${where}: ${key} must be a string`);
}

function sandbox(state: StreamState, o: O, where: string, newId: () => string): Result<StreamState> {
  const a = only(o, ["op", "html", "css", "js", "allow", "ref"], where);
  if (!a.ok) return a;
  const html = optionalText(o, "html", where);
  if (!html.ok) return html;
  const css = optionalText(o, "css", where);
  if (!css.ok) return css;
  const js = optionalText(o, "js", where);
  if (!js.ok) return js;
  const allowRaw = optionalText(o, "allow", where);
  if (!allowRaw.ok) return allowRaw;
  if (html.value.length > SANDBOX_MAX || css.value.length > SANDBOX_MAX || js.value.length > SANDBOX_MAX) return fail(`${where}: custom code is limited to ${SANDBOX_MAX} characters`);
  for (const t of [html.value, css.value, js.value]) { const r = prefixed(checkTokens(t), where); if (!r.ok) return r; }
  const allow = prefixed(origins(allowRaw.value), where);
  if (!allow.ok) return allow;
  let into: string | null = null;
  if (has(o, "ref")) {
    const ref = required(o, "ref", where);
    if (!ref.ok) return ref;
    const pid = Object.hasOwn(state.refs, ref.value) ? state.refs[ref.value] : undefined;
    const parent = pid === undefined ? undefined : state.doc.nodes[pid];
    if (!parent) return fail(`${where}: unknown ref "${ref.value}"`);
    if (!holds(parent, state.doc)) return fail(`${where}: "${ref.value}" cannot hold a block`);
    into = parent.id;
  }
  const box = sandboxElement(html.value, css.value, js.value, allow.value, newId());
  const at = into === null ? state.doc.roots.length : state.doc.nodes[into]?.children.length ?? 0;
  return ok({ doc: insert(state.doc, box, into, at, {}), refs: state.refs });
}

function placeElement(doc: Doc, kindName: string, props: O, newId: () => string, where: string): Result<[El, Record<string, El>]> {
  const kind = kindById(kindName);
  if (kind === "Raw") return fail(`${where}: unknown block "${kindName}"`);
  if (kind) {
    const written = writeProps(el(newId(), kind), kind, props, where);
    return written.ok ? ok([written.value, {}]) : written;
  }
  const block = (doc.defs ?? []).find((b) => b.id === kindName);
  if (!block) return fail(`${where}: unknown block "${kindName}"`);
  const values = prefixed(readProps(block.props, props), where);
  return values.ok ? ok(materialize(block, values.value, newId)) : values;
}

function placePiece(doc: Doc, piece: Piece, newId: () => string): Result<[El, Record<string, El>]> {
  const placed = placeElement(doc, piece.kind, strObj(piece.props), newId, "preset");
  if (!placed.ok) return placed;
  const painted = paint(placed.value[0], piece.style);
  return painted.ok ? ok([painted.value, placed.value[1]]) : painted;
}

function writeTarget(doc: Doc, target: El, name: string, raw: unknown, where: string): Result<Doc> {
  if (target.runtime !== "") {
    const found = (doc.defs ?? []).find((b) => b.id === target.runtime)?.props.find((p) => p.name === name);
    if (!found) return fail(`${where}: unknown prop "${name}" on ${target.runtime}`);
    const values = prefixed(readProps([found], { [name]: raw }), where);
    if (!values.ok) return values;
    const text = values.value[name] ?? "";
    const updated = update(doc, target.id, (n) => ({ ...n, fields: { ...n.fields, [name]: text } }));
    const child = target.children.map((c) => updated.nodes[c]).find((c): c is El => !!c && c.kind === "Text" && c.label === name);
    return ok(child ? update(updated, child.id, (c) => ({ ...c, text })) : updated);
  }
  const spec = propOf(target.kind, name);
  if (!spec) return fail(`${where}: unknown prop "${name}" on ${kindId(target.kind)}`);
  const text = readProp(spec, raw, where);
  return text.ok ? ok(update(doc, target.id, (n) => writeProp(n, name, text.value))) : text;
}

function resolve(doc: Doc, root: string, kindName: string | undefined, where: string): Result<El> {
  if (kindName === undefined) { const n = doc.nodes[root]; return n ? ok(n) : fail(`${where}: missing element`); }
  const kind = kindById(kindName);
  const inside = subtreeIds(doc, root).map((i) => doc.nodes[i]!);
  if (kind) { const n = inside.find((x) => x.kind === kind); return n ? ok(n) : fail(`${where}: no ${kindId(kind)} inside the section`); }
  if ((doc.defs ?? []).some((b) => b.id === kindName)) { const n = inside.find((x) => x.runtime === kindName); return n ? ok(n) : fail(`${where}: no ${kindName} inside the section`); }
  return fail(`${where}: unknown block "${kindName}"`);
}

function writeProps(n: El, kind: Kind, props: O, where: string): Result<El> {
  const unknown = Object.keys(props).find((k) => !propOf(kind, k));
  if (unknown !== undefined) return fail(`${where}: unknown prop "${unknown}" on ${kindId(kind)}`);
  let cur = n;
  for (const [name, raw] of Object.entries(props)) {
    const text = readProp(propOf(kind, name)!, raw, where);
    if (!text.ok) return text;
    cur = writeProp(cur, name, text.value);
  }
  return ok(cur);
}

/** PageStream.readProp: a heading level is 1 to 6. */
function readProp(spec: PropSpec, raw: unknown, where: string): Result<string> {
  if (spec.type === "integer") {
    const n = typeof raw === "number" ? (isWhole(raw) ? toInt(raw) : undefined) : typeof raw === "string" ? intOption(javaTrim(raw)) : undefined;
    return n !== undefined && n >= 1 && n <= 6 ? ok(String(n)) : fail(`${where}: ${spec.name} must be an integer from 1 to 6`);
  }
  if (spec.type === "enum") {
    const s = typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : undefined;
    return s !== undefined && spec.values.includes(s) ? ok(s) : fail(`${where}: unknown ${spec.name} "${s ?? render(raw)}"`);
  }
  if (typeof raw === "string") return ok(raw);
  if (typeof raw === "number") return ok(numText(raw));
  return fail(`${where}: ${spec.name} must be a string, got ${render(raw)}`);
}

function writeProp(n: El, name: string, raw: string): El {
  switch (name) {
    case "text": return { ...n, text: raw };
    case "level": return { ...n, level: Number(raw) };
    case "href": return { ...n, href: raw };
    case "target": return { ...n, target: raw };
    case "src": return { ...n, src: raw };
    case "alt": return { ...n, alt: raw };
    case "icon": return { ...n, icon: raw };
    case "tag": return { ...n, tag: raw };
    case "align": return { ...n, align: raw };
    case "label": return { ...n, label: raw };
    case "menu": return { ...n, src: raw };
    case "toggleAt": return { ...n, alt: raw };
    default: return n;
  }
}

// ---- PagePlans ---------------------------------------------------------------------------------------------------

/** PagePlans.plan: which page a prompt builds, as a catalog stream (deterministic: the canvas can play it without a model). */
export function pagePlan(prompt: string): { name: string; lines: string[] } | undefined {
  const p = prompt.toLowerCase();
  const page = (presets: string[], headline: string) => [
    '{"op":"clear"}',
    `{"op":"insert","preset":"${presets[0]}","ref":"hero"}`,
    `{"op":"set","ref":"hero","kind":"heading","prop":"text","value":${JSON.stringify(headline)}}`,
    ...presets.slice(1).map((id) => `{"op":"insert","preset":"${id}"}`),
  ];
  const landing = ["hero-centered", "logos", "features", "pricing", "testimonials", "faq", "cta", "footer"];
  const shop = ["lib-product-highlight", "lib-product-grid", "testimonials", "cta", "footer"];
  const lms = ["lib-course-grid", "lib-curriculum", "lib-instructor", "faq", "cta", "footer"];
  const lmsPlan = () => ({ name: "lms", lines: page(lms, "Learn the craft, one lesson at a time.") });
  if (p.includes("lms") || p.includes("curriculum") || p.includes("instructor")) return lmsPlan();
  if (["ecommerce", "e-commerce", "shop", "storefront", "product grid", "product highlight"].some((w) => p.includes(w))) return { name: "ecommerce", lines: page(shop, "The oak desk lamp, in stock.") };
  if (["landing", "marketing", "homepage"].some((w) => p.includes(w))) return { name: "landing", lines: page(landing, "Ship the query. Keep the cluster quiet.") };
  if (["course", "academy", "lesson"].some((w) => p.includes(w))) return lmsPlan();
  return undefined;
}
