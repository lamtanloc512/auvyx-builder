<script lang="ts">
  // The box at the bottom of the chat (U/ChatUi.composer): the text, then one row with what the request is about, the
  // toolbar (theme file, model, effort) and the send / stop button.
  import type { Snippet } from "svelte";
  import { Icon } from "../../ui/kit";

  let { draft = $bindable(), busy, enabled, scope, placeholder, send, stop, toolbar }: {
    draft: string; busy: boolean; enabled: boolean; scope: string; placeholder: string; send: () => void; stop: () => void; toolbar: Snippet;
  } = $props();

  const canSend = $derived(draft.trim() !== "" && enabled);
  /** Enter that confirms an IME composition (Vietnamese Telex/VNI, Japanese…) must not send the message. */
  const composing = (e: KeyboardEvent) => e.isComposing || e.keyCode === 229;
</script>

<div class="flex shrink-0 flex-col gap-2 p-3 pt-1" data-ai-composer="1">
  <div class="flex flex-col rounded-[var(--radius)] border border-input bg-background shadow-xs transition-[box-shadow,border-color] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25">
    <textarea class="field-sizing-content max-h-44 min-h-14 w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[13px] leading-snug outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
      rows="2" {placeholder} disabled={!enabled} bind:value={draft}
      onkeydown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !composing(e)) { e.preventDefault(); send(); }
        else if (e.key === "Escape") stop();
      }}></textarea>
    <div class="flex min-w-0 flex-wrap items-center gap-2 px-2 pb-2">
      <span class="flex min-w-0 max-w-[70%] items-center gap-1 rounded-[var(--radius)] bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground" title="What the request is about: select an element to narrow it">
        <Icon name="eye" size={12} class="shrink-0" />
        <span class="truncate">{scope}</span>
      </span>
      {@render toolbar()}
      <span class="min-w-0 flex-1 basis-2"></span>
      {#if busy}
        <button type="button" class="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary text-primary-foreground transition hover:opacity-90"
          title="Stop (Esc)" aria-label="Stop" data-ai-stop="1" onclick={stop}><Icon name="square" size={11} class="fill-current" /></button>
      {:else}
        <button type="button" class="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary text-primary-foreground transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-30"
          title="Send (Enter)" aria-label="Send" data-ai-send="1" disabled={!canSend} onclick={send}><Icon name="arrowDown" size={15} class="rotate-180" /></button>
      {/if}
    </div>
  </div>
</div>
