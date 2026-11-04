<script lang="ts">
  // The two buttons under a section's Theme row (U/SettingsPanel.scala themeMode): copy this section, or the whole page,
  // as a web component.
  import { store } from "../store.svelte";
  import { copyExport } from "./copy";
  let { id }: { id: string } = $props();
</script>

<div class="flex gap-2">
  <button type="button" class="h-7 rounded-md border border-border px-2 text-[11px]" data-export-section={id} onclick={() => copyExport(store.doc, id)}>Export section</button>
  <button type="button" class="h-7 rounded-md border border-border px-2 text-[11px]" data-export-page="1" onclick={() => copyExport(store.doc, null)}>Export page</button>
</div>
