<script lang="ts">
  // TextBoxPosition.panel: Auto (the banner's alignment) or a position, with a pad standing for the banner.
  import { Settings as S } from "@auvyx/editor-core";
  import { store } from "../../lib/store.svelte";
  import { screens } from "../../lib/screens.svelte";
  import { currentXY, dragXY, setXY } from "../../lib/textBoxPosition";
  let { id }: { id: string } = $props();
  const live = $derived((void store.doc, void store.breakpoint, currentXY(id)));
  const device = $derived(screens.all.find((b) => b.id === store.breakpoint)?.label ?? store.breakpoint);
  const fmt = (v: number) => String(v).replace(/\.0$/, "");
  function num(axis: 0 | 1, v: string) {
    const d = Number(v);
    if (v.trim() === "" || !Number.isFinite(d)) return;
    const [x, y] = currentXY(id) ?? [50, 50];
    setXY(id, axis === 0 ? [d, y] : [x, d]);
  }
</script>

{#snippet axis(a: 0 | 1)}
  <input type="number" min="0" max="100" step="1" class="h-7 w-12 min-w-0 rounded-md border border-input bg-background px-1.5 text-xs tabular-nums" data-pos-axis={a === 0 ? "x" : "y"}
    value={live ? fmt(live[a]) : ""} onchange={(e) => num(a, e.currentTarget.value)} />
{/snippet}

<div class="flex flex-col gap-1.5" data-text-box-position="1">
  <div class="grid grid-cols-[64px_1fr] items-start gap-1">
    <span class="pt-1.5 text-[11px] text-muted-foreground">Position</span>
    <div class="flex flex-col gap-1.5">
      <div class="flex gap-0.5 rounded-md bg-muted/70 p-0.5">
        {#each [[false, "Auto"], [true, "Custom"]] as [on, label] (label)}
          <button type="button" class={["h-6 flex-1 rounded-sm text-[10px] text-muted-foreground hover:text-foreground", !!live === on && "bg-background text-foreground shadow-sm"]}
            data-pos-mode={label} onclick={() => setXY(id, on ? (currentXY(id) ?? [50, 50]) : null)}>{label}</button>
        {/each}
      </div>
      {#if live}
        <div class="flex flex-col gap-1.5">
          <!-- The pad is the banner: click or drag to place the box. -->
          <div class="relative h-[90px] w-full cursor-crosshair touch-none rounded-md border border-border bg-muted/40" data-pos-pad="1" role="presentation"
            onpointerdown={(ev) => { const pad = ev.currentTarget as HTMLElement; dragXY(id, ev, (cx, cy) => { const r = pad.getBoundingClientRect(); return [S.clampPct(((cx - r.left) / r.width) * 100), S.clampPct(((cy - r.top) / r.height) * 100)]; }); }}>
            <div class="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow" style="left:{live[0]}%;top:{live[1]}%"></div>
          </div>
          <div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>X</span>{@render axis(0)}<span>%</span><span class="ml-1">Y</span>{@render axis(1)}<span>%</span>
          </div>
          <p class="text-[11px] leading-relaxed text-muted-foreground">Editing {device}. Drag the dot here or the ✥ handle on the canvas; each device keeps its own position.</p>
        </div>
      {/if}
    </div>
  </div>
</div>
