/**
 * Small string helpers that behave like the JVM/Scala.js ones the Scala core uses, so text written by editor-core is
 * byte for byte what Auvyx Studio writes. JavaScript's own versions differ at the edges (Unicode spaces, lone surrogates).
 */
import type { Styles } from "@auvyx/style-engine";

const HEX = "0123456789abcdef";

/**
 * A JSON string literal like the Scala `Json.string` and ujson.write: quotes, backslashes and C0 controls escaped,
 * everything else as is. Unlike JSON.stringify, a lone surrogate is kept, not written as `\udxxx`.
 */
export const jsonString = (value: string): string => {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += "\\\\";
    else if (c === 0x08) out += "\\b";
    else if (c === 0x0c) out += "\\f";
    else if (c === 0x0a) out += "\\n";
    else if (c === 0x0d) out += "\\r";
    else if (c === 0x09) out += "\\t";
    else if (c < 0x20) out += "\\u00" + HEX[c >> 4] + HEX[c & 0xf];
    else out += value[i];
  }
  return out + '"';
};

/** `{"k":"v",…}` of string values, in the map's order. */
export const jsonStrings = (map: Readonly<Record<string, string>>): string =>
  "{" + Object.entries(map).map(([k, v]) => `${jsonString(k)}:${jsonString(v)}`).join(",") + "}";

/** StyleEngine.toJson: normalized styles as JSON (every value a string). */
export const stylesJson = (styles: Styles): string =>
  "{" + Object.entries(styles).map(([bp, states]) =>
    `${jsonString(bp)}:{` + Object.entries(states ?? {}).map(([state, decls]) =>
      `${jsonString(state)}:${jsonStrings(decls ?? {})}`).join(",") + "}").join(",") + "}";

/** Java's String.trim: strips every char up to U+0020 at both ends (String#trim strips Unicode spaces instead). */
export const javaTrim = (s: string): string => s.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, "");

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;

/** Scala's `toIntOption`: an optional sign and decimal digits that fit an Int. */
export const intOption = (s: string): number | undefined => {
  if (!/^[+-]?[0-9]+$/.test(s)) return undefined;
  const n = Number(s);
  return n >= INT_MIN && n <= INT_MAX ? n : undefined;
};

/** Scala.js Double.toInt on whatever JSON gave: coerced to a number, saturated at the Int range, NaN → 0. */
export const toInt = (v: unknown): number => {
  const x = v as number;
  return x > INT_MAX ? INT_MAX : x < INT_MIN ? INT_MIN : (x as unknown as number) | 0;
};

/** Scala's Double.isWhole. */
export const isWhole = (n: number): boolean => Number.isFinite(n) && Math.trunc(n) === n;

/** Java's Character.isWhitespace. */
export const isJavaWhitespace = (c: string): boolean =>
  /[\t\n\x0B\f\r\x1C-\x1F \u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]/.test(c);

/** Java regex whitespace (`\s` without UNICODE_CHARACTER_CLASS) and `.` (any char but a line terminator). */
export const WS = "[ \\t\\n\\x0B\\f\\r]";
export const NOT_WS = "[^ \\t\\n\\x0B\\f\\r]";
export const DOT = "[^\\n\\r\\u0085\\u2028\\u2029]";

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
