<script lang="ts">
  // Post settings (U/PostSettingsDialog.scala): title, status, page template, page title and excerpt, through the REST API.
  import { Button, Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Select } from "../ui/kit";
  import { config } from "../lib/config";
  import { rest } from "../lib/host";
  import { store } from "../lib/store.svelte";
  import { toast } from "../lib/toast.svelte";
  import { ui } from "../lib/ui.svelte";
  import { reloadCanvas } from "../lib/frame";

  let loading = $state(false), saving = $state(false), error = $state("");
  let title = $state(""), status = $state("draft"), template = $state(""), excerpt = $state(""), titleAlign = $state("");
  const templates = (config.pageTemplates ?? []).map((t) => [t.slug, t.title] as [string, string]);
  const path = `wp/v2/${config.restBase}/${config.postId}`;

  $effect(() => { if (ui.postSettings) load(); });

  async function load() {
    error = "";
    loading = true;
    try {
      const { data: r } = await rest<{ title: { raw: string }; status: string; template: string; excerpt: { raw: string }; meta?: { auvyx_title?: string } }>(`${path}?context=edit&_fields=title,status,template,excerpt,meta`);
      title = r.title?.raw ?? ""; status = r.status; template = r.template ?? ""; excerpt = r.excerpt?.raw ?? ""; titleAlign = r.meta?.auvyx_title ?? "";
    } catch (e) {
      title = config.title; status = store.status; error = (e as Error).message;
    } finally { loading = false; }
  }

  async function save() {
    saving = true;
    try {
      const body: Record<string, unknown> = { title: title.trim(), status, excerpt, meta: { auvyx_title: titleAlign } };
      if (!template || templates.some(([s]) => s === template)) body.template = template;
      await rest(path, { method: "POST", body: JSON.stringify(body) });
      reloadCanvas();
      store.status = status;
      toast("Post settings saved");
      ui.postSettings = false;
    } catch (e) { error = (e as Error).message; } finally { saving = false; }
  }
</script>

{#snippet field(label: string, control: import("svelte").Snippet)}
  <div class="flex flex-col gap-1.5"><span class="text-xs font-medium">{label}</span>{@render control()}</div>
{/snippet}

<Dialog bind:open={ui.postSettings} contentBoxClass="gap-4 sm:max-w-md">
  <DialogClose />
  <DialogHeader>
    <DialogTitle>Post settings</DialogTitle>
    <DialogDescription>Title, visibility and template of this page.</DialogDescription>
  </DialogHeader>
  <div class="flex flex-col gap-4" data-post-settings="1">
    {#snippet t()}<Input class="h-9 text-sm" data-ps-title="1" bind:value={title} />{/snippet}
    {@render field("Title", t)}
    {#snippet st()}<Select size="md" bind:value={status} options={[{ value: "draft", label: "Draft" }, { value: "pending", label: "Pending review" }, { value: "private", label: "Private" }, { value: "publish", label: "Published" }]} data-ps-status="1" />{/snippet}
    {@render field("Status", st)}
    {#if templates.length}
      {#snippet tp()}<Select size="md" bind:value={template} options={[{ value: "", label: "Default template" }, ...templates.map(([v, l]) => ({ value: v, label: l }))]} data-ps-template="1" />{/snippet}
      {@render field("Template", tp)}
    {/if}
    {#snippet ta()}
      <div class="flex flex-col gap-1">
        <div class="flex gap-0.5 rounded-md bg-muted/70 p-0.5" data-ps-title-align="1">
          {#each [["", "Default"], ["hide", "Hide"], ["left", "Left"], ["center", "Center"], ["right", "Right"]] as [v, label] (label)}
            <button type="button" class={["h-7 flex-1 rounded-sm text-xs text-muted-foreground hover:text-foreground", titleAlign === v && "bg-background text-foreground shadow-sm"]}
              data-value={label} disabled={loading} onclick={() => (titleAlign = v!)}>{label}</button>
          {/each}
        </div>
        <span class="text-[11px] text-muted-foreground">Above the page's content. Left, Center and Right follow the site's content column; Default is the theme's own title.</span>
      </div>
    {/snippet}
    {@render field("Page title", ta)}
    {#snippet ex()}<textarea class="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring" data-ps-excerpt="1" bind:value={excerpt}></textarea>{/snippet}
    {@render field("Excerpt", ex)}
    {#if loading}<p class="text-xs text-muted-foreground">Loading…</p>{/if}
    {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
  </div>
  <DialogFooter>
    <Button variant="outline" size="sm" onclick={() => (ui.postSettings = false)}>Cancel</Button>
    <Button size="sm" data-ps-save="1" disabled={saving || loading} onclick={save}>{saving ? "Saving…" : "Save"}</Button>
  </DialogFooter>
</Dialog>
