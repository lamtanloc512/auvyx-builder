<script lang="ts">
  // Contextual toolbar under the selection (U/ContextBar.scala). One selection uses the blue label bar; this bar is
  // only for several layers: align (children of one free frame, like the Studio), group, auto layout.
  import type { Arrange } from "@auvyx/editor-core";
  import { Icon } from "../ui/kit";
  import type { IconName } from "../ui/icons";
  import { store } from "../lib/store.svelte";
  import { dnd, type Rect } from "../lib/dnd.svelte";
  import { viewport } from "../lib/viewport.svelte";
  import { align } from "../lib/transformFree";
  import { group, addAutoLayout } from "../lib/actions.svelte";

  let { frame, visible }: { frame: Rect | null; visible: boolean } = $props();

  const show = $derived(visible && !!frame && store.selection.length > 1 && !store.editing && !dnd.active && !store.selection.some((i) => store.doc.nodes[i]?.kind === "Raw"));
  const aligns: [IconName, string, Arrange.Align][] = [
    ["alignL", "Align left (⌥A)", "Left"], ["alignCH", "Align centers (⌥H)", "CenterH"], ["alignR", "Align right (⌥D)", "Right"],
    ["alignT", "Align top (⌥W)", "Top"], ["alignCV", "Align middles (⌥V)", "CenterV"], ["alignB", "Align bottom (⌥S)", "Bottom"],
  ];
  // below the W × H label; above the selection when there is no room
  const top = $derived.by(() => {
    if (!frame) return 0;
    const room = viewport.card?.clientHeight ?? Infinity;
    return frame.y + frame.h + 72 > room ? Math.max(8, frame.y - 44) : frame.y + frame.h + 32;
  });
</script>

{#snippet btn(icon: IconName, tip: string, run: () => void)}
  <button class="flex size-7 items-center justify-center rounded-sm text-foreground/80 hover:bg-muted hover:text-foreground" title={tip} data-ctx={tip}
    onmousedown={(e) => e.stopPropagation()} onclick={run}><Icon name={icon} size={15} /></button>
{/snippet}

<div class="pointer-events-auto absolute z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 text-popover-foreground shadow-md"
  data-context-bar="" style:display={show ? "flex" : "none"} style:left="{frame ? frame.x + frame.w / 2 : 0}px" style:top="{top}px"
  role="toolbar" tabindex="-1" onmousedown={(e) => e.stopPropagation()}>
  <div class="flex items-center gap-0.5">
    {#each aligns as [icon, tip, a] (a)}{@render btn(icon, tip, () => align(a))}{/each}
    <span class="mx-0.5 h-4 w-px bg-border"></span>
    {@render btn("group", "Group (⌘G)", group)}
    <button class="flex h-7 items-center rounded-sm px-2 text-[11px] font-medium whitespace-nowrap text-foreground/80 hover:bg-muted hover:text-foreground" title="Add auto layout (⇧A)" data-ctx="Auto layout"
      onmousedown={(e) => e.stopPropagation()} onclick={addAutoLayout}>Auto layout</button>
  </div>
</div>
