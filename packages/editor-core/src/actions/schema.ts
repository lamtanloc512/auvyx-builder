/**
 * A type as the outside sees it (the Scala `actions.Schema`): its JSON Schema (the draft 2020-12 subset tool calling
 * takes: type, properties, required, items, additionalProperties, enum, description, default), and how it reads from
 * JSON. Strict on shape (unknown fields, missing required ones, wrong types are errors with a path), lenient on scalars
 * the way models write them: `2` and `"2"` are the same number, `true` and `"true"` the same flag. Error texts are the
 * Scala core's, word for word (the agent reads them).
 */
import { text, writeJson } from "../elementJson";
import { isRecord, isWhole, javaTrim } from "../json";

export type Json = unknown;
export type JsonObj = Record<string, Json>;
export type Read<A> = { ok: true; value: A } | { ok: false; error: string };

export interface Schema<A> {
  json(): JsonObj;
  /** The schema as an object's property: an optional field is just its value (absence says "not given"). */
  fieldJson(): JsonObj;
  read(v: Json, path: string): Read<A>;
  /** The value when the field is absent or null; undefined means the field is required. */
  absent?: { value: A };
}

const okv = <A>(value: A): Read<A> => ({ ok: true, value });
const at = (path: string) => (path === "" ? "input" : path);
const show = (v: Json) => {
  const s = writeJson(v);
  return s.length > 60 ? s.slice(0, 57) + "..." : s;
};
export const fail = (path: string, expected: string, got: Json): Read<never> => ({ ok: false, error: `${at(path)}: expected ${expected}, got ${show(got)}` });
const child = (path: string, key: string) => (path === "" ? key : `${path}.${key}`);

const simple = <A>(json: JsonObj, read: (v: Json, path: string) => Read<A>): Schema<A> => ({ json: () => ({ ...json }), fieldJson: () => ({ ...json }), read });

/** Scala's `toDoubleOption` on a trimmed string (decimal and exponent forms, optional d/f suffix, Infinity, NaN). */
const toDouble = (s: string): number | undefined => {
  const t = javaTrim(s);
  if (/^[+-]?(NaN|Infinity)$/.test(t)) return Number(t);
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[dDfF]?$/.test(t)) return undefined;
  return parseFloat(t.replace(/[dDfF]$/, ""));
};

// ---- scalars ------------------------------------------------------------------------------

export const string: Schema<string> = simple({ type: "string" }, (v, path) =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? okv(text(v) ?? "") : fail(path, "a string", v));

export const int: Schema<number> = simple({ type: "integer" }, (v, path) => {
  const d = typeof v === "number" ? v : typeof v === "string" ? toDouble(v) : undefined;
  return d !== undefined && isWhole(d) && d >= -2147483648 && d <= 2147483647 ? okv(d) : fail(path, "an integer", v);
});

export const number: Schema<number> = simple({ type: "number" }, (v, path) => {
  if (typeof v === "number") return okv(v);
  if (typeof v === "string") { const d = toDouble(v); return d === undefined ? fail(path, "a number", v) : okv(d); }
  return fail(path, "a number", v);
});

export const boolean: Schema<boolean> = simple({ type: "boolean" }, (v, path) => {
  if (typeof v === "boolean") return okv(v);
  if (typeof v === "string" && javaTrim(v).toLowerCase() === "true") return okv(true);
  if (typeof v === "string" && javaTrim(v).toLowerCase() === "false") return okv(false);
  return fail(path, "true or false", v);
});

/** Any JSON, kept as written. */
export const any: Schema<Json> = simple({}, (v) => okv(v));

export const object: Schema<JsonObj> = simple({ type: "object" }, (v, path) => (isRecord(v) ? okv(v) : fail(path, "an object", v)));

// ---- containers ---------------------------------------------------------------------------

function nullable(s: JsonObj): JsonObj {
  const out = { ...s };
  const t = s.type;
  if (typeof t === "string") out.type = [t, "null"];
  else if (Array.isArray(t) && !t.includes("null")) out.type = [...t, "null"];
  if (Array.isArray(s.enum)) out.enum = [...s.enum, null];
  return out;
}

/** Absent or null. As a field it is optional; inside a list or a map its value may be null (undefined here). */
export const opt = <A>(inner: Schema<A>): Schema<A | undefined> => ({
  json: () => nullable(inner.json()),
  fieldJson: () => inner.fieldJson(),
  read: (v, path) => (v === null || v === undefined ? okv(undefined) : inner.read(v, path)),
  absent: { value: undefined },
});

export const arr = <A>(inner: Schema<A>): Schema<A[]> => simple({ type: "array", items: inner.json() }, (v, path) => {
  if (!Array.isArray(v)) return fail(path, "an array", v);
  const out: A[] = [];
  for (let i = 0; i < v.length; i++) {
    const r = inner.read(v[i], `${at(path)}[${i}]`);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return okv(out);
});

/** A JSON object with free keys, in the order written: its entries. */
export const map = <A>(inner: Schema<A>): Schema<[string, A][]> => simple({ type: "object", additionalProperties: inner.json() }, (v, path) => {
  if (!isRecord(v)) return fail(path, "an object", v);
  const out: [string, A][] = [];
  for (const [k, x] of Object.entries(v)) {
    const r = inner.read(x, child(path, k));
    if (!r.ok) return r;
    out.push([k, r.value]);
  }
  return okv(out);
});

/** `CamelCase` → `camel_case`: how an enum's cases are written in JSON. */
export const snake = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** A closed set of names (an enum's cases), written in snake_case; a name in another case reads as the same one. */
export function cases(names: readonly string[], description = ""): Schema<string> {
  const ids = names.map(snake);
  const json: JsonObj = { type: "string", enum: ids };
  if (description) json.description = description;
  return simple(json, (v, path) => {
    if (typeof v === "string" && ids.includes(snake(javaTrim(v)))) return okv(snake(javaTrim(v)));
    return fail(path, `one of ${ids.join(", ")}`, v);
  });
}

// ---- objects --------------------------------------------------------------------------------

/** One field of an object: its schema, what it means, and its default (which makes it optional). */
export interface Field { schema: Schema<unknown>; desc?: string; default?: { value: unknown; json?: Json } }

export const f = <A>(schema: Schema<A>, desc?: string, dflt?: { value: A; json?: Json }): Field =>
  ({ schema: schema as Schema<unknown>, desc, default: dflt as Field["default"] });

/** A default and how the schema writes it (`json`, omitted for None-like defaults). */
export const dv = <A>(value: A, json?: Json): { value: A; json?: Json } => ({ value, json: json === undefined ? value : json });

/**
 * A case class: fields by name in this order, `desc` for their meaning, defaults make them optional. Reads to a record
 * of the field values (an absent optional field is undefined).
 */
export function obj(fields: [string, Field][], description?: string): Schema<Record<string, unknown>> {
  const names = fields.map(([n]) => n);
  return {
    json() {
      const props: JsonObj = {};
      for (const [name, fd] of fields) {
        const p = { ...fd.schema.fieldJson() };
        if (fd.desc !== undefined) p.description = fd.desc;
        if (fd.default && fd.default.json !== undefined) p.default = fd.default.json;
        props[name] = p;
      }
      const out: JsonObj = { type: "object" };
      if (description !== undefined) out.description = description;
      out.properties = props;
      out.required = fields.filter(([, fd]) => !fd.default && !fd.schema.absent).map(([n]) => n);
      out.additionalProperties = false;
      return out;
    },
    fieldJson() { return this.json(); },
    read(v, path) {
      if (!isRecord(v)) return fail(path, "an object", v);
      const unknown = Object.keys(v).find((k) => !names.includes(k));
      if (unknown !== undefined) return { ok: false, error: `${at(path)}: unknown field "${unknown}" (fields: ${names.join(", ")})` };
      const out: Record<string, unknown> = {};
      for (const [name, fd] of fields) {
        const x = Object.hasOwn(v, name) ? v[name] : undefined;
        if (x !== null && x !== undefined) {
          const r = fd.schema.read(x, child(path, name));
          if (!r.ok) return r;
          out[name] = r.value;
        } else if (fd.default) out[name] = fd.default.value;
        else if (fd.schema.absent) out[name] = fd.schema.absent.value;
        else return { ok: false, error: `${child(path, name)}: required` };
      }
      return okv(out);
    },
  };
}
