<script lang="ts">
  // Sound for a background video (SettingsPanel.backgroundSound): the Autoplay marker on it. It starts muted like every
  // background; video.js turns the sound on as soon as the browser allows it, with a sound button on the box.
  import { Settings as S, update } from "@auvyx/editor-core";
  import { store } from "../../lib/store.svelte";
  import Row from "./Row.svelte";
  let { videoId }: { videoId: string } = $props();
  const on = $derived(S.hasClass(store.doc.nodes[videoId]?.className ?? "", S.AUTOPLAY_CLASS));
</script>

<Row name="Sound">
  <div class="flex flex-col gap-1">
    <label class="flex items-center gap-2 text-[11px]" data-bg-video-sound="1">
      <input type="checkbox" checked={on} onclick={(e) => { const want = e.currentTarget.checked; const doc = store.doc; const next = update(doc, videoId, (n) => ({ ...n, className: S.toggleToken(n.className, S.AUTOPLAY_CLASS, want) })); if (next !== doc) store.commit(next); }} />
      Play with sound
    </label>
    <p class="text-[11px] leading-relaxed text-muted-foreground">Starts muted (browsers allow nothing else), then plays with sound as soon as the visitor's browser lets it: at once, or at their first tap or click. A button on the box turns the sound on and off.</p>
  </div>
</Row>
