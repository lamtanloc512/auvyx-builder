<script lang="ts">
  // SettingsPanel.iconPicker: the icon set as a grid.
  import { Settings as S } from "@auvyx/editor-core";
  import { store } from "../../lib/store.svelte";
  import type { Update } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  let { id, update }: { id: string; update: Update } = $props();
  const current = $derived(store.doc.nodes[id]?.icon ?? "");
</script>

<Row name="Icon">
  <div class="grid grid-cols-6 gap-1">
    {#each S.ICON_NAMES as name (name)}
      <button class={["flex aspect-square items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:text-foreground", current === name && "border-primary text-primary"]}
        title={name} onclick={() => update("icon", (x) => ({ ...x, icon: name }))}><span class="inline-flex size-4">{@html S.iconSvg(name)}</span></button>
    {/each}
  </div>
</Row>
