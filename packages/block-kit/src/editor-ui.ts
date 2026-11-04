/**
 * Editor UI state shared by the style panel and the canvas overlay of every
 * block: which state is being edited, and whether canvas handles are shown.
 * Tiny external store; not persisted.
 */
import { useSyncExternalStore } from "@wordpress/element";
import type { StateId } from "@auvyx/style-engine";

export type EditorUi = { styleState: StateId; showHandles: boolean };

// Handles start hidden in the block editor; the visual builder is the main visual surface (ADR 0018).
let current: EditorUi = { styleState: "default", showHandles: false };
const listeners = new Set<() => void>();

export const getEditorUi = (): EditorUi => current;

export const setEditorUi = (patch: Partial<EditorUi>): void => {
  current = { ...current, ...patch };
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useEditorUi = (): EditorUi => useSyncExternalStore(subscribe, getEditorUi);
