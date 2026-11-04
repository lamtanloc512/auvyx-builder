<script lang="ts">
  // Flatsome's slider mode for any horizontal scroll-snap track (U/SliderFocus.scala): while the selection is inside
  // one, a bar over it lists the slides and adds, duplicates, moves and removes them (plain document ops, one undo step
  // each), and what the published page adds (arrows, dots or thumbnails) is drawn faintly over the canvas.
  import { DropMath, Settings as S, parentOf } from "@auvyx/editor-core";
  import { Button, Icon } from "../../ui/kit";
  import type { IconName } from "../../ui/icons";
  import { store } from "../../lib/store.svelte";
  import { dnd } from "../../lib/dnd.svelte";
  import { viewport } from "../../lib/viewport.svelte";
  import { decode, nameOf } from "../../lib/labels";
  import { breakpoints, duplicateOne } from "../../lib/settingsOps";
  import { untrack } from "svelte";
  import { follow } from "./measure.svelte";

  const focus = $derived(S.sliderFocusOf(store.doc, store.selected, breakpoints(), store.breakpoint));
  const track = follow(() => focus?.track ?? null);
  const z = $derived(viewport.zoom);
  const r = $derived(track.rect ? { x: track.rect.x * z, y: track.rect.y * z, w: track.rect.w * z, h: track.rect.h * z } : null);
  const shown = $derived(!!focus && !!r && !dnd.active);

  // The selected slide is the one in view (layouts that settle after a selection can re-snap the track).
  $effect(() => {
    void store.selected; void store.doc; void store.breakpoint;
    const t = setTimeout(() => untrack(() => {
      const f = S.sliderFocusOf(store.doc, store.selected, breakpoints(), store.breakpoint);
      const te = f ? store.elements.get(f.track) : undefined;
      const el = f?.current ? store.elements.get(f.current) : undefined;
      if (!te || !el) return;
      const want = el.offsetLeft - te.offsetLeft;
      if (te.scrollWidth > te.clientWidth + 1 && Math.abs(te.scrollLeft - want) > 2) te.scrollLeft = want;
    }), 30);
    return () => clearTimeout(t);
  });

  /** The slide's first heading, for the chip tooltip. */
  const slideTitle = (id: string): string => {
    const walk = (i: string): string | undefined => { const n = store.doc.nodes[i]; return !n ? undefined : n.kind === "Heading" ? decode(n.text) : n.children.map(walk).find((x) => x !== undefined); };
    return walk(id) ?? (store.doc.nodes[id] ? nameOf(store.doc.nodes[id]!) : "");
  };
  /** A slide's picture for the Gallery thumbnails: its video's still, its image, else the last url() of its background. */
  function picture(id: string): string {
    const v = S.backgroundVideo(store.doc, id);
    const poster = v ? S.videoPoster(v.src) : undefined;
    if (poster) return poster;
    const el = store.elements.get(id);
    if (!el) return "";
    const img = el.querySelector("img");
    if (img?.src) return img.src;
    const bg = el.ownerDocument.defaultView?.getComputedStyle(el).backgroundImage ?? "";
    return [...bg.matchAll(/url\(["']?(.*?)["']?\)/g)].at(-1)?.[1] ?? "";
  }

  // A locked slider keeps its slides: selection still works, edits do not.
  const act = (f: (x: NonNullable<typeof focus>) => void) => { if (focus && !store.lockedAt(focus.track)) f(focus); };
  function move(by: number) {
    act((f) => { if (!f.current) return; const i = f.slides.indexOf(f.current) + by; if (i >= 0 && i < f.slides.length) store.move(f.current, f.track, i); });
  }
  function dropOn(e: DragEvent, i: number, s: string) {
    e.preventDefault();
    const from = e.dataTransfer?.getData("text/plain") ?? "";
    act((f) => {
      const fromIndex = f.slides.indexOf(from);
      if (fromIndex >= 0 && from !== s) {
        store.move(from, f.track, DropMath.moveIndex(f.track, fromIndex, f.track, fromIndex < i ? i + 1 : i));
        store.selected = from;
      }
    });
  }
  const idx = $derived(focus?.current ? focus.slides.indexOf(focus.current) : -1);

  // ---- the ghost: what the published page adds, drawn faintly ----
  const ghost = $derived.by(() => {
    if (!shown || !focus || !r) return null;
    const n = store.doc.nodes[focus.track];
    if (!n) return null;
    return { o: S.readSlider(n.className), full: n.align === "full", active: Math.max(0, idx), count: focus.slides.length, pics: focus.slides.map(picture) };
  });
</script>

{#snippet tool(tip: string, icon: IconName, enabled: boolean, run: () => void, data: Record<string, string> = {})}
  <Button variant="ghost" size="icon-sm" title={tip} aria-label={tip} disabled={!enabled} {...data} onclick={(e: MouseEvent) => { e.stopPropagation(); run(); }}><Icon name={icon} size={14} /></Button>
{/snippet}

<div class="pointer-events-none absolute inset-0 z-30" data-slider-ghost="1">
  {#if ghost && r}
    {@const o = ghost.o}
    {@const light = !o.dark}
    {#if o.arrows && ghost.count > 1}
      {#each [true, false] as left (left)}
        {@const size = 40 * z}
        {@const x = o.outside && !ghost.full ? (left ? r.x - size - 12 * z : r.x + r.w + 12 * z) : (left ? r.x + 12 * z : r.x + r.w - size - 12 * z)}
        <div class={["absolute flex items-center justify-center rounded-full opacity-90", o.arrowStyle === "simple" ? (light ? "text-white drop-shadow" : "text-neutral-900") : light ? "bg-white/85 text-neutral-900 shadow-md" : "bg-neutral-900/85 text-white shadow-md"]}
          style="left:{x}px;top:{r.y + r.h / 2 - size / 2}px;width:{size}px;height:{size}px">
          <Icon name={left ? "chevronLeft" : "chevronRight"} size={Math.max(10, Math.trunc((o.arrowStyle === "simple" ? 30 : 20) * z))} />
        </div>
      {/each}
    {/if}
    {#if o.dots && ghost.count >= 2}
      {#if o.dotStyle === "thumbs"}
        <div class="absolute flex gap-1.5 overflow-hidden" style="left:{r.x}px;top:{r.y + r.h + 8 * z}px;width:{r.w}px">
          {#each ghost.pics as pic, i (i)}
            <div class={["shrink-0 rounded-md border-2 bg-neutral-200 bg-cover bg-center", i === ghost.active ? "border-neutral-900" : "border-transparent opacity-60"]}
              style="width:{72 * z}px;aspect-ratio:4/3" style:background-image={pic ? `url("${pic}")` : undefined}></div>
          {/each}
        </div>
      {:else}
        {@const dash = o.dotStyle === "dashes"}
        {@const colour = o.outside || !light ? "#111" : "#fff"}
        <div class="absolute flex -translate-x-1/2 items-center" style="left:{r.x + r.w / 2}px;top:{o.outside ? r.y + r.h + 8 * z : r.y + r.h - 18 * z}px;gap:{10 * z}px">
          {#each Array.from({ length: ghost.count }, (_, i) => i) as i (i)}
            {#if dash}<div style="width:{24 * z}px;height:{4 * z}px;border-radius:2px;background:{colour};opacity:{i === ghost.active ? 1 : 0.4}"></div>
            {:else}<div style="width:{10 * z}px;height:{10 * z}px;border-radius:999px;border:2px solid {colour};background:{i === ghost.active ? colour : 'transparent'}"></div>{/if}
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</div>

<div class="pointer-events-auto absolute z-40 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-lg border border-border bg-background p-1 text-xs shadow-md" data-slider-focus="1"
  style:display={shown ? "flex" : "none"} style:left="{r ? r.x + r.w / 2 : 0}px" style:top="{r ? (r.y >= 52 ? r.y - 30 : r.y + 52) : 0}px"
  role="toolbar" tabindex="-1" onpointerdown={(e) => e.stopPropagation()} onmousedown={(e) => e.stopPropagation()}>
  {@render tool("Slider settings", "settings", true, () => { if (focus) { store.selected = focus.track; store.tab = "content"; store.rightOpen = true; } }, { "data-slider-settings-open": "1" })}
  <span class="px-1 font-medium">Slides</span>
  {#each focus?.slides ?? [] as s, i (s)}
    <button type="button" class={["h-7 min-w-7 rounded-md px-2 tabular-nums hover:bg-muted", focus?.current === s && "bg-primary text-primary-foreground hover:bg-primary/90"]}
      title="Edit slide {i + 1}: {slideTitle(s)}" data-slide={String(i + 1)} draggable="true"
      onclick={(e) => { e.stopPropagation(); store.selected = s; }}
      ondragstart={(e) => e.dataTransfer?.setData("text/plain", s)} ondragover={(e) => e.preventDefault()} ondrop={(e) => dropOn(e, i, s)}>{i + 1}</button>
  {/each}
  <span class="mx-0.5 h-4 w-px bg-border"></span>
  {@render tool("Add a slide (copy of this one)", "plus", !!focus?.slides.length, () => act((f) => { const s = f.current ?? f.slides.at(-1); if (s) duplicateOne(s); }))}
  {@render tool("Move slide left", "chevronLeft", idx > 0, () => move(-1))}
  {@render tool("Move slide right", "chevronRight", idx >= 0 && idx < (focus?.slides.length ?? 0) - 1, () => move(1))}
  {@render tool("Delete slide", "trash", !!focus?.current && (focus?.slides.length ?? 0) > 1, () => act((f) => { if (f.current) store.remove(f.current); }))}
  <span class="mx-0.5 h-4 w-px bg-border"></span>
  {@render tool("Leave the slider", "x", true, () => { if (focus) store.selected = parentOf(store.doc, focus.track); })}
</div>
