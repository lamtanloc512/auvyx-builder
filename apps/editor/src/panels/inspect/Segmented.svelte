<script lang="ts">
  // Icon buttons; clicking the one that is on clears it.
  import { Icon } from "../../ui/kit";
  import type { IconName } from "../../ui/icons";
  import Field from "./Field.svelte";
  import { setStyle, styleValue } from "./style.svelte";
  let { prop, label, options }: { prop: string; label: string; options: [string, IconName, string][] } = $props();
  const v = $derived(styleValue(prop));
</script>

<Field {label} control={prop} responsive>
  <div class="flex rounded-md bg-muted p-0.5">
    {#each options as [k, icon, tip] (k)}
      <button type="button" title={tip} class={["flex h-7 flex-1 items-center justify-center rounded text-muted-foreground", v.value === k && "bg-background text-foreground shadow-sm"]}
        onclick={() => setStyle(prop, v.value === k ? undefined : k)}><Icon name={icon} size={14} /></button>
    {/each}
  </div>
</Field>
