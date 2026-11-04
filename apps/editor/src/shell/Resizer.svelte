<script lang="ts">
  // Drag a panel edge to resize it (U/Main.scala resizer); double-click resets.
  let { width = $bindable(), dflt, grow, side, min = 200, max = 560 }: { width: number; dflt: number; grow: 1 | -1; side: string; min?: number; max?: number } = $props();

  function down(ev: PointerEvent) {
    ev.preventDefault();
    const sx = ev.clientX, start = width;
    const el = ev.currentTarget as HTMLElement;
    el.setPointerCapture(ev.pointerId);
    document.body.style.cursor = "col-resize";
    const move = (e: PointerEvent) => (width = Math.max(min, Math.min(max, start + grow * (e.clientX - sx))));
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); document.body.style.cursor = ""; };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }
</script>

<div class="absolute top-0 {side} z-20 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60" title="Drag to resize · double-click to reset"
  role="separator" aria-orientation="vertical" ondblclick={() => (width = dflt)} onpointerdown={down}></div>
