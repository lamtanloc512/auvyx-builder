<script lang="ts">
  // Design panel, laid out like Figma's (U/StylePanel.scala): Layout, Size, Spacing, Text, then paint, with
  // Webstudio's value sources: blue = set on this breakpoint/state, orange = inherited, grey = computed by the
  // browser. Inputs are Figma-style grey boxes with a prefix that scrubs on drag. Background, Border, Corner,
  // Shadow and Opacity start empty with a + and get a − once set. `STYLE_PANEL` is the order.
  import { allowsStyleGroup, styleGroupsOf, KINDS, STYLE_PANEL } from "@auvyx/editor-core";
  import { Select } from "../../ui/kit";
  import { store, SCREENS } from "../../lib/store.svelte";
  import { frameWidth } from "../../lib/viewport.svelte";
  import { screens } from "../../lib/screens.svelte";
  import { computed, fieldOf, set, setAll, watchComputed } from "./state.svelte";
  import Inside from "./Inside.svelte";
  import Position from "./Position.svelte";
  import SizeCard from "./SizeCard.svelte";
  import Section from "./Section.svelte";
  import SpaceScale from "./SpaceScale.svelte";
  import SpaceControl from "./SpaceControl.svelte";
  import TextCard from "./TextCard.svelte";
  import FillCard from "./FillCard.svelte";
  import Addable from "./Addable.svelte";
  import ColorRow from "./ColorRow.svelte";
  import Labeled from "./Labeled.svelte";
  import Num from "./Num.svelte";
  import SelectBox from "./SelectBox.svelte";
  import OpacityBox from "./OpacityBox.svelte";
  import Presets from "./Presets.svelte";

  watchComputed();
  const node = $derived(store.node);
  const allows = (group: string) => allowsStyleGroup(store.node, store.doc, group);
  const isPath = $derived(node?.kind === "Path");
  const isContainer = $derived(!!node && KINDS[node.kind].container);
  const textKinds = new Set(["Heading", "Text", "Button", "Accordion"]);
  const showsText = $derived(!!node && (textKinds.has(node.kind) || node.kind === "Raw" || (node.runtime !== "" && !!styleGroupsOf(node, store.doc)?.includes("typography"))));
  const padding = ["padding-block-start", "padding-inline-end", "padding-block-end", "padding-inline-start"];
  const spacingProps = ["margin", "padding"].flatMap((b) => [`${b}-block-start`, `${b}-inline-end`, `${b}-block-end`, `${b}-inline-start`]);

  const corners: [string, string][] = [["None", "0"], ["S", "var(--wp--custom--radius--sm)"], ["M", "var(--wp--custom--radius--md)"], ["L", "var(--wp--custom--radius--lg)"], ["Full", "9999px"]];
  const radius = $derived(fieldOf("border-radius"));
  const shadows: [string, string][] = [
    ["Soft", "0 4px 12px rgba(15, 23, 42, 0.08)"],
    ["Medium", "0 12px 24px rgba(15, 23, 42, 0.12)"],
    ["Large", "0 24px 48px rgba(15, 23, 42, 0.18)"],
    ["Glow", "0 0 0 4px rgba(37, 99, 235, 0.2)"],
  ];
  const shadow = $derived(fieldOf("box-shadow"));
  const bordered = $derived(computed("border-top-style") !== "none" && Number(computed("border-top-width").replace(/px$/, "")) > 0);
  const STATES = ["default", "hover", "focus", "active"];
</script>

{#snippet card(name: string)}
  {#if name === "Layout"}
    <div><Inside /><div></div><Position /></div>
  {:else if name === "Size"}
    <div style:display={allows("layout") ? "block" : "none"}><SizeCard /></div>
  {:else if name === "Spacing"}
    <div style:display={allows("space") ? "block" : "none"}>
      <Section title="Spacing" props={[...spacingProps, "gap"]}>
        <!-- The theme's spacing scale, one click per side group (Flatsome: Padding / Spacing XS…XL). The box below stays for exact values. -->
        <SpaceScale name="Padding" props={padding} />
        {#if isContainer}<SpaceScale name="Gap" props={["gap"]} />{:else}<SpaceScale name="Below" props={["margin-block-end"]} />{/if}
        <SpaceControl />
      </Section>
    </div>
  {:else if name === "Text"}
    <div>
      <div style:display={allows("typography") ? "block" : "none"}>
        <div>{#key showsText}<TextCard open={showsText} />{/key}</div>
      </div>
      <div style:display={allows("color") ? "block" : "none"}>
        <div class="auvyx-card px-3 py-3"><Labeled text="Color"><ColorRow prop="color" /></Labeled></div>
      </div>
    </div>
  {:else if name === "Background"}
    <div style:display={allows("fill") ? "block" : "none"}>
      <div>
        {#if isPath}
          <div>
            <!-- Vectors (pen paths) paint with SVG fill and stroke, not background and border. -->
            <Addable title="Fill" props={["fill"]} add={() => setAll([["fill", "#d9d9d9"]])}><ColorRow prop="fill" /></Addable>
            <Addable title="Stroke" props={["stroke", "stroke-width"]} add={() => setAll([["stroke", "#1e1e1e"], ["stroke-width", "2"]])}>
              <ColorRow prop="stroke" />
              <div class="grid grid-cols-2 gap-1.5">
                <Num prefix="≡" prop="stroke-width" options={{ unit: "", min: 0 }} />
                <SelectBox prop="stroke-linecap" options={[["round", "Round cap"], ["butt", "Flat cap"], ["square", "Square cap"]]} empty="Cap" />
              </div>
            </Addable>
          </div>
        {:else}
          <FillCard />
        {/if}
      </div>
    </div>
  {:else if name === "Border"}
    <div style:display={allows("stroke") ? "block" : "none"}>
      <div>
        {#if !isPath}
          <Addable title="Border" props={["border-width", "border-style", "border-color"]} add={() => setAll([["border-width", "1px"], ["border-style", "solid"], ["border-color", "#e2e8f0"]])} showing={bordered}>
            <ColorRow prop="border-color" />
            <div class="grid grid-cols-2 gap-1.5">
              <Num prefix="≡" prop="border-width" options={{ min: 0 }} />
              <SelectBox prop="border-style" options={[["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]} empty="Style" />
            </div>
          </Addable>
        {/if}
      </div>
    </div>
  {:else if name === "Corner"}
    <div style:display={allows("appearance") ? "block" : "none"}>
      <Addable title="Corner" props={["border-radius"]} add={() => setAll([["border-radius", corners[2]![1]]])}>
        <div class="flex gap-0.5 rounded-lg bg-muted p-0.5">
          {#each corners as [cname, v] (cname)}
            <button type="button" class={["h-6 flex-1 rounded-md text-[10px] text-muted-foreground hover:text-foreground", radius.own === v && "bg-background text-foreground shadow-xs"]}
              title={`Corners: ${cname}`} onclick={() => set("border-radius", v, "corner")}>{cname}</button>
          {/each}
        </div>
        <Num prefix="⌜" prop="border-radius" options={{ min: 0 }} />
      </Addable>
    </div>
  {:else if name === "Shadow"}
    <div style:display={allows("effects") ? "block" : "none"}>
      <Addable title="Shadow" props={["box-shadow"]} add={() => setAll([["box-shadow", shadows[0]![1]]])}>
        <div class="flex gap-0.5 rounded-md bg-muted/70 p-0.5">
          {#each shadows as [sname, v] (sname)}
            <button class={["h-6 flex-1 rounded-sm text-[10px] text-muted-foreground hover:text-foreground", shadow.own === v && "bg-background text-foreground shadow-sm"]}
              onclick={() => set("box-shadow", v, "shadow")}>{sname}</button>
          {/each}
        </div>
        <Num prefix="✦" prop="box-shadow" />
      </Addable>
    </div>
  {:else if name === "Opacity"}
    <div style:display={allows("appearance") ? "block" : "none"}>
      <Addable title="Opacity" props={["opacity"]} add={() => setAll([["opacity", "0.8"]])}><OpacityBox /></Addable>
    </div>
  {:else if name === "Presets"}
    <Presets />
  {:else}
    <div></div>
  {/if}
{/snippet}

<div class="flex flex-col">
  {#each STYLE_PANEL as name (name)}{@render card(name)}{/each}
  <!-- What the styles below are for (Subframe's Breakpoint card): the screen, and the state (hover, focus…). -->
  <div class="auvyx-card flex flex-col gap-1.5 px-3 pb-3" data-style-section="Breakpoint">
    <div class="flex h-10 items-center gap-1.5 px-0.5">
      <span class="flex-1 text-xs font-medium">Breakpoint</span>
      <div class="w-24" title="State: style the element when hovered, focused…">
        <Select size="xs" value={store.styleState} options={STATES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} onValue={(v: string) => (store.styleState = v)} />
      </div>
    </div>
    <Select size="field" value={store.breakpoint}
      options={screens.all.map((b) => ({ value: b.id, label: `${b.label} · ${Math.round(frameWidth(b.id))}px${b.id === SCREENS[0]!.id ? " (base)" : ""}` }))}
      onValue={(v: string) => (store.breakpoint = v)} />
  </div>
</div>
