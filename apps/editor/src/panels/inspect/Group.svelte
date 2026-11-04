<script lang="ts">
  // A collapsible group of the panel (ElementPanel.group).
  import type { Snippet } from "svelte";
  let { title, open = true, children }: { title: string; open?: boolean; children: Snippet } = $props();
  let shown = $state((() => open)());
</script>

<div class="border-b border-border" data-panel-group={title}>
  <button type="button" class="flex w-full items-center gap-1.5 px-4 py-3 text-left text-xs font-semibold tracking-wide uppercase select-none hover:bg-muted/50"
    aria-expanded={shown} onclick={() => (shown = !shown)}>
    <span class={["text-muted-foreground transition-transform", shown && "rotate-90"]}>›</span>{title}
  </button>
  <div class="flex flex-col gap-3 px-4 pb-4" style:display={shown ? "flex" : "none"}>{@render children()}</div>
</div>
