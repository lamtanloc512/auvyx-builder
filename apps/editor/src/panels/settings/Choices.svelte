<script lang="ts">
  // SettingsPanel.choices: a component prop's choices, on one line (Fit) or wrapping.
  import type { Settings } from "@auvyx/editor-core";
  let { current, options, oneLine = false, pick }: { current: string; options: Settings.UiChoice[]; oneLine?: boolean; pick: (v: string) => void } = $props();
</script>

<div class={oneLine ? "flex gap-0.5 rounded-lg bg-muted p-0.5" : "flex flex-wrap gap-1"}>
  {#each options as c (c.value)}
    <button type="button" class={[oneLine ? "h-7 flex-1 rounded-md px-0.5 text-[11px] text-muted-foreground hover:text-foreground" : "h-7 rounded-md border border-transparent px-2 text-[11px] text-muted-foreground hover:bg-muted",
      current === c.value && (oneLine ? "bg-background text-foreground shadow-xs" : "border-border bg-muted text-foreground")]} onclick={() => pick(c.value)}>{c.label}</button>
  {/each}
</div>
