<script lang="ts">
  // shadcn Slider (root / track / range / thumb, the Lyra pack's `cn-slider*` classes): one thumb, horizontal.
  // Drag anywhere on the track, arrows step, Shift+arrows / PageUp/Down step ×10, Home/End jump to the ends.
  import { cx } from "./anchor.svelte";
  let {
    value,
    min = 0,
    max = 100,
    step = 1,
    disabled = false,
    onchange,
    oncommit,
    class: cls = "",
    "aria-label": ariaLabel,
  }: {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    /** Every move while dragging or stepping. */
    onchange?: (v: number) => void;
    /** Once, when a drag or key press ends. */
    oncommit?: (v: number) => void;
    class?: string;
    "aria-label"?: string;
  } = $props();

  let track: HTMLElement | undefined = $state();
  let dragging = $state(false);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const snap = (v: number) => {
    const n = Math.round((v - min) / step) * step + min;
    return clamp(Number(n.toFixed(6)));
  };
  const pct = $derived(max > min ? ((clamp(value) - min) / (max - min)) * 100 : 0);

  function fromX(x: number) {
    if (!track) return value;
    const r = track.getBoundingClientRect();
    return snap(min + ((x - r.left) / Math.max(1, r.width)) * (max - min));
  }
  function set(v: number) { if (v !== value) onchange?.(v); }

  function down(e: PointerEvent) {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-slot=slider-thumb]")?.focus();
    dragging = true;
    set(fromX(e.clientX));
  }
  function move(e: PointerEvent) { if (dragging) set(fromX(e.clientX)); }
  function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    oncommit?.(fromX(e.clientX));
  }
  function key(e: KeyboardEvent) {
    if (disabled) return;
    const big = step * 10;
    const by: Record<string, number> = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: big, PageDown: -big };
    let next: number | null = null;
    if (e.key in by) next = snap(value + by[e.key] * (e.shiftKey && !e.key.startsWith("Page") ? 10 : 1));
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    if (next === null) return;
    e.preventDefault();
    set(next);
    oncommit?.(next);
  }
</script>

<div
  class={cx("cn-slider relative flex h-5 w-full touch-none items-center select-none data-disabled:opacity-50", cls)}
  data-slot="slider"
  data-horizontal=""
  data-disabled={disabled ? "" : undefined}
  data-dragging={dragging ? "" : undefined}
  role="presentation"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
>
  <div bind:this={track} class="cn-slider-track relative grow overflow-hidden" data-slot="slider-track" data-horizontal="">
    <div class="cn-slider-range absolute h-full" data-slot="slider-range" data-horizontal="" style:left="0" style:width="{pct}%"></div>
  </div>
  <!-- the pack makes the thumb `position: relative` (its hit area is ::after): a wrapper places it -->
  <span class="pointer-events-none absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2" style:left="{pct}%">
    <span
      class="cn-slider-thumb pointer-events-auto block shrink-0 select-none"
      data-slot="slider-thumb"
      role="slider"
      tabindex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled || undefined}
      aria-orientation="horizontal"
      onkeydown={key}
    ></span>
  </span>
</div>
