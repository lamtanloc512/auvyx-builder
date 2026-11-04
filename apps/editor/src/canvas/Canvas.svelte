<script lang="ts">
  import { decorateParts } from "../lib/parts";
  // The canvas (U/Canvas.scala, web canvas): the site's page at the device width on a board, drawn at the fit zoom;
  // the overlay over it; the canvas bar at the bottom.
  import { config } from "../lib/config";
  import { canvasWeb } from "../lib/canvasWeb.svelte";
  import { store } from "../lib/store.svelte";
  import { viewport } from "../lib/viewport.svelte";
  import { arrow } from "../lib/cursors";
  import CanvasBar from "./CanvasBar.svelte";
  import Overlay from "./Overlay.svelte";
  import { pan } from "../lib/shortcuts.svelte";
  import * as Marquee from "../lib/marquee.svelte";
  import { listenAlt } from "../lib/measure.svelte";
  import { untrack } from "svelte";
  import { mountFrame } from "./runCode.svelte";
  import * as VectorEdit from "../lib/vectorEdit.svelte";
  import VectorEditLayer from "./vector/VectorEdit.svelte";
  import LiveMode from "./LiveMode.svelte";
  import LiveFrame from "./LiveFrame.svelte";
  import { liveAvailable, liveMode } from "../lib/live.svelte";

  // the click that ends a marquee neither selects nor deselects (Marquee.takeClick, after Dnd.takeClick)
  const takeDrop = canvasWeb.takeClick;
  canvasWeb.takeClick = () => takeDrop() && Marquee.takeClick();

  /** The frame loaded: the page takes over, then a press on the page outside an element (the theme, a margin), on a locked
   * layer or on the empty area of a page section that is not selected starts a marquee (U/CanvasWeb.scala listen). */
  function frameLoaded(d: Document) {
    canvasWeb.mount(d);
    mountFrame(d);
    decorateParts(d);
    if (d.defaultView) listenAlt(d.defaultView);
    // the middle button grabs the board, as on the board itself; mousedown is the one that starts autoscroll, and the
    // frame keeps the drag's moves until the button is let go
    d.addEventListener("mousedown", (e) => { if (middle(e)) e.preventDefault(); }, true);
    d.addEventListener("pointermove", (e) => { if (grab?.from === "frame") grabAt("frame", e.screenX, e.screenY); }, true);
    d.addEventListener("pointerup", () => grabEnd("frame"), true);
    d.addEventListener("pointerdown", (e) => {
      if (middle(e)) { e.preventDefault(); e.stopPropagation(); grab = null; grabAt("frame", e.screenX, e.screenY); return; }
      if (canvasWeb.interact || store.editing) return;
      const t = e.target as Element | null;
      const el = t?.nodeType === 1 ? t.closest("[data-auvyx-id]") : null;
      const id = el?.getAttribute("data-auvyx-id");
      if (!id || store.lockedAt(id) || (e.target === el && store.doc.roots.includes(id) && !store.selection.includes(id))) Marquee.start(e);
    }, true);
    // double-click a vector: edit its points (CanvasWeb.listen dblclick, Kind.Path)
    d.addEventListener("dblclick", (e) => {
      if (store.editing || canvasWeb.interact) return;
      const t = e.target as Element | null;
      const id = (t?.nodeType === 1 ? t.closest("[data-auvyx-id]") : null)?.getAttribute("data-auvyx-id");
      if (id && store.doc.nodes[id]?.kind === "Path" && !store.lockedAt(id)) VectorEdit.start(id);
    }, true);
  }

  function panDown(ev: PointerEvent) {
    let [lx, ly] = [ev.clientX, ev.clientY];
    const el = ev.currentTarget as HTMLElement;
    el.setPointerCapture(ev.pointerId);
    const move = (e: PointerEvent) => { viewport.panBy(lx - e.clientX, ly - e.clientY); lx = e.clientX; ly = e.clientY; };
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

  /** The middle button held down: the board follows the pointer until it is let go. Moves come only from where the press
   * began: a frame keeps a press's moves until the button is let go (the Live frame reports them by message), and the
   * cover takes them only for a press on the board; two sources would interleave and the page would shake. Screen
   * coordinates, since the frames move under the pointer while panning. */
  type GrabFrom = "board" | "frame" | "live";
  let grab = $state<{ from: GrabFrom; x: number; y: number } | null>(null);
  function grabAt(from: GrabFrom, x: number, y: number) {
    if (!grab) { grab = { from, x, y }; return; }
    if (grab.from !== from) return;
    viewport.panBy(grab.x - x, grab.y - y);
    grab = { from, x, y };
  }
  function grabEnd(from: GrabFrom) { if (grab?.from === from) grab = null; }
  const middle = (e: MouseEvent) => e.button === 1;

  let scroller: HTMLDivElement;
  let card: HTMLDivElement;

  $effect(() => {
    viewport.scroller = scroller;
    viewport.card = card;
    const measure = () => { viewport.room = scroller.clientWidth; viewport.roomHeight = scroller.clientHeight; };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    const wheel = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) viewport.wheel(e, e.clientX, e.clientY); };
    scroller.addEventListener("wheel", wheel, { passive: false });
    return () => { ro.disconnect(); scroller.removeEventListener("wheel", wheel); };
  });

  // a new screen: back to the start position at the fit zoom
  let lastBp = store.breakpoint;
  $effect(() => {
    const bp = store.breakpoint;
    untrack(() => { if (bp !== lastBp) { lastBp = bp; viewport.chosenZoom = null; viewport.home(); viewport.homeSoon(); } });
  });
  // the panel's size or the fit changed (and nothing was zoomed by hand): back to the start position
  $effect(() => { viewport.fitZoom; viewport.slack; untrack(() => { if (viewport.chosenZoom === null) viewport.homeSoon(); }); });

  const onBoard = (e: Event) => e.target === e.currentTarget || (e.target as Element).hasAttribute?.("data-auvyx-board");
  const empty = $derived(store.doc.roots.length === 0);
  const [sx, sy] = $derived(viewport.slack);
</script>

<div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
  {#if liveAvailable}<LiveMode />{/if}
  <div class="relative min-h-0 min-w-0 flex-1">
    {#if empty}
      <div class="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center" data-empty-page="1">
        <div class="max-w-sm rounded-xl border border-dashed border-border bg-background/95 px-6 py-8 text-center shadow-sm">
          <p class="text-sm font-medium">Start with an empty page</p>
          <p class="mt-2 text-xs text-muted-foreground">Open Add → Sections, pick a page theme preset, or paste from the library.</p>
        </div>
      </div>
    {/if}
    <div bind:this={scroller} class="absolute inset-0 overflow-auto bg-shell select-none" style:cursor={arrow} style:scrollbar-width="none"
      role="presentation" onclick={(e) => { if (onBoard(e) && Marquee.takeClick() && !store.editing) { store.selected = null; store.extra = new Set(); } }}
      onmousedown={(e) => { if (middle(e)) e.preventDefault(); }}
      onpointerdown={(e) => { if (middle(e)) { e.preventDefault(); grab = null; grabAt("board", e.screenX, e.screenY); } else if (onBoard(e)) Marquee.start(e); }}>
      <div class="box-content w-max" data-auvyx-board="1" style:padding="{sy}px {sx}px">
        <div bind:this={card} class="relative bg-white shadow-sm ring-1 ring-black/5"
          style:width="{viewport.width * viewport.zoom}px" style:height="{viewport.pageHeight * viewport.zoom}px"
          role="presentation" onclick={(e) => e.stopPropagation()}>
          <div class="absolute top-0 left-0 origin-top-left" style:width="{viewport.width}px" style:height="{viewport.pageHeight}px"
            style:transform={viewport.zoom === 1 ? "none" : `scale(${viewport.zoom})`}>
            <iframe class="block size-full border-0" data-auvyx-canvas="1" title="Page" src={config.webCanvasUrl}
              onload={(e) => { const d = (e.currentTarget as HTMLIFrameElement).contentDocument; if (d) frameLoaded(d); }}></iframe>
            <LiveFrame onGrab={(x, y, end) => (end ? grabEnd("live") : grabAt("live", x, y))} />
          </div>
          {#if !liveMode.url}<Overlay />{/if}
          {#if canvasWeb.frameError}
            <div class="absolute inset-x-6 top-6 z-30 rounded-lg border border-destructive/30 bg-background p-4 text-xs text-destructive shadow-sm">{canvasWeb.frameError}</div>
          {/if}
        </div>
      </div>
    </div>
    <!-- a vector's points while they are edited (U/Overlay.scala VectorEdit()) -->
    <VectorEditLayer />
    <!-- Space + drag pans (covers the frame so it gets no pointer events meanwhile) -->
    <div class="absolute inset-0 z-30 cursor-grab active:cursor-grabbing" style:display={pan.on || grab?.from === "board" ? "block" : "none"} style:cursor={grab ? "grabbing" : undefined}
      role="presentation" onpointerdown={panDown} onpointermove={(e) => { if (grab?.from === "board") grabAt("board", e.screenX, e.screenY); }}
      onpointerup={() => grabEnd("board")}></div>
    <!-- Preview: the page only; a cover takes every pointer event -->
    <div class="absolute inset-0 z-50" style:display={store.preview ? "block" : "none"}></div>
  </div>
  <CanvasBar />
</div>
