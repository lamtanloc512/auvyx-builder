/**
 * A site's own kinds of content (Properties, Courses, Rooms…), their taxonomies and typed fields: the Scala
 * `ContentModel` (S/ContentModel.scala), checked by the same fixtures (shared/fixtures/content-types/cases.json) as the
 * Studio and the PHP module (Modules/ContentTypes). `validate` reads a definition, `sanitize` a value, `display` shows one.
 */
import { isRecord, javaTrim } from "./json";

export const SCHEMA = "auvyx-content/1";

/** Field kinds, and what each is called in the Studio. */
export const KINDS: readonly [string, string][] = [
  ["text", "Text"], ["textarea", "Long text"], ["number", "Number"], ["money", "Price"], ["date", "Date"], ["time", "Time"],
  ["datetime", "Date and time"], ["select", "Choice"], ["checkbox", "Yes / no"], ["url", "Link"], ["email", "Email"],
  ["phone", "Phone"], ["color", "Colour"], ["image", "Image"], ["gallery", "Gallery"], ["file", "File"],
  ["relation", "Link to another entry"], ["repeater", "Rows"],
];

export const MAX_TYPES = 30, MAX_TAXONOMIES = 30, MAX_FIELDS = 60, MAX_SUB_FIELDS = 20, MAX_OPTIONS = 100, MAX_ROWS = 50,
  MAX_GALLERY = 40, MAX_TEXT = 500, MAX_LONG = 20000;

const TYPE_KEY = /^[a-z][a-z0-9_]{0,19}$/;
const TAX_KEY = /^[a-z][a-z0-9_]{0,31}$/;
const FIELD_KEY = /^[a-z][a-z0-9_]{0,39}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Names WordPress, WooCommerce, EzyPlatform or the query string already use. */
export const RESERVED_TYPES = new Set([
  "post", "page", "attachment", "revision", "nav_menu_item", "custom_css", "customize_changeset", "oembed_cache",
  "user_request", "wp_block", "wp_template", "wp_template_part", "wp_global_styles", "wp_navigation", "wp_font_family",
  "wp_font_face", "action", "author", "order", "theme", "product", "product_variation", "shop_order", "shop_coupon",
  "shop_order_refund", "auvyx_site_template", "auvyx_form_entry", "auvyx_game", "auvyx_data_source", "type", "types", "fields"]);
export const RESERVED_TAXONOMIES = new Set([
  "category", "post_tag", "nav_menu", "link_category", "post_format", "wp_theme", "wp_template_part_area",
  "wp_pattern_category", "product_cat", "product_tag", "product_type", "product_visibility", "product_shipping_class",
  "attachment", "author", "day", "feed", "hour", "m", "minute", "monthnum", "name", "order", "orderby", "p", "page",
  "paged", "post", "s", "search", "second", "static", "tag", "taxonomy", "term", "terms", "theme", "type", "w", "year"]);
export const RESERVED_FIELDS = new Set(["title", "content", "excerpt", "slug", "status", "date", "author", "id", "type", "thumbnail", "parent", "menu_order"]);

export interface Field {
  key: string;
  label: string;
  kind: string;
  required: boolean;
  help: string;
  options: string[];
  multiple: boolean;
  min?: number;
  max?: number;
  to: string;
  fields: Field[];
}

export interface ContentType {
  key: string;
  label: string;
  singular: string;
  slug: string;
  icon: string;
  public: boolean;
  archive: boolean;
  supports: string[];
  fields: Field[];
}

export interface Taxonomy { key: string; label: string; singular: string; slug: string; hierarchical: boolean; types: string[] }

export interface Definition { types: ContentType[]; taxonomies: Taxonomy[] }

export const DEFAULT_SUPPORTS = ["title", "editor", "thumbnail", "excerpt"];
export const SUPPORTS = ["title", "editor", "thumbnail", "excerpt", "comments", "revisions", "page-attributes"];

export const field = (key: string, label: string, kind = "text", more: Partial<Field> = {}): Field =>
  ({ key, label, kind, required: false, help: "", options: [], multiple: false, to: "", fields: [], ...more });
export const contentType = (key: string, label: string, singular: string, slug: string, more: Partial<ContentType> = {}): ContentType =>
  ({ key, label, singular, slug, icon: "", public: true, archive: true, supports: [...DEFAULT_SUPPORTS], fields: [], ...more });

export const emptyDefinition: Definition = { types: [], taxonomies: [] };
export const typeOf = (d: Definition, key: string): ContentType | undefined => d.types.find((t) => t.key === key);

const distinct = <A>(xs: A[]): A[] => [...new Set(xs)];

// ---- reading and checking a definition ------------------------------------------------------

export type Validated = { ok: true; value: Definition } | { ok: false; errors: string[] };

/**
 * A definition from JSON, checked. Errors name where they are (`types[1].fields[0].key: reserved`), in order; a
 * definition with any error is refused whole.
 */
export function validate(json: unknown): Validated {
  const errors: string[] = [];
  const err = (path: string, what: string) => errors.push(`${path}: ${what}`);
  type O = Record<string, unknown>;
  const str = (o: O, k: string) => (typeof o[k] === "string" ? javaTrim(o[k] as string) : "");
  const bool = (o: O, k: string, d: boolean) => (o[k] === true ? true : o[k] === false ? false : d);
  const num = (o: O, k: string) => (typeof o[k] === "number" && Number.isFinite(o[k]) ? (o[k] as number) : undefined);
  const arr = (o: O, k: string): unknown[] => (Array.isArray(o[k]) ? (o[k] as unknown[]) : []);
  const label = (o: O, k: string, path: string, fallback: string) => {
    const l = str(o, k);
    if (l.length > 80) err(`${path}.${k}`, "longer than 80 characters");
    return l === "" ? fallback : l;
  };

  const readField = (v: unknown, path: string, nested: boolean): Field | undefined => {
    if (!isRecord(v)) { err(path, "not an object"); return undefined; }
    const o = v;
    const key = str(o, "key");
    const kind = str(o, "type") || "text";
    if (!FIELD_KEY.test(key)) err(`${path}.key`, "lower-case letters, digits and _ (start with a letter, at most 40)");
    else if (RESERVED_FIELDS.has(key)) err(`${path}.key`, "reserved");
    if (!KINDS.some(([k]) => k === kind)) err(`${path}.type`, `unknown type "${kind}"`);
    if (nested && kind === "repeater") err(`${path}.type`, "rows cannot hold rows");
    const options = distinct(arr(o, "options").flatMap((s) => (typeof s === "string" && javaTrim(s) !== "" ? [javaTrim(s).slice(0, 120)] : [])));
    if (kind === "select" && options.length === 0) err(`${path}.options`, "a choice needs options");
    if (options.length > MAX_OPTIONS) err(`${path}.options`, `more than ${MAX_OPTIONS}`);
    const to = str(o, "to");
    if (kind === "relation" && !TYPE_KEY.test(to)) err(`${path}.to`, "names the content type it links to");
    const min = num(o, "min"), max = num(o, "max");
    if (min !== undefined && max !== undefined && min > max) err(`${path}.min`, "greater than max");
    const subs = arr(o, "fields");
    if (kind === "repeater" && subs.length === 0) err(`${path}.fields`, "rows need fields");
    if (subs.length > MAX_SUB_FIELDS) err(`${path}.fields`, `more than ${MAX_SUB_FIELDS}`);
    const children = kind === "repeater" ? subs.flatMap((s, i) => readField(s, `${path}.fields[${i}]`, true) ?? []) : [];
    if (distinct(children.map((c) => c.key)).length !== children.length) err(`${path}.fields`, "two fields with the same key");
    const help = str(o, "help");
    if (help.length > 300) err(`${path}.help`, "longer than 300 characters");
    const numeric = kind === "number" || kind === "money";
    return {
      key, label: label(o, "label", path, key), kind, required: bool(o, "required", false), help,
      options: kind === "select" ? options : [],
      multiple: (kind === "select" || kind === "relation") && bool(o, "multiple", false),
      ...(numeric && min !== undefined ? { min } : {}),
      ...(numeric && max !== undefined ? { max } : {}),
      to: kind === "relation" ? to : "",
      fields: children,
    };
  };

  if (!isRecord(json)) return { ok: false, errors: ["definition: not an object"] };
  const o = json;
  const rawTypes = arr(o, "types");
  const rawTaxes = arr(o, "taxonomies");
  if (rawTypes.length > MAX_TYPES) err("types", `more than ${MAX_TYPES}`);
  if (rawTaxes.length > MAX_TAXONOMIES) err("taxonomies", `more than ${MAX_TAXONOMIES}`);
  const types = rawTypes.flatMap((v, i): ContentType[] => {
    const path = `types[${i}]`;
    if (!isRecord(v)) { err(path, "not an object"); return []; }
    const t = v;
    const key = str(t, "key");
    if (!TYPE_KEY.test(key)) err(`${path}.key`, "lower-case letters, digits and _ (start with a letter, at most 20)");
    else if (RESERVED_TYPES.has(key)) err(`${path}.key`, "reserved");
    const slug = str(t, "slug") || key.replace(/_/g, "-");
    if (!SLUG.test(slug)) err(`${path}.slug`, "lower-case letters, digits and - (at most 40)");
    const supports = distinct(arr(t, "supports").filter((s): s is string => typeof s === "string"));
    supports.filter((s) => !SUPPORTS.includes(s)).forEach((s) => err(`${path}.supports`, `unknown "${s}"`));
    const rawFields = arr(t, "fields");
    if (rawFields.length > MAX_FIELDS) err(`${path}.fields`, `more than ${MAX_FIELDS}`);
    const fields = rawFields.flatMap((f, j) => readField(f, `${path}.fields[${j}]`, false) ?? []);
    if (distinct(fields.map((f) => f.key)).length !== fields.length) err(`${path}.fields`, "two fields with the same key");
    const icon = str(t, "icon");
    if (icon !== "" && !/^[a-z0-9-]{1,40}$/.test(icon)) err(`${path}.icon`, "an icon name");
    const name = label(t, "label", path, key);
    return [{
      key, label: name, singular: label(t, "singular", path, name), slug, icon, public: bool(t, "public", true), archive: bool(t, "archive", true),
      supports: Object.hasOwn(t, "supports") ? supports.filter((s) => SUPPORTS.includes(s)) : [...DEFAULT_SUPPORTS], fields,
    }];
  });
  if (distinct(types.map((t) => t.key)).length !== types.length) err("types", "two types with the same key");
  if (distinct(types.map((t) => t.slug)).length !== types.length) err("types", "two types with the same slug");
  const typeKeys = new Set(types.map((t) => t.key));
  const builtIn = new Set(["post", "page", "product"]);
  types.forEach((t, i) => {
    [...t.fields, ...t.fields.flatMap((f) => f.fields)].filter((f) => f.kind === "relation").forEach((f) => {
      if (f.to !== "" && !typeKeys.has(f.to) && !builtIn.has(f.to)) err(`types[${i}].fields.${f.key}.to`, `no content type "${f.to}"`);
    });
  });
  const taxonomies = rawTaxes.flatMap((v, i): Taxonomy[] => {
    const path = `taxonomies[${i}]`;
    if (!isRecord(v)) { err(path, "not an object"); return []; }
    const t = v;
    const key = str(t, "key");
    if (!TAX_KEY.test(key)) err(`${path}.key`, "lower-case letters, digits and _ (start with a letter, at most 32)");
    else if (RESERVED_TAXONOMIES.has(key) || RESERVED_TYPES.has(key)) err(`${path}.key`, "reserved");
    const slug = str(t, "slug") || key.replace(/_/g, "-");
    if (!SLUG.test(slug)) err(`${path}.slug`, "lower-case letters, digits and - (at most 40)");
    const on = distinct(arr(t, "types").filter((s): s is string => typeof s === "string").map(javaTrim));
    on.filter((k) => !typeKeys.has(k) && !builtIn.has(k)).forEach((k) => err(`${path}.types`, `no content type "${k}"`));
    const name = label(t, "label", path, key);
    return [{ key, label: name, singular: label(t, "singular", path, name), slug, hierarchical: bool(t, "hierarchical", true), types: on }];
  });
  if (distinct(taxonomies.map((t) => t.key)).length !== taxonomies.length) err("taxonomies", "two taxonomies with the same key");
  taxonomies.map((t) => t.key).filter((k) => typeKeys.has(k)).forEach((k) => err("taxonomies", `"${k}" is also a content type`));
  if (distinct([...types.map((t) => t.slug), ...taxonomies.map((t) => t.slug)]).length !== types.length + taxonomies.length) err("taxonomies", "a slug is used twice");
  return errors.length ? { ok: false, errors } : { ok: true, value: { types, taxonomies } };
}

export function parse(text: string): Validated {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return { ok: false, errors: ["definition: not JSON"] }; }
  return validate(v);
}

// ---- writing a definition -------------------------------------------------------------------

export function fieldJson(f: Field): Record<string, unknown> {
  const o: Record<string, unknown> = { key: f.key, label: f.label, type: f.kind };
  if (f.required) o.required = true;
  if (f.help) o.help = f.help;
  if (f.options.length) o.options = [...f.options];
  if (f.multiple) o.multiple = true;
  if (f.min !== undefined) o.min = f.min;
  if (f.max !== undefined) o.max = f.max;
  if (f.to) o.to = f.to;
  if (f.fields.length) o.fields = f.fields.map(fieldJson);
  return o;
}

export function toJson(d: Definition): Record<string, unknown> {
  return {
    schema: SCHEMA,
    types: d.types.map((t) => {
      const o: Record<string, unknown> = { key: t.key, label: t.label, singular: t.singular, slug: t.slug };
      if (t.icon) o.icon = t.icon;
      o.public = t.public;
      o.archive = t.archive;
      o.supports = [...t.supports];
      o.fields = t.fields.map(fieldJson);
      return o;
    }),
    taxonomies: d.taxonomies.map((t) => ({ key: t.key, label: t.label, singular: t.singular, slug: t.slug, hierarchical: t.hierarchical, types: [...t.types] })),
  };
}

/** Adds or replaces types and taxonomies by key: what is not named stays. */
export function merge(base: Definition, patch: Definition): Definition {
  const upsert = <A extends { key: string }>(xs: A[], ys: A[]) =>
    ys.reduce((acc, y) => {
      const i = acc.findIndex((x) => x.key === y.key);
      return i < 0 ? [...acc, y] : acc.map((x, j) => (j === i ? y : x));
    }, xs);
  return { types: upsert(base.types, patch.types), taxonomies: upsert(base.taxonomies, patch.taxonomies) };
}

// ---- values -----------------------------------------------------------------------------------

const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,253}\.[^\s@<>"']{2,}$/;
const PHONE = /^[0-9+()\-.\s]{3,30}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const MOMENT = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const HEX = /^#[0-9a-f]{6}$/;
const LINK = /^(https?:\/\/[^\s<>"']{1,2000}|\/[^\s<>"']{0,2000})$/;

const validDay = (s: string) => {
  if (!DAY.test(s)) return false;
  const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1]!;
};

/** Text without control characters (newlines kept for long text), trimmed. */
const clean = (s: string, long: boolean) =>
  javaTrim([...s].filter((c) => c >= " " || (long && (c === "\n" || c === "\t"))).join("").replace(/\r/g, ""));

const whole = (n: number) => n === Math.round(n) && Math.abs(n) < 1e15;

const asText = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" ? (whole(v) ? String(Math.trunc(v)) : String(v)) : v === true ? "1" : v === false ? "0" : undefined;

const asNumber = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d{1,15}(\.\d{1,6})?$/.test(javaTrim(v))) return Number(javaTrim(v));
  return undefined;
};

const asId = (v: unknown): number | undefined => {
  if (typeof v === "number" && v === Math.round(v) && v > 0 && v < 1e15) return v;
  if (typeof v === "string" && /^[1-9][0-9]{0,14}$/.test(javaTrim(v))) return Number(javaTrim(v));
  return undefined;
};

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === null || v === undefined ? [] : [v]);

/** Scala's math.round: half up. */
const round = (n: number) => Math.floor(n + 0.5);

export type Sanitized = { ok: true; value: unknown | undefined } | { ok: false; error: string };
const kept = (value: unknown): Sanitized => ({ ok: true, value });
const refused = (error: string): Sanitized => ({ ok: false, error });

/**
 * A value as it is kept: `value: undefined` is "empty" (the host deletes it), an error says why it is refused.
 */
export function sanitize(f: Field, raw: unknown): Sanitized {
  const empty = raw === null || raw === undefined || (typeof raw === "string" && javaTrim(raw) === "") || (Array.isArray(raw) && raw.length === 0);
  if (empty) return f.required ? refused(`${f.label} is required`) : kept(undefined);
  const bad = () => refused(`${f.label}: not a valid ${KINDS.find(([k]) => k === f.kind)?.[1].toLowerCase() ?? f.kind}`);
  const text = (max: number, long: boolean): Sanitized => {
    const t = asText(raw);
    if (t === undefined) return bad();
    const c = clean(t, long);
    if (c === "") return f.required ? refused(`${f.label} is required`) : kept(undefined);
    return c.length > max ? refused(`${f.label}: longer than ${max} characters`) : kept(c);
  };
  const pattern = (p: RegExp, lower = false): Sanitized => {
    const t = asText(raw);
    if (t === undefined) return bad();
    const c = clean(lower ? t.toLowerCase() : t, false);
    return p.test(c) ? kept(c) : bad();
  };
  const bounded = (n: number): Sanitized =>
    f.min !== undefined && n < f.min ? refused(`${f.label}: at least ${show(f.min)}`)
      : f.max !== undefined && n > f.max ? refused(`${f.label}: at most ${show(f.max)}`)
        : kept(n);
  switch (f.kind) {
    case "text": return text(MAX_TEXT, false);
    case "textarea": return text(MAX_LONG, true);
    case "number": { const n = asNumber(raw); return n === undefined ? bad() : bounded(n); }
    case "money": { const n = asNumber(raw); return n === undefined ? bad() : bounded(round(n * 100) / 100); }
    case "date": { const t = asText(raw); const d = t === undefined ? "" : javaTrim(t); return validDay(d) ? kept(d) : bad(); }
    case "time": return pattern(CLOCK);
    case "datetime": { const t = asText(raw); const d = t === undefined ? "" : javaTrim(t); return MOMENT.test(d) && validDay(d.slice(0, 10)) ? kept(d) : bad(); }
    case "email": return pattern(EMAIL, true);
    case "phone": return pattern(PHONE);
    case "url": return pattern(LINK);
    case "color": return pattern(HEX, true);
    case "checkbox":
      if (raw === true || raw === 1 || (typeof raw === "string" && ["1", "yes", "true", "on"].includes(raw))) return kept(true);
      if (raw === false || raw === 0 || (typeof raw === "string" && ["0", "no", "false", "off"].includes(raw))) return f.required ? refused(`${f.label} is required`) : kept(false);
      return bad();
    case "select": {
      const picked = distinct(list(raw).flatMap((x) => asText(x) ?? []).map(javaTrim).filter((p) => p !== ""));
      if (picked.some((p) => !f.options.includes(p))) return bad();
      if (f.multiple) return kept(picked);
      return picked.length === 1 ? kept(picked[0]) : bad();
    }
    case "image": case "file": { const id = asId(raw); return id === undefined ? bad() : kept(id); }
    case "gallery": {
      const ids = list(raw).map(asId);
      if (ids.some((i) => i === undefined)) return bad();
      if (ids.length > MAX_GALLERY) return refused(`${f.label}: more than ${MAX_GALLERY} pictures`);
      return kept(distinct(ids as number[]));
    }
    case "relation": {
      const ids = list(raw).map(asId);
      if (ids.some((i) => i === undefined)) return bad();
      if (f.multiple) return kept(distinct(ids as number[]).slice(0, MAX_ROWS));
      return ids.length === 1 ? kept(ids[0]) : bad();
    }
    case "repeater": {
      const rows = list(raw);
      if (rows.length > MAX_ROWS) return refused(`${f.label}: more than ${MAX_ROWS} rows`);
      const out: Record<string, unknown>[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!isRecord(r)) return refused(`${f.label}, row ${i + 1}: not a row`);
        const row: Record<string, unknown> = {};
        for (const sub of f.fields) {
          const s = sanitize(sub, Object.hasOwn(r, sub.key) ? r[sub.key] : null);
          if (!s.ok) return refused(`${f.label}, row ${i + 1}: ${s.error}`);
          if (s.value !== undefined) row[sub.key] = s.value;
        }
        if (Object.keys(row).length) out.push(row);
      }
      if (!out.length) return f.required ? refused(`${f.label} is required`) : kept(undefined);
      return kept(out);
    }
    default: return bad();
  }
}

/** Every field of an entry; the errors of all fields at once. */
export function sanitizeAll(t: ContentType, values: Record<string, unknown>): { ok: true; value: Record<string, unknown | undefined> } | { ok: false; errors: string[] } {
  const results = t.fields.map((f) => [f.key, sanitize(f, Object.hasOwn(values, f.key) ? values[f.key] : null)] as const);
  const errors = results.flatMap(([, r]) => (r.ok ? [] : [r.error]));
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: Object.fromEntries(results.map(([k, r]) => [k, (r as { value: unknown }).value])) };
}

// ---- what a page shows ------------------------------------------------------------------------

const show = (n: number) => (whole(n) ? String(Math.trunc(n)) : String(n));

/** Groups of three digits with `sep`, two decimals: 1234.5 → "1,234.50". */
export function money(n: number, sep = ",", point = "."): string {
  const cents = round(Math.abs(n) * 100);
  const wholePart = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return `${n < 0 ? "-" : ""}${wholePart}${point}${String(cents % 100).padStart(2, "0")}`;
}

/** How a kept value reads in a text element (ids for pictures, files and links, which a host replaces). */
export function display(f: Field, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (f.kind === "checkbox" && value === true) return "Yes";
  if (f.kind === "checkbox" && value === false) return "No";
  if (f.kind === "money" && typeof value === "number") return money(value);
  if (f.kind === "number" && typeof value === "number") return show(value);
  if (f.kind === "date" && typeof value === "string" && validDay(value)) return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
  if (f.kind === "datetime" && typeof value === "string" && value.length === 16) return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)} ${value.slice(11)}`;
  if (f.kind === "repeater" && Array.isArray(value)) return `${value.length} ${value.length === 1 ? "row" : "rows"}`;
  if (Array.isArray(value)) return value.flatMap((x) => asText(x) ?? []).join(", ");
  return asText(value) ?? "";
}

// ---- what the editor and the agent see ---------------------------------------------------------

export type Shape = "Text" | "Url" | "Image";
export interface DataField { key: string; label: string; group: string; shape: Shape }

/** The binding key of a field: `<type>/<field>`. */
export const bindingKey = (t: ContentType, f: Field) => `${t.key.replace(/_/g, "-")}/${f.key}`;

/** Fields an element can show for entries of a type. */
export const bindings = (t: ContentType): DataField[] =>
  t.fields.map((f) => ({
    key: bindingKey(t, f), label: f.label, group: t.label,
    shape: f.kind === "image" || f.kind === "gallery" ? "Image" : f.kind === "url" || f.kind === "file" ? "Url" : "Text",
  }));

/** One line per type: what exists and how to bind it. */
export const summary = (d: Definition): string[] => [
  ...d.types.map((t) => {
    const fs = t.fields.map((f) => `${f.key}:${f.kind}${f.required ? "*" : ""}${f.kind === "relation" ? `→${f.to}` : ""}`).join(", ");
    return `${t.key} "${t.label}" /${t.slug}/ fields: ${fs || "none"}`;
  }),
  ...d.taxonomies.map((t) => `taxonomy ${t.key} "${t.label}" on ${t.types.join(", ")}`),
];
