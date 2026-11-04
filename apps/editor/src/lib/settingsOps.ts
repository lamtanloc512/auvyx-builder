/**
 * Store operations the Settings panel and its canvas bars use that the editor's Store does not have by these names
 * (U/Store.scala `duplicate`, `deviceBreakpoints`, `breakpoints`).
 */
import { Settings, duplicate as dup, type El } from "@auvyx/editor-core";
import type { Breakpoint } from "@auvyx/style-engine";
import { nextId } from "./ids";
import { store, SCREENS } from "./store.svelte";
import { screens } from "./screens.svelte";

/** Store.duplicate: a copy right after it, selected. */
export function duplicateOne(id: string) {
  const [next, copy] = dup(store.doc, id, nextId);
  store.commit(next);
  if (copy) store.selected = copy;
}
/** Store.breakpoints: every editing screen (built-in and custom). */
export const breakpoints = () => screens.all as Breakpoint[];
/** Store.deviceBreakpoints: desktop, tablet, mobile. */
export const devices = SCREENS.map((s) => s.id);
export const BASE = SCREENS[0]!.id;
export const SMALL = SCREENS[SCREENS.length - 1]!.id;
/** A Settings row's update: one undo step per field while typing (`settings:<id>:<key>`). */
export const updater = (id: string) => (key: string, f: (n: El) => El) => store.updateNode(id, f, `settings:${id}:${key}`);
export type Update = ReturnType<typeof updater>;

/** UiCatalog.setChoice: the class token, then the styles the choice writes (one undo step: the same key). */
export function setChoice(id: string, key: string, value: string) {
  store.updateNode(id, (n) => Settings.uiWithChoice(n, key, value), `ui-${key}:${id}`);
  const patch = Settings.uiChoicePatch(key, value);
  if (patch.length) store.setStyles(id, patch, `ui-${key}:${id}`);
}
