/**
 * What the Scala importers lean on from the JVM, written so the TypeScript reads files the same way: an ordered JSON
 * reader (ujson keeps an object's keys in file order, JavaScript objects move integer keys first), ujson's string form
 * of a value, Java's `split`, `toDoubleOption`, `Double.toString` and the Studio's `Fmt.fixed`.
 */
import { javaTrim } from "../json";

/** A JSON value with objects as ordered maps, as ujson reads them. */
export type JVal = string | number | boolean | null | JVal[] | JObj;
export type JObj = Map<string, JVal>;

export const EMPTY: JObj = new Map();
export const isObj = (v: JVal | undefined): v is JObj => v instanceof Map;

class JsonError extends Error {}

/** JSON → JVal (strict, like ujson.read); throws on anything that is not one JSON value. */
export function readJson(text: string): JVal {
  let i = 0;
  const ws = () => { while (i < text.length && " \t\n\r".includes(text[i]!)) i++; };
  const fail = (): never => { throw new JsonError(`Invalid JSON at ${i}`); };
  const value = (depth: number): JVal => {
    if (depth > 512) fail();
    ws();
    const c = text[i];
    if (c === "{") {
      i++;
      const m: JObj = new Map();
      ws();
      if (text[i] === "}") { i++; return m; }
      for (;;) {
        ws();
        if (text[i] !== "\"") fail();
        const k = string();
        ws();
        if (text[i] !== ":") fail();
        i++;
        m.set(k, value(depth + 1));
        ws();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "}") { i++; return m; }
        fail();
      }
    }
    if (c === "[") {
      i++;
      const a: JVal[] = [];
      ws();
      if (text[i] === "]") { i++; return a; }
      for (;;) {
        a.push(value(depth + 1));
        ws();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "]") { i++; return a; }
        fail();
      }
    }
    if (c === "\"") return string();
    if (text.startsWith("true", i)) { i += 4; return true; }
    if (text.startsWith("false", i)) { i += 5; return false; }
    if (text.startsWith("null", i)) { i += 4; return null; }
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 400));
    if (!m) fail();
    i += m![0].length;
    return Number(m![0]);
  };
  const string = (): string => {
    const start = i;
    i++;
    for (;;) {
      if (i >= text.length) fail();
      const ch = text.charCodeAt(i);
      if (ch === 0x22) break;
      if (ch === 0x5c) i += 2;
      else if (ch < 0x20) fail();
      else i++;
    }
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const v = value(0);
  ws();
  if (i !== text.length) fail();
  return v;
}

/** ujson.Value → a JSON string, keys in their order (for the bare element array a page stores). */
export const writeJson = (v: JVal): string =>
  isObj(v) ? `{${[...v].map(([k, x]) => `${JSON.stringify(k)}:${writeJson(x)}`).join(",")}}`
    : Array.isArray(v) ? `[${v.map(writeJson).join(",")}]` : JSON.stringify(v);

/** Java's Double.toString (shortest digits, scientific below 1e-3 and from 1e7). */
export function javaDouble(d: number): string {
  if (Number.isNaN(d)) return "NaN";
  if (!Number.isFinite(d)) return d > 0 ? "Infinity" : "-Infinity";
  if (d === 0) return Object.is(d, -0) ? "-0.0" : "0.0";
  const a = Math.abs(d);
  if (a >= 1e-3 && a < 1e7) { const s = String(d); return s.includes(".") ? s : `${s}.0`; }
  const [mant, exp] = d.toExponential().split("e") as [string, string];
  return `${mant.includes(".") ? mant : `${mant}.0`}E${Number(exp)}`;
}

/** ElementorImport.str: a string as is, a number as written (whole ones without `.0`), true as "true", else "". */
export const str = (v: JVal | undefined): string =>
  typeof v === "string" ? v
    : typeof v === "number" ? (Number.isFinite(v) && Math.trunc(v) === v ? String(BigInt(v)) : javaDouble(v))
    : v === true ? "true" : "";

export const obj = (v: JVal | undefined): JObj => (isObj(v) ? v : EMPTY);
export const arr = (v: JVal | undefined): JVal[] => (Array.isArray(v) ? v : []);
export const get = (m: JObj, k: string): string => str(m.get(k));

/** Scala's `toDoubleOption` (Java's float grammar: surrounding spaces, an exponent, an f/d suffix, NaN, Infinity). */
export function toDouble(s: string): number | undefined {
  const t = javaTrim(s);
  if (/^[+-]?(NaN|Infinity)$/.test(t)) return Number(t);
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[fFdD]?$/.test(t)) return Number(t.replace(/[fFdD]$/, ""));
  return undefined;
}

/** Fmt.fixed: `decimals` places, half up from the number's shortest decimal form. */
export function fixed(x: number, decimals: number): string {
  if (!Number.isFinite(x)) return javaDouble(x);
  const neg = x < 0 || Object.is(x, -0);
  // the shortest digits as a plain decimal
  let [mant, e] = Math.abs(x).toExponential().split("e") as [string, string];
  const digits = mant.replace(".", "");
  const exp = Number(e);
  let intPart: string, frac: string;
  if (exp >= 0) {
    intPart = digits.length > exp + 1 ? digits.slice(0, exp + 1) : digits.padEnd(exp + 1, "0");
    frac = digits.slice(exp + 1);
  } else {
    intPart = "0";
    frac = "0".repeat(-exp - 1) + digits;
  }
  let keep = intPart + frac.padEnd(decimals, "0").slice(0, decimals);
  const next = frac.length > decimals ? frac.charCodeAt(decimals) - 48 : 0;
  if (next >= 5) keep = (BigInt(keep) + 1n).toString().padStart(keep.length, "0");
  const ip = keep.slice(0, keep.length - decimals) || "0";
  const out = decimals > 0 ? `${ip}.${keep.slice(keep.length - decimals)}` : ip;
  return neg ? `-${out}` : out;
}

/** Java's String.split(regex): no match → the whole string; trailing empty strings dropped. */
export function split(s: string, re: RegExp): string[] {
  const parts = s.split(re);
  if (parts.length === 1) return parts;
  while (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/** Scala's `capitalize`. */
export const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Scala's `toIntOption` (no spaces, fits an Int). */
export const toInt = (s: string): number | undefined => {
  if (!/^[+-]?\d+$/.test(s)) return undefined;
  const n = Number(s);
  return n >= -2147483648 && n <= 2147483647 ? n : undefined;
};

/** Scala's `toLongOption`. */
export const toLong = (s: string): bigint | undefined => {
  if (!/^[+-]?\d+$/.test(s)) return undefined;
  const n = BigInt(s);
  return n >= -(2n ** 63n) && n < 2n ** 63n ? n : undefined;
};

/** Scala's `distinct`. */
export const distinct = <A>(xs: readonly A[]): A[] => [...new Set(xs)];

/** Java regex whitespace inside a character class. */
export const WSC = " \\t\\n\\x0B\\f\\r";
