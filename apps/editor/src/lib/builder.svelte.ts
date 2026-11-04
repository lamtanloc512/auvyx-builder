/**
 * What the header and footer builder boards share (U/BuilderUi.scala, docs/header-builder.md): the action call that lands
 * as one commit, the width being edited, dragging an item chip between slots, and which board the selection is in.
 */
import { type Doc, ancestors } from "@auvyx/editor-core";
import { BuilderParts, FooterBuilder, HeaderBuilder, callBuilder } from "./builderCore";
import { config } from "./config";
import { nextId } from "./ids";
import { screens } from "./screens.svelte";
import { store } from "./store.svelte";
import { toast } from "./toast.svelte";
import { conditions } from "./conditions.svelte";

export type Bp = BuilderParts.Bp;
export const BPS = BuilderParts.BPS;

// ---- actions -------------------------------------------------------------------------------------

/** What kind of document is open, as an action sees it (Session.kind). */
export const documentKind = (): string => (config.isPart ? config.partArea || "part" : config.isComponent ? "component" : "page");

/** The error line of one board: shown under its tabs until the next call or Dismiss. */
export class BoardError { message = $state<string | null>(null); }

/**
 * Calls an action and commits its document once (one Undo). A refusal is shown, never swallowed, and nothing is
 * committed. Answers the item an add created.
 */
export function run(name: string, input: Record<string, unknown>, error: BoardError): string | undefined {
  const r = callBuilder(name, input, { doc: store.doc, newId: nextId, selected: store.selected, kind: documentKind(), platform: "wordpress" });
  if (!r.ok) {
    error.message = r.error;
    toast(r.error);
    return undefined;
  }
  error.message = null;
  store.commit(r.value.doc);
  return r.value.item;
}

// ---- the width -----------------------------------------------------------------------------------

/** The builder width a canvas screen edits: the built-in screens by id, a custom one by its width. */
export function bpOf(id: string): Bp {
  if (id === "base") return "desktop";
  if (id === "tablet") return "tablet";
  if (id === "mobile") return "mobile";
  const b = screens.all.find((s) => s.id === id);
  if (b?.maxWidth !== undefined && b.maxWidth <= 767) return "mobile";
  if (b?.maxWidth !== undefined && b.maxWidth <= 1024) return "tablet";
  return "desktop";
}

export const screenOf = (bp: Bp): string => (bp === "desktop" ? "base" : bp);

export const bpLabel = (bp: Bp): string => (bp === "desktop" ? "Desktop" : bp === "tablet" ? "Tablet" : "Mobile");

// ---- dragging a chip -----------------------------------------------------------------------------

/** A drop place: an element with `data-hb-drop`, holding chips (`data-hb-item`) top to bottom. */
const THRESHOLD = 4;
/** How the slot under a dragged chip shows. */
const OVER = ["bg-primary/10", "ring-1", "ring-primary"];
let dragged = false;

/** True once after a drag, so the click that ends it does not select. */
export function takeDragged(): boolean {
  const was = dragged;
  dragged = false;
  return was;
}

/**
 * Pointer drag of a chip: a ghost follows the pointer, the slot under it lights up, the drop gives the slot and the
 * index among its other chips. Escape or a cancelled pointer drops nothing.
 */
export function chipDown(e: PointerEvent, id: string, drop: (slot: Element, index: number) => void) {
  if (e.button !== 0) return;
  const chip = e.currentTarget as HTMLElement;
  const startX = e.clientX, startY = e.clientY;
  let ghost: HTMLElement | null = null;
  let target: [Element, number] | null = null;
  const under = (x: number, y: number): [Element, number] | null => {
    const slot = document.elementFromPoint(x, y)?.closest("[data-hb-drop]");
    if (!slot) return null;
    const others = [...slot.querySelectorAll("[data-hb-item]")].filter((c) => c.getAttribute("data-hb-item") !== id);
    return [slot, others.filter((c) => { const r = c.getBoundingClientRect(); return r.top + r.height / 2 < y; }).length];
  };
  const light = (next: [Element, number] | null) => {
    if (target) OVER.forEach((c) => target![0].classList.remove(c));
    if (next) OVER.forEach((c) => next[0].classList.add(c));
    target = next;
  };
  const move = (m: PointerEvent) => {
    if (!ghost && Math.hypot(m.clientX - startX, m.clientY - startY) > THRESHOLD) {
      const g = chip.cloneNode(true) as HTMLElement;
      g.style.cssText = `position:fixed;left:0;top:0;z-index:9999;pointer-events:none;opacity:.9;width:${chip.getBoundingClientRect().width}px;box-shadow:0 4px 14px rgb(0 0 0/.18)`;
      g.setAttribute("data-hb-ghost", "1");
      g.removeAttribute("data-hb-item");
      document.body.appendChild(g);
      ghost = g;
      chip.classList.add("opacity-40");
    }
    if (ghost) {
      ghost.style.transform = `translate(${m.clientX + 8}px, ${m.clientY + 6}px)`;
      light(under(m.clientX, m.clientY));
    }
  };
  const up = (u: PointerEvent) => {
    const was = !!ghost;
    const at = was ? under(u.clientX, u.clientY) : null;
    cleanup();
    if (was) {
      dragged = true;
      if (at) drop(at[0], at[1]);
    }
  };
  const cancel = () => cleanup();
  const key = (k: KeyboardEvent) => { if (k.key === "Escape") { if (ghost) dragged = true; cleanup(); } };
  const cleanup = () => {
    light(null);
    ghost?.remove();
    ghost = null;
    chip.classList.remove("opacity-40");
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", key);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", key);
}

// ---- where the board shows -----------------------------------------------------------------------

export type Board = { kind: "header" | "footer"; root: string };

/** The builder header or footer the selection is in (the root or anything inside it). */
export function boardOf(doc: Doc, selected: string | null): Board | null {
  if (!selected || !doc.nodes[selected]) return null;
  const root = [selected, ...ancestors(doc, selected)].at(-1)!;
  const r = doc.nodes[root];
  if (!r || r.kind !== "Section") return null;
  if (HeaderBuilder.isHeaderBuilder(r.className)) return { kind: "header", root: r.id };
  if (FooterBuilder.isFooterBuilder(r.className)) return { kind: "footer", root: r.id };
  return null;
}

class BuilderState {
  /** Open or folded, kept while the selection moves inside the header. */
  open = $state(true);
  #lastRoot: string | null = null;
  #boardSelection: string | null = null;
  #lastSelected: string | null = null;

  /** The board for the selection, remembering it (see `keep`). */
  board(doc: Doc, selected: string | null): Board | null {
    const b = boardOf(doc, selected);
    if (b) { this.#lastRoot = b.root; this.#boardSelection = selected; }
    return b;
  }

  /**
   * When an Undo takes the selected item away (the store clears a selection that no longer exists), the header or footer
   * root is selected instead, so the board stays.
   */
  keep(next: string | null) {
    if (next === null && this.#lastSelected !== null && this.#lastSelected === this.#boardSelection && !store.doc.nodes[this.#lastSelected])
      if (this.#lastRoot && store.doc.nodes[this.#lastRoot]) { this.#lastSelected = null; store.selected = this.#lastRoot; return; }
    this.#lastSelected = next;
  }
}

export const builder = new BuilderState();

$effect.root(() => {
  $effect(() => { const s = store.selected; builder.keep(s); });
});

/** A header part opens on its header: its settings show right away (Main.scala). */
export function selectHeaderPartRoot() {
  if (config.isPart && config.partArea === "header" && store.selected === null) {
    const r = store.doc.roots[0];
    if (r && store.doc.nodes[r] && store.doc.nodes[r]!.kind !== "Raw") store.selected = r;
  }
}

/** The Studio names a Theme Builder template "Header" / "Footer" (TopBar.kindLabel). */
export const isThemePart = () => conditions.available;
