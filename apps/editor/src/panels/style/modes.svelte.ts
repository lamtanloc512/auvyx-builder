/** Layout modes of the selected element (StylePanel.modeSignals / pickMode). */
import { layoutMode, update, type LayoutMode } from "@auvyx/editor-core";
import { resolveValue } from "@auvyx/style-engine";
import { store } from "../../lib/store.svelte";
import { bps, fieldOf } from "./state.svelte";
import { isFrame, leaveFree, setStyles, toFree } from "./free";

const v = (p: string) => { const f = fieldOf(p); return f.own ?? f.inherited; };

/** The mode the element shows (set here or inherited). */
export function resolvedMode(): LayoutMode | undefined {
  return layoutMode(v("display"), v("flex-direction"), v("position"));
}

/** The mode set on this breakpoint/state. */
export function ownMode(): LayoutMode | undefined {
  const d = fieldOf("display");
  return d.own === undefined ? undefined : layoutMode(d.own, v("flex-direction"), v("position"));
}

export function pickMode(m: LayoutMode) {
  const id = store.selected;
  if (!id) return;
  if (m === "Free") { toFree(id); return; }
  // Leaving free layout: children go back into the flow, the frame loses its fixed height.
  const leaving = isFrame(id);
  const patch: [string, string | undefined][] =
    m === "Block" ? [["display", "block"], ["flex-direction", undefined]]
    : m === "Row" ? [["display", "flex"], ["flex-direction", "row"]]
    : m === "Column" ? [["display", "flex"], ["flex-direction", "column"]]
    : m === "Grid" ? [["display", "grid"], ["flex-direction", undefined]]
    : [["display", "none"]];
  // keep `position: absolute` when the frame itself is placed in a free frame
  const n = store.doc.nodes[id];
  const placed = !!n && resolveValue(n.styles, bps(), store.breakpoint, "default", "position")?.value === "absolute";
  const frame: [string, string | undefined][] = leaving ? [...patch, ["height", undefined], ...(placed ? [] : [["position", undefined] as [string, undefined]])] : patch;
  const bp = store.breakpoint, st = store.styleState;
  let d = update(store.doc, id, (x) => ({ ...x, styles: setStyles(x.styles, bp, st, frame) }));
  if (leaving) d = leaveFree(id, d);
  store.commit(d);
}
