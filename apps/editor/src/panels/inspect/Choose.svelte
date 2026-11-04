<script lang="ts">
  import Field from "./Field.svelte";
  import { BOX, setStyle, styleValue } from "./style.svelte";
  let { prop, label, options }: { prop: string; label: string; options: [string, string][] } = $props();
  const v = $derived(styleValue(prop));
</script>

<Field {label} control={prop} responsive>
  <select class={BOX} value={v.value} onchange={(e) => setStyle(prop, e.currentTarget.value)}>
    <option value="">Default</option>
    {#each options as [k, l] (k)}<option value={k}>{l}</option>{/each}
  </select>
</Field>
