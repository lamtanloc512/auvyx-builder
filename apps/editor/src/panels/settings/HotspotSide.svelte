<script lang="ts">
  // TextBoxPosition.hotspotSide: which side a hotspot's card opens on.
  import { Settings as S } from "@auvyx/editor-core";
  import { store } from "../../lib/store.svelte";
  let { id }: { id: string } = $props();
  const side = $derived(S.hotspotSide(store.doc.nodes[id]?.className ?? ""));
</script>

<div class="grid grid-cols-[64px_1fr] items-start gap-1" data-hotspot-side="1">
  <span class="pt-1.5 text-[11px] text-muted-foreground">Card</span>
  <div class="flex gap-0.5 rounded-md bg-muted/70 p-0.5">
    {#each S.HOTSPOT_SIDES as [v, label] (v)}
      <button type="button" class={["h-6 flex-1 rounded-sm text-[10px] text-muted-foreground hover:text-foreground", side === v && "bg-background text-foreground shadow-sm"]}
        data-value={label} onclick={() => store.updateNode(id, (n) => ({ ...n, className: S.withHotspotSide(n.className, v) }))}>{label}</button>
    {/each}
  </div>
</div>
