/**
 * Blocks and presets declared while a page is built (the Scala `RuntimeBlocks`): parsed from the `auvyx` attribute, checked
 * like the Studio checks them, and written back as the same JSON. Catalog facts (kinds, section presets, theme tokens)
 * come from shared/block-catalog.json, the export of the Scala catalog.
 */
import { isAllowedProperty, isSafeValue } from "@auvyx/style-engine";
import catalog from "../../../shared/block-catalog.json";
import { intOption, isRecord, isWhole, javaTrim, jsonString, jsonStrings, toInt } from "./json";

export interface PropSpec {
  readonly name: string;
  readonly type: string;
  readonly values: readonly string[];
}

export interface RuntimeBlock {
  readonly id: string;
  readonly label: string;
  readonly container: boolean;
  readonly props: readonly PropSpec[];
  readonly groups: readonly string[];
}

/** One block of a preset: a catalog kind or a block defined earlier, with prop values and base styles. */
export interface Piece {
  readonly kind: string;
  readonly props: Readonly<Record<string, string>>;
  readonly style: Readonly<Record<string, string>>;
}

/** `sections` are section-library ids, `blocks` pieces; exactly one of the two is set. */
export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly sections: readonly string[];
  readonly blocks: readonly Piece[];
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

const ID = /^[a-z][a-z0-9-]{0,40}$/;
const PROP = /^[a-z][a-z0-9-]{0,32}$/;
/** StyleGroups.groupIds: the panel groups a runtime block may name. */
const GROUP_IDS = new Set(["typography", "space", "appearance", "layout", "fill", "stroke", "effects", "color"]);

const KIND_PROPS = new Map<string, PropSpec[]>(
  catalog.blocks.map((b) => [b.kind, b.props.map((p) => ({ name: p.name, type: p.type, values: "values" in p ? (p.values as string[]) : [] }))]),
);
const PRESET_IDS = new Set(catalog.presets.map((p) => p.id));
const tokens = (list: { variable: string }[]) => new Set(list.map((t) => t.variable));
const COLOR = tokens(catalog.tokens.color);
const FONT_SIZE = tokens(catalog.tokens.fontSize);
const RADIUS = tokens(catalog.tokens.radius);
const FONT_FAMILY = tokens(catalog.tokens.fontFamily);

const COLOR_PROPERTIES = new Set(["color", "background-color", "border-color", "outline-color", "text-decoration-color", "column-rule-color", "caret-color", "fill", "stroke"]);
const RADIUS_PROPERTIES = new Set([
  "border-radius", "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
  "border-start-start-radius", "border-start-end-radius", "border-end-start-radius", "border-end-end-radius",
]);
const RAW_COLOR = /#[0-9a-f]{3,8}|\brgba?\(|\bhsla?\(|\boklch\(/i;

/** BlockCatalog.styleValue: a declaration a preset may carry. Theme colors, type and radii must be tokens. */
const styleValue = (property: string, value: string): Result<void> => {
  if (!isAllowedProperty(property)) return fail(`unknown property "${property}"`);
  if (!isSafeValue(value)) return fail(`unsafe value for ${property}`);
  if (COLOR_PROPERTIES.has(property)) return COLOR.has(value) ? ok(undefined) : fail(`${property} must be a theme color token`);
  if (property === "font-size") return FONT_SIZE.has(value) ? ok(undefined) : fail("font-size must be a theme type token");
  if (property === "font-family") return FONT_FAMILY.has(value) ? ok(undefined) : fail("font-family must be a theme font token");
  if (RADIUS_PROPERTIES.has(property)) return RADIUS.has(value) ? ok(undefined) : fail(`${property} must be a theme radius token`);
  return RAW_COLOR.test(value) ? fail(`${property} uses a raw color`) : ok(undefined);
};

const reserved = (id: string) => KIND_PROPS.has(id) || PRESET_IDS.has(id);

/** A non-empty trimmed string. */
const string = (o: Record<string, unknown>, key: string): Result<string> => {
  const v = Object.hasOwn(o, key) ? o[key] : undefined;
  const t = typeof v === "string" ? javaTrim(v) : "";
  return t ? ok(t) : fail(`missing ${key}`);
};

const stringListValue = (v: unknown, key: string): Result<string[]> => {
  if (!Array.isArray(v)) return fail(`${key} must be a list`);
  if (!v.every((x) => typeof x === "string")) return fail(`${key} must be strings`);
  return ok((v as string[]).map(javaTrim).filter((s) => s));
};

const stringList = (o: Record<string, unknown>, key: string): Result<string[]> =>
  Object.hasOwn(o, key) ? stringListValue(o[key], key) : ok([]);

/** Numbers become text as the Scala core writes them (whole numbers as Ints). */
const numberText = (n: number) => (isWhole(n) ? String(toInt(n)) : String(n));

const objectMap = (o: Record<string, unknown>, key: string): Result<Record<string, string>> => {
  if (!Object.hasOwn(o, key)) return ok({});
  const v = o[key];
  if (!isRecord(v)) return fail(`${key} must be an object`);
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) {
    if (typeof x === "string") out[k] = x;
    else if (typeof x === "number") out[k] = numberText(x);
    else return fail(`${key} values must be strings`);
  }
  return ok(out);
};

const checkProps = (props: readonly PropSpec[]): Result<void> => {
  if (props.length > 12) return fail("a block has at most 12 props");
  if (new Set(props.map((p) => p.name)).size !== props.length) return fail("duplicate prop name");
  for (const p of props) {
    if (!PROP.test(p.name)) return fail(`invalid prop "${p.name}"`);
    if (p.type === "enum" && !(p.values.length && p.values.every((v) => v.length <= 40))) return fail(`enum "${p.name}" needs values`);
    if (p.type !== "string" && p.type !== "integer" && p.type !== "enum") return fail(`unknown prop type "${p.type}"`);
  }
  return ok(undefined);
};

const checkGroups = (groups: readonly string[]): Result<void> => {
  if (!groups.length) return fail("a block needs at least one panel group");
  if (new Set(groups).size !== groups.length) return fail("duplicate panel group");
  return groups.every((g) => GROUP_IDS.has(g)) ? ok(undefined) : fail("unknown panel group");
};

const specsFor = (kind: string, defs: readonly RuntimeBlock[]): Result<readonly PropSpec[]> => {
  if (kind === "block") return fail(`unknown block "${kind}"`); // a raw platform block has no props to set
  const own = KIND_PROPS.get(kind) ?? defs.find((b) => b.id === kind)?.props;
  return own ? ok(own) : fail(`unknown block "${kind}"`);
};

/** RuntimeBlocks.readProps for string values (what a stored piece holds). */
const readProps = (specs: readonly PropSpec[], raw: Record<string, string>): Result<void> => {
  const unknown = Object.keys(raw).find((k) => !specs.some((s) => s.name === k));
  if (unknown !== undefined) return fail(`unknown prop "${unknown}"`);
  for (const spec of specs) {
    if (!Object.hasOwn(raw, spec.name)) continue;
    const v = raw[spec.name]!;
    if (spec.type === "integer" && intOption(javaTrim(v)) === undefined) return fail(`${spec.name} must be an integer`);
    if (spec.type === "enum" && !spec.values.includes(v)) return fail(`unknown ${spec.name}`);
    if (spec.type !== "integer" && spec.type !== "enum" && v.length > 2000) return fail(`${spec.name} is too long`);
  }
  return ok(undefined);
};

const checkPiece = (piece: Piece, defs: readonly RuntimeBlock[]): Result<void> => {
  const specs = specsFor(piece.kind, defs);
  if (!specs.ok) return specs;
  const props = readProps(specs.value, { ...piece.props });
  if (!props.ok) return props;
  for (const [property, value] of Object.entries(piece.style)) {
    const checked = styleValue(property, value);
    if (!checked.ok) return checked;
  }
  return ok(undefined);
};

/** RuntimeBlocks.parseBlock: a block definition, or why not. */
export const parseBlock = (raw: unknown): Result<RuntimeBlock> => {
  if (!isRecord(raw)) return fail("a block definition must be an object");
  const id = string(raw, "id");
  if (!id.ok) return id;
  const label = string(raw, "label");
  if (!label.ok) return label;
  const container = raw.container;
  if (container !== undefined && typeof container !== "boolean") return fail("container must be true or false");
  const props: PropSpec[] = [];
  if (Object.hasOwn(raw, "props")) {
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
  if (!Object.hasOwn(raw, "groups")) return fail("missing groups");
  const groups = stringListValue(raw.groups, "groups");
  if (!groups.ok) return groups;
  const checked = checkProps(props);
  if (!checked.ok) return checked;
  const grouped = checkGroups(groups.value);
  if (!grouped.ok) return grouped;
  return ok({ id: id.value, label: label.value, container: container === true, props, groups: groups.value });
};

/** RuntimeBlocks.parsePresetValue followed by validatePreset, against the blocks defined so far. */
export const parsePreset = (raw: unknown, defs: readonly RuntimeBlock[]): Result<Preset> => {
  if (!isRecord(raw)) return fail("a preset definition must be an object");
  const preset = string(raw, "preset");
  const id = preset.ok ? preset : string(raw, "id");
  if (!id.ok) return id;
  const label = string(raw, "label");
  if (!label.ok) return label;
  const sections = stringList(raw, "sections");
  if (!sections.ok) return sections;
  const blocks: Piece[] = [];
  if (Object.hasOwn(raw, "blocks")) {
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
      const checked = checkPiece(piece, defs);
      if (!checked.ok) return checked;
      blocks.push(piece);
    }
  }
  // validatePreset
  if (!ID.test(id.value)) return fail(`invalid id "${id.value}"`);
  if (reserved(id.value)) return fail(`"${id.value}" is already a catalog block or preset`);
  if (defs.some((b) => b.id === id.value)) return fail(`"${id.value}" is already defined`);
  if (label.value.length > 80) return fail("a definition needs a label");
  if ((sections.value.length > 0) === (blocks.length > 0)) return fail("a preset is made of library sections or of blocks, not both");
  const unknown = sections.value.find((s) => !PRESET_IDS.has(s));
  if (unknown !== undefined) return fail(`unknown preset "${unknown}"`);
  return ok({ id: id.value, label: label.value, sections: sections.value, blocks });
};

const propJson = (p: PropSpec) =>
  `{"name":${jsonString(p.name)},"type":${jsonString(p.type)}${p.values.length ? `,"values":[${p.values.map(jsonString).join(",")}]` : ""}}`;

/** RuntimeBlocks.blockJson; `fields` are the prop values of one use of the block. */
export const blockJson = (block: RuntimeBlock, fields: Readonly<Record<string, string>> = {}): string =>
  `{"id":${jsonString(block.id)},"label":${jsonString(block.label)},"container":${block.container},` +
  `"props":[${block.props.map(propJson).join(",")}],"groups":[${block.groups.map(jsonString).join(",")}]` +
  (Object.keys(fields).length ? `,"fields":${jsonStrings(fields)}` : "") + "}";

export const presetJson = (preset: Preset): string => {
  const blocks = preset.blocks.map((b) =>
    `{"kind":${jsonString(b.kind)}` +
    (Object.keys(b.props).length ? `,"props":${jsonStrings(b.props)}` : "") +
    (Object.keys(b.style).length ? `,"style":${jsonStrings(b.style)}` : "") + "}");
  return `{"id":${jsonString(preset.id)},"label":${jsonString(preset.label)}` +
    (preset.sections.length ? `,"sections":[${preset.sections.map(jsonString).join(",")}]` : "") +
    (blocks.length ? `,"blocks":[${blocks.join(",")}]` : "") + "}";
};
