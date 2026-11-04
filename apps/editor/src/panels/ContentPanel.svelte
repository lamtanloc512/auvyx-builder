<script lang="ts">
  // The site's content types in the left panel (U/ContentPanel.scala, docs/factory.md layer 3): a list of types; one
  // opened shows its settings, its fields and its entries. Saving checks the whole definition here (ContentModel.validate)
  // and again on the platform, and lists every problem.
  import { ScrollArea } from "../ui/kit";
  import { loadPanel, newType, panel, same, savePanel } from "../lib/content.svelte";
  import TypeEditor from "./content/TypeEditor.svelte";
  import { SMALL } from "./content/styles";

  if (!panel.loadedOnce) {
    panel.loadedOnce = true;
    loadPanel();
  }
  const unchanged = $derived(same(panel.saved, panel.draft));
</script>

<div class="flex min-h-0 flex-1 flex-col" data-content-panel="1">
  <ScrollArea class="min-h-0 flex-1">
    {#if panel.open !== null}
      {#key panel.open}<TypeEditor typeKey={panel.open} />{/key}
    {:else}
      <div class="flex flex-col gap-2 p-3">
        <p class={`${SMALL} leading-relaxed`}>Kinds of content this site keeps besides pages and posts: listings, courses, rooms, team members… Pages list them with a loop and show their fields.</p>
        {#each panel.draft.types as t (t.key)}
          <button type="button" class="flex w-full flex-col items-start gap-0.5 rounded-lg bg-muted/50 px-3 py-2 text-left hover:bg-muted" data-content-type-open={t.key}
            onclick={() => (panel.open = t.key)}>
            <span class="text-[13px] font-medium" translate="no">{t.label}</span>
            <span class={SMALL}>/{t.slug}/ · {t.fields.length} fields</span>
          </button>
        {/each}
        <button type="button" class="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" data-content-new-type="1"
          onclick={newType}>+ New content type</button>
      </div>
    {/if}
  </ScrollArea>
  <div class="flex shrink-0 flex-col gap-2 border-t border-border p-3">
    {#if panel.problems.length}
      <ul class="flex max-h-32 list-disc flex-col gap-0.5 overflow-auto pl-4 text-[11px] text-destructive" data-content-problems="1">
        {#each panel.problems as x, i (i)}<li>{x}</li>{/each}
      </ul>
    {/if}
    <div class="flex items-center gap-2">
      <button type="button" class="h-8 flex-1 rounded-md bg-primary text-xs font-medium text-primary-foreground disabled:opacity-50" data-content-save="1"
        disabled={panel.busy || unchanged} onclick={savePanel}>{panel.busy ? "Saving…" : "Save content types"}</button>
      <button type="button" class="h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted" disabled={unchanged}
        onclick={() => { if (panel.saved) panel.draft = panel.saved; panel.problems = []; }}>Undo</button>
    </div>
  </div>
</div>
