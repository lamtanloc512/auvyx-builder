<script lang="ts">
  // The Live page in the canvas's own card (U/LiveView.scala apply): the same device width, page height, zoom and place
  // on the board as the edit frame under it, so switching modes moves nothing. Esc goes back to Edit.
  import { liveMode, liveSandbox, listenLive, closeLive } from "../lib/live.svelte";

  let { onGrab }: { onGrab: (x: number, y: number, end: boolean) => void } = $props();
  let frame = $state<HTMLIFrameElement>();
  $effect(() => (frame ? listenLive(frame, onGrab) : undefined));
  $effect(() => {
    if (!liveMode.url) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") closeLive(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  });
</script>

{#if liveMode.url}
  <iframe bind:this={frame} class="absolute inset-0 z-10 block size-full border-0 bg-white" data-studio-live="1"
    sandbox={liveSandbox} title="Live" src={liveMode.url}></iframe>
{/if}
