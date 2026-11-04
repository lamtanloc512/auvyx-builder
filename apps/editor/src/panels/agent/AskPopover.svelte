<script lang="ts">
  // "Ask for changes" on the canvas (U/AskPopover.scala): the selection label's ✦ opens a prompt box with suggestions for
  // that kind of element; the agent edits only the selected element, in the AI panel's thread (one undo step).
  import { untrack } from "svelte";
  import { Icon } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { agentReady, askPopover, askSuggestions, submitAsk } from "../../lib/agentAsk.svelte";

  type Rect = { x: number; y: number; w: number; h: number };
  let { frame, visible }: { frame: Rect | null; visible: boolean } = $props();

  let root: HTMLDivElement | undefined = $state();
  let field: HTMLInputElement | undefined = $state();

  const kind = $derived(store.node?.kind);
  // closing on selection change keeps the box tied to one element
  $effect(() => {
    void store.selected;
    untrack(() => { askPopover.open = false; askPopover.status = null; });
  });
  $effect(() => {
    if (askPopover.open) setTimeout(() => field?.focus({ preventScroll: true }), 0);
  });

  const left = $derived.by(() => {
    if (!frame) return "0";
    const room = root?.clientWidth ?? Number.MAX_VALUE;
    return `${frame.x + frame.w + 8 + 320 > room ? Math.max(8, frame.x + frame.w - 320) : frame.x + frame.w + 8}px`;
  });
</script>

<div bind:this={root} class="absolute inset-0" style:display={visible && frame && kind && kind !== "Raw" ? "block" : "none"}>
  <div class="pointer-events-auto absolute z-30 w-80 rounded-xl border border-border bg-popover text-popover-foreground shadow-xl" data-ask-popover="1"
    style:display={askPopover.open ? "block" : "none"} style:left={left} style:top="{frame ? frame.y + 32 : 0}px"
    role="dialog" tabindex="-1" onmousedown={(e) => e.stopPropagation()}>
    <div class="flex items-center gap-2 p-2">
      <input bind:this={field} class="h-8 flex-1 bg-transparent px-2 text-[13px] outline-none placeholder:text-muted-foreground"
        placeholder={agentReady ? "Ask for changes" : "Connect AI in the AI panel first"} disabled={!agentReady} bind:value={askPopover.draft}
        onkeydown={(e) => { if (e.key === "Enter") submitAsk(askPopover.draft); else if (e.key === "Escape") askPopover.open = false; }} />
      <button class="flex size-8 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-30" aria-label="Send"
        disabled={askPopover.draft.trim() === ""} onclick={() => submitAsk(askPopover.draft)}><Icon name="send" size={14} /></button>
    </div>
    {#if askPopover.status}
      <div class="flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        {#if askPopover.status === "Working…"}<Icon name="loader" size={14} class="animate-spin" />{/if}{askPopover.status}
      </div>
    {:else}
      <div class="flex flex-col border-t border-border p-1">
        {#each askSuggestions(kind) as sug (sug)}
          <button class="flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            disabled={!agentReady} onclick={() => submitAsk(sug)}><Icon name="sparkles" size={14} class="text-muted-foreground" />{sug}</button>
        {/each}
      </div>
    {/if}
  </div>
</div>
