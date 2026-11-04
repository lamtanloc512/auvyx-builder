<script lang="ts">
  // The menu builder (U/MenuDialog.scala, U/MenuState.scala): the site's menus as editable trees, links from its pages
  // and categories or typed; saving writes WordPress navigation (auvyx/v1/menus) and reloads the canvas.
  import { MenuTree } from "@auvyx/editor-core";
  import { Dialog, DialogClose, Icon, Input, Select } from "../ui/kit";
  import { rest } from "../lib/host";
  import { library } from "../lib/library.svelte";
  import { toast } from "../lib/toast.svelte";
  import { ui } from "../lib/ui.svelte";
  import { reloadCanvas } from "../lib/frame";

  type Node = MenuTree.MenuNode;
  type Menu = MenuTree.EditableMenu;
  let menus = $state.raw<Menu[]>([]);
  let targets = $state.raw<MenuTree.LinkTarget[]>([]);
  let loaded = $state(false);
  let draft = $state.raw<Menu | null>(null);
  let selected = $state<MenuTree.Path | null>(null);
  let dirty = $state(false), saving = $state(false);
  let filter = $state("");

  $effect(() => {
    if (!ui.menus) return;
    library.ensure();
    if (!loaded) rest<{ menus: Menu[]; targets: MenuTree.LinkTarget[] }>("auvyx/v1/menus").then(
      ({ data }) => { menus = data.menus; targets = data.targets; loaded = true; if (!draft && menus[0]) load(menus[0]); },
      (e: Error) => toast(`Menus could not be loaded: ${e.message}`),
    );
  });

  function load(m: Menu) { draft = m; selected = null; dirty = false; }
  function edit(f: (m: Menu) => Menu) { if (draft) { draft = f(draft); dirty = true; } }
  const items = (f: (l: Node[]) => Node[]) => edit((m) => ({ ...m, items: f(m.items) }));
  function move(f: (l: Node[], p: MenuTree.Path) => [Node[], MenuTree.Path], path: MenuTree.Path) {
    if (!draft) return;
    const [next, at] = f(draft.items, path);
    edit((m) => ({ ...m, items: next }));
    selected = at;
  }
  function add(n: Node) {
    if (!draft) return;
    const parent = selected && selected.length < MenuTree.MAX_DEPTH ? selected : [];
    const count = parent.length ? MenuTree.get(draft.items, parent)?.children.length ?? 0 : draft.items.length;
    items((l) => MenuTree.insert(l, parent, count, n));
  }
  async function save() {
    if (!draft) return;
    saving = true;
    try {
      const { data: saved } = await rest<Menu>("auvyx/v1/menus", { method: "POST", body: JSON.stringify({ ...draft, items: draft.items.map((n) => MenuTree.resolve(n, targets)) }) });
      menus = menus.some((m) => m.id === saved.id) ? menus.map((m) => (m.id === saved.id ? saved : m)) : [...menus, saved];
      load(saved);
      reloadCanvas();
      toast(`Menu “${saved.title}” saved`);
    } catch (e) { toast(`Menu not saved: ${(e as Error).message}`); } finally { saving = false; }
  }
  const same = (a: MenuTree.Path | null, b: MenuTree.Path) => !!a && a.join(".") === b.join(".");
  const addLabel = $derived.by(() => { const p = selected && selected.length < MenuTree.MAX_DEPTH ? selected : null; const n = p && draft ? MenuTree.get(draft.items, p) : null; return n ? `Add inside “${n.label}”` : "Add to the menu"; });
  const groups = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    const by = new Map<string, MenuTree.LinkTarget[]>();
    for (const t of targets) if (!q || t.label.toLowerCase().includes(q)) by.set(t.group, [...(by.get(t.group) ?? []), t]);
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
  });
  const icon = "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30";
</script>

<Dialog bind:open={ui.menus} contentBoxClass="flex! flex-col gap-0! p-0!" data-menu-dialog="1" style="width: min(1180px, calc(100vw - 2rem)); max-width: none; height: min(780px, calc(100vh - 4rem));">
  <DialogClose />
  <div class="flex items-center gap-2 border-b border-border px-5 py-3 pe-14">
    <span class="text-sm font-semibold">Menus</span>
    <div class="w-56 shrink-0">
      <Select size="sm" triggerClass="h-8!" value={draft ? String(draft.id) : ""} options={menus.map((m) => ({ value: String(m.id), label: m.title }))}
        onValue={(v: string) => { if (!dirty || confirm("Leave this menu without saving it?")) { const m = menus.find((x) => String(x.id) === v); if (m) load(m); } }} />
    </div>
    <button class="h-8 shrink-0 whitespace-nowrap rounded-md border border-border px-3 text-xs hover:bg-muted" onclick={() => { load({ id: 0, title: "New menu", items: [] }); dirty = true; }}>New menu</button>
    {#if draft}<div class="w-56 shrink-0"><Input class="h-8 text-xs" value={draft.title} placeholder="Menu name" onchange={(e) => edit((m) => ({ ...m, title: e.currentTarget.value }))} /></div>{/if}
    <div class="flex-1"></div>
    {#if dirty}<span class="text-xs text-amber-600">Unsaved</span>{/if}
    <button class="h-8 shrink-0 whitespace-nowrap rounded-md bg-blue-600 px-4 text-xs font-medium text-white disabled:opacity-40" data-menu-save="1" disabled={!dirty || saving} onclick={save}>{saving ? "Saving…" : "Save menu"}</button>
  </div>
  <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px]">
    <div class="flex min-h-0 flex-col gap-1.5 overflow-y-auto p-5">
      {#if !loaded}<p class="text-xs text-muted-foreground">Loading menus…</p>{/if}
      {#if draft}
        {#each MenuTree.flatten(draft.items) as [path, n] (path.join(".") + n.label)}
          {@const level = path.length}
          <div class={["flex items-center gap-2 rounded-md border bg-background px-2 py-1.5", same(selected, path) ? "border-blue-500 ring-1 ring-blue-500/30" : "border-border"]}
            style:margin-left="{(level - 1) * 28}px" data-menu-item={path.join(".")} role="button" tabindex="0" onclick={() => (selected = path)} onkeydown={(e) => e.key === "Enter" && (selected = path)}>
            <span class="w-4 shrink-0 text-center text-[10px] text-muted-foreground">{level === 1 ? "●" : level === 2 ? "○" : "·"}</span>
            <div class="w-48 shrink-0"><Input class="h-7 text-xs" value={n.label} placeholder="Label" onchange={(e) => items((l) => MenuTree.update(l, path, (x) => ({ ...x, label: e.currentTarget.value })))} /></div>
            <div class="min-w-0 flex-1"><Input class="h-7 text-xs text-muted-foreground" value={n.url} placeholder="https://… or /path (a column heading: leave empty)" onchange={(e) => items((l) => MenuTree.update(l, path, (x) => ({ ...x, url: e.currentTarget.value, kind: "custom", id: 0 })))} /></div>
            {#if level === 1}
              <label class="flex shrink-0 items-center gap-1 text-[11px]" title="Show a wide panel on hover: second-level items become columns, and a library piece can fill it (no links needed)">
                <input type="checkbox" checked={n.mega} data-menu-mega="1" onclick={(e) => { const c = e.currentTarget.checked; items((l) => MenuTree.update(l, path, (x) => ({ ...x, mega: c }))); }} />Mega
              </label>
              {#if n.mega}
                <div class="w-44 shrink-0" title="A pattern or component shown as the panel's last column">
                  <Select size="sm" value={String(n.panel)} options={[{ value: "0", label: "No panel content" }, ...library.items.map((i) => ({ value: String(i.id), label: `${i.title} (${i.synced ? "component" : "pattern"})` }))]}
                    onValue={(v: string) => items((l) => MenuTree.update(l, path, (x) => ({ ...x, panel: Number(v) || 0 })))} data-menu-panel="1" />
                </div>
              {/if}
            {/if}
            <button class={icon} title="Move up" onclick={(e) => { e.stopPropagation(); move((l, p) => MenuTree.shift(l, p, -1), path); }}>↑</button>
            <button class={icon} title="Move down" onclick={(e) => { e.stopPropagation(); move((l, p) => MenuTree.shift(l, p, 1), path); }}>↓</button>
            <button class={icon} title="Out of its parent" disabled={level === 1} onclick={(e) => { e.stopPropagation(); move(MenuTree.outdent, path); }}>←</button>
            <button class={icon} title="Into the item above" disabled={level >= MenuTree.MAX_DEPTH} onclick={(e) => { e.stopPropagation(); move(MenuTree.indent, path); }}>→</button>
            <button class={icon} title="Remove" onclick={(e) => { e.stopPropagation(); items((l) => MenuTree.remove(l, path)); selected = null; }}><Icon name="trash" size={13} /></button>
          </div>
        {/each}
      {/if}
      <p class="mt-3 text-[11px] leading-relaxed text-muted-foreground">Click an item to add links inside it. A mega menu turns a top item's submenu into a wide panel: its second-level items are column headings, their links the column, and its last column can be a piece from the blocks library. Up to three levels.</p>
      {#if library.loaded && !library.items.length}
        <p class="text-[11px] leading-relaxed text-muted-foreground" data-menu-library-empty="1">No reusable pieces yet. <span>Save a section as a component (right-click)</span>, then turn Mega on for a top item and pick the piece as its panel. Links under that item become columns beside it; with none, the panel is the piece alone.</p>
      {/if}
    </div>
    <div class="flex min-h-0 flex-col gap-3 border-l border-border bg-muted/30 p-4">
      <div class="flex min-h-0 flex-col gap-2">
        <p class="text-xs font-medium">{addLabel}</p>
        <Input class="h-7 text-xs" placeholder="Find a page or category" bind:value={filter} />
        <div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          <button class="shrink-0 rounded-md px-2 py-1 text-left text-xs hover:bg-muted" data-menu-add-custom="1" onclick={() => add(MenuTree.node("New link", ""))}>+ Custom link or column heading</button>
          {#each groups as [group, ts] (group)}
            <p class="mt-2 shrink-0 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
            {#each ts as t (t.url + t.label)}
              <button class="shrink-0 truncate rounded-md px-2 py-1 text-left text-xs hover:bg-muted" data-menu-target={t.url} onclick={() => add(MenuTree.fromTarget(t))}>+ {t.label}</button>
            {/each}
          {/each}
        </div>
      </div>
    </div>
  </div>
</Dialog>
