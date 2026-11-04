/**
 * One style value of the selected element at (screen, state), as the panel shows it (the Scala `Overrides.field`):
 * set here (`own`), else inherited from the next wider screen, or, for a pseudo state, from Normal.
 */
import { getStyle } from "@auvyx/editor-core";
import { resolveValue, sortBreakpoints, type Breakpoint, type StateId } from "@auvyx/style-engine";
import { store } from "../../lib/store.svelte";
import { screens } from "../../lib/screens.svelte";

export function styleValue(prop: string): { value: string; own: boolean } {
  const n = store.node;
  if (!n) return { value: "", own: false };
  const bp = store.breakpoint, st = store.styleState;
  const own = getStyle(n.styles, bp, st, prop);
  if (own !== undefined) return { value: own, own: true };
  const breakpoints = screens.all as Breakpoint[];
  const ordered = sortBreakpoints(breakpoints);
  const i = ordered.findIndex((b) => b.id === bp);
  const wider = i > 0 ? resolveValue(n.styles, breakpoints, ordered[i - 1]!.id, st as StateId, prop) : undefined;
  const inherited = wider ?? (st !== "default" ? resolveValue(n.styles, breakpoints, bp, "default", prop) : undefined);
  return { value: inherited?.value ?? "", own: false };
}

export function setStyle(prop: string, v: string | undefined, coalesce = false) {
  const id = store.selected;
  if (id) store.setStyles(id, [[prop, v?.trim() ? v : undefined]], coalesce ? `panel:${id}:${prop}` : null);
}

export const BOX = "auvyx-field h-8 w-full min-w-0 rounded-md border border-input px-2 text-xs outline-none";
