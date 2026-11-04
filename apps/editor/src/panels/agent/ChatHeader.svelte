<script lang="ts">
  // The top of the AI chat (U/ChatHeader.scala): the conversation's title opens the list of conversations (open,
  // delete), + starts a new one, × closes the agent.
  import { Icon } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import type { Thread } from "../../lib/agent.svelte";

  let { threads, current, busy, canStartNew, open, remove, startNew, model }: {
    threads: Thread[]; current: string; busy: boolean; canStartNew: boolean;
    open: (id: string) => void; remove: (id: string) => void; startNew: () => void; model?: string;
  } = $props();

  let menu = $state(false);
  const title = $derived(threads.find((t) => t.id === current)?.title ?? "New chat");

  function ago(at: number): string {
    const mins = Math.trunc((Date.now() - at) / 60000);
    return mins < 1 ? "now" : mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.trunc(mins / 60)}h` : `${Math.trunc(mins / 1440)}d`;
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape" && menu) menu = false; }} />

<div class="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5" data-ai-header="1">
  <div class="relative min-w-0 flex-1">
    <!-- above the click-away layer, so the same button closes the list -->
    <button type="button" class="relative z-20 flex h-7 w-full min-w-0 items-center gap-1.5 rounded-[var(--radius)] px-2 text-left text-xs hover:bg-muted"
      data-ai-chats="1" title="Conversations" onclick={() => (menu = !menu)}>
      <Icon name="sparkles" size={13} class="shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate font-medium">{title}</span>
      <Icon name="chevronDown" size={12} class="shrink-0 text-muted-foreground" />
    </button>
    {#if menu}
      <div class="contents">
        <div class="fixed inset-0 z-10" role="presentation" onclick={() => (menu = false)}></div>
        <div class="absolute left-0 top-full z-20 mt-1 flex max-h-72 w-64 flex-col overflow-y-auto rounded-[var(--radius)] border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {#if model}<div class="px-2 py-1 text-[10px] text-muted-foreground">Model: {model}</div>{/if}
          {#if threads.length === 0}
            <div class="px-2 py-2 text-[11px] text-muted-foreground">No conversations yet</div>
          {:else}
            <div class="flex flex-col">
              {#each threads as t (t.id)}
                <div class={["group/thread flex items-center gap-1 rounded-[var(--radius)] hover:bg-muted", current === t.id ? "bg-muted" : ""]}>
                  <button type="button" class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[11px]" data-ai-thread={t.id}
                    onclick={() => { menu = false; open(t.id); }}>
                    <span class="min-w-0 flex-1 truncate" translate="no">{t.title}</span>
                    <span class="shrink-0 text-[10px] text-muted-foreground">{ago(t.at)}</span>
                  </button>
                  <button type="button" class="mr-1 shrink-0 rounded-[var(--radius)] p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover/thread:opacity-100 focus-visible:opacity-100"
                    title="Delete" aria-label="Delete conversation" data-ai-thread-delete={t.id} onclick={() => remove(t.id)}><Icon name="trash" size={12} /></button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  <button type="button" class="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    title="New chat" aria-label="New chat" data-ai-new="1" disabled={busy || !canStartNew} onclick={startNew}><Icon name="plus" size={15} /></button>
  <button type="button" class="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted-foreground hover:bg-muted hover:text-foreground"
    title="Close the agent" aria-label="Close the agent" data-ai-close="1" onclick={() => (store.aiOpen = false)}><Icon name="x" size={15} /></button>
</div>
