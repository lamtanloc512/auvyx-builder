/**
 * Element actions shared by the context menu and the shortcuts (U/ContextMenu.scala, U/Clipboard.scala,
 * U/Grouping.scala, U/AutoLayout.scala, InlineEdit in U/Canvas.scala).
 */
import { type Doc, type El, el, insert, move, parentOf, remove, subtreeIds, indexIn, serialize, update, setStyle, getStyle } from "@auvyx/editor-core";
import { resolveValue, type Breakpoint, type Styles } from "@auvyx/style-engine";
import { nameOf } from "./labels";
import { nextId } from "./ids";
import { store, SCREENS } from "./store.svelte";
import { toast } from "./toast.svelte";
import { canvasWeb } from "./canvasWeb.svelte";

const KEY = "auvyx-editor:clipboard";
const resolved = (n: El, prop: string) => resolveValue(n.styles, SCREENS as Breakpoint[], store.breakpoint, "default", prop)?.value;

// ---- clipboard: every field here (localStorage), the block markup on the system clipboard ----
export function copy(id: string) {
  const doc = store.doc, root = doc.nodes[id];
  if (!root) return;
  const ids = subtreeIds(doc, id);
  const sub: Doc = { roots: [id], nodes: Object.fromEntries(ids.map((i) => [i, doc.nodes[i]!])) };
  try { localStorage.setItem(KEY, JSON.stringify(sub)); } catch { /* private window */ }
  navigator.clipboard?.writeText(serialize(sub)).catch(() => {});
  toast(`Copied ${nameOf(root)}`);
}
export function cut(id: string) { copy(id); store.remove(id); }
/** Pastes with fresh ids, inside the selected section or after the selected element. */
export function paste() {
  let sub: Doc | null = null;
  try { sub = JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { sub = null; }
  if (!sub?.roots?.length) return;
  const fresh = new Map(Object.keys(sub.nodes).map((k) => [k, nextId()]));
  const nodes = Object.fromEntries(Object.values(sub.nodes).map((n) => [fresh.get(n.id)!, { ...n, id: fresh.get(n.id)!, children: n.children.flatMap((c) => (fresh.has(c) ? [fresh.get(c)!] : [])) }]));
  const root = nodes[fresh.get(sub.roots[0]!)!]!;
  const { [root.id]: _, ...rest } = nodes;
  store.insertTree(root, rest);
}

// ---- styles ----
let copiedStyles: Styles | null = null;
export const hasCopiedStyle = () => copiedStyles !== null;
export function copyStyle(id: string) { copiedStyles = store.doc.nodes[id]?.styles ?? null; toast("Style copied"); }
export function pasteStyle(id: string) { const s = copiedStyles; if (s) store.updateNode(id, (n) => ({ ...n, styles: s })); }
export const isHidden = (id: string) => { const n = store.doc.nodes[id]; return !!n && resolved(n, "display") === "none"; };
/** Hidden on the current screen (display: none), like Show/Hide ⇧⌘H. */
export function toggleHidden(id: string) { store.setStyles(id, [["display", isHidden(id) ? undefined : "none"]]); }

// ---- groups (flow): a stack that lays its layers out like the parent did ----
export const GROUP = "auvyx-group";
function siblings(): [string | null, string[]] | null {
  const ids = store.selection;
  if (!ids.length) return null;
  const parent = parentOf(store.doc, ids[0]!);
  const same = ids.filter((i) => parentOf(store.doc, i) === parent);
  const list = parent ? store.doc.nodes[parent]!.children : store.doc.roots;
  return [parent, [...same].sort((a, b) => list.indexOf(a) - list.indexOf(b))];
}
export function group() {
  const s = siblings();
  if (!s) return;
  const [parent, ids] = s;
  const doc = store.doc;
  const box = el(nextId(), "Section", { tag: "div", className: GROUP });
  let d = insert(doc, box, parent, indexIn(doc, ids[0]!));
  ids.forEach((i, at) => (d = move(d, i, box.id, at)));
  const p = parent ? doc.nodes[parent] : null;
  const flex = !!p && (resolved(p, "display") ?? "").includes("flex");
  const dir = flex ? resolved(p!, "flex-direction") ?? "row" : "column";
  const gap = p ? resolved(p, "gap") ?? "0px" : "0px";
  const bp = store.breakpoint;
  d = update(d, box.id, (n) => ({ ...n, styles: [["display", "flex"], ["flex-direction", dir], ["gap", gap]].reduce((st, [k, v]) => setStyle(st, bp, "default", k!, v), n.styles) }));
  store.commit(d);
  store.selected = box.id;
  store.extra = new Set();
}
export const canUngroup = (id: string) => { const n = store.doc.nodes[id]; return !!n && n.kind === "Section" && n.children.length > 0; };
export function ungroup() {
  const id = store.selected;
  const node = id ? store.doc.nodes[id] : null;
  if (!id || !node || !canUngroup(id)) return;
  const doc = store.doc, parent = parentOf(doc, id), at = indexIn(doc, id);
  let d = node.children.reduce((acc, c, i) => move(acc, c, parent, at + i), doc);
  d = remove(d, id);
  store.commit(d);
  store.selected = node.children[0] ?? null;
  store.extra = new Set(node.children.slice(1));
}

// ---- auto layout (flow) ----
const isAuto = (n: El) => { const d = resolved(n, "display") ?? ""; return d.includes("flex") || d.includes("grid"); };
export const canRemoveAuto = (id: string) => { const n = store.doc.nodes[id]; return !!n && n.kind === "Section" && isAuto(n); };
export function addAutoLayout() {
  const sel = store.selection, doc = store.doc, bp = store.breakpoint;
  if (sel.length === 1 && doc.nodes[sel[0]!]?.kind === "Section" && !isAuto(doc.nodes[sel[0]!]!)) {
    store.setStyles(sel[0]!, [["display", "flex"], ["flex-direction", "column"], ["gap", "16px"], ["align-items", "flex-start"], ["height", undefined]]);
    return;
  }
  const s = siblings();
  if (!s) return;
  const [parent, ids] = s;
  const frame = el(nextId(), "Section", { tag: "div", styles: [["display", "flex"], ["flex-direction", "column"], ["gap", "16px"], ["align-items", "flex-start"]].reduce((st, [k, v]) => setStyle(st, bp, "default", k!, v), {} as Styles) });
  let d = insert(doc, frame, parent, Math.min(...ids.map((i) => indexIn(doc, i))));
  ids.forEach((i, at) => (d = move(d, i, frame.id, at)));
  store.commit(d);
  store.selected = frame.id;
}
export function removeAutoLayout() {
  const id = store.selected;
  if (id && canRemoveAuto(id)) store.setStyles(id, [["display", "block"], ["flex-direction", undefined], ["gap", undefined], ["align-items", undefined], ["justify-content", undefined]]);
}

// ---- inline text editing (InlineEdit) ----
export const inline = $state<{ el: HTMLElement | null; keepOpen: boolean }>({ el: null, keepOpen: false });

/** b → strong, i → em, trailing <br> and &nbsp; dropped (the Scala `RichText.normalize`). */
export const normalizeRich = (html: string) => html.replace(/<b(\s[^>]*)?>/g, "<strong>").replaceAll("</b>", "</strong>").replace(/<i(\s[^>]*)?>/g, "<em>").replaceAll("</i>", "</em>").replace(/(<br\s*\/?>)+$/, "").replaceAll("&nbsp;", " ");

export function editText(id: string, target?: HTMLElement) {
  const n = store.doc.nodes[id];
  const elx = target ?? store.elements.get(id);
  if (!n || !elx || store.lockedAt(id)) return;
  const attr = n.kind === "Button" ? "text" : "content";
  if (n.bind[attr]) { toast(`Shows ${n.bind[attr]}. Unlink it in Settings → Data to type text.`); return; }
  const isSummary = elx.tagName === "SUMMARY";
  elx.innerHTML = n.text;
  elx.setAttribute("data-auvyx-editing", "");
  start(id, elx, n.kind !== "Text" || isSummary);
}

function start(id: string, target: HTMLElement, singleLine: boolean) {
  store.selected = id;
  store.editing = id;
  inline.el = target;
  const original = target.innerHTML;
  const exec = (cmd: string, arg?: string) => (target.ownerDocument as Document).execCommand(cmd, false, arg);
  target.setAttribute("contenteditable", "true");
  target.focus();
  const range = target.ownerDocument.createRange();
  range.selectNodeContents(target);
  const sel = target.ownerDocument.defaultView!.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  const onKey = (e: KeyboardEvent) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") { e.stopPropagation(); target.blur(); }
    else if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); e.stopPropagation(); if (singleLine) exec("insertLineBreak"); else exec("insertHTML", "<br>"); }
    else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); target.blur(); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); richLink.open = true; }
  };
  const onPaste = (e: ClipboardEvent) => { e.preventDefault(); exec("insertText", e.clipboardData?.getData("text/plain") ?? ""); };
  const onBlur = () => {
    if (inline.keepOpen) return;
    target.removeEventListener("keydown", onKey);
    target.removeEventListener("paste", onPaste);
    target.removeEventListener("blur", onBlur);
    target.removeAttribute("contenteditable");
    target.removeAttribute("data-auvyx-editing");
    store.editing = null;
    inline.el = null;
    richLink.open = false;
    const text = normalizeRich(target.innerHTML);
    if (text !== original) store.updateNode(id, (n) => ({ ...n, text }));
    // the page shows it as the site does again
    canvasWeb.redraw([id]);
  };
  target.addEventListener("keydown", onKey);
  target.addEventListener("paste", onPaste);
  target.addEventListener("blur", onBlur);
}

export const richLink = $state({ open: false });
export function command(name: string, arg?: string) {
  const t = inline.el;
  if (t) (t.ownerDocument as Document).execCommand(name, false, arg);
}
export { getStyle };
