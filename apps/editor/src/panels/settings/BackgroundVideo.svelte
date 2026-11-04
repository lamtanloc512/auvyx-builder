<script lang="ts">
  // Flatsome Banner → Video (SettingsPanel.backgroundVideo): a muted looping video behind the box's content, stored as
  // an ordinary Video element (marked auvyx-bg-video, the box's first child); the box's background image is the poster.
  import { Settings as S } from "@auvyx/editor-core";
  import { Input } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { nextId } from "../../lib/ids";
  import { BASE, breakpoints } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  import BackgroundSound from "./BackgroundSound.svelte";
  let { id }: { id: string } = $props();
  const n = $derived(store.doc.nodes[id]);
  const current = $derived(n ? S.backgroundVideo(store.doc, id) : undefined);
  function write(url: string) {
    const doc = store.doc;
    const next = S.writeBackgroundVideo(doc, id, url, BASE, nextId);
    if (next !== doc) store.commit(next);
  }
</script>

<div>
  {#if n && !S.isTrack(n, breakpoints(), store.breakpoint)}
    <div class="flex flex-col gap-1" data-bg-video="1">
      <Row name="Video"><Input class="h-7 text-xs" placeholder="YouTube, Vimeo or .mp4 link" value={current?.src ?? ""} onchange={(e) => write(e.currentTarget.value)} /></Row>
      {#if current && !S.playsAsBackground(current.src)}
        <p class="ml-[68px] text-[11px] text-destructive">Not a YouTube, Vimeo or .mp4/.webm link.</p>
      {:else if current}
        <p class="ml-[68px] text-[11px] leading-relaxed text-muted-foreground">Plays looping behind the content. Visitors who prefer less motion see the background image instead.</p>
      {/if}
      {#if current}<BackgroundSound videoId={current.id} />{/if}
    </div>
  {/if}
</div>
