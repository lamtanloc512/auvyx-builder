/**
 * Argument parsers for capability methods: what arrives from the other side is `unknown` and each method says what it
 * accepts. A parser returns the value or throws a PlayError("bad-args").
 */
import { PlayError } from "./protocol";

export type Parser<A> = (value: unknown, path?: string) => A;

const bad = (path: string, expected: string): never => {
  throw new PlayError({ code: "bad-args", message: `${path || "args"}: expected ${expected}` });
};

export const string =
  ({ max = 1000, pattern }: { readonly max?: number; readonly pattern?: RegExp } = {}): Parser<string> =>
  (v, path = "") =>
    typeof v === "string" && v.length <= max && (!pattern || pattern.test(v)) ? v : bad(path, `a string${pattern ? ` matching ${pattern}` : ""} of at most ${max} characters`);

export const number =
  ({ min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY }: { readonly min?: number; readonly max?: number } = {}): Parser<number> =>
  (v, path = "") =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : bad(path, `a number from ${min} to ${max}`);

export const boolean: Parser<boolean> = (v, path = "") => (typeof v === "boolean" ? v : bad(path, "true or false"));

export const literal =
  <const T extends string>(...options: readonly T[]): Parser<T> =>
  (v, path = "") =>
    options.find((o) => o === v) ?? bad(path, options.join(" | "));

export const optional =
  <A>(inner: Parser<A>): Parser<A | undefined> =>
  (v, path) =>
    v === undefined ? undefined : inner(v, path);

export const object =
  <S extends Record<string, Parser<unknown>>>(shape: S): Parser<{ readonly [K in keyof S]: ReturnType<S[K]> }> =>
  (v, path = "") => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return bad(path, "an object");
    const record: Record<string, unknown> = { ...v };
    const out: Record<string, unknown> = {};
    for (const [key, parse] of Object.entries(shape)) out[key] = parse(record[key], path ? `${path}.${key}` : key);
    // Every key was produced by its own parser above.
    return out as { readonly [K in keyof S]: ReturnType<S[K]> };
  };

/** No arguments (anything sent is ignored). */
export const none: Parser<undefined> = () => undefined;

/** Plain JSON data no larger than `maxBytes` once written out (what storage keeps, what inspect returns). */
export const json =
  ({ maxBytes }: { readonly maxBytes: number }): Parser<unknown> =>
  (v, path = "") => {
    let text: string | undefined;
    try {
      text = JSON.stringify(v);
    } catch {
      return bad(path, "JSON data");
    }
    if (text === undefined) return bad(path, "JSON data");
    return new TextEncoder().encode(text).length <= maxBytes ? JSON.parse(text) : bad(path, `JSON data of at most ${maxBytes} bytes`);
  };
