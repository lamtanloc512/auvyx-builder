/**
 * Pointer drag and drop onto the canvas (U/Dnd.scala): a new element from the Add panel, or moving one. It starts
 * after 4 px; the element stays in place and dims, a label follows the pointer, a blue line (or a dashed container)
 * shows where it lands, with "X → parent, before Y". Alt copies, Esc cancels.
 */
import { DropMath, ancestors, duplicate, indexIn, insert, move, parentOf, type Doc, type El, type Kind, KINDS } from "@auvyx/editor-core";
import { built, node as defaultNode, pageLevel } from "./defaults";
import { nameOf, kindName } from "./labels";
import { nextId } from "./ids";
import { canvasFrame, drag as pointerDrag, toEditor, toPage, type P } from "./pointer";
import { store } from "./store.svelte";
import { canvasWeb } from "./canvasWeb.svelte";
import { viewport } from "./viewport.svelte";

export type Payload = { new: Kind } | { tree: () => [El, Record<string, El>]; label: string; section?: boolean } | { existing: string };
export interface Rect { x: number; y: number; w: number; h: number }
export interface Indicator { line: Rect | null; container: Rect | null; vertical: boolean; where: string }
interface Target { parent: string | null; index: number }

const THRESHOLD = 4;
const EDGE_BAND = 24;
const EDGE_SLICE = 10;
const rectOf = (r: DOMRect): Rect => ({ x: r.left, y: r.top, w: r.width, h: r.height });
const boxOf = (r: DOMRect): DropMath.Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

class Dnd {
  active = $state(false);
  ghost = $state<string | null>(null);
  ghostValid = $state(false);
  indicator = $state.raw<Indicator | null>(null);
  ghostNode: HTMLElement | null = null;
  #moving: string | null = null;
  #copying = false;
  #suppress = false;

  /** True once after a drag ended, so the click that follows a drop does not act as a click. */
  takeClick() { const was = this.#suppress; this.#suppress = false; return !was; }

  private label(p: Payload) {
    return "new" in p ? kindName(p.new) : "tree" in p ? p.label : store.doc.nodes[p.existing] ? nameOf(store.doc.nodes[p.existing]!) : "Element";
  }

  private placeGhost(x: number, y: number) { if (this.ghostNode) this.ghostNode.style.transform = `translate3d(${x + 14}px, ${y + 18}px, 0)`; }

  /** Arms a drag on pointer down; it starts once the pointer moved past 4 px, so clicks still work. */
  arm(payload: Payload, ev: PointerEvent) {
    if (ev.button !== 0) return;
    if ("existing" in payload && store.lockedAt(payload.existing)) return;
    ev.preventDefault();
    this.#suppress = false;
    const label = this.label(payload);
    const first = toEditor(ev);
    let started = false, cancelled = false, target: Target | null = null, latest = first, dirty = false, raf = 0, lastTick = 0;
    const lifted = "existing" in payload ? store.elements.get(payload.existing) ?? null : null;
    this.#moving = "existing" in payload ? payload.existing : null;
    this.#copying = false;
    const body = () => canvasFrame()?.contentDocument?.body;
    const cleanup = () => {
      cancelAnimationFrame(raf);
      this.active = false;
      this.ghost = null;
      this.indicator = null;
      body()?.classList.remove("auvyx-dragging");
      lifted?.classList.remove("auvyx-drag-source");
      this.#moving = null;
    };
    const keyDocs = [document, canvasFrame()?.contentDocument].filter(Boolean) as Document[];
    let cancelDrag = () => {};
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); cancelDrag(); } };
    keyDocs.forEach((d) => d.addEventListener("keydown", key, true));
    const cancel = () => {
      cancelled = true;
      target = null;
      if (started) this.#suppress = true;
      keyDocs.forEach((d) => d.removeEventListener("keydown", key, true));
      cleanup();
    };
    const update = (p: P) => {
      if (cancelled) return;
      if (!started && Math.hypot(p.x - first.x, p.y - first.y) > THRESHOLD) {
        started = true;
        this.active = true;
        store.hovered = null;
        body()?.classList.add("auvyx-dragging");
        lifted?.classList.add("auvyx-drag-source");
      }
      if (!started) return;
      this.#copying = p.alt && !!this.#moving;
      const name = this.#copying ? `Copy of ${label}` : label;
      if (this.ghost !== name) this.ghost = name;
      this.placeGhost(p.x, p.y);
      target = this.locate(payload, p.x, p.y);
      if (!target) this.indicator = null;
      this.ghostValid = !!this.indicator;
    };
    const animate = (time: number) => {
      raf = 0;
      if (!started || cancelled || !this.active) return;
      const elapsed = Math.min(32, Math.max(0, time - lastTick));
      lastTick = time;
      if (dirty) { dirty = false; update(latest); }
      const ws = viewport.scroller?.getBoundingClientRect(), f = canvasFrame()?.getBoundingClientRect();
      if (ws && f) {
        const speed = latest.x < f.left || latest.x > f.right ? 0 : DropMath.edgeSpeed(latest.y, ws.top, ws.bottom, f.top < ws.top, f.bottom > ws.bottom);
        if (speed) { viewport.panBy(0, (speed * elapsed) / 1000); update(latest); }
        else if (canvasWeb.edgeScroll(latest.x, latest.y, elapsed)) update(latest);
      }
      raf = requestAnimationFrame(animate);
    };
    cancelDrag = pointerDrag("grabbing", (p) => {
      latest = p;
      if (started) { this.placeGhost(p.x, p.y); dirty = true; }
      else {
        update(p);
        if (started) { lastTick = performance.now(); raf = requestAnimationFrame(animate); }
      }
    }, (p) => {
      keyDocs.forEach((d) => d.removeEventListener("keydown", key, true));
      if (cancelled) return;
      if (started) update(p);
      const t = target;
      cleanup();
      if (started) {
        this.#suppress = true;
        setTimeout(() => (this.#suppress = false), 0);
        this.drop(payload, t, p.alt);
      }
    }, cancel);
  }

  private canDrop(parent: string | null, source: string | null = this.#moving) {
    const doc = store.doc;
    if (source && (!doc.nodes[source] || store.lockedAt(source))) return false;
    if (parent === null) return true;
    const n = doc.nodes[parent];
    return !!n && KINDS[n.kind].container && !n.markup && !n.script && !store.lockedAt(parent) && (!source || (parent !== source && !ancestors(doc, parent).includes(source)));
  }

  private drop(payload: Payload, target: Target | null, copy: boolean) {
    if (!target || !this.canDrop(target.parent, "existing" in payload ? payload.existing : null)) return;
    const { parent, index } = target;
    const wrap = parent === null;
    if ("existing" in payload) {
      const original = payload.existing;
      let doc = store.doc, id = original, at = index;
      if (copy) {
        const [withCopy, made] = duplicate(doc, original, nextId);
        if (made) { doc = withCopy; id = made; if (parent === parentOf(store.doc, original) && index > indexIn(store.doc, original)) at = index + 1; }
      }
      const from = parentOf(doc, id);
      let next: Doc;
      if (wrap && doc.nodes[id]!.kind !== "Section") {
        const section = defaultNode("Section");
        next = move(insert(doc, section, null, at), id, section.id, 0);
      } else next = move(doc, id, parent, DropMath.moveIndex(from, indexIn(doc, id), parent, at));
      store.commit(next);
      store.selected = id;
      return;
    }
    const [root, extra] = "new" in payload ? (() => { const b = built(payload.new); return [b.root, b.nodes] as const; })() : payload.tree();
    store.commit(this.place(store.doc, root, extra, parent, index, wrap));
    store.selected = root.id;
  }

  /** Page-level drops wrap a widget in a flow section, as a boundary + does on click. */
  private place(doc: Doc, root: El, extra: Record<string, El>, parent: string | null, index: number, wrap: boolean): Doc {
    if (!wrap) return insert(doc, root, parent, index, extra);
    if (root.kind === "Section") return insert(doc, pageLevel(root), null, index, extra);
    const section = defaultNode("Section");
    return insert(insert(doc, section, null, index), root, section.id, 0, extra);
  }

  private landing(parent: string | null, index: number) {
    const doc = store.doc;
    const name = this.ghost ?? "Item";
    const into = parent && doc.nodes[parent] ? nameOf(doc.nodes[parent]!) : "Page";
    const all = parent ? doc.nodes[parent]!.children : doc.roots;
    const m = this.#moving, c = this.#copying;
    const spot = all.every((id) => m === id && !c) ? "empty"
      : (() => { const next = all.slice(index).find((id) => c || m !== id); return next && doc.nodes[next] ? `before ${nameOf(doc.nodes[next]!)}` : "the end"; })();
    return `${name} → ${into}, ${spot}`;
  }

  private show(i: Indicator) {
    const now = this.indicator;
    if (!now || JSON.stringify(now) !== JSON.stringify(i)) this.indicator = i;
  }

  /** A new Section (or a section template) lands as a page sibling. */
  private sectionDrag(p: Payload) { return ("new" in p && p.new === "Section") || ("tree" in p && !!p.section); }

  private pageLine(index: number): Rect | null {
    const roots = store.doc.roots.map((id) => store.elements.get(id)).filter(Boolean).map((e) => boxOf(e!.getBoundingClientRect())).filter((b) => b.bottom > b.top || b.right > b.left);
    if (!roots.length) return null;
    const b = index <= 0 ? roots[0]! : roots[Math.min(index - 1, roots.length - 1)]!;
    return { x: b.left, y: index <= 0 ? b.top : b.bottom, w: Math.max(24, b.right - b.left), h: 0 };
  }

  private reveal(p: Payload, parent: string | null, index: number, line: Rect | null, container: Rect | null, verticalLine: boolean): Target {
    let [tp, ti] = [parent, index];
    if (this.sectionDrag(p) && parent !== null) {
      const top = [parent, ...ancestors(store.doc, parent)].at(-1)!;
      const at = store.doc.roots.indexOf(top);
      [tp, ti] = [null, at < 0 ? store.doc.roots.length : at + 1];
    }
    if (tp === parent && ti === index) { this.show({ line, container, vertical: verticalLine, where: this.landing(tp, ti) }); return { parent: tp, index: ti }; }
    this.show({ line: this.pageLine(ti), container: null, vertical: false, where: this.landing(null, ti) });
    return { parent: null, index: ti };
  }

  private vertical(c: HTMLElement | null | undefined) {
    if (!c) return true;
    const cs = c.ownerDocument.defaultView!.getComputedStyle(c);
    if (cs.display.includes("grid")) return false;
    if (cs.display.includes("flex")) return cs.flexDirection.startsWith("column");
    return true;
  }

  /** Container interiors accept children; their edges reserve sibling insertion slots. */
  private locate(p: Payload, x: number, y: number): Target | null {
    const at = toPage(x, y);
    const idoc = canvasFrame()?.contentDocument;
    if (!at || !idoc) return null;
    const hit = idoc.elementFromPoint(at[0], at[1]);
    return hit ? this.resolve(p, hit, at[0], at[1]) : this.publish(p, null, at[0], at[1], null);
  }

  private resolve(p: Payload, hit: Element, x: number, y: number): Target | null {
    const doc = store.doc;
    const dragged = "existing" in p ? store.elements.get(p.existing) : null;
    if (dragged?.contains(hit)) return null;
    const chain: [HTMLElement, El][] = [];
    for (let e = hit.closest("[data-auvyx-id]") as HTMLElement | null; e; e = e.parentElement?.closest("[data-auvyx-id]") as HTMLElement | null) {
      const n = doc.nodes[e.getAttribute("data-auvyx-id")!];
      if (n) chain.push([e, n]);
    }
    if (!chain.length) return this.publish(p, null, x, y, null);
    const z = viewport.zoom;
    const isContainer = (n: El) => KINDS[n.kind].container && !n.markup;
    const levels: DropMath.Level[] = chain.map(([e, n]) => {
      const parent = parentOf(doc, n.id);
      const flowsDown = this.vertical(parent ? store.elements.get(parent) : null);
      const box = boxOf(e.getBoundingClientRect());
      const extent = flowsDown ? box.bottom - box.top : box.right - box.left;
      const band = isContainer(n) ? Math.min(EDGE_BAND / z, extent / 3) : extent / 2;
      const accepts = isContainer(n) && !store.lockedAt(n.id) && this.canDrop(n.id);
      return { box, vertical: flowsDown, radius: band, usable: this.canDrop(parent), claimsInterior: accepts };
    });
    const spot = DropMath.edgeSpot(levels, x, y, EDGE_SLICE / z);
    if (spot) {
      const [i, before] = spot;
      const n = chain[i]![1], level = levels[i]!;
      const parent = parentOf(doc, n.id);
      const siblings = parent ? doc.nodes[parent]!.children : doc.roots;
      const index = siblings.indexOf(n.id) + (before ? 0 : 1);
      const b = level.box;
      const line: Rect = level.vertical ? { x: b.left, y: before ? b.top : b.bottom, w: b.right - b.left, h: 0 } : { x: before ? b.left : b.right, y: b.top, w: 0, h: b.bottom - b.top };
      const pe = parent ? store.elements.get(parent) : null;
      return this.reveal(p, parent, index, line, pe ? rectOf(pe.getBoundingClientRect()) : null, !level.vertical);
    }
    const inner = chain.find(([, n]) => isContainer(n) && !store.lockedAt(n.id) && this.canDrop(n.id));
    return inner ? this.publish(p, inner[1].id, x, y, inner[0]) : null;
  }

  private publish(p: Payload, parent: string | null, x: number, y: number, container: HTMLElement | null): Target | null {
    if (!this.canDrop(parent)) return null;
    const doc = store.doc;
    const all = parent ? doc.nodes[parent]!.children : doc.roots;
    const visible = all.filter((id) => id !== this.#moving).map((id) => [id, store.elements.get(id)] as const)
      .filter(([, e]) => e?.isConnected).map(([id, e]) => [id, boxOf(e!.getBoundingClientRect())] as const)
      .filter(([, b]) => b.right > b.left || b.bottom > b.top);
    const ids = visible.map(([id]) => id), boxes = visible.map(([, b]) => b);
    const isVertical = this.vertical(container);
    const row = isVertical ? null : DropMath.rowSlot(boxes, x, y);
    const slot = isVertical ? DropMath.slotIndex(boxes, x, y, true) : row?.index ?? 0;
    const index = DropMath.documentIndex(all, ids, slot);
    const cr = container ? rectOf(container.getBoundingClientRect()) : null;
    let line: Rect | null;
    if (!boxes.length) line = cr ? { x: cr.x + 12, y: cr.y + cr.h / 2, w: Math.max(24, cr.w - 24), h: 0 } : { x: 0, y, w: viewport.width, h: 0 };
    else if (isVertical) {
      const at = slot === 0 ? boxes[0]!.top : slot >= boxes.length ? boxes.at(-1)!.bottom : (boxes[slot - 1]!.bottom + boxes[slot]!.top) / 2;
      const left = Math.min(...boxes.map((b) => b.left)), right = Math.max(...boxes.map((b) => b.right));
      line = { x: left, y: at, w: right - left, h: 0 };
    } else line = row ? { x: row.x, y: row.top, w: 0, h: row.bottom - row.top } : null;
    return this.reveal(p, parent, index, line, parent ? cr : null, !isVertical);
  }
}

export const dnd = new Dnd();
