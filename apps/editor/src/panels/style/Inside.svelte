<script lang="ts">
  // The Layout card (StylePanel.inside): how the things inside a container are shown, in plain words (Stack, Row,
  // Grid with its columns, Block or Free); then where they sit and the gap between them.
  import { KINDS, getStyle, repeatColumns, effective, type LayoutMode } from "@auvyx/editor-core";
  import { resolveValue } from "@auvyx/style-engine";
  import { Icon } from "../../ui/kit";
  import type { IconName } from "../../ui/icons";
  import { store } from "../../lib/store.svelte";
  import { bps, fieldOf, set, setAll } from "./state.svelte";
  import { ownMode, pickMode, resolvedMode } from "./modes.svelte";
  import Num from "./Num.svelte";
  import Labeled from "./Labeled.svelte";

  const node = $derived(store.node);
  const isTrack = (n: NonNullable<typeof node>) => n.kind === "Section" && !!resolveValue(n.styles, bps(), store.breakpoint, "default", "scroll-snap-type")?.value.trim().startsWith("x");
  const isHeaderPreset = (cls: string) => cls.split(/\s+/).includes("auvyx-hv");
  const applies = $derived(!!node && KINDS[node.kind].container && node.kind !== "Accordion" && !isTrack(node) && !isHeaderPreset(node.className));
  const choices: [LayoutMode, string, string][] = [
    ["Column", "Stack", "Vertical: one under the other"],
    ["Row", "Row", "Horizontal: side by side"],
    ["Grid", "Grid", "A grid of equal columns"],
    ["Block", "Block", "Normal flow, children stack and fill the width"],
    ["Free", "Free", "Free (Figma freeform): place children anywhere"],
  ];
  const resolved = $derived(resolvedMode());
  const own = $derived(ownMode());
  const flowing = $derived(resolved === "Row" || resolved === "Column" || resolved === "Grid");
  const colsNow = $derived(repeatColumns(effective(fieldOf("grid-template-columns"))));

  // 3×3 alignment like Figma auto layout. Row: x = justify-content, y = align-items (swapped for columns).
  const pos: Record<string, number> = { "flex-start": 0, start: 0, center: 1, "flex-end": 2, end: 2 };
  const values = ["flex-start", "center", "flex-end"];
  const gridValues = ["start", "center", "end"];
  const ev = (p: string) => { const f = fieldOf(p); return f.own ?? f.inherited; };
  const cell = $derived.by((): [number | undefined, number | undefined] => {
    const j = ev("justify-content"), a = ev("align-items"), ji = ev("justify-items");
    const at = (x: string | undefined) => (x === undefined ? undefined : pos[x]);
    if (resolved === "Row") return [j === undefined ? 0 : at(j), at(a)];
    if (resolved === "Column") return [at(a), j === undefined ? 0 : at(j)];
    if (resolved === "Grid") return [at(ji), at(a)];
    return [undefined, undefined];
  });
  function align(x: number, y: number) {
    setAll(resolved === "Row" ? [["justify-content", values[x]], ["align-items", values[y]]]
      : resolved === "Column" ? [["align-items", values[x]], ["justify-content", values[y]]]
      : resolved === "Grid" ? [["justify-items", gridValues[x]], ["align-items", gridValues[y]]] : []);
  }
  const justify = $derived(fieldOf("justify-content"));
  const wrap = $derived(fieldOf("flex-wrap"));
</script>

{#snippet iconToggle(icon: IconName, tipText: string, active: boolean, inherited: boolean, onPick: () => void)}
  <button class={["flex h-6 flex-1 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground", active && "bg-background text-foreground shadow-sm", inherited && !active && "text-orange-600"]}
    title={tipText} onclick={onPick}><Icon name={icon} size={14} /></button>
{/snippet}

<div style:display={applies ? "flex" : "none"} class="auvyx-card flex flex-col gap-2.5 px-3 py-3" data-inside="1">
  <div class="flex h-6 items-center px-0.5"><span class="text-xs font-medium" title="How the content inside is shown">Layout</span></div>
  <div class="flex gap-0.5 rounded-md bg-muted/70 p-0.5">
    {#each choices as [m, label, tip] (m)}
      <button type="button" class={["h-7 flex-1 rounded-sm px-1 text-[11px] text-muted-foreground hover:text-foreground", own === m && "bg-background text-foreground shadow-sm", resolved === m && own !== m && "text-orange-600"]}
        data-inside-mode={label} title={tip} onclick={() => pickMode(m)}>{label}</button>
    {/each}
  </div>
  <!-- Grid: how many columns, one click (Flatsome's Row columns). -->
  <div class="flex flex-col gap-1.5" style:display={resolved === "Grid" ? "flex" : "none"} data-inside-columns="1">
    <div class="grid grid-cols-[52px_1fr] items-center gap-1.5">
      <span class="text-[11px] text-muted-foreground">Columns</span>
      <div class="flex gap-0.5 rounded-md bg-muted/70 p-0.5">
        {#each [1, 2, 3, 4, 5, 6] as n (n)}
          <button type="button" class={["h-6 flex-1 rounded-sm text-[10px] text-muted-foreground hover:text-foreground", colsNow === String(n) && "bg-background text-foreground shadow-sm"]}
            onclick={() => set("grid-template-columns", String(n), "inside-cols")}>{n}</button>
        {/each}
      </div>
    </div>
    <!-- Any column template ("3fr 1fr", "repeat(auto-fit, minmax(240px, 1fr))"). -->
    <div class="grid grid-cols-[52px_1fr] items-center gap-1.5"><span class="text-[11px] text-muted-foreground">Custom</span><Num prefix="▦" prop="grid-template-columns" options={{ unit: "" }} /></div>
  </div>
  <!-- Where the things sit, and the gap between them (auto layout). -->
  <div class="flex gap-2" style:display={flowing ? "flex" : "none"}>
    <div class="grid size-[72px] shrink-0 grid-cols-3 rounded-md bg-muted/70 p-0.5" title="Alignment">
      {#each [0, 1, 2] as y (y)}
        {#each [0, 1, 2] as x (x)}
          {@const on = cell[0] === x && cell[1] === y}
          <!-- svelte-ignore a11y_consider_explicit_label -->
          <button class={["group flex items-center justify-center rounded-sm hover:bg-background", on && "bg-background shadow-sm"]} onclick={() => align(x, y)}>
            <span class={["block size-1 rounded-full bg-muted-foreground/40 group-hover:bg-muted-foreground", on && "!h-1 !w-3.5 !rounded-sm !bg-blue-600"]}></span>
          </button>
        {/each}
      {/each}
    </div>
    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <Labeled text="Gap"><Num prefix="↔" prop="gap" options={{ min: 0 }} /></Labeled>
      {#if resolved !== "Grid"}
        <div class="flex gap-0.5 rounded-md bg-muted/70 p-0.5">
          {@render iconToggle("betweenH", "Space between", justify.own === "space-between", justify.inherited === "space-between", () => set("justify-content", "space-between", "between"))}
          {@render iconToggle("wrap", "Wrap", wrap.own === "wrap", wrap.inherited === "wrap", () => {
            const n = store.node;
            set("flex-wrap", n && getStyle(n.styles, store.breakpoint, store.styleState, "flex-wrap") === "wrap" ? undefined : "wrap", "wrap");
          })}
        </div>
      {/if}
    </div>
  </div>
</div>
