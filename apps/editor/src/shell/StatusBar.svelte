<script lang="ts">
  // The status bar (U/Main.scala statusBar): Home › … › the selection, then Edit | Lyra · theme.
  import { ancestors } from "@auvyx/editor-core";
  import { Icon } from "../ui/kit";
  import { config } from "../lib/config";
  import { iconOf, nameOf } from "../lib/labels";
  import { kindLabel } from "../lib/parts";
  import { store } from "../lib/store.svelte";
  import { theme, cap } from "../lib/theme.svelte";

  const home = config.title || "Home";
  const chain = $derived(store.selected && store.doc.nodes[store.selected]
    ? [...ancestors(store.doc, store.selected).reverse(), store.selected].map((id) => store.doc.nodes[id]!).filter(Boolean) : []);
</script>

<div class="flex h-7 shrink-0 items-center gap-3 px-3 text-[11px] text-muted-foreground" style:display={store.preview ? "none" : "flex"}>
  <div class="flex min-w-0 items-center">
    {#if !chain.length}
      <div class="flex min-w-0 items-center gap-1.5">
        <span class="max-w-56 truncate font-medium text-foreground" translate="no">{home}</span>
        <span>{kindLabel()}</span>
      </div>
    {:else}
      <div class="flex min-w-0 items-center">
        <button class="shrink-0 rounded-sm px-1 py-0.5 hover:bg-muted hover:text-foreground" title="Clear the selection" onclick={() => (store.selected = null)}>{home}</button>
        {#each chain as n, i (n.id)}
          <span class="flex min-w-0 items-center">
            <span class="px-0.5">›</span>
            {#if i === chain.length - 1}
              <span class="flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 font-medium text-foreground"><Icon name={iconOf(n.kind)} size={12} class="shrink-0" /><span class="max-w-36 truncate">{nameOf(n)}</span></span>
            {:else}
              <button class="flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-muted hover:text-foreground" title="Select" onclick={() => (store.selected = n.id)}>
                <Icon name={iconOf(n.kind)} size={12} class="shrink-0" /><span class="max-w-36 truncate">{nameOf(n)}</span>
              </button>
            {/if}
          </span>
        {/each}
      </div>
    {/if}
  </div>
  <div class="flex-1"></div>
  <span>{store.preview ? "Preview" : "Edit"}</span>
  <span class="h-3 w-px bg-border"></span>
  <span>Lyra · {cap(theme.mode)}</span>
</div>
