<script lang="ts">
  // The AI panel on pi (U/AgentPanel.scala, ADR 0039): the conversation from the runtime's transcript (the request, what
  // the agent said, the steps it took), one undo step per request, conversations kept by the platform.
  import { Icon, Select, selectItems } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { nameOf } from "../../lib/labels";
  import { toast } from "../../lib/toast.svelte";
  import { configured, gateway, settings, setEffort } from "../../lib/agentBridge.svelte";
  import {
    THEME_TYPES, agent, copy, deleteThread, ensureLoaded, liveEditing, liveText, newChat, openThread, stop, submit, themeFile, turnsOf, undoTurn,
  } from "../../lib/agent.svelte";
  import ChatHeader from "./ChatHeader.svelte";
  import Composer from "./Composer.svelte";
  import Working from "./Working.svelte";
  import Markdown from "./Markdown.svelte";

  ensureLoaded();

  // ---- the message list: follows the end while the reader is there, offers "Latest" when they are not ----
  let scroller: HTMLDivElement | undefined = $state();
  let atBottom = $state(true);
  const toBottom = () => setTimeout(() => { if (scroller) scroller.scrollTop = scroller.scrollHeight; }, 0);
  agent.follow = () => { if (atBottom) toBottom(); };
  agent.jump = () => { atBottom = true; toBottom(); };
  $effect(() => { if (scroller) toBottom(); });

  const turns = $derived(turnsOf(agent.transcript));
  const said = $derived(liveText(agent.live));
  const workingLabel = $derived(agent.stopping ? "Stopping…" : liveEditing(agent.live) ? "Editing" : "Working");
  const scope = $derived(store.node ? nameOf(store.node) : "Whole page");

  const suggestions: [string, string][] = [
    ["Generate a landing page", "Build a complete landing page for this site: hero, benefits, featured products, testimonials, FAQ and a final call to action."],
    ["Add a section", "Add a section after the selected one that fits the page: pick what is missing."],
    ["Tidy and polish", "Tidy the selected element (or the whole page): consistent spacing on an 8px rhythm, clear type hierarchy, aligned edges, better contrast."],
    ["Make it responsive", "Check every section on tablet and mobile and add the overrides they need: stack columns, smaller headings, tighter padding."],
    ["Rewrite the copy", "Rewrite the text of the selected element (or the page) to be clearer and more persuasive, same length."],
  ];

  let picker: HTMLInputElement | undefined = $state();
  const action = "rounded-[var(--radius)] px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-background hover:text-foreground";

  function onDrop(e: DragEvent) {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    if (THEME_TYPES.split(",").some((x) => f.name.toLowerCase().endsWith(x))) themeFile(f);
    else toast("Drop a theme file: .css, tailwind.config, tokens .json or DESIGN.md");
  }
  function toggleSteps(index: number) {
    const o = new Set(agent.open);
    if (o.has(index)) o.delete(index); else o.add(index);
    agent.open = o;
  }
</script>

<!-- a theme file dropped on the chat is imported like one picked with the palette button -->
<div class="flex min-h-0 flex-1 flex-col" role="region" aria-label="AI agent"
  ondragover={(e) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); }} ondrop={onDrop}>
  <ChatHeader threads={agent.threads} current={agent.currentId} busy={agent.busy} canStartNew={agent.transcript.length > 0}
    open={openThread} remove={deleteThread} startNew={newChat} />
  <div class="relative flex min-h-0 flex-1 flex-col">
    <div bind:this={scroller} class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 [overflow-anchor:none]"
      onscroll={(e) => { const t = e.currentTarget; atBottom = t.scrollHeight - t.scrollTop - t.clientHeight < 80; }}>
      {#if !configured}
        <div class="flex flex-col gap-2 rounded-[var(--radius)] border border-border p-3 text-[12px]">
          <p class="font-medium">The AI agent needs this site's own AI provider key</p>
          <p class="text-[11px] leading-relaxed text-muted-foreground">It builds and changes pages with the same tools you have, writes a design brief and makes games. It runs with your own AI provider (OpenAI, Anthropic, Gemini, OpenRouter, Ollama…): add the provider, your key and a model in Settings → AI. Everything else in the editor works without it.</p>
          {#if gateway?.settingsUrl}
            <a class="inline-flex h-7 items-center self-start rounded-[var(--radius)] bg-foreground px-3 text-[11px] font-medium text-background" href={gateway.settingsUrl} target="_blank">Set up AI</a>
          {:else}
            <p class="text-[11px] text-muted-foreground">Ask an administrator to set it up.</p>
          {/if}
        </div>
      {/if}
      {#if agent.transcript.length === 0 && !agent.busy && configured}
        <div class="flex flex-1 flex-col justify-center gap-4 py-4">
          <div class="flex flex-col items-center gap-2 text-center">
            <div class="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon name="sparkles" size={20} /></div>
            <p class="text-sm font-medium">How can I help?</p>
            <p class="text-balance text-xs text-muted-foreground">I build and change this page with the same tools you have. Every request is one undo step.</p>
          </div>
          <div class="flex w-full flex-col gap-1.5">
            {#each suggestions as [t, prompt] (t)}
              <button type="button" class="flex w-full items-center gap-2 rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-left text-[12px] transition hover:bg-muted"
                data-suggestion={t} onclick={() => (agent.draft = prompt)}>
                <Icon name="sparkles" size={13} class="shrink-0 text-muted-foreground" />
                <span class="flex-1">{t}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
      <div class="flex flex-col gap-4">
        {#each turns as t (t.index)}
          <div class="animate-in fade-in-0 duration-200">
            <div class="flex flex-col gap-3">
              <div class="flex flex-col items-end gap-0.5">
                <div class="max-w-[88%] rounded-[var(--radius)] bg-primary px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap break-words text-primary-foreground" translate="no">{t.request}</div>
              </div>
              <div class="group/msg flex min-w-0 flex-col gap-2 text-[13px] leading-relaxed break-words">
                {#if t.said}<Markdown text={t.said} />{/if}
                {#if t.error}<div class="rounded-[var(--radius)] bg-destructive/10 px-2 py-1 text-[11px] text-destructive">{t.error}</div>{/if}
                {#if t.stopped}<div class="rounded-[var(--radius)] bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700" data-ai-stopped="1">{t.stopped}</div>{/if}
                {#if t.steps.length}
                  <div class="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    <div class="-ms-1.5 flex items-center gap-1">
                      <button class="flex flex-1 items-center gap-1 text-left hover:text-foreground" data-ai-steps-toggle="1" onclick={() => toggleSteps(t.index)}>
                        <Icon name="chevronRight" size={12} class={agent.open.has(t.index) ? "rotate-90" : ""} />
                        {t.steps.length} step{t.steps.length === 1 ? "" : "s"}
                      </button>
                      {#if agent.turns.get(t.index) && store.doc === agent.turns.get(t.index)![1]}
                        <button class={action} data-ai-undo="1" onclick={() => undoTurn(t.index)}>Undo</button>
                      {/if}
                      <div class="opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                        <button class={action} onclick={() => copy(t.said, t.index)}>{agent.copied === t.index ? "Copied" : "Copy"}</button>
                      </div>
                    </div>
                    {#if agent.open.has(t.index)}
                      <ul class="flex min-w-0 list-disc flex-col gap-0.5 ps-4 break-words" data-ai-steps="1">
                        {#each t.notes as n, i (i)}<li class="italic">{n.slice(0, 160)}</li>{/each}
                        {#each t.steps as s, i (i)}
                          <li class={s.failed ? "min-w-0 text-destructive" : "min-w-0"}>{s.label}{#if s.detail}<span class="block break-words opacity-70">{s.detail.slice(0, 200)}</span>{/if}{#if s.thumb}<img src={s.thumb} alt="What the agent looked at" data-ai-thumb="1" class="mt-1 block w-40 max-w-full rounded border border-border" />{/if}</li>
                        {/each}
                      </ul>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
      <!-- plain text while streaming avoids reparsing the growing Markdown document for every token -->
      {#if said}<div class="min-w-0 break-words whitespace-pre-wrap text-[13px] leading-relaxed">{said}</div>{/if}
      {#if agent.busy}<Working label={workingLabel} startedAt={agent.startedAt} {stop} />{/if}
    </div>
    <button type="button" class={["absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[var(--radius)] border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm transition-opacity duration-200 hover:text-foreground", atBottom ? "pointer-events-none opacity-0" : "opacity-100"]}
      data-ai-jump="1" onclick={() => agent.jump()}><Icon name="arrowDown" size={12} />Latest</button>
  </div>
  <Composer bind:draft={agent.draft} busy={agent.busy} enabled={configured} {scope}
    placeholder={agent.busy ? "Add to the request: the agent reads it after its current step…" : "Describe what to build or change…"}
    send={() => void submit(agent.draft)} stop={() => { if (agent.busy) stop(); }}>
    {#snippet toolbar()}
      <div class="flex items-center gap-1">
        <button type="button" class="flex size-7 items-center justify-center rounded-[var(--radius)] text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Import a theme file: Tailwind or CSS variables, tailwind.config, design tokens JSON or DESIGN.md (or drop it here)" aria-label="Import a theme file"
          data-import-theme="1" onclick={() => picker?.click()}>
          <Icon name="palette" size={15} />
          <input bind:this={picker} type="file" accept={THEME_TYPES} class="hidden"
            onchange={(e) => { const el = e.currentTarget; const f = el.files?.[0]; if (f) themeFile(f); el.value = ""; }} />
        </button>
        <div class="w-28" title="How much one request may do: a section (up to 80 steps, $1.50) or a whole page (up to 240 steps, $6)">
          <Select size="xs" value={settings.effort} options={selectItems([["section", "Section"], ["page", "Whole page"]])} onValue={setEffort} data-ai-effort="1" />
        </div>
      </div>
    {/snippet}
  </Composer>
</div>
