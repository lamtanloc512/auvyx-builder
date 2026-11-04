<script lang="ts">
  // Figma-style transform handles on the selection (U/TransformHandles.scala), drawn inside the rotated selection
  // layer on the element's layout box (`frame`, workspace pixels, unrotated).
  import { HANDLES, allowed, at, cursor, isRadius, isRotate, isEdge, start, hoverRadius, resetRotation, type H } from "../lib/transform.svelte";
  import type { Rect } from "../lib/measure.svelte";

  let { frame, visible }: { frame: Rect | null; visible: boolean } = $props();

  const ok = $derived(allowed());
  // Radius handles only on boxes big enough to grab them.
  const big = $derived(!!frame && frame.w >= 56 && frame.h >= 56);
  const cls = (h: H) => isRadius(h) ? "pointer-events-auto absolute z-[45] rounded-full border-[1.5px] border-blue-600 bg-white shadow-sm"
    : isRotate(h) || isEdge(h) ? "pointer-events-auto absolute"
    : "pointer-events-auto absolute z-[45] border border-blue-600 bg-white";
</script>

<div class="absolute inset-0" style:display={visible ? "block" : "none"}>
  {#each HANDLES as h (h)}
    {@const r = frame ? at(h, frame) : null}
    <div class={cls(h)} data-handle={h.toLowerCase()} style:cursor={cursor(h)} role="presentation"
      style:display={ok.has(h) && r && (big || !isRadius(h)) ? "block" : "none"}
      style:left="{r?.x ?? 0}px" style:top="{r?.y ?? 0}px" style:width="{r?.w ?? 0}px" style:height="{r?.h ?? 0}px"
      onmouseenter={() => hoverRadius(h, true)} onmouseleave={() => hoverRadius(h, false)}
      ondblclick={() => resetRotation(h)} onpointerdown={(ev) => start(h, ev)}></div>
  {/each}
</div>
