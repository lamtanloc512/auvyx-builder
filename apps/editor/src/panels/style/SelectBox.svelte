<script lang="ts">
  // A select bound to a property (StylePanel.selectBox). Unset shows what the element really gets (theme,
  // inheritance): "Semibold · auto" rather than a dash.
  import { effective, sourceOf } from "@auvyx/editor-core";
  import { Select, selectItems } from "../../ui/kit";
  import Dot from "./Dot.svelte";
  import { computed, fieldOf, set } from "./state.svelte";
  let { prop, options, empty = "—" }: { prop: string; options: [string, string][]; empty?: string } = $props();
  const f = $derived(fieldOf(prop));
  const items = $derived.by(() => {
    const now = computed(prop);
    const hit = options.find(([v]) => v === now);
    return [{ value: "", label: hit ? `${hit[1]} · auto` : empty }, ...selectItems(options)];
  });
</script>

<div class="flex min-w-0 items-center gap-1.5">
  <Select size="field" value={effective(f) ?? ""} options={items} onValue={(v: string) => set(prop, v || undefined, "select")} class={sourceOf(f) === "here" ? "text-blue-600" : ""} />
  <Dot {prop} />
</div>
