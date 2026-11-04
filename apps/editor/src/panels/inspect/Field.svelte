<script lang="ts">
  // One control row: label left (with the screen it edits), control right; `wide` stacks them.
  import type { Snippet } from "svelte";
  import { Icon } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  let { label, control, responsive = false, wide = false, children }: { label: string; control: string; responsive?: boolean; wide?: boolean; children: Snippet } = $props();
  const icon = $derived(store.breakpoint === "base" ? "monitor" : store.breakpoint === "tablet" ? "tablet" : store.breakpoint === "mobile" ? "phone" : "frame") as "monitor";
</script>

<div class={wide ? "flex flex-col gap-1.5" : "grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2"} data-control={control}>
  <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
    {label}
    {#if responsive}<span class="opacity-80" title="Edits this screen"><Icon name={icon} size={12} /></span>{/if}
  </span>
  <div class="min-w-0">{@render children()}</div>
</div>
