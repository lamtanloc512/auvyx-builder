<script lang="ts">
  // The top bar (U/TopBar.scala): the way back and the document on the left; save state, undo, redo, Agent, Preview,
  // and the save buttons on the right.
  import { Button, Icon } from "../ui/kit";
  import { config } from "../lib/config";
  import { connected } from "../lib/host";
  import { store } from "../lib/store.svelte";
  import { toast } from "../lib/toast.svelte";
  import { backTarget, kindLabel } from "../lib/parts";
  import { conditions } from "../lib/conditions.svelte";
  import ConditionsDialog from "../panels/builder/ConditionsDialog.svelte";

  const title = config.title || "Home";

  function preview() {
    // the tab opens at once (popup blockers), then goes to the preview once the work is kept
    const tab = window.open("", "_blank");
    const go = () => { if (tab) tab.location.href = config.previewUrl; };
    if (store.safe) go();
    else if (config.autosaves) store.autosaveNow(go);
    else store.save(false, go);
  }

  function toggleAutosave() {
    store.autosave = !store.autosave;
    toast(store.autosave ? "Autosave on" : "Autosave off");
    if (store.autosave) store.autosaveNow();
  }
  const alwaysLive = !!config.isComponent || !!config.isPart;
  // "← Home": back to the page this document was opened from (its header's "Edit" on the canvas) (U/BackLink.scala)
  const back = backTarget();
  // The ‹ pill goes the same way (the Studio's Session.backUrl prefers the way in): a header or footer opened from a
  // page returns to that page, not to wp-admin.
  const exitHref = $derived(back ? back[0] : config.exitUrl);
  const exitTip = $derived(back ? `Back to ${back[1]}` : "Back");
</script>

<header class="flex h-14 shrink-0 items-center gap-1 bg-shell px-2" style:display={store.preview ? "none" : "flex"}>
  <div class="flex min-w-0 items-center gap-2">
    <div class="-ml-2 flex w-12 shrink-0 justify-center">
      {#if exitHref}
        <a class="auvyx-pill auvyx-pill--icon" href={exitHref} title={exitTip} aria-label="Back" data-studio-back="1"><Icon name="chevronLeft" size={16} /></a>
      {/if}
    </div>
    <div class="auvyx-pill auvyx-pill--label min-w-0 gap-1" data-title-card="1">
      <span class="max-w-56 truncate" translate="no">{title}</span>
      <span class="shrink-0 text-xs font-normal text-muted-foreground">{kindLabel()}</span>
    </div>
  </div>
  {#if back}<a class="auvyx-pill ml-1" href={back[0]} data-back-link="1" title="Back to {back[1]}">← {back[1]}</a>{/if}
  <div class="flex-1"></div>
  <button
    class="mr-1 flex items-center gap-1 rounded-[3px] px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
    data-autosave={String(store.autosave)}
    title={store.autosave
      ? "Autosave is on: your work is kept on the server a moment after each change (a live page changes only when you press Update). Click to turn it off."
      : "Autosave is off: only Save keeps your work on the server. Click to turn it on."}
    onclick={toggleAutosave}
  >
    {#if !store.autosave}<span class="rounded-sm bg-muted px-1 text-[10px] uppercase">Autosave off</span>{/if}
    {#if store.saveStatus === "kept"}<span class="flex items-center gap-1"><Icon name="cloudCheck" size={14} />Autosaved · not live yet</span>
    {:else if store.saveStatus === "saved"}<span class="flex items-center gap-1"><Icon name="cloudCheck" size={14} />Saved</span>
    {:else if store.saveStatus === "saving"}<span class="flex items-center gap-1"><Icon name="loader" size={14} class="animate-spin" />Saving…</span>
    {:else if store.saveStatus === "unsaved"}<span class="flex items-center gap-1 text-orange-600"><span class="size-1.5 rounded-full bg-orange-500"></span>Unsaved</span>
    {:else}<span class="flex items-center gap-1 text-destructive" title={store.saveError ?? ""}><Icon name="x" size={14} />Save failed</span>{/if}
  </button>
  <Button variant="ghost" size="icon-sm" class="auvyx-pill auvyx-pill--icon" title="Undo (⌘Z)" disabled={!store.canUndo} onclick={() => store.undo()}><Icon name="undo" size={14} /></Button>
  <Button variant="ghost" size="icon-sm" class="auvyx-pill auvyx-pill--icon" title="Redo (⇧⌘Z)" disabled={!store.canRedo} onclick={() => store.redo()}><Icon name="redo" size={14} /></Button>
  <button type="button" class={["auvyx-pill", store.aiOpen && "is-on"]} title="Agent: builds and changes the page with you" data-toggle-agent="1" onclick={() => (store.aiOpen = !store.aiOpen)}>
    <Icon name="sparkles" size={14} />Agent
  </button>
  {#if connected && config.previewUrl}
    <Button variant="ghost" size="sm" class="auvyx-pill" title="Keep your work and preview it in a new tab (nothing goes live)" onclick={preview}>Preview</Button>
  {:else if !connected}<Button variant="ghost" size="sm" class="auvyx-pill" title="Preview appearance in a new tab" data-open-customize="1" onclick={() => { const u = new URL(location.href); u.searchParams.set("screen", "customize"); const t = window.open("", "_blank"); if (t) t.location.href = u.toString(); }}>Preview</Button>
  {/if}
  {#if connected}
    <div class="flex items-center gap-1">
      {#if conditions.available}
        <!-- A Theme Builder header or footer (Elementor's way): Publish asks where it shows while it shows nowhere. -->
        {@const summary = conditions.current?.summary ?? ""}
        {@const none = !conditions.current?.conditions.length}
        <div class="flex items-center gap-1">
          <button type="button" class="auvyx-pill" data-display-conditions="1" title={summary ? `Shows on: ${summary}` : "Shows nowhere yet"} onclick={() => conditions.show()}>
            <span class={["size-2 rounded-full", summary ? "bg-emerald-500" : "bg-zinc-300"]}></span>Display Conditions
          </button>
          <Button size="sm" class="auvyx-pill auvyx-pill--primary" title="Save (⌘S)" data-publish-part="1"
            disabled={store.saveStatus === "saving" || (store.saveStatus === "saved" && !none)}
            onclick={() => store.save(true, () => conditions.afterPublish())}>
            {store.saveStatus === "saving" ? "Saving…" : none ? "Publish" : "Update"}
          </Button>
        </div>
      {:else if store.status === "publish" || alwaysLive}
        <Button size="sm" class="auvyx-pill auvyx-pill--primary" title="Save (⌘S)" disabled={store.saveStatus === "saved" || store.saveStatus === "saving"} onclick={() => store.save(true)}>
          {store.saveStatus === "saving" ? "Saving…" : "Update"}
        </Button>
      {:else}
        <div class="flex items-center gap-1">
          <span class="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">{store.status}</span>
          <Button variant="outline" size="sm" class="auvyx-pill" title="Save draft (⌘S)" disabled={store.saveStatus === "saved" || store.saveStatus === "saving"} onclick={() => store.save()}>Save draft</Button>
          <Button size="sm" class="auvyx-pill auvyx-pill--primary" onclick={() => store.save(true)}>Publish</Button>
        </div>
      {/if}
    </div>
  {/if}
</header>
{#if conditions.available}<ConditionsDialog />{/if}
