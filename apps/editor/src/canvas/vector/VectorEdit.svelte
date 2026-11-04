<script lang="ts">
  // Points, handles and the path outline over the canvas while a vector's points are edited (U/VectorEdit.apply). The
  // layer covers the whole canvas area like the Studio's: a press outside a point leaves the mode (Figma). Page
  // coordinates are drawn at the frame's place and zoom, measured every frame.
  import { untrack } from "svelte";
  import { canvasFrame } from "../../lib/pointer";
  import { viewport } from "../../lib/viewport.svelte";
  import { vectorEdit, grab, stop, overlaySvg } from "../../lib/vectorEdit.svelte";

  let layer: HTMLDivElement;
  /** Where the frame's top-left is inside this layer, in px. */
  let off = $state<[number, number]>([0, 0]);

  $effect(() => {
    if (!vectorEdit.editing) return;
    let raf = 0;
    const tick = () => {
      const f = canvasFrame()?.getBoundingClientRect();
      const l = layer?.getBoundingClientRect();
      if (f && l) {
        const next: [number, number] = [f.left - l.left, f.top - l.top];
        if (next[0] !== off[0] || next[1] !== off[1]) off = next;
      }
      raf = requestAnimationFrame(tick);
    };
    untrack(tick);
    return () => cancelAnimationFrame(raf);
  });

  const svg = $derived.by(() => {
    const e = vectorEdit.editing;
    if (!e) return "";
    const z = viewport.zoom, [ox, oy] = off;
    return overlaySvg(e, (x, y) => [ox + x * z, oy + y * z]);
  });

  function down(ev: PointerEvent) {
    const k = (ev.target as Element | null)?.getAttribute?.("data-k");
    if (k) grab(ev, k.slice(0, 1) as "a" | "o" | "i", Number(k.slice(1)));
    else stop();
  }
  // ⌘/Ctrl + wheel still zooms; a plain wheel does not scroll the page under the points
  $effect(() => {
    const wheel = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) viewport.wheel(e, e.clientX, e.clientY); else e.preventDefault(); };
    layer.addEventListener("wheel", wheel, { passive: false });
    return () => layer.removeEventListener("wheel", wheel);
  });
</script>

<div bind:this={layer} class="pointer-events-auto absolute inset-0 z-30" style:display={vectorEdit.editing ? "block" : "none"}
  role="presentation" data-vector-edit="" onpointerdown={down}>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- markup built from numbers only (overlaySvg) -->
  {@html svg}
</div>
