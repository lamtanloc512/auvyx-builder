<script lang="ts">
  // The classic slider's layers (U/Overlay.scala sliderBar): shadcn buttons over the selected Carousel, not a pill
  // inside the page: Slider, Banner, Image, and + to add a slide.
  import { Button } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { dnd } from "../../lib/dnd.svelte";
  import { viewport } from "../../lib/viewport.svelte";
  import { carouselUi } from "../../lib/carouselUi.svelte";
  import { follow } from "./measure.svelte";
  const target = follow(() => (store.node?.kind === "Carousel" ? store.selected : null));
  const r = $derived(target.rect ? { x: target.rect.x * viewport.zoom, y: target.rect.y * viewport.zoom, w: target.rect.w * viewport.zoom } : null);
  const LAYERS: ["slider" | "banner" | "image", string][] = [["slider", "Slider"], ["banner", "Banner"], ["image", "Image"]];
</script>

<div class="pointer-events-auto absolute z-40 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-sm" data-carousel-bar="1"
  style:display={r && !dnd.active ? "flex" : "none"} style:left="{r ? r.x + r.w / 2 : 0}px" style:top="{r ? Math.max(8, r.y - 8) : 0}px"
  role="toolbar" tabindex="-1" onmousedown={(e) => e.stopPropagation()}>
  {#each LAYERS as [key, label] (key)}
    <Button variant="ghost" size="sm" class={carouselUi.layer === key ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""} onclick={(e: MouseEvent) => { e.stopPropagation(); carouselUi.layer = key; }}>{label}</Button>
  {/each}
  <Button variant="outline" size="icon-sm" title="Add slide" aria-label="Add slide" onclick={(e: MouseEvent) => { e.stopPropagation(); carouselUi.addSlide(); }}>+</Button>
</div>
