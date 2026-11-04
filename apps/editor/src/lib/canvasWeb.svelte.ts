/**
 * The web canvas (U/CanvasWeb.scala, docs/canvas-renderer.md "WordPress"): the site's own page in canvas mode, the
 * document drawn by PHP (`auvyx/v1/canvas/render`) where the page has its `<!--auvyx-canvas-root-->` marker. A style-only
 * edit is patched here with the style engine (byte-equal to PHP's, invariant 1); anything else asks the site for the
 * smallest changed subtree, one request at a time.
 */
import { compileBlockStyles, compileScopedCss, type Breakpoint } from "@auvyx/style-engine";
import { DropMath, ancestors, type Doc, type El } from "@auvyx/editor-core";
import { untrack } from "svelte";
import { canvasRender, connected } from "./host";
import { config } from "./config";
import { arrow } from "./cursors";
import { store, SCREENS } from "./store.svelte";
import { viewport } from "./viewport.svelte";

const breakpoints: Breakpoint[] = (config.designSystem?.breakpoints as Breakpoint[] | undefined) ?? (SCREENS as Breakpoint[]);

/** Editor-only rules in the page: nothing here restyles it (outlines are drawn on the overlay). */
const EDITOR_CSS = `html{overscroll-behavior:contain}
html,body,[data-auvyx-id]{cursor:${arrow}}
body{user-select:none;-webkit-user-select:none}
[contenteditable]{cursor:text;user-select:text;-webkit-user-select:text;outline:none}
.auvyx-drag-source{opacity:.35!important}
.auvyx-drag-source,.auvyx-drag-source *{pointer-events:none!important}
html:not([data-auvyx-interact]) iframe,html:not([data-auvyx-interact]) video,html:not([data-auvyx-interact]) audio{pointer-events:none!important}
img{-webkit-user-drag:none}`;

const WIREFRAME_CSS = `body{background:#fff!important}
[data-auvyx-id],[data-auvyx-id] *{background-image:none!important;background-color:transparent!important;color:transparent!important;box-shadow:none!important;text-shadow:none!important}
[data-auvyx-id]{outline:1px dashed #c3c8d0;outline-offset:-1px}
img,svg,video{opacity:.25!important;filter:grayscale(1)!important}
.wp-block-auvyx-section:empty{background:#f1f5f9!important}`;

const CONTAINER_CSS = ":root{--auvyx-container:var(--wp--style--global--wide-size,1200px);--auvyx-gutter:24px;--auvyx-band:max(var(--auvyx-gutter),calc((100vw - var(--auvyx-container)) / 2))}";
const GUIDES_CSS = `${CONTAINER_CSS}html::after{content:"";position:fixed;inset-block:0;inset-inline:var(--auvyx-band);border-inline:1px dashed color-mix(in srgb,#6366f1 55%,transparent);pointer-events:none;z-index:2147483646}`;

/** The classes and rules an element's styles give its tag (HtmlRenderer.styleClasses / nodeCss). */
const styleOf = (n: El) => {
  const block = compileBlockStyles(n.styles, breakpoints);
  const free = compileScopedCss(n.css);
  return { classes: [block?.className, free?.className].filter(Boolean) as string[], css: [block?.css, free?.css].filter(Boolean) as string[] };
};

/** Only the styles changed (and not full/wide alignment, where PHP adds an override rule). */
const styleOnly = (a: El, b: El) => {
  if (a.align === "full" || a.align === "wide" || b.align === "full" || b.align === "wide") return false;
  const strip = (n: El) => JSON.stringify({ ...n, styles: null, css: null });
  return strip(a) === strip(b);
};

const quoted = (id: string) => JSON.stringify(id);

interface Mounted { idoc: Document; container: HTMLElement; style: HTMLStyleElement; drawn: Doc | null; inFlight: boolean; force: Set<string>; rules: string[] }

class CanvasWeb {
  frameError = $state<string | null>(null);
  interact = $state(false);
  #m: Mounted | null = null;
  /** Called with the editing element when a text edit starts (set by the inline editor). */
  onEdit: (id: string, el: HTMLElement) => void = () => {};
  onContext: (id: string, x: number, y: number) => void = () => {};
  onPointerDown: (id: string, e: PointerEvent) => void = () => {};
  onKey: (e: KeyboardEvent) => void = () => {};
  /** A drag in progress swallows the next click (Dnd.takeClick). */
  takeClick: () => boolean = () => true;
  get doc() { return this.#m?.idoc ?? null; }

  /** The frame loaded: find the place for the document and take over the page's events. */
  mount(idoc: Document) {
    this.#m = null;
    const walker = idoc.createTreeWalker(idoc.body, NodeFilter.SHOW_COMMENT);
    let marker: Node | null = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue?.trim() === "auvyx-canvas-root") { marker = n; break; }
    const container = marker?.parentNode as HTMLElement | null;
    if (!container) {
      this.frameError = idoc.querySelector("[data-auvyx-canvas-error]")?.textContent?.trim() || "The site's page for this document did not load with a place for it.";
      return;
    }
    this.frameError = null;
    idoc.documentElement.setAttribute("data-auvyx-editing", "");
    let style = idoc.getElementById("auvyx-page-css") as HTMLStyleElement | null;
    if (!style) {
      style = idoc.createElement("style");
      style.id = "auvyx-page-css";
      container.parentNode!.insertBefore(style, container);
    }
    const add = (id: string, text = "") => { const s = idoc.createElement("style"); s.id = id; s.textContent = text; idoc.head.appendChild(s); return s; };
    add("auvyx-canvas-editor", EDITOR_CSS);
    const wire = add("auvyx-canvas-wireframe");
    const guide = add("auvyx-canvas-guides");
    const m: Mounted = { idoc, container, style, drawn: null, inFlight: false, force: new Set(), rules: [] };
    this.#m = m;
    this.listen(m);
    viewport.scrollPageBy = (dy) => idoc.defaultView?.scrollBy(0, dy);
    viewport.scrollPageTo = (y) => idoc.defaultView?.scrollTo(0, y);
    $effect.root(() => {
      $effect(() => { wire.textContent = store.wireframe ? WIREFRAME_CSS : ""; });
      $effect(() => { guide.textContent = store.guides && !store.preview ? GUIDES_CSS : ""; });
      $effect(() => { if (this.interact) idoc.documentElement.setAttribute("data-auvyx-interact", ""); else idoc.documentElement.removeAttribute("data-auvyx-interact"); });
      $effect(() => { const d = store.doc; const editing = store.editing; untrack(() => { if (this.#m === m && !editing) this.update(m, d); }); });
    });
  }

  /** Draws a new document: style-only edits here at once, the rest by the site. */
  private update(m: Mounted, next: Doc) {
    if (!connected) return;
    if (m.inFlight) return; // drawn again once the answer is in
    const prev = m.drawn;
    const whole = !prev || prev.roots.join() !== next.roots.join();
    const changed = whole ? [] : Object.keys(next.nodes).filter((id) => prev!.nodes[id] !== next.nodes[id]);
    const force = [...m.force].filter((id) => next.nodes[id]);
    m.force.clear();
    const local = changed.filter((id) => !force.includes(id) && prev!.nodes[id] && styleOnly(prev!.nodes[id]!, next.nodes[id]!));
    for (const id of local) {
      const before = styleOf(prev!.nodes[id]!), after = styleOf(next.nodes[id]!);
      for (const el of this.styledTags(m, id)) { el.classList.remove(...before.classes); el.classList.add(...after.classes); }
      m.rules.push(...after.css);
    }
    if (local.length) m.style.textContent = m.rules.join("");
    // an element inside a loop is drawn by its outermost loop
    const drawnBy = (id: string) => ancestors(next, id).find((a) => next.nodes[a]?.kind === "Loop") ?? id;
    const asked = [...new Set([...changed.filter((id) => !local.includes(id)), ...force].map(drawnBy))];
    const top = asked.filter((id) => !ancestors(next, id).some((a) => asked.includes(a)));
    if (!whole && !top.length) { m.drawn = next; store.drawn++; return; }
    const one = !whole && top.length === 1 && m.container.querySelector(`[data-auvyx-id=${quoted(top[0]!)}]`) ? top[0]! : null;
    m.inFlight = true;
    canvasRender(next, one).then(
      (r) => {
        m.inFlight = false;
        if (this.#m !== m) return;
        if (one) {
          const el = m.container.querySelector(`[data-auvyx-id=${quoted(one)}]`);
          const tmp = m.idoc.createElement("template");
          tmp.innerHTML = r.html;
          el?.replaceWith(tmp.content);
        } else m.container.innerHTML = r.html;
        this.assets(m, r.assets);
        if (r.css) m.rules.push(r.css);
        m.style.textContent = m.rules.join("");
        m.drawn = next;
        this.collect(m);
        // a redraw asked while this render was in flight (force) runs now, as the Studio does (pendingForce)
        if ((store.doc !== next || m.force.size) && !store.editing) this.update(m, store.doc);
      },
      (e: Error) => {
        m.inFlight = false;
        if (one) { m.drawn = null; this.update(m, store.doc); }
        else this.frameError = e.message;
      },
    );
  }

  /** The sheets a render needed that the page does not have yet, before the page's own rules. */
  private assets(m: Mounted, html: string) {
    if (!html.trim()) return;
    const tmp = m.idoc.createElement("template");
    tmp.innerHTML = html;
    tmp.content.querySelectorAll("link[rel=stylesheet],style").forEach((tag) => {
      const id = tag.getAttribute("id") ?? "";
      const base = id.replace(/-inline-css$/, "").replace(/-css$/, "");
      const known = id && [id, `${base}-css`, `${base}-inline-css`].some((x) => m.idoc.getElementById(x));
      const same = !id && [...m.idoc.querySelectorAll("style")].some((s) => s.textContent === tag.textContent);
      if (!known && !same) m.style.parentNode!.insertBefore(m.idoc.importNode(tag, true), m.style);
    });
  }

  /** The tags that carry an element's style classes: its [data-auvyx-part] when a wrapper comes first, else itself; every copy. */
  private styledTags(m: Mounted, id: string): Element[] {
    return [...m.container.querySelectorAll(`[data-auvyx-id=${quoted(id)}],[data-auvyx-clone=${quoted(id)}]`)].map((el) => el.querySelector(":scope [data-auvyx-part]") ?? el);
  }

  private collect(m: Mounted) {
    m.container.querySelectorAll("video").forEach((v) => { v.autoplay = false; v.pause(); });
    store.elements.clear();
    m.container.querySelectorAll<HTMLElement>("[data-auvyx-id]").forEach((el) => {
      const id = el.getAttribute("data-auvyx-id")!;
      if (!store.elements.has(id)) store.elements.set(id, el);
    });
    store.drawn++;
  }

  /** Draws these elements again (a typed text, a forced refresh). */
  redraw(ids: string[]) {
    const m = this.#m;
    if (!m) return;
    ids.forEach((id) => m.force.add(id));
    this.update(m, store.doc);
  }

  private idOf(target: EventTarget | null): [string, HTMLElement] | null {
    const el = target instanceof Element || (target as Node | null)?.nodeType === 1 ? (target as Element).closest("[data-auvyx-id]") as HTMLElement | null : null;
    return el ? [el.getAttribute("data-auvyx-id")!, el] : null;
  }

  /** The element a pointer is over, skipping locked layers (they are background). */
  private unlocked(target: EventTarget | null) {
    let at = this.idOf(target);
    while (at && store.lockedAt(at[0])) at = this.idOf(at[1].parentElement);
    return at;
  }

  /** Editor coordinates of a point in the frame. */
  frameXY(e: MouseEvent): [number, number] {
    const f = this.#m?.idoc.defaultView?.frameElement;
    if (!f) return [e.clientX, e.clientY];
    const r = f.getBoundingClientRect();
    return [r.left + e.clientX * viewport.zoom, r.top + e.clientY * viewport.zoom];
  }

  private listen(m: Mounted) {
    const idoc = m.idoc;
    idoc.addEventListener("click", (e) => {
      const target = e.target as Element;
      const inEdited = !!target.closest?.("[contenteditable=true]");
      const link = !!target.closest?.("a[href]");
      if (!inEdited && (!this.interact || link)) e.preventDefault();
      if (this.interact || inEdited) return;
      e.stopPropagation();
      if (!this.takeClick()) return;
      const hit = this.idOf(e.target);
      if (!hit) { if (!store.editing) { store.selected = null; store.extra = new Set(); } return; }
      const [id] = hit;
      if (store.lockedAt(id)) { store.selected = null; return; }
      if (store.editing === id) return;
      if (e.shiftKey && store.selected) store.toggleSelected(id);
      else { store.selected = id; store.extra = new Set(); }
    }, true);
    idoc.addEventListener("submit", (e) => e.preventDefault(), true);
    idoc.addEventListener("mouseover", (e) => { store.hovered = this.unlocked(e.target)?.[0] ?? null; }, true);
    idoc.documentElement.addEventListener("mouseleave", () => { store.hovered = null; });
    idoc.addEventListener("pointerdown", (e) => {
      if (this.interact || store.editing) return;
      e.stopPropagation();
      const hit = this.idOf(e.target);
      if (hit && !store.lockedAt(hit[0])) this.onPointerDown(hit[0], e);
    }, true);
    idoc.addEventListener("contextmenu", (e) => {
      if (store.editing) return;
      const hit = this.idOf(e.target);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      const [x, y] = this.frameXY(e);
      this.onContext(hit[0], x, y);
    }, true);
    idoc.addEventListener("dblclick", (e) => {
      if (store.editing || this.interact) return;
      const hit = this.idOf(e.target);
      if (!hit) return;
      const [id, el] = hit;
      const n = store.doc.nodes[id];
      if (!n || store.lockedAt(id)) return;
      if (n.kind === "Heading" || n.kind === "Text" || n.kind === "Button") { e.preventDefault(); this.onEdit(id, el); }
      else if (n.kind === "Accordion") {
        const s = (e.target as Element).closest("summary") as HTMLElement | null;
        if (s && el.contains(s)) { e.preventDefault(); this.onEdit(id, s); }
      }
    }, true);
    idoc.addEventListener("keydown", (e) => this.onKey(e));
    idoc.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) { const [x, y] = this.frameXY(e); viewport.wheel(e, x, y); }
    }, { passive: false });
  }

  /** Scrolls the frame so a rect (frame viewport coordinates) is in view. */
  reveal(r: DOMRect) {
    const win = this.#m?.idoc.defaultView;
    if (!win) return;
    const h = win.innerHeight;
    if (r.top < 24 || r.bottom > h - 24) win.scrollTo(0, Math.max(0, win.scrollY + r.top + r.height / 2 - h / 2));
  }

  /** Drag edge scrolling: near the top or bottom of the visible part of the frame, its page scrolls. */
  edgeScroll(x: number, y: number, elapsedMs: number): boolean {
    const m = this.#m;
    const f = m?.idoc.defaultView?.frameElement;
    if (!m || !f) return false;
    const r = f.getBoundingClientRect();
    const ws = viewport.scroller?.getBoundingClientRect();
    const top = ws ? Math.max(r.top, ws.top) : r.top, bottom = ws ? Math.min(r.bottom, ws.bottom) : r.bottom;
    const win = m.idoc.defaultView!;
    const max = m.idoc.documentElement.scrollHeight - win.innerHeight;
    if (x < r.left || x > r.right) return false;
    const speed = DropMath.edgeSpeed(y, top, bottom, win.scrollY > 0, win.scrollY < max - 0.5);
    const dy = (speed * elapsedMs) / 1000 / viewport.zoom;
    if (dy) win.scrollBy(0, dy);
    return dy !== 0;
  }
}

export const canvasWeb = new CanvasWeb();
