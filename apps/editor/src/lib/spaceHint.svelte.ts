/**
 * Spacing the Space control points at (U/Overlay.scala `spaceHint`): the box ("padding" | "margin") and the sides
 * (Top, Right, Bottom, Left) the hovered, scrubbed or edited cell covers. The overlay draws those bands on the canvas
 * with their px values; null draws nothing.
 */
import type { Side, SpaceBox } from "@auvyx/editor-core";

export const spaceHint = $state<{ value: { box: SpaceBox; sides: Side[] } | null }>({ value: null });
