<script lang="ts">
  // One settings row (SettingsPanel.row): a 64px label, then the control.
  import type { Snippet } from "svelte";
  let { name, children, ...rest }: { name: string; children: Snippet; [attr: `data-${string}`]: string } = $props();
</script>

<div class="grid grid-cols-[64px_1fr] items-start gap-1" {...rest}><span class="pt-1.5 text-[11px] text-muted-foreground">{name}</span><div>{@render children()}</div></div>
