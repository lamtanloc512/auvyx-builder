<script lang="ts">
  // SettingsPanel.props: the props of a component marked auvyx-ui-<id> (UiCatalog). A Row, Column or Grid's arrangement
  // is the Layout card of the Style tab; what is left here is the element's own: Fit, Add column.
  import { Settings as S, insert, childrenOf } from "@auvyx/editor-core";
  import { Button, Input } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { newColumn } from "../../lib/elements";
  import { setChoice } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  import Choices from "./Choices.svelte";
  const node = $derived(store.node);
  const widget = $derived(node ? S.uiWidget(S.uiIdOf(node)) : undefined);
  const LAYOUT_KEYS = new Set(["justify", "align", "gap", "wrap", "columns"]);
  const fields = $derived(widget ? widget.fields.filter((f) => !(widget.group === "Layout" && LAYOUT_KEYS.has(f.key))) : []);
  function setText(key: string, value: string) {
    const id = store.selected;
    if (!id) return;
    const target = S.uiSetText(store.doc, id, key, value);
    if (target) store.updateNode(target[0], target[1], `ui-${key}:${target[0]}`);
  }
  function setFlag(name: string, on: boolean) {
    const id = store.selected;
    if (id) store.updateNode(id, (n) => S.uiWithFlag(n, name, on), `ui-flag-${name}:${id}`);
  }
</script>

<div class="flex flex-col gap-3 p-3 text-xs">
  {#if !node || !widget}
    <p class="text-muted-foreground">Select a component.</p>
  {:else}
    {@const n = node}
    <div class="flex flex-col gap-3" data-ui-settings={widget.id}>
      {#each fields as field (field.key)}
        {#if S.UI_CHOICE_KEYS.has(field.key)}
          {@const current = S.uiProp(n, field.key, S.uiFallback(field.key))}
          <div class="grid grid-cols-[72px_1fr] items-start gap-1">
            <div class="flex flex-col gap-0.5 pt-1">
              <span class="text-[11px] text-muted-foreground">{field.label}</span>
              <span class="text-[10px] font-medium text-blue-400">{field.choices.find((c) => c.value === current)?.label ?? current}</span>
            </div>
            <Choices {current} options={field.choices} oneLine={field.key === "fit"} pick={(v) => { if (store.selected) setChoice(store.selected, field.key, v); }} />
          </div>
        {:else if field.key === "disabled" || field.key === "checked"}
          <Row name={field.label}><input type="checkbox" class="mt-1.5 size-3.5 accent-blue-600" checked={S.uiFlagged(n, field.key)} onclick={(e) => setFlag(field.key, e.currentTarget.checked)} /></Row>
        {:else}
          <Row name={field.label}><Input class="h-7 text-xs" value={S.uiReadText(n, field.key)} oninput={(e) => setText(field.key, e.currentTarget.value)} /></Row>
        {/if}
      {/each}
      {#if ["row", "col", "grid"].includes(widget.id)}
        <Button variant="outline" size="sm" class="self-start" data-add-region={widget.id}
          onclick={() => { const id = store.selected; if (!id) return; const col = newColumn(); store.commit(insert(store.doc, col, id, childrenOf(store.doc, id).length)); store.selected = col.id; }}>Add column</Button>
      {/if}
    </div>
  {/if}
</div>
