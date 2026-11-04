/**
 * Figma "auto layout" ⇄ CSS. Pure mapping, unit-tested; the UI is in auto-layout.tsx.
 */
export type LayoutMode = "block" | "row" | "column" | "grid" | "none";

type Resolve = (property: string) => string | undefined;
type Patch = Record<string, string | undefined>;

export const layoutMode = (resolve: Resolve): LayoutMode | undefined => {
  const display = resolve("display");
  if (display === undefined) return undefined;
  if (display === "flex" || display === "inline-flex") {
    return (resolve("flex-direction") ?? "row").startsWith("column") ? "column" : "row";
  }
  if (display === "grid" || display === "inline-grid") return "grid";
  if (display === "none") return "none";
  return "block";
};

export const modePatch = (mode: LayoutMode | undefined): Patch => {
  switch (mode) {
    case "row":
      return { display: "flex", "flex-direction": "row" };
    case "column":
      return { display: "flex", "flex-direction": "column" };
    case "grid":
      return { display: "grid", "flex-direction": undefined, "flex-wrap": undefined };
    case "block":
      return { display: "block", "flex-direction": undefined, "flex-wrap": undefined };
    case "none":
      return { display: "none" };
    case undefined:
      return { display: undefined, "flex-direction": undefined };
  }
};

type Cell = 0 | 1 | 2;

const POSITION: Record<string, Cell> = {
  "flex-start": 0,
  start: 0,
  left: 0,
  top: 0,
  center: 1,
  "flex-end": 2,
  end: 2,
  right: 2,
  bottom: 2,
};
const FLEX = ["flex-start", "center", "flex-end"] as const;
const GRID = ["start", "center", "end"] as const;

/** Which CSS properties drive the matrix's x (horizontal) and y (vertical) axes. */
const axes = (mode: LayoutMode): { x: string; y: string; values: readonly string[] } | undefined => {
  if (mode === "row") return { x: "justify-content", y: "align-items", values: FLEX };
  if (mode === "column") return { x: "align-items", y: "justify-content", values: FLEX };
  if (mode === "grid") return { x: "justify-items", y: "align-items", values: GRID };
  return undefined;
};

export const matrixValue = (mode: LayoutMode | undefined, resolve: Resolve): { x?: Cell; y?: Cell } => {
  const a = mode === undefined ? undefined : axes(mode);
  if (a === undefined) return {};
  // Unset justify-content behaves like flex-start; unset align-items is stretch (no cell).
  const value = (property: string) => {
    const raw = resolve(property);
    return raw === undefined && property === "justify-content" ? 0 : POSITION[raw ?? ""];
  };
  return { x: value(a.x), y: value(a.y) };
};

export const matrixPatch = (mode: LayoutMode, x: Cell, y: Cell): Patch => {
  const a = axes(mode);
  return a === undefined ? {} : { [a.x]: a.values[x], [a.y]: a.values[y] };
};

/** "repeat(3, minmax(0, 1fr))" ⇄ 3. Other templates are left as-is. */
export const columnCount = (template: string | undefined): string | undefined => {
  if (template === undefined) return undefined;
  const match = /^repeat\(\s*(\d+)\s*,/.exec(template);
  return match ? match[1] : template;
};

export const columnTemplate = (value: string | undefined): string | undefined =>
  value !== undefined && /^\d+$/.test(value) ? `repeat(${Math.max(1, Number(value))}, minmax(0, 1fr))` : value;
