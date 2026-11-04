/** Which style cards a block shows, and the order the style panel renders them (the Studio's shared StyleGroups.scala). */
import type { Doc, El, Kind } from "./model";

export const STYLE_PANEL: readonly string[] = ["Presets", "Layout", "Size", "Spacing", "Text", "Background", "Border", "Corner", "Shadow", "Opacity"];

/** "layout" gates the Size card. "space" gates Spacing. Container Layout is not a gate: it shows for containers only. */
export const STYLE_GROUPS_BY_KIND: Partial<Record<Kind, readonly string[]>> = {
  Heading: ["typography", "space", "appearance", "layout"],
  Text: ["typography", "space", "appearance", "layout"],
  Snippet: ["typography", "space", "appearance", "layout"],
  Accordion: ["typography", "space", "appearance"],
  Button: ["typography", "fill", "stroke", "appearance", "space", "effects", "layout"],
  Image: ["layout", "appearance", "effects", "space"],
  Video: ["layout", "appearance", "effects"],
  Icon: ["layout", "color", "appearance"],
  Divider: ["stroke", "space", "appearance"],
  Section: ["layout", "space", "fill", "stroke", "appearance", "effects"],
  Nav: ["layout", "typography", "space"],
  Loop: ["layout", "space"],
  Carousel: ["layout", "space", "fill"],
  Path: ["fill", "stroke"],
};

/** The groups an element allows (RuntimeBlocks.groupsOf): its runtime block's, else its kind's; undefined = all. */
export function styleGroupsOf(n: El, doc: Doc): readonly string[] | undefined {
  if (n.runtime) {
    const def = doc.defs?.find((d) => d.id === n.runtime);
    if (def) return def.groups;
  }
  return STYLE_GROUPS_BY_KIND[n.kind];
}

/** A card of the style panel shows unless the element names its groups and this one is not among them. */
export const allowsStyleGroup = (n: El | null, doc: Doc, group: string): boolean => {
  if (!n) return true;
  const gs = styleGroupsOf(n, doc);
  return gs === undefined || gs.includes(group);
};
