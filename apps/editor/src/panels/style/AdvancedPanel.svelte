<script lang="ts">
  // The Advanced tab's "Every property" (StylePanel.advancedPanel): every declaration set on this breakpoint/state,
  // and a way to add any allowed property.
  import { isAllowedProperty, isSafeValue } from "@auvyx/style-engine";
  import { sourceOf } from "@auvyx/editor-core";
  import { store } from "../../lib/store.svelte";
  import { boxCls, fieldOf, set, sourceText, tip, watchComputed } from "./state.svelte";
  import { startScrub } from "./scrub";
  import Section from "./Section.svelte";
  import Num from "./Num.svelte";
  watchComputed();
  let newProp = $state("");
  let newValue = $state("");
  const declarations = $derived(Object.keys((store.node?.styles[store.breakpoint] as Record<string, Record<string, string>> | undefined)?.[store.styleState] ?? {}));
  function add() {
    const [p, v] = [newProp.trim(), newValue.trim()];
    if (isAllowedProperty(p) && isSafeValue(v)) {
      set(p, v, "add");
      newProp = "";
      newValue = "";
    } else window.alert("Property or value not allowed.");
  }
</script>

<div class="flex flex-col">
  <Section title="All properties" props={["transform", "transition"]} open={false}>
    <span class="text-[11px] text-muted-foreground">Every property set on this breakpoint/state</span>
    <div class="flex flex-col gap-1.5">
      {#each declarations as p (p)}
        {@const f = fieldOf(p)}
        <div class="grid grid-cols-[96px_1fr] items-center gap-1.5">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class={["truncate text-[11px]", "cursor-ew-resize select-none", sourceText(sourceOf(f))]} title={tip(f)} onpointerdown={(e) => startScrub(e, p, f, {})}>{p}</span>
          <Num prefix="" prop={p} />
        </div>
      {/each}
    </div>
    <div class="grid grid-cols-[1fr_1fr_auto] gap-1">
      <input class={`${boxCls} text-[11px]`} placeholder="property" bind:value={newProp} />
      <input class={`${boxCls} text-[11px]`} placeholder="value" bind:value={newValue} />
      <button class="h-7 rounded-md bg-muted/70 px-2 text-[11px] hover:bg-muted" onclick={add}>Add</button>
    </div>
  </Section>
</div>
