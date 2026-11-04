<script lang="ts" generics="T">
  // A segmented choice (BuilderUi.seg): picking the active one does nothing.
  let { attr, choices, active, pick }: { attr: string; choices: [T, string][]; active: T; pick: (v: T) => void } = $props();
</script>

<div class="flex gap-0.5 rounded-md bg-muted/70 p-0.5" data-builder-opt={attr}>
  {#each choices as [v, label] (label)}
    <button
      type="button"
      class={["h-6 flex-1 rounded-sm px-1 text-[10px] text-muted-foreground hover:text-foreground", v === active && "bg-background text-foreground shadow-sm"]}
      aria-pressed={String(v === active) as "true" | "false"}
      data-value={label}
      onclick={() => { if (v !== active) pick(v); }}
    >{label}</button>
  {/each}
</div>
