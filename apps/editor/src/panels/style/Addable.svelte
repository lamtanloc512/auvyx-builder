<script lang="ts">
  // A card that is empty until added (+), like Figma's Fill / Stroke / Effects (StylePanel.addable). Open when set
  // here or when the element already shows it (theme button background, inherited border).
  import type { Snippet } from "svelte";
  import { hasAny, setAll } from "./state.svelte";
  let { title, props, add, showing = false, children }: { title: string; props: readonly string[]; add: () => void; showing?: boolean; children: Snippet } = $props();
  const own = $derived(hasAny(props));
  const present = $derived(own || showing);
</script>

<div class="auvyx-card" data-style-section={title}>
  <div class="flex h-10 items-center gap-1.5 px-3.5">
    <span class={["flex-1 text-xs font-medium", !present && "text-muted-foreground"]}>{title}</span>
    {#if own}
      <button class="flex size-6 items-center justify-center rounded-sm text-base leading-none text-muted-foreground hover:bg-muted hover:text-foreground" title={`Remove ${title}`}
        onclick={(e) => { e.stopPropagation(); setAll(props.map((p) => [p, undefined])); }}>−</button>
    {:else}
      <button class="flex size-6 items-center justify-center rounded-sm text-base leading-none text-muted-foreground hover:bg-muted hover:text-foreground" title={`Add ${title}`}
        onclick={(e) => { e.stopPropagation(); add(); }}>+</button>
    {/if}
  </div>
  <div class="flex flex-col gap-2.5 px-3 pb-3" style:display={present ? "flex" : "none"}>{@render children()}</div>
</div>
