<script lang="ts">
  // "Working" with three dots and a light passing over the words (U/ChatUi.working); after a few seconds it counts, so a
  // slow model does not look stuck.
  let { label, startedAt, stop }: { label: string; startedAt: number; stop: () => void } = $props();
  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 500); return () => clearInterval(t); });
  const secs = $derived(Math.trunc((now - startedAt) / 1000));
</script>

<div class="flex items-center gap-2 text-[12px]" role="status" aria-live="polite">
  <span class="flex items-center gap-0.5 text-foreground" aria-hidden="true">
    {#each [1, 2, 3] as i (i)}<span class="auvyx-dot size-1 rounded-full bg-current"></span>{/each}
  </span>
  <span class="auvyx-shimmer font-medium">{label}</span>
  <span class="tabular-nums text-muted-foreground">{secs >= 3 ? `${secs}s` : ""}</span>
  <span class="flex-1"></span>
  <button type="button" class="rounded-[var(--radius)] px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground" data-ai-stop="1" onclick={stop}>Stop</button>
</div>
