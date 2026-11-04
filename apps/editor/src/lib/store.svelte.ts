/**
 * All editor state, as the Studio's Store (U/Store.scala): the document and its history, the selection, the screen
 * and state being edited, the panels, saving. Every edit goes through `commit`.
 */
import { type Doc, type El, type Kind, decodeTree, duplicate as dup, insert as ins, insertionPoint, move as mv, parentOf, remove as rm, reorder as ro, setStyle, update, ancestors, indexIn, getStyle } from "@auvyx/editor-core";
import { config } from "./config";
import { built, pageLevel } from "./defaults";
import * as host from "./host";
import { nextId } from "./ids";
import { toast } from "./toast.svelte";
import { takePending } from "./insertPlus.svelte";

export type SaveStatus = "saved" | "unsaved" | "saving" | "failed" | "kept";
const safe = (s: SaveStatus) => s === "saved" || s === "kept";

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* private window */ } },
};
const kept = (key: string, dflt: boolean) => { const v = ls.get(key); return v === null ? dflt : v === "1"; };
const width = (key: string, dflt: number, min = 200, max = 560) => {
  const v = Number(ls.get(`auvyx-studio:${key}`));
  return Number.isFinite(v) && v > 0 ? Math.max(min, Math.min(max, v)) : dflt;
};

const COALESCE_MS = 1000;
const AUTOSAVE_MS = 2500;

/** Built-in screens (U/Screens.scala). */
export const SCREENS = [
  { id: "base", label: "Laptop" },
  { id: "tablet", label: "iPad", maxWidth: 1024 },
  { id: "mobile", label: "Mobile", maxWidth: 767 },
];

class Store {
  // ---- document + history ----
  doc = $state.raw<Doc>(decodeTree(config.blocks, nextId));
  past = $state.raw<Doc[]>([]);
  future = $state.raw<Doc[]>([]);
  #lastKey: string | null = null;
  #lastTime = 0;

  // ---- selection ----
  selected = $state<string | null>(null);
  extra = $state.raw<Set<string>>(new Set());
  hovered = $state<string | null>(null);
  editing = $state<string | null>(null);

  // ---- view ----
  preview = $state(false);
  wireframe = $state(false);
  guides = $state(ls.get("auvyx-studio:guides") !== "off");
  breakpoint = $state("base");
  styleState = $state("default");
  leftPanel = $state<"add" | "assets" | "navigator" | "content">("navigator");
  /** Inspector tab (ElementPanel.tab): content | style | advanced. */
  tab = $state<"content" | "style" | "advanced">("style");
  leftOpen = $state(kept("auvyx-studio:left-open", true));
  rightOpen = $state(kept("auvyx-studio:right-open", true));
  aiOpen = $state(ls.get("auvyx-studio:ai-open") === "1");
  leftWidth = $state(width("left-width", 240));
  rightWidth = $state(width("right-width", 288));
  collapsed = $state.raw<Set<string>>(new Set());
  /** The canvas's element for each id (filled by the canvas after each render). Not reactive: read on demand. */
  elements = new Map<string, HTMLElement>();
  /** Bumped whenever the canvas redraws, so measurements follow. */
  drawn = $state(0);

  // ---- saving ----
  saveStatus = $state<SaveStatus>("saved");
  saveError = $state<string | null>(null);
  autosave = $state(ls.get("auvyx-studio:autosave") !== "0");
  status = $state(config.status || "draft");
  lockedBy = $state<string | null>(config.lock?.locked ? config.lock.by ?? "Someone" : null);
  #autoTimer: ReturnType<typeof setTimeout> | undefined;
  #backupTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    $effect.root(() => {
      $effect(() => ls.set("auvyx-studio:left-open", this.leftOpen ? "1" : "0"));
      $effect(() => ls.set("auvyx-studio:right-open", this.rightOpen ? "1" : "0"));
      $effect(() => ls.set("auvyx-studio:ai-open", this.aiOpen ? "1" : "0"));
      $effect(() => ls.set("auvyx-studio:autosave", this.autosave ? "1" : "0"));
      $effect(() => ls.set("auvyx-studio:guides", this.guides ? "on" : "off"));
      $effect(() => { const w = this.leftWidth; const t = setTimeout(() => ls.set("auvyx-studio:left-width", String(w)), 300); return () => clearTimeout(t); });
      $effect(() => { const w = this.rightWidth; const t = setTimeout(() => ls.set("auvyx-studio:right-width", String(w)), 300); return () => clearTimeout(t); });
    });
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get node(): El | null { return this.selected ? this.doc.nodes[this.selected] ?? null : null; }
  get selection(): string[] { return [...(this.selected ? [this.selected] : []), ...[...this.extra].sort()]; }
  get live() { return this.status === "publish" || !!config.isComponent || !!config.isPart; }

  /** A new document. Commits sharing `key` within 1 s (a drag, a scrub, typing) are one undo step. */
  commit(next: Doc, key: string | null = null) {
    if (next === this.doc) return;
    const t = Date.now();
    if (key && key === this.#lastKey && t - this.#lastTime < COALESCE_MS) {
      this.future = [];
    } else {
      this.past = [this.doc, ...this.past].slice(0, 100);
      this.future = [];
      this.#lastKey = key;
    }
    this.#lastTime = t;
    this.doc = next;
    this.afterJump();
    this.scheduleSave();
  }

  undo() {
    const [prev, ...rest] = this.past;
    if (!prev) return;
    this.future = [this.doc, ...this.future];
    this.past = rest;
    this.#lastKey = null;
    this.doc = prev;
    this.afterJump();
    this.scheduleSave();
  }

  redo() {
    const [next, ...rest] = this.future;
    if (!next) return;
    this.past = [this.doc, ...this.past];
    this.future = rest;
    this.#lastKey = null;
    this.doc = next;
    this.afterJump();
    this.scheduleSave();
  }

  private afterJump() {
    if (this.selected && !this.doc.nodes[this.selected]) this.selected = null;
    if ([...this.extra].some((id) => !this.doc.nodes[id])) this.extra = new Set([...this.extra].filter((id) => this.doc.nodes[id]));
    if (this.editing && !this.doc.nodes[this.editing]) this.editing = null;
  }

  // ---- edits ----
  updateNode(id: string, f: (n: El) => El, key: string | null = null) {
    this.commit(update(this.doc, id, f), key);
  }

  /** Style declarations for the current screen and state, on the element (or the whole selection when it is selected). */
  setStyles(id: string, patch: [string, string | undefined][], key: string | null = null) {
    const ids = this.selected === id ? this.selection : [id];
    const bp = this.breakpoint, st = this.styleState;
    let doc = this.doc;
    for (const i of ids) doc = update(doc, i, (n) => ({ ...n, styles: patch.reduce((s, [p, v]) => setStyle(s, bp, st, p, v), n.styles) }));
    this.commit(doc, key);
  }

  styleOf(n: El, property: string, bp = this.breakpoint, st = this.styleState) {
    return getStyle(n.styles, bp, st, property);
  }

  lockedAt(id: string) {
    return [id, ...ancestors(this.doc, id)].some((a) => this.doc.nodes[a]?.locked);
  }

  toggleLock() {
    const ids = this.selection;
    if (!ids.length) return;
    const lock = !ids.every((id) => this.doc.nodes[id]?.locked);
    let doc = this.doc;
    for (const id of ids) doc = update(doc, id, (n) => ({ ...n, locked: lock }));
    this.commit(doc);
  }

  insert(kind: Kind) {
    const b = built(kind);
    if (kind === "Section") {
      const top = this.selected && this.doc.nodes[this.selected] ? [this.selected, ...ancestors(this.doc, this.selected)].at(-1)! : null;
      const index = top ? this.doc.roots.indexOf(top) + 1 : this.doc.roots.length;
      this.commit(ins(this.doc, pageLevel(b.root), null, index, b.nodes));
      this.selected = b.root.id;
    } else this.insertTree(b.root, b.nodes);
  }

  /** Inserts after the selection (inside a selected container; after a selected loop). */
  insertTree(root: El, extra: Record<string, El>, at?: [string | null, number]) {
    const sel = this.selected ? this.doc.nodes[this.selected] : undefined;
    const [parent, index] = at ?? takePending() ?? (sel?.kind === "Loop" ? [parentOf(this.doc, sel.id), indexIn(this.doc, sel.id) + 1] : insertionPoint(this.doc, this.selected));
    this.commit(ins(this.doc, parent === null ? pageLevel(root) : root, parent, index, extra));
    this.selected = root.id;
  }

  remove(id: string) {
    const parent = parentOf(this.doc, id);
    this.commit(rm(this.doc, id));
    this.selected = parent;
  }

  removeSelection() {
    const ids = this.selection;
    if (!ids.length) return;
    const parent = parentOf(this.doc, ids[0]!);
    let doc = this.doc;
    for (const id of ids) if (doc.nodes[id]) doc = rm(doc, id);
    this.extra = new Set();
    this.commit(doc);
    this.selected = parent && doc.nodes[parent] ? parent : null;
  }

  duplicateSelection() {
    let doc = this.doc;
    const copies: string[] = [];
    for (const id of this.selection) {
      const [next, copy] = dup(doc, id, nextId);
      doc = next;
      if (copy) copies.push(copy);
    }
    if (!copies.length) return;
    this.commit(doc);
    this.selected = copies[0]!;
    this.extra = new Set(copies.slice(1));
  }

  move(id: string, parent: string | null, index: number) { this.commit(mv(this.doc, id, parent, index)); }
  reorder(id: string, by: number) { this.commit(ro(this.doc, id, by)); }
  selectParent() { if (this.selected) this.selected = parentOf(this.doc, this.selected); }

  toggleSelected(id: string) {
    if (!this.selected) { this.selected = id; return; }
    if (id === this.selected) {
      const [first, ...rest] = [...this.extra];
      this.selected = first ?? null;
      this.extra = new Set(rest);
    } else {
      const next = new Set(this.extra);
      if (next.has(id)) next.delete(id); else next.add(id);
      this.extra = next;
    }
  }

  clearPage() {
    if (!this.doc.roots.length) return;
    this.commit({ ...this.doc, roots: [], nodes: {} });
    this.selected = null;
    toast("Page cleared · ⌘Z to undo");
  }

  togglePanels() {
    const open = !(this.leftOpen || this.rightOpen);
    this.leftOpen = open;
    this.rightOpen = open;
  }

  // ---- saving (U/Store.scala, Backup) ----
  private scheduleSave() {
    this.saveStatus = "unsaved";
    if (!host.connected) return;
    clearTimeout(this.#backupTimer);
    this.#backupTimer = setTimeout(() => ls.set(this.backupKey, JSON.stringify({ modified: config.modified, at: Date.now(), blocks: null })), 800);
    clearTimeout(this.#autoTimer);
    if (this.autosave && config.autosaves) this.#autoTimer = setTimeout(() => this.autosaveNow(), AUTOSAVE_MS);
  }

  private get backupKey() { return `auvyx-editor:backup:${config.postId}`; }

  /** Keeps the work on the server now (WordPress's autosave), if there is unsaved work and nobody else holds the page. */
  autosaveNow(andThen: () => void = () => {}) {
    clearTimeout(this.#autoTimer);
    if (safe(this.saveStatus)) andThen();
    const waiting = this.saveStatus === "unsaved" || this.saveStatus === "failed";
    if (!waiting || this.lockedBy || !config.autosaves) return;
    const snapshot = this.doc;
    this.saveStatus = "saving";
    host.keep(snapshot).then(
      (k) => {
        this.saveError = null;
        if (this.doc === snapshot) {
          ls.del(this.backupKey);
          this.saveStatus = k === "saved" ? "saved" : "kept";
          andThen();
        } else {
          this.saveStatus = "unsaved";
          this.scheduleSave();
        }
      },
      (e: Error) => { this.saveError = e.message; this.saveStatus = "unsaved"; },
    );
  }

  /** Saves the content; `publish` also publishes it. */
  save(publish = false, andThen: () => void = () => {}) {
    if (this.lockedBy) { toast(`${this.lockedBy} is editing this page — take over to save.`); return; }
    if (this.saveStatus === "saving") return;
    clearTimeout(this.#autoTimer);
    const snapshot = this.doc;
    this.saveStatus = "saving";
    host.save(snapshot, publish || this.status === "publish").then(
      () => {
        this.saveError = null;
        if (publish) this.status = "publish";
        if (this.doc === snapshot) ls.del(this.backupKey);
        this.saveStatus = this.doc === snapshot ? "saved" : "unsaved";
        toast(publish ? "Published" : "Saved");
        andThen();
      },
      (e: Error) => { this.saveError = e.message; this.saveStatus = "failed"; },
    );
  }

  get safe() { return safe(this.saveStatus); }
}

export const store = new Store();
