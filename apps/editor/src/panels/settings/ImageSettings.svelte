<script lang="ts">
  // SettingsPanel.imageSettings: source, alt text, and the media picker.
  import { Input } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import type { Update } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  import MediaPicker from "./MediaPicker.svelte";
  let { id, update }: { id: string; update: Update } = $props();
  const n = $derived(store.doc.nodes[id]);
</script>

{#if n}
  <div class="flex flex-col gap-2">
    <Row name="Source"><Input class="h-7 text-xs" placeholder="https://…" value={n.src} oninput={(e) => update("src", (x) => ({ ...x, src: e.currentTarget.value, mediaId: 0 }))} /></Row>
    <Row name="Alt text"><Input class="h-7 text-xs" placeholder="Describe the image" value={n.alt} oninput={(e) => update("alt", (x) => ({ ...x, alt: e.currentTarget.value }))} /></Row>
    <MediaPicker onPick={(m) => update("src", (x) => ({ ...x, src: m.url, alt: m.alt, mediaId: m.id ?? 0 }))} />
  </div>
{/if}
