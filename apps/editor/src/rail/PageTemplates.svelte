<script lang="ts">
  // Page templates (U/PageTemplatesDialog.scala): every page of the site templates (the site's own and the ones its theme
  // and add-ons bring), applied to THIS page only. Its content is replaced, as one undo step, and saved with the page like
  // any edit; the site's colors, menus, header and footer stay as they are (a whole site is applied from Site templates).
  import { Dialog, DialogClose } from "../ui/kit";
  import { store } from "../lib/store.svelte";
  import { toast } from "../lib/toast.svelte";
  import { ui } from "../lib/ui.svelte";
  import { get, list, pageDocument, read, type Summary } from "../lib/siteTemplates";

  let items = $state.raw<Summary[]>([]);
  let loading = $state(false), busy = $state(false), error = $state("");

  // PageTemplatesDialog.show(): every opening reads the list again
  $effect(() => {
    if (!ui.pageTemplates) return;
    error = "";
    loading = true;
    list().then((r) => { loading = false; items = r; }, (e: Error) => { loading = false; error = e.message; });
  });

  /** The template's page `index` replaces this page's content. */
  async function use(t: Summary, index: number) {
    const pageTitle = t.pages[index] ?? "";
    if (store.doc.roots.length && !confirm(`Replace this page's content with “${t.title} — ${pageTitle}”? You can undo it.`)) return;
    busy = true;
    let text: string;
    try { text = await get(t.id); } catch (e) { busy = false; error = (e as Error).message; return; }
    busy = false;
    const full = read(text);
    if (!full.ok) { error = `The template has problems: ${full.error}`; return; }
    const p = full.value.pages[index];
    if (!p) return;
    const doc = pageDocument(p);
    if (!doc.roots.length) { error = "Nothing in that page can be shown on this site."; return; }
    store.commit(doc);
    store.selected = null;
    ui.pageTemplates = false;
    toast(`“${full.value.title} — ${p.title}” is on this page (undo to go back)`);
  }
</script>

<Dialog bind:open={ui.pageTemplates} contentBoxClass="flex! flex-col gap-0! p-0!" data-page-templates-dialog="1"
  style="width: min(980px, calc(100vw - 2rem)); max-width: none; height: min(720px, calc(100vh - 4rem));">
  <DialogClose />
  <div class="flex items-center gap-2 border-b border-border px-5 py-3 pe-14">
    <span class="text-sm font-semibold">Page templates</span>
    <span class="text-xs text-muted-foreground">Replaces the content of this page only. Colors, menus, header and footer stay as they are.</span>
  </div>
  <div class="min-h-0 flex-1 overflow-y-auto p-5">
    {#if error}<p class="mb-3 text-xs text-red-600">{error}</p>{/if}
    {#if loading && !items.length}
      <p class="text-xs text-muted-foreground">Loading…</p>
    {:else if !items.length}
      <p class="text-xs text-muted-foreground">No templates yet.</p>
    {:else}
      <div class="flex flex-col gap-5">
        {#each items as t (t.id)}
          <div class="flex flex-col gap-2">
            <div class="flex items-baseline gap-2">
              <span class="text-xs font-semibold">{t.title}</span>
              {#if t.description}<span class="truncate text-[11px] text-muted-foreground">{t.description}</span>{/if}
            </div>
            <div class="flex flex-wrap gap-2">
              {#each t.pages as title, i (i)}
                <button class="h-8 rounded-md border border-border px-3 text-xs hover:bg-muted disabled:opacity-40" data-page-template={`${t.id}/${i}`}
                  disabled={busy} onclick={() => use(t, i)}>{title}</button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</Dialog>
