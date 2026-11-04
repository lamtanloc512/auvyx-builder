<script lang="ts">
  // A Video element (SettingsPanel.videoSettings): its link, and how it plays: as a player, or filling the box it sits
  // in as a muted looping background (Flatsome Banner → Video).
  import { ElementJson, Settings as S, parentOf } from "@auvyx/editor-core";
  import { Input, Select } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { nameOf } from "../../lib/labels";
  import { BASE, breakpoints, type Update } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  import BackgroundSound from "./BackgroundSound.svelte";
  let { id, update }: { id: string; update: Update } = $props();
  const n = $derived(store.doc.nodes[id]);
  const asBackground = $derived(S.hasClass(n?.className ?? "", S.BG_VIDEO_CLASS));
  const box = $derived.by(() => { const p = parentOf(store.doc, id); const b = p ? store.doc.nodes[p] : undefined; return b && b.kind === "Section" && !S.isTrack(b, breakpoints(), store.breakpoint) ? b : undefined; });
  function setMode(bg: boolean) {
    const doc = store.doc;
    const next = S.setVideoBackground(doc, id, bg, BASE);
    if (next !== doc) {
      store.commit(next);
      // The background sits behind the box's content: select the box, whose Content shows the video link.
      if (bg) { const p = parentOf(doc, id); if (p) store.selected = p; }
    }
  }
</script>

{#if n}
  <div class="flex flex-col gap-2" data-video-settings="1">
    <Row name="URL"><Input class="h-7 text-xs" placeholder="YouTube, Vimeo or .mp4 link" value={n.src} oninput={(e) => update("src", (x) => ({ ...x, src: e.currentTarget.value }))} /></Row>
    {#if box}
      <Row name="Play as">
        <div class="flex flex-col gap-1">
          <div class="flex gap-0.5 rounded-md bg-muted/70 p-0.5" data-video-mode="1">
            {#each [[false, "Player"], [true, "Background"]] as [bg, label] (label)}
              <button type="button" class={["h-6 flex-1 truncate rounded-sm px-1 text-[10px] text-muted-foreground hover:text-foreground", asBackground === bg && "bg-background text-foreground shadow-sm"]}
                data-value={bg ? "background" : "player"} onclick={() => setMode(bg as boolean)}>{label}</button>
            {/each}
          </div>
          <p class="text-[11px] leading-relaxed text-muted-foreground">Background fills the {nameOf(box)} behind its text: looping, no controls, muted unless you turn Sound on.</p>
        </div>
      </Row>
    {/if}
    <!-- A player can start by itself: muted at first, with sound as soon as the visitor's browser allows it. Never in the editor. -->
    {#if asBackground}
      <BackgroundSound videoId={id} />
    {:else}
      <div class="flex flex-col gap-2">
        <!-- The player's shape: vertical for TikTok / Reels / Shorts clips; a wide video is cropped to fill it. -->
        <Row name="Frame">
          <div class="flex flex-col gap-1" data-video-frame="1">
            <Select size="xs" value={S.frameOf(n)} options={S.FRAMES.map((f) => ({ value: f.id, label: f.label }))} onValue={(v: string) => update("video-frame", (x) => ElementJson.withFrame(x, v))} />
            {#if S.frameOf(n) !== S.FRAMES[0]!.id}
              <p class="text-[11px] leading-relaxed text-muted-foreground">Fills the frame: a wide video shows its middle. Its width and corners are in Design.</p>
            {/if}
          </div>
        </Row>
        <Row name="Autoplay">
          <div class="flex flex-col gap-1">
            <label class="flex items-center gap-2 text-[11px]" data-video-autoplay="1">
              <input type="checkbox" checked={S.hasClass(n.className, S.AUTOPLAY_CLASS)} onclick={(e) => { const on = e.currentTarget.checked; update("video-autoplay", (x) => ({ ...x, className: S.toggleToken(x.className, S.AUTOPLAY_CLASS, on) })); }} />
              Start by itself
            </label>
            <p class="text-[11px] leading-relaxed text-muted-foreground">Plays with sound as soon as the visitor's browser allows it: at once where it does, otherwise at their first tap or click (browsers do not let a page start sound on its own). A button on the video turns the sound on and off.</p>
          </div>
        </Row>
      </div>
    {/if}
  </div>
{/if}
