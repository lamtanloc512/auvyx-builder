/** Editor shortcuts, bound on the editor window and the canvas frame (U/Shortcuts.scala). */
import { store } from "./store.svelte";
import { viewport } from "./viewport.svelte";
import { ui } from "./ui.svelte";
import * as A from "./actions.svelte";
import { align, arrangeable, distribute } from "./transformFree";
import * as VectorEdit from "./vectorEdit.svelte";

export const SHORTCUT_GROUPS: [string, [string[], string][]][] = [
  ["Edit", [
    [["⌘Z"], "Undo"], [["⇧⌘Z"], "Redo"], [["⌘S"], "Save"], [["⌘C", "⌘X", "⌘V"], "Copy · cut · paste"], [["⌘D"], "Duplicate"], [["⌫"], "Delete"],
    [["⌘G", "⇧⌘G"], "Group · ungroup"], [["⇧⌘L"], "Lock"], [["⌥⌘C", "⌥V"], "Copy · paste the style"], [["[", "]"], "Back · forward in the parent"],
    [["⌥↑", "⌥↓", "⌥←", "⌥→"], "Move earlier · later in the flow"], [["↑", "↓", "←", "→"], "Same, while a flow block is selected and text is not being edited"],
    [["Enter"], "Edit text, or a vector's points"],
  ]],
  ["Arrange", [
    [["⇧A", "⌥A"], "Add · remove auto layout"], [["⌥A", "⌥D", "⌥H"], "Align left · right · centers"], [["⌥W", "⌥S", "⌥V"], "Align top · bottom · middles"],
    [["⌃⌥H", "⌃⌥V"], "Distribute spacing"], [["↑↓←→"], "Nudge in a free frame (Shift ×10)"],
  ]],
  ["View", [
    [["Space", "H"], "Hold and drag (or the Hand) to pan"], [["⌘ wheel"], "Zoom at the pointer (or pinch)"], [["⌘+", "⌘−"], "Zoom in · out"],
    [["⇧0"], "Zoom to 100%"], [["⌘0", "⇧1"], "Reset view: fit, back to the top"], [["⌘\\"], "Hide · show both panels"], [["?"], "This list"],
    [["Esc"], "Leave preview, or select the parent"],
  ]],
];

export const pan = $state({ on: false });

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
};

export function handle(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  const sel = store.selected;
  if (store.preview && key === "escape") { e.preventDefault(); store.preview = false; }
  else if (mod && key === "s") { e.preventDefault(); store.save(); }
  else if (mod && (e.code === "Backslash" || key === "\\")) { e.preventDefault(); store.togglePanels(); }
  else if (mod && !e.altKey && (e.code === "Equal" || e.code === "NumpadAdd" || key === "+" || key === "=")) { e.preventDefault(); viewport.zoomBy(1.25); }
  else if (mod && !e.altKey && (e.code === "Minus" || e.code === "NumpadSubtract" || key === "-")) { e.preventDefault(); viewport.zoomBy(0.8); }
  else if (mod && !e.altKey && (e.code === "Digit0" || e.code === "Numpad0")) { e.preventDefault(); viewport.resetView(); }
  else if (typing(e)) return;
  else if (!mod && e.shiftKey && e.code === "Digit0") { e.preventDefault(); viewport.zoomTo(1); }
  else if (!mod && e.shiftKey && e.code === "Digit1") { e.preventDefault(); viewport.resetView(); }
  else if (!mod && key === "?") { e.preventDefault(); ui.shortcuts = !ui.shortcuts; }
  else if (mod && key === "z") { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); }
  else if (mod && key === "y") { e.preventDefault(); store.redo(); }
  else if (mod && e.altKey && e.code === "KeyC") { if (sel) { e.preventDefault(); A.copyStyle(sel); } }
  else if (mod && e.altKey && e.code === "KeyV") { if (sel) { e.preventDefault(); A.pasteStyle(sel); } }
  else if (mod && key === "c") { if (sel) { e.preventDefault(); A.copy(sel); } }
  else if (mod && key === "x") { if (sel) { e.preventDefault(); A.cut(sel); } }
  else if (mod && key === "v") return; // the paste event
  else if (mod && e.shiftKey && e.code === "KeyG") { e.preventDefault(); A.ungroup(); }
  else if (mod && e.code === "KeyG") { e.preventDefault(); A.group(); }
  else if (mod && e.shiftKey && e.code === "KeyL") { e.preventDefault(); store.toggleLock(); }
  else if (mod && e.shiftKey && e.code === "KeyH") { if (sel) { e.preventDefault(); A.toggleHidden(sel); } }
  else if (!mod && (key === "[" || key === "]")) { if (sel) { e.preventDefault(); store.reorder(sel, key === "[" ? -1 : 1); } }
  else if (mod && key === "d") { e.preventDefault(); store.duplicateSelection(); }
  else if (key === "delete" || key === "backspace") { if (sel) { e.preventDefault(); store.removeSelection(); } }
  else if (!mod && e.shiftKey && e.code === "KeyA") { e.preventDefault(); if (e.altKey) A.removeAutoLayout(); else A.addAutoLayout(); }
  else if (e.altKey && !e.shiftKey && !e.metaKey && arrangeable() && ["KeyA", "KeyD", "KeyH", "KeyW", "KeyS", "KeyV"].includes(e.code)) {
    // Figma: ⌥A/D/H left/right/center, ⌥W/S/V top/bottom/middle; ⌃⌥H/V distribute
    e.preventDefault();
    if (e.ctrlKey && e.code === "KeyH") distribute(true);
    else if (e.ctrlKey && e.code === "KeyV") distribute(false);
    else align(({ KeyA: "Left", KeyD: "Right", KeyH: "CenterH", KeyW: "Top", KeyS: "Bottom", KeyV: "CenterV" } as const)[e.code as "KeyA"]);
  }
  else if (!mod && key.startsWith("arrow") && !store.editing && store.selection.length && !store.selection.some((i) => store.lockedAt(i))) {
    e.preventDefault();
    if (sel) store.reorder(sel, key === "arrowup" || key === "arrowleft" ? -1 : 1);
  }
  else if (key === " ") { e.preventDefault(); if (!e.repeat && !store.editing) pan.on = true; }
  else if (key === "escape") {
    if (ui.shortcuts) ui.shortcuts = false;
    else if (VectorEdit.active()) VectorEdit.stop();
    else if (ui.menu) ui.menu = null;
    else if (store.extra.size) store.extra = new Set();
    else store.selectParent();
  }
  else if (key === "enter" && VectorEdit.active()) { e.preventDefault(); VectorEdit.stop(); }
  else if (key === "enter" && sel && store.doc.nodes[sel]?.kind === "Path") {
    // Figma: Enter on a vector edits its points
    e.preventDefault();
    VectorEdit.start(sel);
  }
  else if (key === "enter" && !store.editing && sel) {
    const n = store.doc.nodes[sel];
    if (n && ["Heading", "Text", "Button"].includes(n.kind)) { e.preventDefault(); A.editText(sel); }
  }
}

export function release(e: KeyboardEvent) { if (e.key === " ") pan.on = false; }

/** The paste event (editor and canvas): elements from the editor's clipboard. Fields keep their paste. */
export function onPaste(e: ClipboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
  e.preventDefault();
  A.paste();
}
