<script lang="ts">
  // Per-field responsive dot (StylePanel.dot): filled while this screen size overrides the field, hollow while it only
  // inherits one. Click clears the override, or pins the inherited value as one.
  import { showsDot } from "@auvyx/editor-core";
  import { fieldOf, toggleOverrideOf } from "./state.svelte";
  let { prop }: { prop: string } = $props();
  const f = $derived(fieldOf(prop));
</script>

<button class={["size-2.5 shrink-0 rounded-full border", f.isOverride && "border-transparent bg-blue-600", f.canPin && "border-muted-foreground/60 hover:border-foreground"]}
  data-override={prop} style:display={showsDot(f) ? "block" : "none"}
  title={f.isOverride ? `Overridden on this screen size · click to use the wider value (${f.inherited ?? "default"})` : `Inherited · click to override on this screen size (${f.inherited ?? ""})`}
  onclick={(e) => { e.stopPropagation(); toggleOverrideOf(prop); }}></button>
