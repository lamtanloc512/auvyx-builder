import { useDispatch, useSelect } from "@wordpress/data";
import { sortBreakpoints, type Breakpoint } from "@auvyx/style-engine";
import { getDesignSystem } from "./design-system";

/**
 * The active breakpoint IS the editor's device preview (core/editor
 * getDeviceType, WP ≥ 6.5), so the canvas and the style panel never disagree.
 * Desktop-first: sorted breakpoints map to Desktop, Tablet, Mobile.
 *
 * The store is addressed by name (not imported) so wp-editor is not pulled
 * into editors that do not load it (e.g. the widgets editor).
 */
const DEVICES = ["Desktop", "Tablet", "Mobile"] as const;

type EditorSelectors = { getDeviceType?: () => string };
type EditorActions = { setDeviceType?: (device: string) => void };

export const getPanelBreakpoints = (): Breakpoint[] =>
  sortBreakpoints(getDesignSystem().breakpoints).slice(0, DEVICES.length);

export function useActiveBreakpoint(): [string, (id: string) => void] {
  const breakpoints = getPanelBreakpoints();
  const device = useSelect(
    (select) =>
      (select("core/editor") as EditorSelectors | undefined)?.getDeviceType?.() ?? "Desktop",
    []
  );
  const editor = useDispatch("core/editor") as EditorActions | undefined;

  const index = Math.max(0, DEVICES.indexOf(device as (typeof DEVICES)[number]));
  const active = breakpoints[index]?.id ?? breakpoints[0]?.id ?? "base";

  const setActive = (id: string) => {
    const target = DEVICES[breakpoints.findIndex((bp) => bp.id === id)];
    if (target !== undefined) {
      editor?.setDeviceType?.(target);
    }
  };
  return [active, setActive];
}
