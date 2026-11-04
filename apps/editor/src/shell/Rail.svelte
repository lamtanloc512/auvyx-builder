<script lang="ts">
  // The icon rail (U/Main.scala rail, U/TopBar.scala tools): the panels, then the document's tools at its foot.
  import { Icon } from "../ui/kit";
  import type { IconName } from "../ui/icons";
  import { config } from "../lib/config";
  import { store } from "../lib/store.svelte";
  import { theme, cap } from "../lib/theme.svelte";
  import { ui } from "../lib/ui.svelte";
  import { pick as importFile } from "../lib/import";
  import { available as contentAvailable } from "../lib/content.svelte";
  import { pageTemplatesAvailable } from "../lib/siteTemplates";

  type Panel = typeof store.leftPanel;
  function open(id: Panel) {
    if (store.leftPanel === id && store.leftOpen) store.leftOpen = false;
    else { store.leftPanel = id; store.leftOpen = true; }
  }
  const panels: [Panel, IconName, string][] = [["add", "plus", "Add"], ["assets", "library", "Assets"], ["navigator", "layers", "Navigator"],
    ...(contentAvailable() ? [["content", "database", "Content types"] as [Panel, IconName, string]] : [])];
  const alwaysLive = !!config.isComponent || !!config.isPart;
</script>

<div class="-ml-2 flex min-h-0 w-12 shrink-0 flex-col items-center gap-1.5 overflow-y-auto py-1 [scrollbar-width:none]" style:display={store.preview ? "none" : "flex"}>
  {#each panels as [id, icon, tip] (id)}
    <button class={["auvyx-pill auvyx-pill--icon", store.leftPanel === id && "is-on"]} title={tip} onclick={() => open(id)}><Icon name={icon} size={16} /></button>
  {/each}
  {#if config.canEditMenus}
    <button class="auvyx-pill auvyx-pill--icon" title="Menus" data-open-menus="1" onclick={() => (ui.menus = true)}><Icon name="menu" size={16} /></button>
  {/if}
  {#if pageTemplatesAvailable()}
    <button class="auvyx-pill auvyx-pill--icon" title="Page templates" data-open-page-templates="1" onclick={() => (ui.pageTemplates = true)}><Icon name="layoutTemplate" size={16} /></button>
  {/if}
  <div class="mt-auto flex flex-col items-center gap-1.5" data-rail-tools="1">
    <span class="my-0.5 h-px w-5 bg-border"></span>
    <button type="button" class="auvyx-pill auvyx-pill--icon" title="Post settings" aria-label="Post settings" data-title-tool="post-settings" onclick={() => (ui.postSettings = true)}><Icon name="settings" size={16} /></button>
    {#if config.viewUrl && (store.status === "publish" || alwaysLive)}
      <button type="button" class="auvyx-pill auvyx-pill--icon" title="View the live page" aria-label="View the live page" data-title-tool="view-live" onclick={() => window.open(config.viewUrl, "_blank")}><Icon name="external" size={16} /></button>
    {/if}
    <button type="button" class="auvyx-pill auvyx-pill--icon" title="Page theme presets" aria-label="Page theme presets" data-title-tool="theme-presets" onclick={() => (ui.themePresets = true)}><Icon name="palette" size={16} /></button>
    <button type="button" class="auvyx-pill auvyx-pill--icon" title="Clear page" aria-label="Clear page" data-title-tool="clear-page"
      onclick={() => { if (confirm("Clear every section on this page? You can undo with ⌘Z.")) store.clearPage(); }}><Icon name="trash" size={16} /></button>
    <button type="button" class="auvyx-pill auvyx-pill--icon" title="Document source" aria-label="Document source" data-title-tool="source" onclick={() => (ui.source = true)}><Icon name="code" size={16} /></button>
    <button type="button" class="auvyx-pill auvyx-pill--icon" title="Import a Studio JSON, an Elementor export, Flatsome shortcodes or an HTML page" aria-label="Import a Studio JSON, an Elementor export, Flatsome shortcodes or an HTML page" data-title-tool="import" onclick={importFile}><Icon name="upload" size={16} /></button>
    <button type="button" class="auvyx-pill auvyx-pill--icon" data-title-tool="theme" data-theme-toggle="1" title={`Theme: ${cap(theme.mode)} (click for ${theme.next()})`} onclick={() => theme.cycle()}>
      <Icon name={theme.mode === "light" ? "sun" : theme.mode === "dark" ? "moon" : "monitor"} size={16} />
    </button>
    <button type="button" class="auvyx-pill auvyx-pill--icon" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts (?)" data-title-tool="shortcuts" onclick={() => (ui.shortcuts = true)}><Icon name="keyboard" size={16} /></button>
  </div>
</div>
