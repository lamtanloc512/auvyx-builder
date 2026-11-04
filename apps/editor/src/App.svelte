<script lang="ts">
  // The editor (U/Main.scala fullApp): top bar, then the rail, the left panel, the canvas and the inspector, then the
  // status bar.
  import { Icon, ScrollArea } from "./ui/kit";
  import { store } from "./lib/store.svelte";
  import { connected } from "./lib/host";
  import { dnd } from "./lib/dnd.svelte";
  import { canvasWeb } from "./lib/canvasWeb.svelte";
  import { toastState } from "./lib/toast.svelte";
  import { ui } from "./lib/ui.svelte";
  import * as Shortcuts from "./lib/shortcuts.svelte";
  import { editText } from "./lib/actions.svelte";
  import TopBar from "./shell/TopBar.svelte";
  import AiColumnLazy from "./panels/agent/AiColumnLazy.svelte";
  import PartBanner from "./panels/builder/PartBanner.svelte";
  import McpPendingBanner from "./shell/McpPendingBanner.svelte";
  import { selectHeaderPartRoot } from "./lib/builder.svelte";
  import { conditions } from "./lib/conditions.svelte";
  import { applyDeepLink } from "./lib/deepLink";
  import Rail from "./shell/Rail.svelte";
  import StatusBar from "./shell/StatusBar.svelte";
  import Resizer from "./shell/Resizer.svelte";
  import ContextMenu from "./shell/ContextMenu.svelte";
  import Dialogs from "./shell/Dialogs.svelte";
  import Canvas from "./canvas/Canvas.svelte";
  import Navigator, { reveal } from "./panels/Navigator.svelte";
  import AddPanel from "./panels/AddPanel.svelte";
  import Inspector from "./panels/Inspector.svelte";
  import MediaPicker from "./panels/MediaPicker.svelte";
  import AssetsPanel from "./panels/AssetsPanel.svelte";
  import PostSettings from "./rail/PostSettings.svelte";
  import ThemePresets from "./rail/ThemePresets.svelte";
  import Menus from "./rail/Menus.svelte";
  import PageTemplates from "./rail/PageTemplates.svelte";
  import ContentPanel from "./panels/ContentPanel.svelte";
  import { pageTemplatesAvailable } from "./lib/siteTemplates";
  import { init as initContent } from "./lib/content.svelte";
  import { untrack } from "svelte";
  import { screen } from "./screens/route";
  import ScreenLazy from "./screens/ScreenLazy.svelte";
  import { i18n, start as startI18n } from "./lib/i18n.svelte";
  import { startGames } from "./lib/games.svelte";

  // the interface's language first (I18n.scala): the editor, or one of its screens, shows once its dictionary is in
  void startI18n();
  // the screens outside the page editor (Site templates, Add New Header/Footer, Customize) open on their own
  const editing = screen === "editor";
  if (editing) {
    initContent();
    selectHeaderPartRoot();
    conditions.fromLink();
    applyDeepLink();
    startGames();
  }
  // the canvas hands its events to the editor
  canvasWeb.onEdit = (id, el) => editText(id, el);
  canvasWeb.onContext = (id, x, y) => { if (!store.selection.includes(id)) store.selected = id; ui.menu = { id, x, y }; };
  canvasWeb.onPointerDown = (id, e) => {
    const el = store.elements.get(id);
    // a press on a page section's own background (not selected) starts nothing: a click selects it
    if (el && e.target === el && store.doc.roots.includes(id) && !store.selection.includes(id)) return;
    dnd.arm({ existing: id }, e);
  };
  canvasWeb.onKey = (e) => Shortcuts.handle(e);
  canvasWeb.takeClick = () => dnd.takeClick();
  // a canvas click reveals the row in the Navigator
  let lastSel: string | null = null;
  $effect(() => {
    const s = store.selected;
    untrack(() => {
      if (s && s !== lastSel && document.activeElement?.tagName === "IFRAME") reveal(s);
      lastSel = s;
      if (s) { const el = store.elements.get(s); if (el?.isConnected) canvasWeb.reveal(el.getBoundingClientRect()); }
    });
  });

  const title = $derived(store.leftPanel === "add" ? "Elements" : store.leftPanel === "assets" ? "Assets" : store.leftPanel === "content" ? "Content types" : "Navigator");
</script>

<svelte:window onkeydown={(e) => { if (editing) Shortcuts.handle(e); }} onkeyup={(e) => { if (editing) Shortcuts.release(e); }}
  onbeforeunload={(e) => { if (editing && connected && !store.safe) e.preventDefault(); }} />
<svelte:document onpaste={(e) => { if (editing) Shortcuts.onPaste(e); }} />

{#if !i18n.ready}
  <!-- the dictionary is on its way -->
{:else if screen !== "editor"}
  <ScreenLazy {screen} />
{:else}
<div class="flex h-dvh flex-col overflow-hidden bg-shell text-foreground">
  <TopBar />
  <PartBanner />
  <McpPendingBanner />
  <div class="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-foreground px-3 py-1.5 text-xs text-background shadow-lg transition-opacity"
    class:opacity-0={!toastState.text}>{toastState.text ?? ""}</div>
  <div class="fixed top-3 left-1/2 z-50 -translate-x-1/2" style:display={store.preview ? "block" : "none"}>
    <button class="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs shadow-md hover:bg-muted" data-exit-preview="1"
      onclick={() => (store.preview = false)}><Icon name="eyeOff" size={14} />Exit preview (Esc)</button>
  </div>
  <ContextMenu />
  <Dialogs />
  <PostSettings />
  <ThemePresets />
  <Menus />
  {#if pageTemplatesAvailable()}<PageTemplates />{/if}
  {#if ui.media}<MediaPicker />{/if}
  <div bind:this={dnd.ghostNode}
    class="pointer-events-none fixed top-0 left-0 z-50 rounded-md border border-blue-500 bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-lg will-change-transform data-[drop-valid=false]:border-border data-[drop-valid=false]:bg-background data-[drop-valid=false]:text-muted-foreground"
    data-drag-ghost="1" data-drop-valid={String(!!dnd.indicator)} style:display={dnd.ghost ? "block" : "none"}>
    {dnd.ghost ?? ""}
    <div class="mt-0.5 text-[10px] font-normal text-current opacity-80">{dnd.indicator ? "Release to place" : "No drop here"}</div>
  </div>

  <div class="relative flex min-h-0 flex-1 gap-2 px-2 pb-2">
    <Rail />
    <div class="relative flex shrink-0 flex-col overflow-hidden rounded-xl bg-background" data-left-panel="1"
      style:display={store.preview || !store.leftOpen ? "none" : "flex"} style:width="{store.leftWidth}px">
      <Resizer bind:width={store.leftWidth} dflt={240} grow={1} side="-right-1" />
      <div class="flex h-10 items-center pr-1.5 pl-3.5 text-xs font-medium">
        <span class="flex-1">{title}</span>
        <button class="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" title="Hide this panel (⌘\ hides both)"
          data-fold-panel="1" onclick={() => (store.leftOpen = false)}><Icon name="panelLeft" size={15} /></button>
      </div>
      {#if store.leftPanel === "add"}
        <ScrollArea class="min-h-0 flex-1"><AddPanel /></ScrollArea>
      {:else if store.leftPanel === "assets"}
        <ScrollArea class="min-h-0 flex-1"><AssetsPanel /></ScrollArea>
      {:else if store.leftPanel === "content"}
        <ContentPanel />
      {:else}
        <div class="min-h-0 flex-1 overflow-auto" data-nav-scroll="1"><Navigator /></div>
      {/if}
    </div>
    <div class="relative flex min-w-0 flex-1">
      <Canvas />
      <button type="button" class="auvyx-pill auvyx-pill--icon absolute top-1/2 z-40 -translate-y-1/2 shadow-sm left-2" data-folded-panel="left" title="Show the left panel (⌘\ both)"
        style:display={store.preview || store.leftOpen ? "none" : "inline-flex"} onclick={() => (store.leftOpen = true)}><Icon name="panelLeft" size={16} /></button>
      <button type="button" class="auvyx-pill auvyx-pill--icon absolute top-1/2 z-40 -translate-y-1/2 shadow-sm right-2" data-folded-panel="right" title="Show the Design panel (⌘\ both)"
        style:display={store.preview || store.rightOpen ? "none" : "inline-flex"} onclick={() => (store.rightOpen = true)}><Icon name="panelRight" size={16} /></button>
    </div>
    <div class="contents">
      <div class="relative flex shrink-0 flex-col" data-right-panel="1" style:display={store.preview || !store.rightOpen ? "none" : "flex"} style:width="{store.rightWidth}px">
        <Resizer bind:width={store.rightWidth} dflt={288} grow={-1} side="-left-1" />
        <Inspector />
      </div>
      <AiColumnLazy />
    </div>
  </div>
  <StatusBar />
</div>
{/if}
