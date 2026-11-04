<script lang="ts">
  // Outlines, labels and the drop marker over the page (U/Overlay.scala). Rects are measured in the frame's
  // coordinates every frame and drawn scaled by the zoom, so labels keep their size. The selection layer rotates with
  // the element and holds its outline, transform handles and size; spacing bands for it go in that layer too
  // (`selection.box` has the padding, margin and border).
  import { ancestors, parentOf, insert, Measure } from "@auvyx/editor-core";
  import { Badge, Button, Icon } from "../ui/kit";
  import { nameOf } from "../lib/labels";
  import { store, SCREENS } from "../lib/store.svelte";
  import { viewport } from "../lib/viewport.svelte";
  import { dnd, type Rect } from "../lib/dnd.svelte";
  import { node as defaultNode } from "../lib/defaults";
  import { pending } from "../lib/insertPlus.svelte";
  import { toast } from "../lib/toast.svelte";
  import RichToolbar from "./RichToolbar.svelte";
  import TransformHandles from "./TransformHandles.svelte";
  import ContextBar from "./ContextBar.svelte";
  import Extras from "./extras/Extras.svelte";
  import AskPopover from "../panels/agent/AskPopover.svelte";
  import { toggleAsk } from "../lib/agentAsk.svelte";
  import { guides, keys, measure, rectOf, toR } from "../lib/measure.svelte";
  import { selection, radius, startColResize } from "../lib/transform.svelte";
  import { marquee } from "../lib/marquee.svelte";
  import { untrack } from "svelte";
  import { spaceHint } from "../lib/spaceHint.svelte";

  let hovered = $state<Rect | null>(null);
  let chain = $state.raw<[string, Rect, string][]>([]);
  let selected = $state<Rect | null>(null);
  let extras = $state.raw<Rect[]>([]);
  let edges = $state.raw<[number, Rect][]>([]);
  /** Column boundaries of the selected Row: draggable splitters, page coordinates. */
  let colResizers = $state.raw<[number, Rect][]>([]);
  /** Distances from the selection to the hovered element with ⌥ (Figma), or the selection's position lines. */
  let measures = $state.raw<[Measure.Line[], Measure.Tag[]]>([[], []]);
  let plusSide = $state(false);

  const r = (d: DOMRect): Rect => ({ x: d.left, y: d.top, w: d.width, h: d.height });
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const live = (id: string) => { const e = store.elements.get(id); return e?.isConnected ? e : null; };

  $effect(() => {
    let raf = 0;
    const tick = () => {
      const doc = store.doc;
      const roots = doc.roots.map(live).filter(Boolean).map((e) => r(e!.getBoundingClientRect()));
      const nextEdges: [number, Rect][] = !roots.length || roots.length !== doc.roots.length ? [] : Array.from({ length: roots.length + 1 }, (_, i) => {
        const above = roots[i - 1], below = roots[i];
        const y = above && below ? (above.y + above.h + below.y) / 2 : above ? above.y + above.h : below!.y;
        const b = below ?? above!;
        return [i, { x: b.x, y, w: b.w, h: 0 }];
      });
      if (!same(nextEdges, edges)) edges = nextEdges;
      const h = !dnd.active && store.hovered && store.hovered !== store.selected ? live(store.hovered) : null;
      const hr = h ? r(h.getBoundingClientRect()) : null;
      if (!same(hr, hovered)) hovered = hr;
      const c: [string, Rect, string][] = dnd.active || !store.hovered ? [] : ancestors(doc, store.hovered).flatMap((a) => {
        if (a === store.selected) return [];
        const e = live(a), n = doc.nodes[a];
        return e && n ? [[a, r(e.getBoundingClientRect()), nameOf(n)] as [string, Rect, string]] : [];
      });
      if (!same(c, chain)) chain = c;
      const sid = store.selected;
      const sn = sid ? doc.nodes[sid] : undefined;
      const res: [number, Rect][] = [];
      if (sid && sn?.className.split(" ").find((k) => k.startsWith("auvyx-ui-"))?.slice(9) === "row") {
        const cols = sn.children.map(live).filter(Boolean) as HTMLElement[];
        for (let i = 0; cols.length >= 2 && i < cols.length - 1; i++) {
          const a = cols[i]!.getBoundingClientRect(), b = cols[i + 1]!.getBoundingClientRect();
          res.push([i, { x: (a.right + b.left) / 2 - 4, y: a.top, w: 8, h: a.height }]);
        }
      }
      if (!same(res, colResizers)) colResizers = res;
      const s = sid ? live(sid) : null;
      const box = s ? measure(s) : null;
      if (!same(box, selection.box)) selection.box = box;
      const sr = box?.rect ?? null;
      if (!same(sr, selected)) selected = sr;
      const ex = [...store.extra].sort().map(live).filter(Boolean).map((e) => r(e!.getBoundingClientRect()));
      if (!same(ex, extras)) extras = ex;
      // ⌥ held: distances to the hovered element; nothing hovered: Figma's position lines (up and left to the nearest obstacle)
      const hid = store.hovered;
      let mm: [Measure.Line[], Measure.Tag[]] = [[], []];
      if (box && sid && keys.alt && !store.editing && !dnd.active && !guides.snap.length && hid && hid !== sid && !ancestors(doc, hid).includes(sid)) {
        const he = store.elements.get(hid);
        if (he) mm = Measure.between(toR(box.rect), toR(rectOf(he.getBoundingClientRect())), ancestors(doc, sid).includes(hid));
      }
      let shown = mm;
      if (!(mm[0].length || dnd.active || store.editing || store.extra.size) && box && box.angle === 0 && sid) {
        const pid = parentOf(doc, sid);
        const pe = pid ? store.elements.get(pid) : undefined;
        if (pid && pe) {
          const others = (doc.nodes[pid]?.children ?? []).filter((c) => c !== sid).flatMap((c) => { const e = store.elements.get(c); return e ? [toR(rectOf(e.getBoundingClientRect()))] : []; });
          shown = [Measure.anchors(toR(box.rect), toR(rectOf(pe.getBoundingClientRect())), others), []];
        }
      }
      if (!same(shown, measures)) measures = shown;
      raf = requestAnimationFrame(tick);
    };
    untrack(tick);
    return () => cancelAnimationFrame(raf);
  });

  const z = $derived(viewport.zoom);

  /** One spacing band of the selection (U/Overlay.scala bands), page coordinates. */
  type Sides4 = { top: number; right: number; bottom: number; left: number };
  function bandOf(b: { frame: Rect; padding: Sides4; margin: Sides4; border: Sides4 }, box: "padding" | "margin", side: "Top" | "Right" | "Bottom" | "Left"): { rect: Rect; px: number } {
    const r = b.frame, p = b.padding, mg = b.margin, br = b.border;
    if (box === "padding") {
      const [ix, iy, iw, ih] = [r.x + br.left, r.y + br.top, r.w - br.left - br.right, r.h - br.top - br.bottom];
      return side === "Top" ? { rect: { x: ix, y: iy, w: iw, h: p.top }, px: p.top }
        : side === "Bottom" ? { rect: { x: ix, y: iy + ih - p.bottom, w: iw, h: p.bottom }, px: p.bottom }
        : side === "Left" ? { rect: { x: ix, y: iy + p.top, w: p.left, h: ih - p.top - p.bottom }, px: p.left }
        : { rect: { x: ix + iw - p.right, y: iy + p.top, w: p.right, h: ih - p.top - p.bottom }, px: p.right };
    }
    return side === "Top" ? { rect: { x: r.x, y: r.y - Math.max(mg.top, 0), w: r.w, h: Math.abs(mg.top) }, px: mg.top }
      : side === "Bottom" ? { rect: { x: r.x, y: r.y + r.h + Math.min(mg.bottom, 0), w: r.w, h: Math.abs(mg.bottom) }, px: mg.bottom }
      : side === "Left" ? { rect: { x: r.x - Math.max(mg.left, 0), y: r.y, w: Math.abs(mg.left), h: r.h }, px: mg.left }
      : { rect: { x: r.x + r.w + Math.min(mg.right, 0), y: r.y, w: Math.abs(mg.right), h: r.h }, px: mg.right };
  }
  const m = (x: Rect): Rect => ({ x: x.x * z, y: x.y * z, w: x.w * z, h: x.h * z });
  const place = (x: Rect) => `left:${x.x}px;top:${x.y}px;width:${Math.max(0, x.w)}px;height:${Math.max(0, x.h)}px`;
  const hov = $derived(hovered ? m(hovered) : null);
  const sel = $derived(selected ? m(selected) : null);
  /** The selection's layout box (unrotated) and the layer's rotation around its center. */
  const selFrame = $derived(selection.box ? m(selection.box.frame) : null);
  const selAngle = $derived(selection.box?.angle ?? 0);
  const line = (l: Measure.Line) => {
    const a = m({ x: Math.min(l.x1, l.x2), y: Math.min(l.y1, l.y2), w: Math.abs(l.x2 - l.x1), h: Math.abs(l.y2 - l.y1) });
    return { ...a, horizontal: a.h < 0.5 };
  };
  const marqueeRect = $derived(marquee.rect ? m(marquee.rect) : null);
  const showHandles = $derived(!store.editing && !dnd.active);

  const selectedLabel = $derived.by(() => {
    const n = store.node;
    if (!n) return "";
    const where = [SCREENS.find((b) => b.id === store.breakpoint)?.label, store.styleState !== "default" ? store.styleState.charAt(0).toUpperCase() + store.styleState.slice(1) : null].filter(Boolean).join(" · ");
    return `${nameOf(n)} · ${where}`;
  });
  const hoverLabel = $derived(store.hovered && store.doc.nodes[store.hovered] ? nameOf(store.doc.nodes[store.hovered]!) : "");

  // hover glide (only from one shown box to the next)
  let glide = $state(false);
  let shown = false;
  $effect(() => { const on = !!hov; untrack(() => { glide = shown && on; shown = on; }); });
  const GLIDE = "transition-[left,top,width,height] duration-150 ease-out motion-reduce:transition-none";

  // ancestor labels: the nearest layer keeps its label, an outer one moves along its top edge or hides
  const chainLabels = $derived.by(() => {
    const chipBox = (x: Rect, text: string): Rect => { const above = x.y >= 20; return { x: Math.max(0, x.x), y: above ? x.y - 18 : x.y, w: text.length * 6 + 12, h: 18 }; };
    let taken: Rect[] = [...(hov ? [chipBox(hov, hoverLabel)] : []), ...(sel ? [chipBox(sel, selectedLabel)] : [])];
    const hits = (a: Rect) => taken.filter((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
    return [...chain].reverse().map(([id, rect, name]) => {
      const mm = m(rect);
      let box: Rect = { x: mm.x - 1, y: mm.y - 14, w: name.length * 5.6 + 8, h: 14 };
      for (let t = 0; t < 4 && hits(box).length; t++) box = { ...box, x: Math.max(...hits(box).map((b) => b.x + b.w)) + 4 };
      const fits = !hits(box).length && box.x + box.w <= mm.x + mm.w;
      if (fits) taken = [...taken, box];
      return { id, mm, name, box: fits ? box : null };
    }).reverse();
  });

  // ---- the selection label ----
  let labelHot = false;
  let crumbsOpen = $state(false);
  let crumbsUp = $state(false);
  let revealed = $state(false);
  let settling = $state(false);
  let revealTimer: ReturnType<typeof setTimeout> | undefined, settleTimer: ReturnType<typeof setTimeout> | undefined;
  const LABEL_H = 24;
  function wantReveal(on: boolean) {
    clearTimeout(revealTimer);
    if (on) revealed = true;
    else revealTimer = setTimeout(() => (revealed = false), 320);
  }
  let lastZoom = viewport.zoom;
  $effect(() => {
    if (viewport.zoom === lastZoom) return;
    lastZoom = viewport.zoom;
    settling = true;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => (settling = false), 180);
  });
  const onSelection = $derived(!!store.hovered && !!store.selected && (store.hovered === store.selected || ancestors(store.doc, store.hovered).includes(store.selected)));
  $effect(() => { const on = onSelection; untrack(() => { if (!labelHot && !crumbsOpen) wantReveal(on); }); });
  $effect(() => { store.selected; untrack(() => (crumbsOpen = false)); });
  const labelPlace = $derived.by(() => {
    if (!sel) return { x: 0, y: 0, where: "above" };
    const w = selectedLabel.length * 6.2 + 44 + (revealed ? 72 : 0);
    const room = viewport.card?.clientWidth ?? Infinity;
    const [y, where] = sel.y - LABEL_H >= 0 ? [sel.y - LABEL_H, "above"] : sel.y + sel.h >= LABEL_H * 2 ? [Math.max(0, sel.y), "inside"] : [sel.y + sel.h, "below"];
    return { x: Math.max(0, Math.min(sel.x, room - w)), y, where };
  });
  const crumbs = $derived(store.selected ? [...ancestors(store.doc, store.selected).reverse(), store.selected].map((id) => ({ id, name: nameOf(store.doc.nodes[id]!), current: id === store.selected })) : []);
  function toggleCrumbs(ev: MouseEvent) {
    if (!crumbsOpen) {
      const btn = (ev.currentTarget as HTMLElement).getBoundingClientRect();
      const rows = crumbs.length;
      const floor = document.querySelector("[data-canvas-bar]")?.getBoundingClientRect().top ?? innerHeight;
      crumbsUp = btn.bottom + 4 + rows * 28 + 10 > floor && btn.top - 4 - rows * 28 - 10 > 0;
    }
    crumbsOpen = !crumbsOpen;
  }

  // ---- section boundaries ----
  const hoveredRoot = $derived(store.hovered && store.doc.nodes[store.hovered] ? store.doc.roots.indexOf([store.hovered, ...ancestors(store.doc, store.hovered)].at(-1)!) : -1);
  function addSection(index: number) {
    const root = defaultNode("Section");
    store.commit(insert(store.doc, root, null, index));
    store.selected = root.id;
    store.leftPanel = "add";
  }

  // ---- hover grip on unselected page sections ----
  const gripId = $derived(store.hovered && store.hovered !== store.selected && !dnd.active && !store.editing && store.doc.roots.includes(store.hovered) && store.doc.nodes[store.hovered]?.kind === "Section" ? store.hovered : null);

  // ---- InsertPlus (U/InsertPlus.scala): a + on the trailing edge of the hovered nested element ----
  const plusTarget = $derived(store.hovered && store.hovered !== store.selected && !dnd.active && !store.editing && parentOf(store.doc, store.hovered) && !store.lockedAt(parentOf(store.doc, store.hovered)!) ? store.hovered : null);
  let plusHeld = $state<{ id: string; rect: Rect; side: boolean } | null>(null);
  let pointer = [-1e4, -1e4];
  let plusEl: HTMLButtonElement;
  const near = () => { if (!plusEl || plusEl.style.display === "none") return false; const b = plusEl.getBoundingClientRect(); return Math.hypot(pointer[0]! - (b.left + b.width / 2), pointer[1]! - (b.top + b.height / 2)) <= 28; };
  $effect(() => {
    const id = plusTarget, rect = hov;
    let side = false;
    if (id) { const p = parentOf(store.doc, id); const pe = p ? store.elements.get(p) : null; if (pe) { const cs = pe.ownerDocument.defaultView!.getComputedStyle(pe); side = cs.display.includes("grid") || (cs.display.includes("flex") && !cs.flexDirection.startsWith("column")); } }
    const next = id && rect ? { id, rect, side } : null;
    untrack(() => { if (!plusHeld || !near()) plusHeld = next; });
  });
  $effect(() => {
    const fromEditor = (e: MouseEvent) => { pointer = [e.clientX, e.clientY]; };
    document.addEventListener("mousemove", fromEditor);
    return () => document.removeEventListener("mousemove", fromEditor);
  });
  function plusClick(e: MouseEvent) {
    e.stopPropagation();
    if (!plusHeld) return;
    const id = plusHeld.id;
    const p = parentOf(store.doc, id);
    const siblings = p ? store.doc.nodes[p]!.children : store.doc.roots;
    pending.at = [p, siblings.indexOf(id) + 1];
    store.leftPanel = "add";
    store.leftOpen = true;
    toast(`Pick a widget to add after ${nameOf(store.doc.nodes[id]!)}`);
    plusHeld = null;
  }

  // ---- drop marker ----
  const drop = $derived(dnd.indicator);
  const dropLine = $derived.by(() => {
    const l = drop?.line;
    if (!l) return null;
    const s = m(l);
    return drop!.vertical ? { x: s.x - 2, y: s.y, w: 4, h: Math.max(s.h, 24) } : { x: s.x, y: s.y - 2, w: Math.max(s.w, 24), h: 4 };
  });
  const dropBox = $derived(drop?.container ? m(drop.container) : null);
</script>

<div class="pointer-events-none absolute inset-0 overflow-clip" style:display={store.preview ? "none" : "block"}>
  {#each edges as [index, edge] (index)}
    <Button variant="outline" size="icon-sm"
      class={["pointer-events-auto absolute z-40 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 shadow-sm hover:opacity-100 focus-visible:opacity-100",
        hoveredRoot >= 0 && (index === hoveredRoot || index === hoveredRoot + 1) && "opacity-100", dnd.active && "invisible"].filter(Boolean).join(" ")}
      style="left:{(edge.x + edge.w / 2) * z}px;top:{edge.y * z}px;translate:-50% -50%;transition-property:opacity, background-color, border-color, color, box-shadow"
      data-section-add={String(index)} aria-label="Add a section here" title="Add a section here"
      onpointerdown={(e: PointerEvent) => { e.stopPropagation(); e.preventDefault(); }}
      onclick={(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); addSection(index); }}><Icon name="plus" size={15} /></Button>
  {/each}

  {#each chainLabels as c (c.id)}
    <div class="pointer-events-none absolute border border-violet-300" style={place(c.mm)}></div>
    {#if c.box}<div class="pointer-events-none absolute px-1 font-mono text-[9px] leading-[14px] text-violet-950 bg-violet-300" style="left:{c.box.x}px;top:{c.box.y}px">{c.name}</div>{/if}
  {/each}

  <!-- column splitters of the selected Row -->
  {#each colResizers as [i, cr] (i)}
    <div class="pointer-events-auto absolute z-40 cursor-col-resize rounded-sm bg-transparent hover:bg-blue-500/40 active:bg-blue-500/60" data-col-resize={String(i)} role="separator"
      style="left:{cr.x * z}px;top:{cr.y * z}px;width:{Math.max(6, cr.w * z)}px;height:{cr.h * z}px" onpointerdown={(ev) => startColResize(ev, i)}></div>
  {/each}

  <div class={["absolute border border-sky-500", glide && GLIDE]} style={hov ? place(hov) : "display:none"}></div>
  {#if hov}
    <div class={["absolute px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-white bg-sky-500", glide && GLIDE]}
      style="left:{Math.max(0, hov.x)}px;top:{Math.max(0, hov.y)}px;transform:{hov.y >= 20 ? 'translateY(-100%)' : 'none'}">{hoverLabel}</div>
  {/if}

  <!-- guides: distances to the hovered element, alignment while snapping (dashed blue, like Figma) -->
  {#each [...measures[0], ...guides.snap] as l, i (i)}
    {@const a = line(l)}
    <div class={["absolute z-10 border-dashed border-blue-500", l.dashed && "opacity-60", a.horizontal ? "border-t" : "border-l"]}
      style="left:{a.x}px;top:{a.y}px;width:{a.horizontal ? a.w : 0}px;height:{a.horizontal ? 0 : a.h}px"></div>
  {/each}
  {#each measures[1] as t, i (i)}
    <div class="absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-blue-600 px-1 font-mono text-[10px] leading-4 text-white" style="left:{t.x * z}px;top:{t.y * z}px">{t.text}</div>
  {/each}
  <!-- smart guides while moving or resizing freely (red) -->
  {#each guides.move as l, i (i)}
    {@const a = line(l)}
    <div class="absolute z-20 bg-[#f24822]" style="left:{a.x}px;top:{a.y}px;width:{Math.max(1, a.w)}px;height:{Math.max(1, a.h)}px"></div>
  {/each}

  {#each extras as x, i (i)}
    {@const mm = m(x)}
    <div class="absolute border-[1.5px] border-blue-600" style={place(mm)}></div>
    {#if mm.w >= 80 && mm.h >= 32}
      <div class="absolute -translate-x-1/2 rounded-sm bg-blue-600 px-1.5 py-0.5 font-mono text-[10px] leading-none whitespace-nowrap text-white" style="left:{mm.x + mm.w / 2}px;top:{mm.y + mm.h + 8}px">{Math.round(x.w)} × {Math.round(x.h)}</div>
    {/if}
  {/each}

  <!-- marquee -->
  <div class="absolute border border-blue-500 bg-blue-500/10" style={marqueeRect ? place(marqueeRect) : "display:none"}></div>

  <!-- selection layer (rotates with the element) -->
  <div class="absolute inset-0" style:transform={selFrame && selAngle !== 0 ? `rotate(${selAngle}deg)` : "none"}
    style:transform-origin={selFrame ? `${selFrame.x + selFrame.w / 2}px ${selFrame.y + selFrame.h / 2}px` : "0 0"}>
    <!-- spacing bands while the Space control points at them (Overlay.bands) -->
    {#if spaceHint.value && selection.box}
      {@const b = selection.box}
      {@const hint = spaceHint.value}
      {#each hint.sides as side (side)}
        {@const band = bandOf(b, hint.box, side)}
        <div class="absolute flex items-center justify-center {hint.box === 'padding' ? 'bg-pink-500/20' : 'bg-orange-400/25'}" style={place(m(band.rect))}>
          <span class="rounded-sm px-1 font-mono text-[10px] leading-4 text-white {hint.box === 'padding' ? 'bg-pink-600' : 'bg-orange-500'}">{Math.round(band.px)}</span>
        </div>
      {/each}
    {/if}
    <div class="absolute border-[1.5px] border-blue-600" style={selFrame ? place(selFrame) : "display:none"}></div>
    <TransformHandles frame={selFrame} visible={showHandles} />
    <!-- "Radius N" above the selection while a radius handle is used -->
    <div class="absolute -translate-x-1/2 -translate-y-full rounded-sm bg-blue-600 px-1.5 py-0.5 font-mono text-[10px] leading-none whitespace-nowrap text-white"
      style:display={radius.label && selFrame && showHandles ? "block" : "none"} style:left="{selFrame ? selFrame.x + selFrame.w / 2 : 0}px" style:top="{selFrame ? selFrame.y - 26 : 0}px">{radius.label ?? ""}</div>
    <!-- W × H under the selection, like Figma -->
    <div class="absolute -translate-x-1/2 rounded-sm bg-blue-600 px-1.5 py-0.5 font-mono text-[10px] leading-none whitespace-nowrap text-white"
      style:display={selFrame && showHandles && !measures[1].length ? "block" : "none"} style:left="{selFrame ? selFrame.x + selFrame.w / 2 : 0}px" style:top="{selFrame ? selFrame.y + selFrame.h + 8 : 0}px">{selection.box ? `${Math.round(selection.box.frame.w)} × ${Math.round(selection.box.frame.h)}` : ""}</div>
  </div>

  <!-- the selected element's label: grip, the name with its parents, then duplicate, delete and AI -->
  <div class={["pointer-events-auto absolute z-40 flex items-start", crumbsUp ? "flex-col-reverse" : "flex-col"]} data-selection-bar="1"
    style:display={showHandles && sel && !settling ? "flex" : "none"} style:left="{labelPlace.x}px" style:top="{labelPlace.y}px"
    style:transform={crumbsUp && crumbsOpen ? "translateY(calc(-100% + 24px))" : "none"}
    role="toolbar" tabindex="-1"
    onmousedown={(e) => e.stopPropagation()}
    onmouseenter={() => { labelHot = true; wantReveal(true); }}
    onmouseleave={() => { labelHot = false; if (!crumbsOpen) wantReveal(false); }}>
    <div class={["flex h-6 items-center overflow-hidden rounded-md bg-blue-600 text-white shadow-sm", labelPlace.where === "above" ? "rounded-bl-none" : "rounded-tl-none"]}>
      <button type="button" class="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-white/80 hover:bg-white/15 hover:text-white" title="Move" aria-label="Move" data-sel-act="Move"
        onpointerdown={(ev) => { ev.stopPropagation(); if (store.selected) dnd.arm({ existing: store.selected }, ev); }}><Icon name="grip" size={12} /></button>
      <button type="button" class="flex h-6 max-w-60 items-center gap-0.5 pr-1.5 pl-0.5 text-[11px] font-medium whitespace-nowrap hover:bg-white/15 focus-visible:bg-white/15 focus-visible:outline-none"
        title="Select a parent (Esc)" data-sel-name="1" aria-haspopup="true" aria-expanded={crumbsOpen} onclick={toggleCrumbs}>
        <span class="truncate">{selectedLabel}</span><Icon name="chevronDown" size={12} class="shrink-0 opacity-80" />
      </button>
      <div class="flex items-center border-l border-white/20" data-sel-actions="1" style:display={revealed ? "flex" : "none"}>
        <button type="button" class="flex h-6 w-6 shrink-0 items-center justify-center text-white/90 hover:text-white focus-visible:bg-white/15 focus-visible:outline-none hover:bg-white/15" title="Duplicate (⌘D)" aria-label="Duplicate (⌘D)" data-sel-act="Duplicate" onclick={() => store.duplicateSelection()}><Icon name="copy" size={14} /></button>
        <button type="button" class="flex h-6 w-6 shrink-0 items-center justify-center text-white/90 hover:text-white focus-visible:bg-white/15 focus-visible:outline-none bg-red-600 text-white hover:bg-red-700 focus-visible:bg-red-700" title="Delete (⌫)" aria-label="Delete (⌫)" data-sel-act="Delete" onclick={() => store.removeSelection()}><Icon name="trash" size={14} /></button>
        {#if store.node && store.node.kind !== "Raw"}
          <button type="button" class="flex h-6 w-6 shrink-0 items-center justify-center text-white/90 hover:text-white focus-visible:bg-white/15 focus-visible:outline-none bg-violet-600 hover:bg-violet-700" title="Ask AI to change this" aria-label="Ask AI to change this" data-sel-act="Ask AI" data-ask="1" onclick={toggleAsk}><Icon name="sparkles" size={14} /></button>
        {/if}
      </div>
    </div>
    <div class={["flex min-w-44 flex-col rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg", crumbsUp ? "mb-1" : "mt-1"]} role="menu" data-sel-crumbs="1" style:display={crumbsOpen ? "flex" : "none"}>
      {#each crumbs as c, depth (c.id)}
        <button type="button" role="menuitem" class={["flex h-7 items-center gap-1.5 rounded-sm pr-2 text-left text-xs whitespace-nowrap hover:bg-accent hover:text-accent-foreground", c.current && "font-medium"]}
          style:padding-left="{8 + depth * 10}px" data-sel-crumb={c.id}
          onmouseenter={() => { if (!c.current) store.hovered = c.id; }} onmouseleave={() => { if (store.hovered === c.id) store.hovered = null; }}
          onclick={() => { crumbsOpen = false; if (!c.current) { store.hovered = null; store.selected = c.id; } }}>
          {#if c.current}<Icon name="check" size={12} />{:else}<span class="w-3"></span>{/if}{c.name}
        </button>
      {/each}
    </div>
  </div>

  {#if gripId && hov && showHandles}
    <button type="button" class="pointer-events-auto absolute z-40 flex size-5 cursor-grab items-center justify-center rounded-sm bg-blue-600 text-white shadow-sm" data-hover-grip="1" title="Move"
      style="left:{hov.x + 6}px;top:{hov.y + 6}px"
      onpointerdown={(ev) => { ev.stopPropagation(); ev.preventDefault(); if (gripId) dnd.arm({ existing: gripId }, ev); }}><Icon name="grip" size={12} /></button>
  {/if}

  <RichToolbar rect={selected} />

  <!-- contextual actions under the selection (several layers) -->
  <ContextBar frame={sel} visible={showHandles} />
  <AskPopover frame={sel} visible={showHandles} />

  <div class="pointer-events-none absolute z-30 rounded-md border-2 border-dashed border-blue-500 bg-blue-500/5" data-drop-container="1" style={dropBox ? place(dropBox) : "display:none"}></div>
  <div class="pointer-events-none absolute top-0 left-0 z-30 rounded-full bg-blue-600 will-change-transform transition-[transform,width,height] duration-100 ease-out motion-reduce:transition-none"
    data-drop-indicator="1" style:display={dropLine ? "block" : "none"}
    style:transform={dropLine ? `translate3d(${dropLine.x}px, ${dropLine.y}px, 0)` : "none"} style:width="{dropLine?.w ?? 0}px" style:height="{dropLine?.h ?? 0}px"></div>
  {#if drop?.where && (dropLine || dropBox)}
    {@const at = dropLine ?? dropBox!}
    <Badge variant="default" class="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-full shadow-md" data-drop-where="1" style="left:{at.x + at.w / 2}px;top:{at.y - 6}px">{drop.where}</Badge>
  {/if}

  <button bind:this={plusEl} type="button" class="pointer-events-auto absolute z-30 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm ring-2 ring-white hover:bg-sky-600 transition-[left,top,transform] duration-150 ease-out hover:scale-110 motion-reduce:transition-none"
    data-insert-plus="1" aria-label="Add an element here" title={plusHeld && store.doc.nodes[plusHeld.id] ? `Add after ${nameOf(store.doc.nodes[plusHeld.id]!)}` : ""}
    style:display={plusHeld ? "flex" : "none"}
    style:left="{plusHeld ? (plusHeld.side ? plusHeld.rect.x + plusHeld.rect.w : plusHeld.rect.x + plusHeld.rect.w / 2) : 0}px"
    style:top="{plusHeld ? (plusHeld.side ? plusHeld.rect.y + plusHeld.rect.h / 2 : plusHeld.rect.y + plusHeld.rect.h) : 0}px"
    onpointerdown={(e) => e.stopPropagation()} onmousedown={(e) => e.stopPropagation()} onclick={plusClick}><Icon name="plus" size={12} /></button>
  <Extras />
</div>
