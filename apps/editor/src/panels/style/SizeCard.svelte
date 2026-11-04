<script lang="ts">
  // Size: how big the element itself is (StylePanel.layout, sizeBox, sectionWidth); the layout of its content is the
  // Layout card at the top.
  import { sizeMode } from "@auvyx/editor-core";
  import { store } from "../../lib/store.svelte";
  import { fieldOf, hasAny, set } from "./state.svelte";
  import Section from "./Section.svelte";
  import Num from "./Num.svelte";
  import Labeled from "./Labeled.svelte";

  let minMax = $state(false);
  const rootSection = $derived(store.node && store.node.kind === "Section" && store.doc.roots.includes(store.node.id) ? store.node.id : null);
  const clip = $derived(fieldOf("overflow"));
  const min0 = { min: 0 };
  const alignOf = (id: string) => { const a = store.doc.nodes[id]?.align ?? ""; return a === "" ? "Content" : a.charAt(0).toUpperCase() + a.slice(1); };
  const WIDTH_TIPS: Record<string, string> = { Content: "Width: theme content column", Wide: "Width: theme wide width", Full: "Width: full page" };

  function pick(prop: string, m: string) {
    // Fixed starts from the measured size.
    const el = store.selected ? store.elements.get(store.selected) : undefined;
    const measured = el ? Math.round(prop === "width" ? el.offsetWidth : el.offsetHeight) : undefined;
    set(prop, m === "Fill" ? "100%" : m === "Hug" ? "fit-content" : m === "Fixed" ? (measured === undefined ? undefined : `${measured}px`) : undefined, "mode");
  }
</script>

<!-- Subframe: "W  375  [Hug | Fill]". Pressing the lit one again goes back to Auto; typing a number is Fixed. -->
{#snippet sizeBox(prefix: string, prop: string)}
  {@const f = fieldOf(prop)}
  {@const current = sizeMode(f.own ?? f.inherited)}
  <div class="flex items-center gap-1.5" data-size-box={prop}>
    <div class="min-w-0 flex-1"><Num {prefix} {prop} options={{ min: 0 }} /></div>
    <div class="flex shrink-0 gap-0.5 rounded-lg bg-muted p-0.5">
      {#each ["Hug", "Fill"] as m (m)}
        <button type="button" class={["h-6 rounded-md px-2 text-[11px] text-muted-foreground hover:text-foreground", current === m && "bg-background text-foreground shadow-xs"]}
          data-size-mode={m} title={m === "Hug" ? "Hug: as big as the content" : "Fill: as big as the parent"} onclick={() => pick(prop, current === m ? "Auto" : m)}>{m}</button>
      {/each}
    </div>
  </div>
{/snippet}

<Section title="Size" props={["width", "height", "min-width", "min-height", "max-width", "max-height", "overflow", "rotate"]}>
  <div class="flex flex-col gap-1.5">
    {#if rootSection}
      {@const id = rootSection}
      <div class="flex flex-col gap-1.5">
        <!-- Page-level sections: WordPress alignment (the theme keeps content in a column; Full breaks out of it). -->
        <div class="flex gap-0.5 rounded-md bg-muted/70 p-0.5">
          {#each ["Content", "Wide", "Full"] as o (o)}
            <button class={["h-6 flex-1 rounded-sm px-1 text-[10px] text-muted-foreground hover:text-foreground", alignOf(id) === o && "bg-background text-foreground shadow-sm"]}
              title={WIDTH_TIPS[o]} data-size-mode={o} onclick={() => store.updateNode(id, (n) => ({ ...n, align: o === "Content" ? "" : o.toLowerCase() }))}>{o}</button>
          {/each}
        </div>
        {@render sizeBox("H", "height")}
      </div>
    {:else}
      <div class="flex flex-col gap-1.5">{@render sizeBox("W", "width")}{@render sizeBox("H", "height")}</div>
    {/if}
    <button class="self-start text-[11px] text-muted-foreground hover:text-foreground" onclick={() => (minMax = !minMax)}>{minMax ? "− Min / max" : "+ Min / max"}</button>
    <div class="grid grid-cols-2 gap-1.5" style:display={minMax || hasAny(["min-width", "min-height", "max-width", "max-height"]) ? "grid" : "none"}>
      <Labeled text="Min W"><Num prefix="↦" prop="min-width" options={min0} /></Labeled>
      <Labeled text="Min H"><Num prefix="↧" prop="min-height" options={min0} /></Labeled>
      <Labeled text="Max W"><Num prefix="⇥" prop="max-width" options={min0} /></Labeled>
      <Labeled text="Max H"><Num prefix="⤓" prop="max-height" options={min0} /></Labeled>
    </div>
  </div>
  <div class="grid grid-cols-2 items-end gap-1.5">
    <Labeled text="Rotation"><Num prefix="∠" prop="rotate" options={{ unit: "deg" }} /></Labeled>
    <label class="flex h-7 cursor-pointer items-center gap-2 text-[11px]">
      <input type="checkbox" class="size-3.5 accent-blue-600" checked={(clip.own ?? clip.inherited) === "hidden"}
        onclick={(e) => set("overflow", e.currentTarget.checked ? "hidden" : undefined, "clip")} />
      Clip content
    </label>
  </div>
</Section>
