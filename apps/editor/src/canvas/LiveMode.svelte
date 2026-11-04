<script lang="ts">
  // Edit or Live, above the workspace (U/LiveView.scala header): the mode switch, what the mode means, Refresh while Live.
  import { liveMode, openLive, closeLive } from "../lib/live.svelte";

  const live = $derived(liveMode.url !== null);
  const note = $derived(liveMode.opening ? "Opening the page as a visitor sees it…"
    : live ? "As a visitor sees it. Code runs here, isolated from your account."
    : "Code is stopped while you edit. Switch to Live to see it run.");
</script>

{#snippet mode(label: string, on: boolean, pick: () => void, attr: string)}
  <button class={["rounded px-2.5 py-1 font-medium text-muted-foreground hover:text-foreground", on && "bg-background text-foreground shadow-sm"]}
    data-studio-mode-pick={attr} disabled={liveMode.opening} onclick={pick}>{label}</button>
{/snippet}

<div class="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-background px-3 text-xs" data-studio-mode="1">
  <div class="inline-flex rounded-md bg-muted p-0.5" role="group">
    {@render mode("Edit", !live, closeLive, "edit")}
    {@render mode("Live", live, () => { if (!live) openLive(); }, "live")}
  </div>
  <span class="truncate text-muted-foreground">{note}</span>
  <div class="flex-1"></div>
  {#if live}
    <button class="rounded-md px-2 py-1 hover:bg-muted" disabled={liveMode.opening} onclick={openLive}>{liveMode.opening ? "Refreshing…" : "Refresh"}</button>
  {/if}
</div>
