/** Figma-style number scrubbing (the Studio's shared Scrub.scala, itself a port of packages/controls/src/scrub.ts). */
export interface ScrubOptions { step?: number; unit?: string; min?: number }

const NUMERIC = /^(-?\d*\.?\d+)([a-zA-Z%]*)$/;

/** Fixed-point formatting with the Scala's output: at most 0–3 decimals by step, trailing zeros dropped. */
export function formatStep(value: number, step: number): string {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  const scale = 10 ** decimals;
  const scaled = Math.round(value * scale);
  if (scaled === 0) return "0";
  const sign = scaled < 0 ? "-" : "";
  const abs = Math.abs(scaled);
  const whole = Math.floor(abs / scale);
  const frac = decimals === 0 ? "" : String(abs % scale).padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${sign}${whole}.${frac}` : `${sign}${whole}`;
}

const parse = (v: string | undefined | null): [string, string] | null => {
  const m = v == null ? null : NUMERIC.exec(v.trim());
  return m ? [m[1]!, m[2]!] : null;
};

/** New value after `steps` increments. Keeps the unit; starts from the current value, else the fallback, else 0. */
export function scrubValue(current: string | undefined | null, fallback: string | undefined | null, steps: number, options: ScrubOptions = {}): string {
  const step = options.step ?? 1, unit = options.unit ?? "px";
  const parsed = parse(current) ?? parse(fallback);
  const [base, u] = parsed ? [Number(parsed[0]), parsed[1] ? parsed[1] : Number(parsed[0]) === 0 ? unit : ""] : [0, unit];
  const raw = base + steps * step;
  const next = options.min === undefined ? raw : Math.max(options.min, raw);
  return `${formatStep(next, step)}${u}`;
}
