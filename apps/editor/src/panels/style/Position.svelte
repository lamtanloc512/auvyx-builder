<script lang="ts">
  // Figma's Position for children of free frames (StylePanel.position): X/Y in the frame and constraints (how they
  // follow its size).
  import type { FreeH, FreeV, Geo } from "@auvyx/editor-core";
  import { Select } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { boxCls, computedTick } from "./state.svelte";
  import { constraints, geo, isChild, place } from "./free";
  import Section from "./Section.svelte";
  import Labeled from "./Labeled.svelte";

  const target = $derived.by(() => { void store.doc; void store.breakpoint; return store.selected && isChild(store.selected) ? store.selected : null; });
  const geoNow = $derived.by((): Geo | null => {
    void computedTick.tick; void store.drawn;
    const el = store.selected ? store.elements.get(store.selected) : undefined;
    return el?.isConnected ? geo(el) : null;
  });
  let drafts = $state<Record<string, string | null>>({});
  function typed(prefix: "X" | "Y", s: string) {
    drafts[prefix] = s;
    const n = s.trim() === "" ? NaN : Number(s.trim());
    const id = store.selected, el = id ? store.elements.get(id) : undefined;
    if (!isNaN(n) && id && el) { const g = geo(el); place([[id, prefix === "X" ? { ...g, x: n } : { ...g, y: n }]], `pos:${id}:${prefix}`); }
  }
  const H_OPTS: [FreeH, string][] = [["Left", "Left"], ["Right", "Right"], ["LeftRight", "Left & right"], ["Center", "Center"], ["Scale", "Scale"]];
  const V_OPTS: [FreeV, string][] = [["Top", "Top"], ["Bottom", "Bottom"], ["TopBottom", "Top & bottom"], ["Center", "Center"], ["Scale", "Scale"]];
  const hv = $derived.by(() => { void store.doc; void store.breakpoint; void store.styleState; return store.selected ? constraints(store.selected) : (["Left", "Top"] as [FreeH, FreeV]); });
  function pick(axis: 0 | 1, i: string) {
    const id = store.selected, el = id ? store.elements.get(id) : undefined, k = Number(i);
    if (!id || !el || isNaN(k)) return;
    const cur = constraints(id);
    place([[id, geo(el)]], null, axis === 0 ? [H_OPTS[k]![0], cur[1]] : [cur[0], V_OPTS[k]![0]]);
  }
</script>

{#snippet coord(prefix: "X" | "Y")}
  <div class={boxCls}>
    <span class="w-3 shrink-0 text-center text-[10px] font-medium text-muted-foreground">{prefix}</span>
    <input class="h-full w-full min-w-0 bg-transparent text-[11px] outline-none"
      value={drafts[prefix] ?? (geoNow ? String(Math.round(prefix === "X" ? geoNow.x : geoNow.y)) : "")}
      oninput={(e) => typed(prefix, e.currentTarget.value)} onblur={() => (drafts[prefix] = null)} />
  </div>
{/snippet}

<div>
  {#if target}
    <Section title="Position" props={["inset-inline-start", "inset-inline-end", "inset-block-start", "inset-block-end"]}>
      <div class="grid grid-cols-2 gap-1.5">
        <Labeled text="X">{@render coord("X")}</Labeled>
        <Labeled text="Y">{@render coord("Y")}</Labeled>
      </div>
      <div class="grid grid-cols-2 gap-1.5">
        <Labeled text="Horizontal"><Select size="field" value={String(H_OPTS.findIndex(([h]) => h === hv[0]))} options={H_OPTS.map(([, l], i) => ({ value: String(i), label: l }))} onValue={(i: string) => pick(0, i)} /></Labeled>
        <Labeled text="Vertical"><Select size="field" value={String(V_OPTS.findIndex(([v]) => v === hv[1]))} options={V_OPTS.map(([, l], i) => ({ value: String(i), label: l }))} onValue={(i: string) => pick(1, i)} /></Labeled>
      </div>
      <p class="text-[10px] leading-snug text-muted-foreground">Constraints decide how it follows the frame on wider or narrower screens. Arrow keys nudge (Shift: 10px).</p>
    </Section>
  {/if}
</div>
