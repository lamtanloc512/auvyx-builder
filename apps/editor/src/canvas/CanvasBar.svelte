<script lang="ts">
  // Device width and what is being edited, floating at the bottom of the canvas (U/Canvas.scala canvasBar).
  import { Icon } from "../ui/kit";
  import type { IconName } from "../ui/icons";
  import { canvasWeb } from "../lib/canvasWeb.svelte";
  import { store, SCREENS } from "../lib/store.svelte";
  import { viewport, frameWidth } from "../lib/viewport.svelte";
  import { screens } from "../lib/screens.svelte";
  import { config } from "../lib/config";
  import { runCode, toggleRunCode } from "./runCode.svelte";

  const icons: IconName[] = ["monitor", "tablet", "phone"];
  const zoomTitle = $derived(viewport.chosenZoom !== null ? "Your zoom. Click to fit the page to the panel"
    : viewport.fitting ? "Fit to panel. Click for 100% (scroll sideways)" : "100%. Click to fit the page to the panel");
  const editing = $derived.by(() => {
    const label = SCREENS.find((s) => s.id === store.breakpoint)?.label ?? store.breakpoint;
    return store.breakpoint === "base" ? `Base · editing ${label}` : `${label} · overriding ${SCREENS[0]!.label}`;
  });
  function zoomToggle() {
    if (viewport.chosenZoom !== null) { viewport.chosenZoom = null; viewport.fitting = true; }
    else viewport.fitting = !viewport.fitting;
  }
</script>

{#snippet iconBtn(icon: IconName, tip: string, active: boolean, action: () => void, attr: string = "")}
  <button class={["flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground", active && "bg-muted text-foreground"]}
    title={tip} data-bar={attr || undefined} onclick={(e) => { e.stopPropagation(); action(); }}><Icon name={icon} size={14} /></button>
{/snippet}

<div class="relative z-40 mx-auto mt-1 mb-0 flex h-10 w-max max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-hidden rounded-xl bg-background px-1.5 shadow-lg ring-1 ring-border"
  data-canvas-bar="1" style:display={store.preview ? "none" : "flex"}>
  <div class="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
    {#each screens.all as bp, i (bp.id)}
      <button class={["flex h-7 items-center justify-center rounded-md px-2 text-[11px] text-muted-foreground hover:text-foreground", store.breakpoint === bp.id && "bg-background text-foreground shadow-sm"]}
        title="{bp.label} · {Math.round(frameWidth(bp.id))}px" onclick={() => (store.breakpoint = bp.id)}>{#if i < icons.length}<Icon name={icons[i]!} size={14} />{:else}{bp.label}{/if}</button>
    {/each}
    <button class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground" title="Add a screen" onclick={() => screens.prompt()}>+</button>
  </div>
  <span class="font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">{Math.round(viewport.width)} px</span>
  <div class="flex shrink-0 items-center">
    {@render iconBtn("minus", "Zoom out (⌘−)", false, () => viewport.zoomBy(0.8), "zoom-out")}
    <button class="h-7 shrink-0 rounded-md px-1.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground tabular-nums hover:bg-muted hover:text-foreground"
      data-zoom-toggle="1" title={zoomTitle} onclick={zoomToggle}>{Math.round(viewport.zoom * 100)}%{viewport.fitting && viewport.chosenZoom === null ? " · Fit" : ""}</button>
    {@render iconBtn("plus", "Zoom in (⌘+). Ctrl/⌘ + wheel or pinch zooms at the pointer", false, () => viewport.zoomBy(1.25), "zoom-in")}
    {@render iconBtn("frame", "Reset view: fit the page, back to the top (⌘0)", false, () => viewport.resetView(), "reset-view")}
  </div>
  <span class="max-w-48 truncate text-[11px] text-muted-foreground">{editing}</span>
  <span class="mx-0.5 h-5 w-px shrink-0 bg-border"></span>
  {@render iconBtn("columns3", "Container guides: the content column every section lines up to", store.guides, () => (store.guides = !store.guides), "guides")}
  {@render iconBtn("box", "Wireframe: the layout as grey boxes", store.wireframe, () => (store.wireframe = !store.wireframe))}
  {@render iconBtn("eye", "Preview: the page without the editor (Esc leaves)", store.preview, () => (store.preview = true), "preview")}
  {@render iconBtn("pointer", "Preview interactions: clicks reach menus, tabs and sliders on the page", canvasWeb.interact, () => (canvasWeb.interact = !canvasWeb.interact), "interact")}
  <!-- Custom code never runs by opening the canvas: only here, by someone who may author it, on a site that allows it, after a warning -->
  {#if config.canScript}
    {@render iconBtn("play", runCode.policyOn ? "Run custom code (off whenever the canvas opens or code is edited)" : "Custom code is switched off for this site", runCode.on, toggleRunCode, "run-code")}
  {/if}
</div>
