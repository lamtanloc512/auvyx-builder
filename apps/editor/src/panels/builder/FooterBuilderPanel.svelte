<script lang="ts" module>
  import type { IconName } from "../../ui/icons";
  import { FooterBuilder as FB, BuilderParts } from "../../lib/builderCore";

  type ItemKind = FB.FooterItemKind;
  type RowKind = FB.FooterRowKind;

  export const footerItemLabel = (k: ItemKind) => (k === "Custom" ? "Element" : FB.FOOTER_ITEM[k].label);
  export const footerItemIcon = (k: ItemKind): IconName => ({
    Logo: "image", About: "quote", Links: "link", Newsletter: "send", Social: "share", Payments: "price", Contact: "user", Copyright: "text", Text: "text",
    Html: "code", Custom: "box",
  } as const)[k];
  export const footerRowLabel = (r: RowKind) => ({ top: "Top row", main: "Columns", bottom: "Last line" })[r];
</script>

<script lang="ts">
  // The footer builder board (U/FooterBuilderPanel.scala, the twin of the header's): rows (Top / Main / Bottom) of 1 to 6
  // columns of item chips. Columns fold to two on tablets and one on phones by themselves; the width tabs say where "hide"
  // applies. Every change is one action, one commit, one Undo.
  import { Icon, Select, selectItems } from "../../ui/kit";
  import { BoardError, bpLabel, bpOf, builder, chipDown, run, takeDragged } from "../../lib/builder.svelte";
  import { store } from "../../lib/store.svelte";
  import { ancestors } from "@auvyx/editor-core";
  import Frame from "./Frame.svelte";
  import BpTabs from "./BpTabs.svelte";
  import ErrorLine from "./ErrorLine.svelte";
  import Seg from "./Seg.svelte";
  import Row from "./Row.svelte";
  import Check from "./Check.svelte";
  import IconButton from "./IconButton.svelte";
  import FooterSketch from "./FooterSketch.svelte";
  import { toneLabel } from "./HeaderBuilderPanel.svelte";

  let { root }: { root: string } = $props();

  const error = new BoardError();
  let picker = $state<[RowKind, number] | null>(null);
  let rowOpen = $state<RowKind | null>(null);
  let presets = $state(false);

  const view = $derived.by(() => { const l = FB.readFooter(store.doc, root); return l ? FB.footerView(l) : null; });
  const bp = $derived(bpOf(store.breakpoint));
  const sel = $derived(store.selected);
  const snake = BuilderParts.enumName;
  const select = (id: string | null) => (store.selected = id);
  const rows = FB.FOOTER_ROWS;

  function remove(id: string) {
    const top = ancestors(store.doc, id).at(-1) ?? null;
    run("footer_remove_item", { item: id }, error);
    if (!store.doc.nodes[id]) select(top);
  }

  function drop(id: string, colEl: Element, index: number) {
    const ci = colEl.getAttribute("data-fb-column");
    const r = rows.find((x) => x === colEl.closest("[data-fb-row]")?.getAttribute("data-fb-row"));
    if (ci !== null && /^\d+$/.test(ci) && r) run("footer_move_item", { item: id, row: r, column: Number(ci), index }, error);
  }

  const tone = $derived((BuilderParts.TONES.find((t) => t === view?.tone) ?? "dark") as BuilderParts.Tone);
</script>

<Frame name="Footer builder" attr="footer-builder">
  <BpTabs attr="fb-tabs" />
  <ErrorLine {error} />
  {#if view}
    <div class="flex flex-col gap-2">
      <p class="text-[11px] text-muted-foreground">Columns fold to two on tablets and one on phones.</p>
      {#each rows as r (r)}
        {@const rv = view.rows.find((x) => x.row === r)}
        {@const cols = rv?.columns ?? []}
        {@const hidden = !!rv?.hidden.includes(bp)}
        {@const here = sel ? cols.flatMap((c, ci) => c.items.flatMap((it, i) => (it.id === sel ? [[ci, i, it] as const] : [])))[0] : undefined}
        {@const columns = (n: number) => run("footer_set_columns", { row: r, columns: n }, error)}
        <div class={["flex flex-col gap-1 rounded-md bg-muted/40 p-1.5", hidden && "opacity-60"]} data-fb-row={r}>
          <div class="flex items-center gap-1 px-0.5">
            <span class="text-[11px] font-medium">{footerRowLabel(r)}</span>
            {#if hidden}<span class="flex items-center gap-0.5 text-[10px] text-muted-foreground"><Icon name="eyeOff" size={10} />Hidden on {bpLabel(bp)}</span>{/if}
            <span class="flex-1"></span>
            <IconButton icon="minus" hint="One column less" attr="columns-less" enabled={cols.length > 1} act={() => columns(cols.length - 1)} />
            <span class="w-4 text-center text-[10px] text-muted-foreground" data-fb-columns={r}>{rv ? cols.length : 0}</span>
            <IconButton icon="plus" hint="One column more" attr="columns-more" enabled={cols.length < FB.MAX_COLUMNS} act={() => columns(cols.length + 1)} />
            <IconButton icon="settings" hint="{footerRowLabel(r)} options" attr="row-options" act={() => (rowOpen = rowOpen === r ? null : r)} />
          </div>
          {#if !cols.length}
            <button type="button" class="h-8 rounded-md border border-dashed border-border text-[11px] text-muted-foreground hover:bg-background" data-fb-add-row={r}
              onclick={() => columns(1)}>Add this row</button>
          {:else}
            <div class="grid gap-1" style="grid-template-columns:repeat({cols.length},minmax(0,1fr))">
              {#each cols as c, ci (ci)}
                <div
                  class="flex min-h-[56px] min-w-0 flex-col gap-1 rounded-md border border-dashed border-border bg-background/70 p-1 transition-colors"
                  data-hb-drop="1"
                  data-fb-column={String(ci)}
                  aria-label="{footerRowLabel(r)}, column {ci + 1}"
                >
                  {#each c.items as it (it.id)}
                    {@const kind = FB.footerKindOf(it.kind)}
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
                      title={footerItemLabel(kind)}
                      onpointerdown={(e) => chipDown(e, it.id, (colEl, index) => drop(it.id, colEl, index))}
                      onclick={() => { if (!takeDragged()) select(it.id); }}
                      onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(it.id); } }}
                    >
                      <Icon name={footerItemIcon(kind)} size={11} class="text-muted-foreground" />
                      <span class="min-w-0 flex-1 truncate" translate={kind === "Custom" && it.label ? "no" : undefined}>{kind === "Custom" && it.label ? it.label : footerItemLabel(kind)}</span>
                      {#if off}<Icon name="eyeOff" size={10} class="text-muted-foreground" />{/if}
                    </div>
                  {/each}
                  <button
                    type="button"
                    class="mt-auto flex h-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Add to column {ci + 1}"
                    data-fb-add="{r}-{ci}"
                    onclick={() => (picker = picker && picker[0] === r && picker[1] === ci ? null : [r, ci])}
                  ><Icon name="plus" size={12} /></button>
                </div>
              {/each}
            </div>
          {/if}

          {#if here}
            {@const [ci, i, it] = here}
            {@const kind = FB.footerKindOf(it.kind)}
            {@const off = it.hidden.includes(bp)}
            {@const move = (row: RowKind, column: number, index?: number) => run("footer_move_item", { item: it.id, row, column, ...(index === undefined ? {} : { index }) }, error)}
            <div class="flex flex-wrap items-center gap-0.5 rounded-md bg-background p-1 shadow-xs" data-hb-chip-menu={it.id}>
              <span class="truncate px-1 text-[11px] font-medium">{footerItemLabel(kind)}</span>
              <span class="flex-1"></span>
              <IconButton icon="chevronLeft" hint="Move to the column before" attr="left" enabled={ci > 0} act={() => { if (ci > 0) move(r, ci - 1); }} />
              <IconButton icon="chevronRight" hint="Move to the next column" attr="right" enabled={ci < cols.length - 1} act={() => { if (ci < cols.length - 1) move(r, ci + 1); }} />
              <button
                type="button"
                class="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                title="Move up" aria-label="Move up" data-chip-action="up" disabled={i === 0}
                onclick={() => { if (i > 0) move(r, ci, i - 1); }}
              ><Icon name="arrowDown" size={13} class="rotate-180" /></button>
              <IconButton icon="arrowDown" hint="Move down" attr="down" enabled={i < cols[ci]!.items.length - 1} act={() => { if (i < cols[ci]!.items.length - 1) move(r, ci, i + 1); }} />
              <IconButton icon={off ? "eye" : "eyeOff"} hint={off ? `Show on ${bpLabel(bp)}` : `Hide on ${bpLabel(bp)}`} attr="hide" enabled={kind !== "Custom"}
                act={() => run("footer_set_item_visible", { item: it.id, bp, on: off }, error)} />
              <IconButton icon="settings" hint="Item settings" attr="settings" act={() => { select(it.id); builder.open = false; }} />
              <IconButton icon="trash" hint="Remove" attr="remove" act={() => remove(it.id)} />
            </div>
          {/if}

          {#if picker && picker[0] === r}
            {@const ci = picker?.[1] ?? 0}
            <div class="flex flex-col gap-1 rounded-md bg-background p-1.5 shadow-xs" data-fb-picker="{r}-{ci}">
              <div class="flex items-center gap-1">
                <span class="flex-1 text-[11px] font-medium">Add to {footerRowLabel(r)} · column {ci + 1}</span>
                <IconButton icon="x" hint="Close" attr="close-picker" act={() => (picker = null)} />
              </div>
              <div class="grid grid-cols-2 gap-1">
                {#each FB.FOOTER_ITEM_KINDS.filter((k) => k !== "Custom") as k (k)}
                  <button
                    type="button"
                    class="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-[11px] hover:bg-muted"
                    data-fb-pick={snake(k)}
                    onclick={() => {
                      const column = ci;
                      picker = null;
                      const id = run("footer_add_item", { row: r, column, item: snake(k) }, error);
                      if (id) select(id);
                    }}
                  ><Icon name={footerItemIcon(k)} size={12} class="text-muted-foreground" /><span class="truncate">{footerItemLabel(k)}</span></button>
                {/each}
              </div>
            </div>
          {/if}

          {#if rowOpen === r}
            <div class="flex flex-col gap-2 rounded-md bg-background p-2 shadow-xs" data-fb-row-options={r}>
              {#if cols.length}
                <div class="flex flex-col gap-1.5">
                  <span class="text-[11px] text-muted-foreground">Align</span>
                  {#each cols as c, ci (ci)}
                    <Row name="Column {ci + 1}">
                      <Select value={c.align} options={selectItems([["start", "Start"], ["center", "Center"], ["end", "End"]])} size="xs" aria-label="Align column {ci + 1}"
                        onValue={(v) => { if ((FB.FOOTER_ALIGNS as readonly string[]).includes(v)) run("footer_set_column_align", { row: r, column: ci, align: v }, error); }} />
                    </Row>
                  {/each}
                </div>
              {/if}
              <div class="grid grid-cols-2 gap-1.5 pl-[68px]">
                <Check name="Line above" attr="divider" on={!!rv?.divider} set={(b) => run("footer_set_row_divider", { row: r, on: b }, error)} />
                <Check name="Hide on {bpLabel(bp)}" attr="row-hidden" on={hidden} set={(b) => run("footer_set_row_visible", { row: r, bp, on: !b }, error)} />
              </div>
            </div>
          {/if}
        </div>
      {/each}

      <Row name="Colour">
        <Seg attr="footer-tone" choices={BuilderParts.TONES.map((t) => [t, toneLabel(t)])} active={tone} pick={(t) => run("footer_set_tone", { tone: t }, error)} />
      </Row>

      <div class="flex flex-col gap-2">
        <button type="button" class="flex h-7 items-center gap-1.5 text-left text-[11px] font-medium" data-fb-presets="toggle" aria-expanded={presets} onclick={() => (presets = !presets)}>
          <Icon name="chevronRight" size={11} class={presets ? "text-muted-foreground rotate-90" : "text-muted-foreground"} />
          <Icon name="layoutTemplate" size={12} class="text-muted-foreground" />
          Presets
        </button>
        {#if presets}
          <div class="flex flex-col gap-2">
            <p class="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900">A preset replaces the layout. It keeps the link lists' menus, the texts and the items it shares with this one; Undo brings the footer back.</p>
            <div class="grid grid-cols-2 gap-2">
              {#each FB.FOOTER_PRESETS as p (p.id)}
                <button type="button" class="flex flex-col gap-1 rounded-md p-1 text-left hover:bg-muted" data-fb-preset={p.id} title={p.hint}
                  onclick={() => run("footer_set_preset", { preset: p.id }, error)}>
                  <FooterSketch preset={p} />
                  <span class="px-0.5 text-[10px] text-muted-foreground">{p.label}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</Frame>
