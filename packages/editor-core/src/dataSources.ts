/**
 * The site's data sources (REST, GraphQL), as the Scala `DataSources` has them (docs/ai-full-power.md, layer 4): what a
 * source may be (validate), how an answer becomes items, the fields a source offers elements, and the JSON the platform
 * keeps. Checked against shared/fixtures/data-sources/cases.json, which the Studio and DataSources.php also run.
 */
import type { DataField, Shape } from "./settings";

export interface Spec {
  name: string; label: string; url: string; method: string; headers: [string, string][]; body: string; list: string;
  fields: [string, string][]; ttl: number; public: boolean;
}
export const PREFIX = "data/";
export const MAX_FIELDS = 30, MAX_ITEMS = 50, MAX_BODY = 20000, MAX_TTL = 86400, MIN_PUBLIC_TTL = 60;
const NAME = /^[a-z0-9_]{1,40}$/;
const HEADER_NAME = /^[A-Za-z0-9-]{1,60}$/;
const PATH = /^[A-Za-z0-9_$@:-]+(\.[A-Za-z0-9_$@:-]+)*$/;

export const spec = (s: Partial<Spec> & Pick<Spec, "name" | "url">): Spec =>
  ({ label: "", method: "GET", headers: [], body: "", list: "", fields: [], ttl: 300, public: false, ...s });
/** DataSources.sourceKey */
export const sourceKey = (name: string) => PREFIX + name;
/** DataSources.fieldKey */
export const fieldKey = (name: string) => PREFIX + name;

/** DataSources.validate: the spec as kept (method upper-cased, label defaulted), or why not. */
export function validate(s: Spec): { ok: Spec } | { error: string } {
  const method = s.method.toUpperCase();
  if (!NAME.test(s.name)) return { error: "A name is 1 to 40 lowercase letters, digits or _" };
  if (!/^https?:\/\/[^\s"'<>]{3,2000}$/i.test(s.url)) return { error: "The address starts with https:// (or http://)" };
  if (method !== "GET" && method !== "POST") return { error: "GET or POST" };
  if (s.headers.length > 20 || s.headers.some(([k, v]) => !HEADER_NAME.test(k) || v.includes("\r") || v.includes("\n") || v.length > 4000)) return { error: "A header is a name and one line" };
  if (s.body.length > MAX_BODY) return { error: `A body is at most ${MAX_BODY} characters` };
  if (s.body !== "" && method === "GET") return { error: "Only a POST sends a body" };
  if (s.list !== "" && !PATH.test(s.list)) return { error: "The list path is names and indexes joined by dots (data.items)" };
  if (s.fields.length === 0 || s.fields.length > MAX_FIELDS) return { error: `Name 1 to ${MAX_FIELDS} fields` };
  if (s.fields.some(([k, p]) => !NAME.test(k) || !PATH.test(p))) return { error: "A field is a name (lowercase, digits, _) and a path (price.amount)" };
  if (s.ttl < 0 || s.ttl > MAX_TTL) return { error: `Keep an answer 0 to ${MAX_TTL} seconds` };
  if (s.public && s.ttl < MIN_PUBLIC_TTL) return { error: `A public source keeps its answer at least ${MIN_PUBLIC_TTL} seconds` };
  return { ok: { ...s, method, label: s.label.trim().slice(0, 80) || s.name } };
}

/** DataSources.at */
export function at(json: unknown, path: string): unknown {
  if (path === "") return json;
  let cur: unknown = json;
  for (const step of path.split(".")) {
    if (cur === undefined) return undefined;
    if (Array.isArray(cur)) { const i = /^-?\d+$/.test(step) ? Number(step) : NaN; cur = i >= 0 && i < cur.length ? cur[i] : undefined; }
    else if (cur !== null && typeof cur === "object") cur = Object.hasOwn(cur, step) ? (cur as Record<string, unknown>)[step] : undefined;
    else return undefined;
  }
  return cur;
}
/** DataSources.text */
export function text(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isInteger(v) && Math.abs(v) < 1e15 ? String(v) : String(v);
  if (typeof v === "boolean") return String(v);
  return undefined;
}
/** DataSources.items */
export function items(answer: unknown, s: Spec, limit = MAX_ITEMS): Record<string, string>[] {
  const found = at(answer, s.list);
  const rows = Array.isArray(found) ? found : found && typeof found === "object" && Object.keys(found).length ? [found] : [];
  return rows.slice(0, Math.max(0, Math.min(limit, MAX_ITEMS))).map((row) =>
    Object.fromEntries(s.fields.flatMap(([name, path]) => { const t = text(at(row, path)); return t === undefined ? [] : [[fieldKey(name), t.slice(0, 5000)]]; })));
}
/** DataSources.parse */
export function parse(answer: string, s: Spec, limit = MAX_ITEMS): { items: Record<string, string>[] } | { error: string } {
  let json: unknown;
  try { json = JSON.parse(answer); } catch { return { error: "The answer is not JSON" }; }
  if (json && typeof json === "object" && !Array.isArray(json) && Object.hasOwn(json, "errors")) {
    const data = (json as Record<string, unknown>).data;
    const has = data === null || data === undefined ? false : Array.isArray(data) ? data.length > 0 : typeof data === "object" ? Object.keys(data).length > 0
      : typeof data === "boolean" ? data : typeof data === "string" ? data !== "" && data !== "0" : typeof data === "number" ? data !== 0 : false;
    if (!has) return { error: "The endpoint answered with errors: " + JSON.stringify((json as Record<string, unknown>).errors).slice(0, 300) };
  }
  return { items: items(json, s, limit) };
}
/** DataSources.guessShape */
export const guessShape = (name: string): Shape =>
  /image|photo|picture|thumbnail|avatar|logo|icon/.test(name) ? "Image" : /url|link|href/.test(name) ? "Url" : "Text";
/** DataSources.fields: the fields sources offer elements, as DataFields (group "Data: <label>"). */
export function fields(specs: readonly Spec[]): DataField[] {
  const seen = new Set<string>();
  return specs.flatMap((s) => s.fields.map(([f]) => ({ key: fieldKey(f), label: f.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), group: `Data: ${s.label}`, shape: guessShape(f) })))
    .filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)));
}
/** DataSources.toJson */
export const toJson = (s: Spec, withHeaderValues: boolean) => ({
  name: s.name, label: s.label, url: s.url, method: s.method, headers: Object.fromEntries(s.headers.map(([k, v]) => [k, withHeaderValues ? v : ""])),
  body: s.body, list: s.list, fields: Object.fromEntries(s.fields), ttl: s.ttl, public: s.public,
});
/** DataSources.fromJson */
export function fromJson(j: unknown): Spec | undefined {
  if (!j || typeof j !== "object" || Array.isArray(j)) return undefined;
  const o = j as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  const strings = (k: string): [string, string][] => {
    const m = o[k];
    return m && typeof m === "object" && !Array.isArray(m) ? Object.entries(m).flatMap(([a, v]) => (typeof v === "string" ? [[a, v] as [string, string]] : [])) : [];
  };
  return { name: str("name"), label: str("label"), url: str("url"), method: str("method") || "GET", headers: strings("headers"), body: str("body"), list: str("list"),
    fields: strings("fields"), ttl: typeof o.ttl === "number" ? Math.trunc(o.ttl) : 300, public: o.public === true };
}
