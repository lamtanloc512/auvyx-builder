<script lang="ts">
  // The inspector (U/Main.scala inspectorBody, U/Inspector.scala, U/ElementPanel.scala): a header card with the way
  // back to the parent, then one sheet with Content / Style / Advanced.
  import { KINDS, ancestors, parentOf } from "./inspect/core";
  import { Icon, ScrollArea } from "../ui/kit";
  import type { IconName } from "../ui/icons";
  import { config } from "../lib/config";
  import { iconOf, nameOf } from "../lib/labels";
  import { store } from "../lib/store.svelte";
  import Group from "./inspect/Group.svelte";
  import Slider from "./inspect/Slider.svelte";
  import Color from "./inspect/Color.svelte";
  import Choose from "./inspect/Choose.svelte";
  import Segmented from "./inspect/Segmented.svelte";
  import { untrack } from "svelte";
  import StylePanel from "./style/StylePanel.svelte";
  import SpacingControls from "./style/SpacingControls.svelte";
  import AdvancedPanel from "./style/AdvancedPanel.svelte";
  import BuilderCard from "./builder/BuilderCard.svelte";
  import SettingsPanel from "./settings/SettingsPanel.svelte";
  import Props from "./settings/Props.svelte";
  import RawSettings from "./settings/RawSettings.svelte";
  import AdvancedOptions from "./settings/AdvancedOptions.svelte";
  import ProDialog from "./settings/ProDialog.svelte";
  import { Settings } from "@auvyx/editor-core";
  import { blockType } from "../lib/session.svelte";

  const node = $derived(store.node);
  const parent = $derived(store.selected ? (parentOf(store.doc, store.selected) ? store.doc.nodes[parentOf(store.doc, store.selected)!] ?? null : null) : null);
  const TABS: [typeof store.tab, string, IconName][] = [["content", "Content", "penTool"], ["style", "Style", "palette"], ["advanced", "Advanced", "settings"]];
  const textKinds = new Set(["Heading", "Text", "Button", "Accordion", "Icon", "Snippet", "Nav"]);
  const STATES = ["default", "hover", "focus", "active"];

  // slide the sheet in when the selection moves (from the right going deeper, from the left going back up)
  let sheet: HTMLDivElement | undefined = $state();
  let previous: string | null = store.selected;
  $effect(() => {
    const next = store.selected;
    untrack(() => slide(next));
  });
  function slide(next: string | null) {
    const prev = previous;
    previous = next;
    if (!next || !prev || prev === next || !sheet || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const deeper = ancestors(store.doc, next).includes(prev), back = ancestors(store.doc, prev).includes(next);
    const from = back ? "-40%" : deeper ? "40%" : "24px";
    sheet.animate([{ transform: `translateX(${from})`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 300, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
    (sheet.closest("[data-slot=scroll-area-viewport], .overflow-auto") as HTMLElement | null)?.scrollTo?.(0, 0);
  }

</script>




<div class="flex min-h-0 flex-1 flex-col">
  {#if !node}
    <div class="relative flex flex-1 flex-col items-center justify-center gap-2 rounded-xl bg-background p-6 text-center text-xs text-muted-foreground">
      <div class="absolute top-2 right-2">
        <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Hide the Design panel (⌘\ hides both)" aria-label="Hide the Design panel" data-fold-panel="right" onclick={() => (store.rightOpen = false)}><Icon name="panelRight" size={15} /></button>
      </div>
      <Icon name="pointer" size={20} />
      <p class="text-xs font-medium text-foreground">Nothing selected</p>
      <p>Click any element on the canvas — or drag one in from the Add panel. Double-click text to edit it in place.</p>
    </div>
  {:else if node.kind === "Raw" && !blockType(node.blockName)?.design}
    <ScrollArea class="min-h-0 flex-1">
      <div class="flex flex-col gap-1.5">
        <BuilderCard />
        <div class="auvyx-card flex flex-col gap-3 p-4 text-xs">
          <p class="font-medium">{nameOf(node)}</p>
          {#key node.id}<RawSettings id={node.id} blockName={node.blockName} />{/key}
          {#if config.blockEditorUrl}<a class="underline" href={config.blockEditorUrl}>Open the block editor</a>{/if}
        </div>
      </div>
    </ScrollArea>
  {:else if Settings.uiIdOf(node) && !Settings.uiIsLayout(node)}
    <div class="flex min-h-0 flex-1 flex-col"><Props /></div>
  {:else}
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="auvyx-card flex h-12 shrink-0 items-center gap-1 px-1.5" data-inspector-header="1">
        <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          data-inspector-back="1" disabled={!parent} title={parent ? `Back to ${nameOf(parent)}` : ""} aria-label={parent ? `Back to ${nameOf(parent)}` : "Back"} onclick={() => store.selectParent()}><Icon name="chevronLeft" size={16} /></button>
        <div class="flex min-w-0 flex-1 flex-col leading-tight">
          <span class="truncate text-[10px] text-muted-foreground">{parent ? nameOf(parent) : "Page"}</span>
          <div class="flex min-w-0 items-center gap-1.5">
            <Icon name={iconOf(node.kind)} size={13} class="shrink-0 text-muted-foreground" />
            <span class="truncate text-[13px] font-semibold" data-inspector-name="1">{nameOf(node)}</span>
          </div>
        </div>
        <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Hide the Design panel (⌘\ hides both)" aria-label="Hide the Design panel" data-fold-panel="right" onclick={() => (store.rightOpen = false)}><Icon name="panelRight" size={15} /></button>
      </div>
      <ScrollArea class="min-h-0 flex-1">
        <div bind:this={sheet} class="auvyx-card flex flex-col overflow-hidden pb-2" data-inspector-body="1">
          <BuilderCard />
          <div class="grid shrink-0 grid-cols-3 border-b border-border" role="tablist" data-panel-tabs="1">
            {#each TABS as [id, label, icon] (id)}
              <button type="button" role="tab" data-panel-tab={id} aria-selected={store.tab === id}
                class={["flex flex-col items-center gap-1 border-b-2 pt-2.5 pb-2 text-xs", store.tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"]}
                onclick={() => (store.tab = id)}><Icon name={icon} size={15} />{label}</button>
            {/each}
          </div>

          {#if store.tab === "content"}
            <div data-panel-content="1">
              {#if node.kind === "Raw"}
                <div class="flex flex-col gap-3 p-4 text-xs">{#key node.id}<RawSettings id={node.id} blockName={node.blockName} />{/key}</div>
              {:else if Settings.uiIsLayout(node)}
                <Props />
              {:else}
                <div>
                  <SettingsPanel />
                  {#if node.kind === "Section"}
                    <Group title="Container">
                      <Segmented prop="flex-direction" label="Direction" options={[["column", "arrowDown", "Column"], ["row", "arrowRight", "Row"]]} />
                      <Choose prop="align-items" label="Align items" options={[["flex-start", "Start"], ["center", "Center"], ["flex-end", "End"], ["stretch", "Stretch"]]} />
                      <Choose prop="justify-content" label="Justify" options={[["flex-start", "Start"], ["center", "Center"], ["flex-end", "End"], ["space-between", "Space between"]]} />
                      <Slider prop="gap" label="Gap" min={0} max={120} />
                      <Slider prop="min-height" label="Min height" min={0} max={900} />
                    </Group>
                  {/if}
                </div>
              {/if}
            </div>
          {:else if store.tab === "advanced"}
            <div data-panel-advanced="1">
              <!-- margin and padding: the builder's box (drag a side, the spacing scale), as before -->
              <Group title="Layout">
                <SpacingControls />
                <Slider prop="z-index" label="Z-index" min={0} max={100} unit="" />
              </Group>
              <Group title="Element"><AdvancedOptions /></Group>
              <Group title="Every property" open={false}><AdvancedPanel /></Group>
            </div>
          {:else}
            <div data-panel-style="1">
              <div class="flex px-4 pt-3 pb-1">
                <div class="flex w-full rounded-md bg-muted p-0.5" data-control="state">
                  {#each STATES as s (s)}
                    <button type="button" class={["h-7 flex-1 rounded text-xs text-muted-foreground", store.styleState === s && "bg-background text-foreground shadow-sm"]}
                      onclick={() => (store.styleState = s)}>{s === "default" ? "Normal" : s.charAt(0).toUpperCase() + s.slice(1)}</button>
                  {/each}
                </div>
              </div>
              {#if textKinds.has(node.kind) || node.kind === "Raw"}
                <Group title="Typography">
                  <Slider prop="font-size" label="Size" min={8} max={120} />
                  <Choose prop="font-weight" label="Weight" options={["300", "400", "500", "600", "700", "800"].map((w) => [w, w] as [string, string])} />
                  <Slider prop="line-height" label="Line height" min={0.8} max={3} step={0.05} unit="" />
                  <Slider prop="letter-spacing" label="Letter spacing" min={-5} max={20} step={0.5} units={["px", "rem", "em"]} />
                  <Color prop="color" label="Text color" />
                  <Segmented prop="text-align" label="Alignment" options={[["left", "alignLeft", "Left"], ["center", "alignCenter", "Center"], ["right", "alignRight", "Right"]]} />
                  <Choose prop="text-transform" label="Transform" options={[["uppercase", "Uppercase"], ["lowercase", "Lowercase"], ["capitalize", "Capitalize"], ["none", "None"]]} />
                </Group>
              {/if}
              {#if node.kind === "Image"}
                <Group title="Image">
                  <Slider prop="width" label="Width" min={10} max={100} unit="%" />
                  <Choose prop="object-fit" label="Fit" options={[["cover", "Cover"], ["contain", "Contain"], ["fill", "Fill"]]} />
                  <Slider prop="opacity" label="Opacity" min={0} max={1} step={0.05} unit="" />
                </Group>
              {/if}
              {#if KINDS[node.kind].container || node.kind === "Button"}
                <Group title="Size">
                  <Slider prop="width" label="Width" min={0} max={1600} />
                  <Slider prop="max-width" label="Max width" min={0} max={1600} />
                  <Slider prop="min-height" label="Min height" min={0} max={900} />
                </Group>
              {/if}
              <Group title="Background & border">
                <Color prop="background-color" label="Background" />
                <Slider prop="border-radius" label="Radius" min={0} max={100} units={["px", "%", "rem"]} />
                <Slider prop="border-width" label="Border width" min={0} max={20} units={["px", "rem"]} />
                <Color prop="border-color" label="Border color" />
                <Choose prop="border-style" label="Border type" options={[["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]} />
                <Choose prop="box-shadow" label="Shadow" options={[["0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.1)", "Small"], ["0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1)", "Medium"], ["0 20px 25px -5px rgba(0,0,0,.1), 0 8px 10px -6px rgba(0,0,0,.1)", "Large"]]} />
              </Group>
              <!-- everything the builder's design panel has beyond these (presets, layout modes, fills, effects, tokens) -->
              <Group title="More styles" open={false}><StylePanel /></Group>
            </div>
          {/if}
        </div>
      </ScrollArea>
    </div>
  {/if}
</div>

<ProDialog />
