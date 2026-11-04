<script lang="ts">
  // The Content tab's own options of the selected element (U/SettingsPanel.scala apply): Fit, then per kind (a
  // section's code, header / footer bar, countdown, popup, slider, background video, text box position, hotspot, box
  // effects; a heading's variant; an image, icon, video, posts loop, classic slider or navigation), then the
  // interaction recipe, text, link, open, case and button colour.
  import { Settings as S, type Kind } from "@auvyx/editor-core";
  import { Input, Select } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { updater } from "../../lib/settingsOps";
  import { placeable } from "../../lib/textBoxPosition";
  import { resolveSt } from "../inspect/core";
  import BarPanel from "../builder/BarPanel.svelte";
  import Row from "./Row.svelte";
  import FitRow from "./FitRow.svelte";
  import CodeSettings from "./CodeSettings.svelte";
  import CountdownRow from "./CountdownRow.svelte";
  import PopupRow from "./PopupRow.svelte";
  import SliderSettings from "./SliderSettings.svelte";
  import BackgroundVideo from "./BackgroundVideo.svelte";
  import TextBoxPanel from "./TextBoxPanel.svelte";
  import HotspotSide from "./HotspotSide.svelte";
  import BoxEffects from "./BoxEffects.svelte";
  import ImageSettings from "./ImageSettings.svelte";
  import IconPicker from "./IconPicker.svelte";
  import VideoSettings from "./VideoSettings.svelte";
  import LoopSettings from "./LoopSettings.svelte";
  import CarouselSettings from "./CarouselSettings.svelte";
  import NavSettings from "./NavSettings.svelte";
  import InteractionRows from "./InteractionRows.svelte";

  const sel = $derived(store.node ? { id: store.node.id, kind: store.node.kind as Kind } : null);
  const HEADING_VARIANTS: [number, string, string][] = [[1, "Display", "56px"], [1, "H1", "40px"], [2, "H2", "32px"], [3, "H3", "24px"], [4, "H4", "20px"], [5, "H5", "16px"], [6, "H6", "14px"]];
</script>

<div class="flex flex-col gap-2 p-3 text-xs">
  {#if !sel}
    <p class="text-muted-foreground">Select an element.</p>
  {:else}
    {#key sel.id}
      {@const id = sel.id}
      {@const kind = sel.kind}
      {@const update = updater(id)}
      {@const n = store.doc.nodes[id]}
      {#if n}
        <div class="flex flex-col gap-3">
          <FitRow {id} />
          {#if kind === "Section"}
            <div class="flex flex-col gap-2">
              <CodeSettings {id} {update} />
              <div><BarPanel area="header" /></div>
              <div><BarPanel area="footer" /></div>
              <CountdownRow {id} {update} />
              <PopupRow {id} {update} />
              <SliderSettings {id} />
              <BackgroundVideo {id} />
              {#if placeable(id)}<TextBoxPanel {id} />{/if}
              {#if S.isHotspot(n.className)}<HotspotSide {id} />{/if}
              <BoxEffects {id} {update} />
            </div>
          {:else if kind === "Heading"}
            <Row name="Variant">
              <div class="flex flex-wrap gap-1">
                {#each HEADING_VARIANTS as [level, name, size] (name)}
                  {@const font = resolveSt(n.styles, store.breakpoint, "font-size")}
                  {@const on = font === size || (!font && n.level === level && name !== "Display")}
                  <button type="button" class={["h-7 rounded-md border border-transparent px-2 text-[11px] text-muted-foreground hover:bg-muted", on && "border-border bg-background text-foreground"]}
                    onclick={() => { update("level", (x) => ({ ...x, level })); store.setStyles(id, [["font-size", size], ["font-weight", level <= 2 ? "700" : "600"], ["line-height", "1.15"]]); }}>{name}</button>
                {/each}
              </div>
            </Row>
          {:else if kind === "Image"}
            <ImageSettings {id} {update} />
          {:else if kind === "Icon"}
            <IconPicker {id} {update} />
          {:else if kind === "Video"}
            <VideoSettings {id} {update} />
          {:else if kind === "Loop"}
            <LoopSettings {id} {update} />
          {:else if kind === "Carousel"}
            <CarouselSettings {id} {update} />
          {:else if kind === "Nav"}
            <NavSettings {id} {update} />
          {/if}
          {#if S.recipeEditable(kind)}<InteractionRows {id} {kind} {update} />{/if}
          {#if kind === "Heading" || kind === "Text" || kind === "Button" || kind === "Accordion"}
            <Row name={kind === "Accordion" ? "Title" : "Text"}>
              <textarea class="min-h-16 w-full rounded-md border border-input bg-transparent p-2 text-xs outline-none focus:border-ring" value={n.text}
                oninput={(e) => update("text", (x) => ({ ...x, text: e.currentTarget.value }))}></textarea>
            </Row>
          {/if}
          {#if kind === "Button" || kind === "Image" || kind === "Icon"}
            <Row name="Link"><Input class="h-7 text-xs" placeholder="https:// or #section-id" value={n.href} oninput={(e) => update("href", (x) => ({ ...x, href: e.currentTarget.value.trim() }))} /></Row>
          {/if}
          {#if kind === "Button"}
            <Row name="Open"><Select size="sm" value={n.target === "_blank" ? "_blank" : ""} options={[{ value: "", label: "Same window" }, { value: "_blank", label: "New window" }]} onValue={(v: string) => update("target", (x) => ({ ...x, target: v }))} /></Row>
          {/if}
          {#if kind === "Heading" || kind === "Text" || kind === "Button"}
            <Row name="Case"><Select size="sm" value={store.styleOf(n, "text-transform", store.breakpoint, "default") ?? ""} options={[{ value: "", label: "Default" }, { value: "uppercase", label: "ABC" }, { value: "capitalize", label: "Abc" }]} onValue={(v: string) => store.setStyles(id, [["text-transform", v || undefined]])} /></Row>
          {/if}
          {#if kind === "Button"}
            <Row name="Color">
              <Select size="sm" value={store.styleOf(n, "background-color", store.breakpoint, "default") ?? ""}
                options={[{ value: "", label: "Default" }, { value: "var(--wp--preset--color--auvyx-primary)", label: "Primary" }, { value: "var(--wp--preset--color--auvyx-secondary)", label: "Secondary" }, { value: "#dc2626", label: "Alert" }, { value: "#16a34a", label: "Success" }, { value: "#ffffff", label: "White" }]}
                onValue={(v: string) => store.setStyles(id, [["background-color", v || undefined], ["color", v ? (v === "#ffffff" ? "#0f172a" : "#ffffff") : undefined]])} />
            </Row>
          {/if}
        </div>
      {/if}
    {/key}
  {/if}
</div>
