<script lang="ts">
  // TextBoxPosition.handle: a move handle in the middle of a placed, selected text box; and openSelected: the canvas
  // keeps a hotspot's card open while it or anything in it is selected, so the card can be edited.
  import { Settings as S, ancestors } from "@auvyx/editor-core";
  import { Icon } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { dnd } from "../../lib/dnd.svelte";
  import { viewport } from "../../lib/viewport.svelte";
  import { canvasWeb } from "../../lib/canvasWeb.svelte";
  import { selection } from "../../lib/transform.svelte";
  import { currentXY, dragXY, placeable, pointToXY } from "../../lib/textBoxPosition";
  const target = $derived((void store.doc, void store.breakpoint, store.selected && placeable(store.selected) && currentXY(store.selected) ? store.selected : null));
  const r = $derived(selection.box ? { x: selection.box.rect.x * viewport.zoom, y: selection.box.rect.y * viewport.zoom, w: selection.box.rect.w * viewport.zoom, h: selection.box.rect.h * viewport.zoom } : null);

  $effect(() => {
    const sel = store.selected, d = store.doc;
    void store.drawn;
    const t = setTimeout(() => {
      const cd = canvasWeb.doc;
      if (!cd) return;
      const open = sel ? [sel, ...ancestors(d, sel)].find((i) => S.isHotspot(d.nodes[i]?.className ?? "")) : undefined;
      cd.querySelectorAll(".auvyx-hotspot").forEach((e) => e.classList.toggle("auvyx-open", !!open && e.getAttribute("data-auvyx-id") === open));
    }, 30);
    return () => clearTimeout(t);
  });
</script>

<button type="button" class="pointer-events-auto absolute z-40 flex size-7 -translate-x-1/2 -translate-y-1/2 cursor-move touch-none items-center justify-center rounded-full bg-blue-600 text-white shadow-md ring-2 ring-white"
  title="Drag to place it on the banner" aria-label="Drag to place it on the banner" data-text-box-handle="1"
  style:display={target && !dnd.active ? "flex" : "none"} style:left="{r ? r.x + r.w / 2 : 0}px" style:top="{r ? r.y + r.h / 2 : 0}px"
  onmousedown={(e) => e.stopPropagation()}
  onpointerdown={(ev) => { const id = store.selected; if (id) dragXY(id, ev, (cx, cy) => pointToXY(id, cx, cy)); }}><Icon name="move" size={14} /></button>
