<script lang="ts">
  // Slider layers, Flatsome-style (SettingsPanel.carouselSettings): the strip, the banner copy, or the image. The layer
  // is picked on the bar over the slider (canvas/extras) or here; the slide by its button.
  import { Settings as S } from "@auvyx/editor-core";
  import { Input, Select, Slider } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { carouselUi } from "../../lib/carouselUi.svelte";
  import type { Update } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  import MediaPicker from "./MediaPicker.svelte";
  let { id, update }: { id: string; update: Update } = $props();
  type Slide = S.CarouselSlide;
  const n = $derived(store.doc.nodes[id]);
  const slides = $derived(n ? carouselUi.slidesOf(n) : []);
  const cur = $derived(slides[carouselUi.slide]);
  const q = (key: string) => (n ? S.carouselValue(n.query, key) : "");
  const set = (key: string) => (v: string) => update(`carousel-${key}`, (x) => ({ ...x, query: Object.fromEntries(S.normalizeCarousel({ ...x.query, [key]: v })) }));
  const write = (next: Slide[]) => update("carousel-slides", (x) => carouselUi.withSlides(x, next));
  const editAt = (i: number, f: (s: Slide) => Slide) => { const now = store.doc.nodes[id]; if (!now) return; const all = carouselUi.slidesOf(now); const s = all[i]; if (s) write(all.map((x, k) => (k === i ? f(s) : x))); };
  const edit = (f: (s: Slide) => Slide) => editAt(carouselUi.slide, f);
  const field = (k: keyof Slide) => cur?.[k] ?? "";
  // Bind uploads to the slide that opened the picker, even if the selection changes while uploading.
  const pickFor = $derived(carouselUi.slide);
</script>

{#snippet text(name: string, k: keyof Slide, placeholder = "", trim = false)}
  <Row {name}><Input class="h-7 text-xs" {placeholder} value={field(k)} oninput={(e) => { const v = e.currentTarget.value; edit((s) => ({ ...s, [k]: trim ? v.trim() : v })); }} /></Row>
{/snippet}
{#snippet meter(name: string, k: keyof Slide)}
  <Row {name}><Slider min={0} max={100} aria-label={name} value={Number(field(k)) || 0} onchange={(v) => edit((s) => ({ ...s, [k]: String(v) }))} /></Row>
{/snippet}
{#snippet choose(name: string, k: keyof Slide, options: [string, string][], read?: (s: string) => string)}
  <Row {name}><Select size="sm" value={read ? read(field(k)) : field(k)} options={options.map(([value, label]) => ({ value, label }))} onValue={(v: string) => edit((s) => ({ ...s, [k]: v }))} /></Row>
{/snippet}

{#if n}
  <div class="flex flex-col gap-2" data-carousel-settings="">
    {#if carouselUi.layer === "banner"}
      <div class="flex flex-col gap-2">
        {@render text("Eyebrow", "eyebrow")}
        {@render text("Title", "title")}
        {@render text("Text", "body")}
        {@render text("Button", "button")}
        {@render text("Link", "href", "#", true)}
        <Row name="Colour"><input type="color" class="h-7 w-16 cursor-pointer rounded-md border border-input bg-transparent p-0.5" value={field("color")} oninput={(e) => { const v = e.currentTarget.value; edit((s) => ({ ...s, color: v })); }} /></Row>
      </div>
    {:else if carouselUi.layer === "image"}
      <div class="flex flex-col gap-2">
        {@render text("Source", "image", "https://…", true)}
        {#key pickFor}<MediaPicker onPick={(m) => editAt(pickFor, (s) => ({ ...s, image: m.url, alt: m.alt }))} />{/key}
        {@render choose("Hover", "hover", [["none", "None"], ["zoom", "Zoom"], ["darken", "Darken"]])}
        {@render text("Alt", "alt", "Describe the photo")}
        {@render meter("Depth", "depth")}
        {@render meter("Depth hover", "depthHover")}
        {@render meter("Parallax", "parallax")}
        {@render choose("Animate", "animate", [["none", "None"], ["fade", "Fade"], ["left", "Bounce left"], ["right", "Bounce right"], ["up", "Bounce up"]])}
        {@render text("Link", "imageHref", "https://", true)}
        {@render choose("Target", "target", [["", "Same tab"], ["_blank", "New tab"]], (t) => (t === "_blank" ? "_blank" : ""))}
        {@render meter("Horizontal", "posX")}
        {@render meter("Vertical", "posY")}
      </div>
    {:else}
      <div class="flex flex-col gap-2">
        <Row name="Layout"><Select size="sm" value={q("layout")} options={[{ value: "banner", label: "Banner" }, { value: "centered", label: "Centered" }, { value: "split", label: "Split" }]} onValue={set("layout")} /></Row>
        <Row name="Width"><Select size="sm" value={q("size")} options={[{ value: "full", label: "Full" }, { value: "half", label: "Half" }, { value: "third", label: "Third" }]} onValue={set("size")} /></Row>
        <Row name="Height"><Select size="sm" value={q("height")} options={[{ value: "320", label: "Short" }, { value: "480", label: "Medium" }, { value: "640", label: "Tall" }]} onValue={set("height")} /></Row>
        <Row name="Arrows"><Select size="sm" value={q("arrows")} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} onValue={set("arrows")} /></Row>
        <Row name="Gap"><Input class="h-7 text-xs" value={q("gap")} oninput={(e) => { const v = e.currentTarget.value; set("gap")(v.endsWith("px") ? v : `${v.replace(/\D/g, "")}px`); }} /></Row>
        <div class="flex flex-wrap gap-1">
          {#each slides as _, i (i)}
            <button type="button" class={["h-7 rounded-md border border-transparent px-2 text-[11px] text-muted-foreground hover:bg-muted", carouselUi.slide === i && "border-blue-600 bg-blue-600 text-white"]}
              onclick={() => (carouselUi.slide = i)}>Slide {i + 1}</button>
          {/each}
        </div>
        <p class="text-[11px] leading-relaxed text-muted-foreground">Pick Banner or Image on the slider to edit that layer. Parallax shifts the photo; the published page has no scroll script.</p>
      </div>
    {/if}
  </div>
{/if}
