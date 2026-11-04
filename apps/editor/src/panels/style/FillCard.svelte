<script lang="ts">
  // Background (StylePanel.fill): colour, image URL and overlay (Flatsome Banner: separate controls sharing one
  // background-image value), the library or a gradient, then size and position once there is an image.
  import { composeBackground, effective, parseBackground, type BackgroundLayers } from "@auvyx/editor-core";
  import { store } from "../../lib/store.svelte";
  import { boxCls, computed, fieldOf, pretty, set, setAll } from "./state.svelte";
  import Addable from "./Addable.svelte";
  import ColorRow from "./ColorRow.svelte";
  import Labeled from "./Labeled.svelte";
  import SelectBox from "./SelectBox.svelte";
  import InlineMedia from "./InlineMedia.svelte";

  const gradients = [
    "linear-gradient(135deg, #2563eb, #7c3aed)",
    "linear-gradient(135deg, #f59e0b, #ef4444)",
    "linear-gradient(135deg, #10b981, #0ea5e9)",
    "linear-gradient(180deg, #0f172a, #1e293b)",
    "radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.45), transparent 60%)",
    "linear-gradient(rgba(15, 23, 42, 0.55), rgba(15, 23, 42, 0.55))",
  ];
  let picking = $state(false);
  const image = $derived(fieldOf("background-image"));
  const current = $derived(effective(image) ?? "");
  const sized = $derived(effective(fieldOf("background-size")) !== undefined);

  function setLayers(f: (l: BackgroundLayers) => BackgroundLayers) {
    const next = f(parseBackground(current));
    const fit: [string, string | undefined][] = sized || !next.image ? [] : [["background-size", "cover"], ["background-position", "center"]];
    // A box with a background video repeats its overlay over the video (BoxEffects --auvyx-scrim).
    const n = store.node;
    const scrim: [string, string | undefined][] = n && n.className.split(" ").includes("auvyx-has-bg-video") ? [["--auvyx-scrim", next.overlay || undefined]] : [];
    setAll([["background-image", composeBackground(next)], ...fit, ...scrim]);
  }
  function pickImage(url: string) {
    setLayers((l) => ({ ...l, image: new URL(url, window.location.href).href }));
    picking = false;
  }
  const painted = $derived.by(() => {
    const bg = computed("background-color");
    const img = computed("background-image");
    return (bg !== "" && bg !== "transparent" && !bg.endsWith(", 0)")) || (img !== "" && img !== "none");
  });
  let editing = $state<"image" | "overlay" | null>(null);
</script>

{#snippet layerInput(which: "image" | "overlay", placeholderText: string)}
  {@const raw = parseBackground(current)[which]}
  <div class={boxCls}>
    <input class="h-full w-full min-w-0 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/70" placeholder={placeholderText}
      value={editing === which ? raw : pretty(raw)} onfocus={() => (editing = which)} onblur={() => (editing = null)}
      onchange={(e) => { const v = e.currentTarget.value.trim(); setLayers((l) => ({ ...l, [which]: v })); }} />
  </div>
{/snippet}

<Addable title="Background" props={["background-color", "background-image", "background-size", "background-position"]} add={() => setAll([["background-color", "#ffffff"]])} showing={painted}>
  <ColorRow prop="background-color" />
  <Labeled text="Image URL"><div data-bg-image="1">{@render layerInput("image", "https://")}</div></Labeled>
  <Labeled text="Overlay">
    <div class="flex items-center gap-1" data-bg-overlay="1">
      <div class="min-w-0 flex-1">{@render layerInput("overlay", "rgba(0, 0, 0, 0.35)")}</div>
      {#each [["None", ""], ["Dark", "rgba(0, 0, 0, 0.35)"], ["Light", "rgba(255, 255, 255, 0.45)"]] as [name, c] (name)}
        <button class="h-6 rounded-md bg-muted/70 px-1.5 text-[11px] hover:bg-muted" onclick={() => setLayers((l) => ({ ...l, overlay: c }))}>{name}</button>
      {/each}
    </div>
  </Labeled>
  <Labeled text="Library or gradient">
    <div class="flex flex-col gap-1.5">
      <div class="flex flex-wrap items-center gap-1">
        <button class="h-6 rounded-md bg-muted/70 px-2 text-[11px] hover:bg-muted" onclick={() => (picking = !picking)}>{picking ? "Close" : "Library…"}</button>
        {#each gradients as g (g)}
          <button class="size-6 rounded-full border border-black/10" title={g} style:background-image={g} onclick={() => set("background-image", g, "gradient")}></button>
        {/each}
      </div>
      {#if picking}<InlineMedia onPick={pickImage} />{/if}
      <div class="grid grid-cols-2 gap-1.5" style:display={(image.own ?? image.inherited) !== undefined ? "grid" : "none"}>
        <SelectBox prop="background-size" options={[["cover", "Cover"], ["contain", "Contain"], ["auto", "Original"]]} empty="Size" />
        <SelectBox prop="background-position" options={[["center", "Center"], ["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"]]} empty="Position" />
      </div>
    </div>
  </Labeled>
</Addable>
