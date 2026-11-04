<script lang="ts">
  // A named control (BuilderUi.field): the name in a 64px column, the control beside it.
  import type { Snippet } from "svelte";
  let { name, children }: { name: string; children: Snippet } = $props();
</script>

<div class="grid grid-cols-[64px_1fr] items-center gap-1"><span class="text-[11px] text-muted-foreground">{name}</span>{@render children()}</div>
