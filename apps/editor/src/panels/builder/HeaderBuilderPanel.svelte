<script lang="ts" module>
  import type { IconName } from "../../ui/icons";
  import { HeaderBuilder as HB, BuilderParts } from "../../lib/builderCore";

  type ItemKind = HB.ItemKind;
  type RowKind = HB.RowKind;
  type Slot = HB.Slot;

  export const itemLabel = (k: ItemKind): string => (k === "SearchIcon" ? "Search icon" : k === "SearchField" ? "Search field" : k === "Custom" ? "Element" : HB.ITEM[k].label);

  export const itemIcon = (k: ItemKind): IconName => ({
    Logo: "image", Menu: "menu", MenuButton: "menu", Category: "grid", SearchIcon: "search", SearchField: "search", Account: "user", Cart: "bag",
    Wishlist: "star", Compare: "layers", Social: "share", Text: "text", Html: "code", Component: "component", Custom: "box",
  } as const)[k];

  export const rowLabel = (r: RowKind) => HB.ROW_LABEL[r];
  export const slotLabel = (s: Slot) => HB.SLOT_LABEL[s];
  export const toneLabel = (t: BuilderParts.Tone) => ({ plain: "Plain", muted: "Muted", dark: "Dark", brand: "Brand" })[t];
</script>

<script lang="ts">
  // The header builder board (U/HeaderBuilderPanel.scala, docs/header-builder.md): the layout a width shows as rows
  // (Top / Main / Bottom) × slots (start / center / end) of item chips. Drag a chip to another slot or row, or use its menu;
  // "+" adds an item; every change is one action, one commit, one Undo. A chip is the item's element: selecting it
  // selects it on the canvas.
  import { Icon, Select, selectItems } from "../../ui/kit";
  import { BoardError, bpLabel, bpOf, builder, chipDown, run, takeDragged, type Bp } from "../../lib/builder.svelte";
  import { store } from "../../lib/store.svelte";
  import { ancestors } from "@auvyx/editor-core";
  import Frame from "./Frame.svelte";
  import BpTabs from "./BpTabs.svelte";
  import ErrorLine from "./ErrorLine.svelte";
  import Seg from "./Seg.svelte";
  import Row from "./Row.svelte";
  import Check from "./Check.svelte";
  import IconButton from "./IconButton.svelte";
  import HeaderSketch from "./HeaderSketch.svelte";

  let { root }: { root: string } = $props();

  const error = new BoardError();
  let picker = $state<[RowKind, Slot] | null>(null);
  let rowOpen = $state<RowKind | null>(null);
  let presets = $state(false);

  const view = $derived.by(() => { const l = HB.readHeader(store.doc, root); return l ? HB.headerView(l) : null; });
  const bp = $derived(bpOf(store.breakpoint));
  const sel = $derived(store.selected);

  /** The layout a width shows (the tablet may follow the desktop or the mobile one). */
  const layoutFor = (v: HB.HeaderView, b: Bp): Bp => (b !== "tablet" ? b : v.tablet === "desktop" ? "desktop" : v.tablet === "own" ? "tablet" : "mobile");

  /** Items one can add: every builder item but hand-made elements and components (they come from Assets), the menu
   * button only where the layout does not show on desktops. */
  const addable = (desktop: boolean): ItemKind[] => HB.ITEM_KINDS.filter((k) => k !== "Custom" && k !== "Component").filter((k) => !(k === "MenuButton" && desktop));

  const snake = BuilderParts.enumName;
  const select = (id: string | null) => (store.selected = id);

  const tabletText: Record<HB.TabletMode, string> = {
    desktop: "Follows Desktop: edits here change the desktop layout too. Pick Own layout to change tablets alone.",
    mobile: "Follows Mobile: edits here change the mobile layout too. Pick Own layout to change tablets alone.",
    own: "Tablets have a layout of their own (a copy of the one they followed).",
  };

  const rows = HB.ROWS;
  const slots = HB.SLOTS;

  function chipMenuMoves(r: RowKind, s: Slot, i: number, count: number, id: string) {
    const move = (row: RowKind, slot: Slot, index?: number) => run("header_move_item", { item: id, row, bp, slot, ...(index === undefined ? {} : { index }) }, error);
    const si = slots.indexOf(s), ri = rows.indexOf(r);
    const left = i > 0 ? () => move(r, s, i - 1) : si > 0 ? () => move(r, slots[si - 1]!) : null;
    const right = i < count - 1 ? () => move(r, s, i + 1) : si < slots.length - 1 ? () => move(r, slots[si + 1]!, 0) : null;
    const up = ri > 0 ? () => move(rows[ri - 1]!, s) : null;
    const down = ri < rows.length - 1 ? () => move(rows[ri + 1]!, s) : null;
    return { left, right, up, down };
  }

  function remove(id: string) {
    const top = ancestors(store.doc, id).at(-1) ?? null;
    run("header_remove_item", { item: id }, error);
    if (!store.doc.nodes[id]) select(top);
  }

  function drop(id: string, slotEl: Element, index: number) {
    const s = slots.find((x) => x === slotEl.getAttribute("data-hb-slot"));
    const r = rows.find((x) => x === slotEl.closest("[data-hb-row]")?.getAttribute("data-hb-row"));
    if (s && r) run("header_move_item", { item: id, row: r, bp, slot: s, index }, error);
  }

  const sticky = $derived((HB.STICKIES.find((s) => snake(s) === view?.sticky) ?? "Off") as HB.Sticky);
</script>

<Frame name="Header builder" attr="header-builder">
  <BpTabs attr="hb-tabs" />
  <ErrorLine {error} />
  {#if view}
    {@const layout = layoutFor(view, bp)}
    {@const tree = view.layouts.find((t) => t.layout === layout)}
    {@const desktop = !!tree?.shows.includes("desktop")}
    <div class="flex flex-col gap-2" data-hb-layout={layout}>
      {#if bp === "tablet"}
        {@const mode = (HB.TABLET_MODES.find((t) => t === view.tablet) ?? "mobile") as HB.TabletMode}
        <div class="flex flex-col gap-1.5 rounded-md bg-muted/40 p-2" data-hb-tablet={mode}>
          <span class="text-[11px] text-muted-foreground">Tablet</span>
          <Seg attr="tablet" choices={[["desktop", "Desktop"], ["mobile", "Mobile"], ["own", "Own layout"]]} active={mode} pick={(m) => run("header_set_tablet", { mode: m }, error)} />
          <p class="text-[11px] leading-relaxed text-muted-foreground">{tabletText[mode]}</p>
        </div>
      {:else if tree?.shows.includes("tablet")}
        <p class="text-[11px] text-muted-foreground">Tablets show this layout too.</p>
      {/if}

      {#each rows as r (r)}
        {@const rv = tree?.rows.find((x) => x.row === r)}
        {@const hidden = !!rv?.hidden.includes(bp)}
        {@const height = rv ? rv.height : HB.defaultHeight(bp, r)}
        {@const items = (s: Slot) => rv?.slots.find((x) => x.slot === s)?.items ?? []}
        {@const here = sel ? slots.flatMap((s) => items(s).flatMap((it, i) => (it.id === sel ? [[s, i, it] as const] : [])))[0] : undefined}
        <div class={["flex flex-col gap-1 rounded-md bg-muted/40 p-1.5", hidden && "opacity-60"]} data-hb-row={r}>
          <div class="flex items-center gap-1.5 px-0.5">
            <span class="text-[11px] font-medium">{rowLabel(r)}</span>
            <span class="text-[10px] text-muted-foreground">{height} px</span>
            {#if hidden}<span class="flex items-center gap-0.5 text-[10px] text-muted-foreground"><Icon name="eyeOff" size={10} />Hidden on {bpLabel(bp)}</span>{/if}
            <span class="flex-1"></span>
            <IconButton icon="settings" hint="{rowLabel(r)} options" attr="row-options" act={() => (rowOpen = rowOpen === r ? null : r)} />
          </div>
          <div class="grid grid-cols-3 gap-1">
            {#each slots as s (s)}
              <div
                class="flex min-h-[56px] min-w-0 flex-col gap-1 rounded-md border border-dashed border-border bg-background/70 p-1 transition-colors"
                data-hb-drop="1"
                data-hb-slot={s}
                aria-label="{rowLabel(r)}, {slotLabel(s)}"
              >
                {#each items(s) as it (it.id)}
                  {@const kind = HB.headerKindOf(it.kind)}
                  {@const off = it.hidden.includes(bp)}
                  {@const on = sel === it.id}
                  <div
                    class={["flex h-6 min-w-0 cursor-grab touch-none select-none items-center gap-1 rounded-md border bg-background px-1.5 text-[11px] shadow-xs active:cursor-grabbing",
                      on ? "border-primary ring-1 ring-primary" : "border-border", off && "border-dashed text-muted-foreground"]}
                    data-hb-item={it.id}
                    data-hb-kind={it.kind}
                    tabindex="0"
                    role="button"
                    aria-pressed={String(on) as "true" | "false"}
                    title={off ? `${itemLabel(kind)} (hidden on ${bpLabel(bp)})` : itemLabel(kind)}
                    onpointerdown={(e) => chipDown(e, it.id, (slotEl, index) => drop(it.id, slotEl, index))}
                    onclick={() => { if (!takeDragged()) select(it.id); }}
                    onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(it.id); } }}
                  >
                    <Icon name={itemIcon(kind)} size={11} class="text-muted-foreground" />
                    <span class="min-w-0 flex-1 truncate" translate={kind === "Custom" && it.label ? "no" : undefined}>{kind === "Custom" && it.label ? it.label : itemLabel(kind)}</span>
                    {#if off}<Icon name="eyeOff" size={10} class="text-muted-foreground" />{/if}
                  </div>
                {/each}
                <button
                  type="button"
                  class="mt-auto flex h-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Add to {slotLabel(s)}"
                  aria-label="Add to {rowLabel(r)}, {slotLabel(s)}"
                  data-hb-add="{r}-{s}"
                  onclick={() => (picker = picker && picker[0] === r && picker[1] === s ? null : [r, s])}
                ><Icon name="plus" size={12} /></button>
              </div>
            {/each}
          </div>

          {#if here}
            {@const [s, i, it] = here}
            {@const kind = HB.headerKindOf(it.kind)}
            {@const off = it.hidden.includes(bp)}
            {@const m = chipMenuMoves(r, s, i, items(s).length, it.id)}
            <!-- The selected chip's menu: moves (the keyboard's way to drag), hide here, its settings, remove. -->
            <div class="flex flex-wrap items-center gap-0.5 rounded-md bg-background p-1 shadow-xs" data-hb-chip-menu={it.id}>
              <span class="truncate px-1 text-[11px] font-medium">{itemLabel(kind)}</span>
              <span class="flex-1"></span>
              <IconButton icon="chevronLeft" hint="Move left" attr="left" enabled={!!m.left} act={() => m.left?.()} />
              <IconButton icon="chevronRight" hint="Move right" attr="right" enabled={!!m.right} act={() => m.right?.()} />
              <button
                type="button"
                class="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                title="Move up a row" aria-label="Move up a row" data-chip-action="up" disabled={!m.up}
                onclick={() => m.up?.()}
              ><Icon name="arrowDown" size={13} class="rotate-180" /></button>
              <IconButton icon="arrowDown" hint="Move down a row" attr="down" enabled={!!m.down} act={() => m.down?.()} />
              <IconButton icon={off ? "eye" : "eyeOff"} hint={off ? `Show on ${bpLabel(bp)}` : `Hide on ${bpLabel(bp)}`} attr="hide" enabled={kind !== "Custom"}
                act={() => run("header_set_item_visible", { item: it.id, bp, on: off }, error)} />
              <IconButton icon="settings" hint="Item settings" attr="settings" act={() => { select(it.id); builder.open = false; }} />
              <IconButton icon="trash" hint="Remove" attr="remove" act={() => remove(it.id)} />
            </div>
          {/if}

          {#if picker && picker[0] === r}
            {@const s = picker?.[1] ?? "start"}
            <div class="flex flex-col gap-1 rounded-md bg-background p-1.5 shadow-xs" data-hb-picker="{r}-{s}">
              <div class="flex items-center gap-1">
                <span class="flex-1 text-[11px] font-medium">Add to {rowLabel(r)} · {slotLabel(s)}</span>
                <IconButton icon="x" hint="Close" attr="close-picker" act={() => (picker = null)} />
              </div>
              <div class="grid grid-cols-2 gap-1">
                {#each addable(desktop) as k (k)}
                  <button
                    type="button"
                    class="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-[11px] hover:bg-muted"
                    data-hb-pick={snake(k)}
                    onclick={() => {
                      const slot = s;
                      picker = null;
                      const id = run("header_add_item", { row: r, bp, slot, item: snake(k) }, error);
                      if (id) select(id);
                    }}
                  ><Icon name={itemIcon(k)} size={12} class="text-muted-foreground" /><span class="truncate">{itemLabel(k)}</span></button>
                {/each}
              </div>
            </div>
          {/if}

          {#if rowOpen === r}
            {@const tone = (BuilderParts.TONES.find((t) => t === rv?.tone) ?? "plain") as BuilderParts.Tone}
            {@const align = (s: Slot) => (HB.ALIGNS.find((a) => a === rv?.slots.find((x) => x.slot === s)?.align) ?? ({ start: "start", center: "center", end: "end" } as const)[s])}
            {@const set = (o: Record<string, unknown>) => run("header_set_row_options", { row: r, bp, ...o }, error)}
            <div class="flex flex-col gap-2 rounded-md bg-background p-2 shadow-xs" data-hb-row-options={r}>
              <Row name="Height">
                <Select value={String(height)} options={selectItems(HB.HEIGHTS.map((h) => [String(h), `${h} px`]))} size="xs" data-hb-height={r}
                  onValue={(v) => { if (/^\d+$/.test(v)) set({ height: Number(v) }); }} />
              </Row>
              <Row name="Colour"><Seg attr="tone" choices={BuilderParts.TONES.map((t) => [t, toneLabel(t)])} active={tone} pick={(t) => set({ tone: t })} /></Row>
              <span class="text-[11px] text-muted-foreground">Align</span>
              {#each slots as s (s)}
                <Row name={slotLabel(s)}>
                  <Select value={align(s)} options={selectItems([["start", "Start"], ["center", "Center"], ["end", "End"], ["between", "Spread"]])} size="xs" data-hb-align={s}
                    onValue={(v) => { if ((HB.ALIGNS as readonly string[]).includes(v)) run("header_set_slot_align", { row: r, bp, slot: s, align: v }, error); }} />
                </Row>
              {/each}
              <div class="grid grid-cols-2 gap-1.5 pl-[68px]">
                <Check name="Line below" attr="divider" on={!!rv?.divider} set={(b) => set({ divider: b })} />
                <Check name="Hide on {bpLabel(bp)}" attr="row-hidden" on={hidden} set={(b) => run("header_set_row_visible", { row: r, bp, on: !b }, error)} />
              </div>
            </div>
          {/if}
        </div>
      {/each}

      <div class="flex flex-col gap-1.5">
        <Row name="Sticky">
          <Seg attr="sticky" choices={HB.STICKIES.map((s) => [s, HB.STICKY_LABEL[s]])} active={sticky} pick={(s) => run("header_set_sticky", { sticky: snake(s) }, error)} />
        </Row>
        <div class="pl-[68px]">
          <Check name="Over the home page's first section" attr="overlay" on={view.overlay} set={(b) => run("header_set_sticky", { sticky: snake(sticky), overlay: b }, error)} />
        </div>
        <p class="text-[11px] text-muted-foreground" data-hb-heights="1"><span>Height: {view.heights.desktop ?? 0} / {view.heights.tablet ?? 0} / {view.heights.mobile ?? 0}</span> px</p>
      </div>

      <div class="flex flex-col gap-2">
        <button type="button" class="flex h-7 items-center gap-1.5 text-left text-[11px] font-medium" data-hb-presets="toggle" aria-expanded={presets} onclick={() => (presets = !presets)}>
          <Icon name="chevronRight" size={11} class={presets ? "text-muted-foreground rotate-90" : "text-muted-foreground"} />
          <Icon name="layoutTemplate" size={12} class="text-muted-foreground" />
          Presets
        </button>
        {#if presets}
          <div class="flex flex-col gap-2">
            <p class="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900" data-hb-preset-note="1">A preset replaces the layout. It keeps the menus, the texts and the items it shares with this one; Undo brings the header back.</p>
            {#each [["Storefront", HB.HEADER_PRESETS], ["Classic", HB.HEADER_LEGACY_LAYOUTS.map(([, p]) => p)]] as const as [name, all] (name)}
              <div class="flex flex-col gap-1">
                <span class="text-[10px] text-muted-foreground">{name}</span>
                <div class="grid grid-cols-2 gap-2">
                  {#each all as p (p.id)}
                    <button type="button" class="flex flex-col gap-1 rounded-md p-1 text-left hover:bg-muted" data-hb-preset={p.id} title={p.hint}
                      onclick={() => run("header_set_preset", { preset: p.id }, error)}>
                      <HeaderSketch preset={p} />
                      <span class="px-0.5 text-[10px] text-muted-foreground">{p.label}</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</Frame>
