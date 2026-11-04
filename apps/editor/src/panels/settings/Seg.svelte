<script lang="ts" generics="T">
  // A row of small choices on a muted strip (SettingsPanel sliderSettings.seg and the like): the one on is raised.
  let { options, active, pick, attr = "", layout = "flex", item = "h-6 flex-1 rounded-sm px-1 text-[10px] text-muted-foreground hover:text-foreground", dataName = "slider-opt", values }:
    { options: [T, string][]; active: T | undefined; pick: (v: T) => void; attr?: string; layout?: string; item?: string; dataName?: string; values?: string[] } = $props();
</script>

<div class="{layout} gap-0.5 rounded-md bg-muted/70 p-0.5" {...{ [`data-${dataName}`]: attr || undefined }}>
  {#each options as [v, label], i (i)}
    <button type="button" class={[item, active === v && "bg-background text-foreground shadow-sm"]} data-value={values?.[i] ?? label} onclick={() => pick(v)}>{label}</button>
  {/each}
</div>
