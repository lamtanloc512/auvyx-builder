<script lang="ts">
  import Field from "./Field.svelte";
  import Reset from "./Reset.svelte";
  import { BOX, setStyle, styleValue } from "./style.svelte";
  let { prop, label }: { prop: string; label: string } = $props();
  const v = $derived(styleValue(prop));
</script>

<Field {label} control={prop} responsive>
  <div class="grid grid-cols-[32px_minmax(0,1fr)_24px] items-center gap-2">
    <input type="color" class="h-8 w-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5" value={/^#[0-9a-fA-F]{6}$/.test(v.value) ? v.value : "#000000"}
      oninput={(e) => setStyle(prop, e.currentTarget.value, true)} />
    <input class={[`${BOX} font-mono`, !v.own && "italic text-muted-foreground"]} placeholder="Default" value={v.value} oninput={(e) => setStyle(prop, e.currentTarget.value, true)} />
    <Reset show={v.own} onreset={() => setStyle(prop, undefined)} />
  </div>
</Field>
