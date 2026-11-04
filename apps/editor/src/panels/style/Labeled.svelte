<script lang="ts">
  // A caption above a control (StylePanel.labeled).
  import type { Snippet } from "svelte";
  let { text, children }: { text: string; children: Snippet } = $props();
</script>

<div class="flex min-w-0 flex-col gap-1"><span class="text-[11px] text-muted-foreground">{text}</span>{@render children()}</div>
