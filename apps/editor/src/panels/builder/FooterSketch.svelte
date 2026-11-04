<script lang="ts">
  // A footer preset drawn from its data (FooterBuilderPanel.sketch): rows of columns, each item in the shape it takes in
  // a footer — a logo, a stack of links under a heading, a newsletter field, social dots, payment chips — so the six
  // presets read at a glance instead of six rows of identical bars.
  import { FooterBuilder as FB } from "../../lib/builderCore";

  let { preset }: { preset: FB.FooterPreset } = $props();

  const tone = $derived(preset.tone ?? "dark");
  const dark = $derived(tone === "dark" || tone === "brand");
  const align = { start: "items-start", center: "items-center", end: "items-end" } as const;

  // Static class names only (Tailwind scans this file).
  const skin = $derived(
    dark
      ? { box: "bg-zinc-900", bar: "bg-white/60", dim: "bg-white/30", line: "bg-white/15", field: "border-white/35" }
      : { box: "bg-zinc-100", bar: "bg-zinc-500/70", dim: "bg-zinc-500/40", line: "bg-zinc-900/15", field: "border-zinc-900/30" },
  );
</script>

{#snippet bar(w: string, h = "h-1")}
  <span class={["block rounded-full", h, w, skin.dim]}></span>
{/snippet}

{#snippet item(k: FB.FooterItemKind)}
  {#if k === "Logo"}
    <span class="flex items-center gap-1">
      <span class={["block size-2.5 rounded-[2px]", skin.bar]}></span>
      <span class={["block h-1.5 w-6 rounded-full", skin.bar]}></span>
    </span>
  {:else if k === "About" || k === "Text"}
    <span class="flex w-full flex-col gap-1">{@render bar("w-full")}{@render bar("w-3/4")}</span>
  {:else if k === "Links"}
    <span class="flex w-full flex-col gap-1">
      {@render bar("w-1/2", "h-1.5")}
      {@render bar("w-full")}{@render bar("w-4/5")}{@render bar("w-2/3")}
    </span>
  {:else if k === "Newsletter"}
    <span class="flex w-full items-center gap-1">
      <span class={["h-3.5 min-w-0 flex-1 rounded-[2px] border", skin.field]}></span>
      <span class={["block size-3.5 shrink-0 rounded-[2px]", skin.bar]}></span>
    </span>
  {:else if k === "Social"}
    <span class="flex items-center gap-1">
      <span class={["block size-2 rounded-full", skin.bar]}></span>
      <span class={["block size-2 rounded-full", skin.bar]}></span>
      <span class={["block size-2 rounded-full", skin.dim]}></span>
    </span>
  {:else if k === "Payments"}
    <span class="flex flex-wrap items-center gap-1">
      <span class={["block h-2 w-3.5 rounded-[1px]", skin.dim]}></span>
      <span class={["block h-2 w-3.5 rounded-[1px]", skin.dim]}></span>
      <span class={["block h-2 w-3.5 rounded-[1px]", skin.dim]}></span>
    </span>
  {:else if k === "Contact"}
    <span class="flex w-full flex-col gap-1">
      <span class="flex items-center gap-1"><span class={["block size-1.5 rounded-full", skin.bar]}></span>{@render bar("w-2/3")}</span>
      <span class="flex items-center gap-1"><span class={["block size-1.5 rounded-full", skin.dim]}></span>{@render bar("w-1/2")}</span>
    </span>
  {:else if k === "Copyright"}
    {@render bar("w-10")}
  {:else}
    <span class={["block h-3 w-full rounded-[2px] border border-dashed", skin.field]}></span>
  {/if}
{/snippet}

<div class={["flex h-[74px] flex-col justify-center gap-2 overflow-hidden rounded-md p-2", skin.box]}>
  {#each preset.rows as r, i (i)}
    {#if r.divider}<span class={["block h-px w-full", skin.line]}></span>{/if}
    <div class="grid items-start gap-1.5" style="grid-template-columns:repeat({r.columns.length},minmax(0,1fr))">
      {#each r.columns as c, j (j)}
        <div class={["flex min-w-0 flex-col gap-1", align[c.align ?? "start"]]}>
          {#each c.items as k, n (n)}
            {@render item(k)}
          {/each}
        </div>
      {/each}
    </div>
  {/each}
</div>
