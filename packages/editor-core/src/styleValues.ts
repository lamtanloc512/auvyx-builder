/** Small value rules of the Style panel (U/StylePanel.scala), kept pure so they are tested. */

/** "3" → `repeat(3, minmax(0, 1fr))`; anything else as typed (trimmed). */
export function normalizeColumns(v: string): string {
  const t = v.trim();
  const n = /^[+-]?\d+$/.test(t) ? Number(t) : NaN;
  return Number.isInteger(n) && n > 0 ? `repeat(${n}, minmax(0, 1fr))` : t;
}

/** Computed values with px decimals rounded ("12.5px" → "13px", as the Studio's `computed`). */
export const roundPx = (v: string): string => v.replace(/(-?\d+\.\d+)px/g, (_, n: string) => `${Math.round(Number(n))}px`);

/** Opacity 0–1 shown as a whole percentage. */
export function opacityPercent(v: string | undefined): string | undefined {
  if (v === undefined || v.trim() === "" || isNaN(Number(v))) return undefined;
  return String(Math.round(Number(v) * 100));
}

/** What typing "80" or "80%" stores: 0–1 ("1" for 100). Blank clears; not a number: undefined with `valid` false. */
export function parseOpacity(typed: string): { valid: boolean; value?: string } {
  if (typed.trim() === "") return { valid: true, value: undefined };
  const t = typed.replace(/%$/, "").trim();
  if (t === "" || isNaN(Number(t))) return { valid: false };
  const x = Math.max(0, Math.min(100, Number(t))) / 100;
  return { valid: true, value: x === 1 ? "1" : String(x) };
}

export type SizeMode = "Auto" | "Hug" | "Fill" | "Fixed";
/** Figma's sizing mode of a width/height value. */
export function sizeMode(v: string | undefined): SizeMode {
  if (v === undefined) return "Auto";
  if (v === "100%") return "Fill";
  if (v === "fit-content" || v === "max-content" || v === "min-content") return "Hug";
  return "Fixed";
}

/** The spacing-scale step all `values` share ("0", "XS"…), or null when they differ or match none. */
export function scaleStep(values: (string | undefined)[], steps: readonly [string, string][]): string | null {
  const distinct = [...new Set(values)];
  if (distinct.length !== 1 || distinct[0] === undefined) return null;
  const v = distinct[0];
  return /^0(\.0+)?(px|rem|em)?$/.test(v.trim()) ? "0" : steps.find(([, s]) => s === v)?.[0] ?? null;
}

/** Layout mode of an element from display, flex-direction and position (StylePanel.mode). */
export type LayoutMode = "Free" | "Block" | "Row" | "Column" | "Grid" | "Hidden";
export function layoutMode(display: string | undefined, direction: string | undefined, position?: string): LayoutMode | undefined {
  if (display === undefined) return undefined;
  if (display === "flex" || display === "inline-flex") return direction?.startsWith("column") ? "Column" : "Row";
  if (display === "grid" || display === "inline-grid") return "Grid";
  if (display === "none") return "Hidden";
  if (display === "block" && (position === "relative" || position === "absolute")) return "Free";
  return "Block";
}

/** The column count of `repeat(N, …)`, as text. */
export const repeatColumns = (v: string | undefined): string | undefined => (v ? /^repeat\((\d+),.*/.exec(v)?.[1] : undefined);
