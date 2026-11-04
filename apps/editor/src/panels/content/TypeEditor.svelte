<script lang="ts">
  // One content type opened (ContentPanel.typeEditor): its settings, its fields, its entries, and removing it.
  import { Icon } from "../../ui/kit";
  import * as ContentModel from "../../../../../packages/editor-core/src/contentModel";
  import { keyFrom, loadEntries, panel, updateType } from "../../lib/content.svelte";
  import FieldEditor from "./FieldEditor.svelte";
  import { INPUT, SMALL } from "./styles";

  let { typeKey }: { typeKey: string } = $props();

  const ct = $derived(ContentModel.typeOf(panel.draft, typeKey));
  const isNew = $derived(!panel.saved || !ContentModel.typeOf(panel.saved, typeKey));
  const has = $derived(!!ct);

  // entries load when the type's editor appears (its onMountCallback)
  $effect(() => { if (has) loadEntries(typeKey); });
</script>

{#snippet row(name: string, control: import("svelte").Snippet)}
  <div class="grid grid-cols-[72px_1fr] items-center gap-2"><span class={SMALL}>{name}</span>{@render control()}</div>
{/snippet}

<div class="flex flex-col gap-3 p-3" data-content-type={typeKey}>
  <button type="button" class="flex items-center gap-1 self-start text-[11px] text-muted-foreground hover:text-foreground" onclick={() => (panel.open = null)}>
    <Icon name="chevronLeft" size={12} />All types
  </button>
  {#if ct}
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1.5">
        {#snippet nameInput()}<input class={INPUT} placeholder="Properties" value={ct.label} oninput={(e) => { const v = e.currentTarget.value; updateType(typeKey, (t) => ({ ...t, label: v })); }} />{/snippet}
        {#snippet oneInput()}<input class={INPUT} placeholder="Property" value={ct.singular} oninput={(e) => { const v = e.currentTarget.value; updateType(typeKey, (t) => ({ ...t, singular: v })); }} />{/snippet}
        {#snippet slugInput()}<input class={INPUT} placeholder="properties" value={ct.slug} oninput={(e) => { const v = e.currentTarget.value.trim(); updateType(typeKey, (t) => ({ ...t, slug: v })); }} />{/snippet}
        {#snippet keyInput()}
          <input class={INPUT} placeholder="property" defaultValue={typeKey}
            onchange={(e) => {
              const k = e.currentTarget.value.trim();
              if (k !== "" && k !== typeKey) {
                panel.draft = { ...panel.draft, types: panel.draft.types.map((x) => (x.key === typeKey ? { ...x, key: k } : x)) };
                panel.open = k;
              }
            }} />
        {/snippet}
        {@render row("Name", nameInput)}
        {@render row("One", oneInput)}
        {@render row("Address", slugInput)}
        {#if isNew}{@render row("Key", keyInput)}{/if}
        <label class="flex items-center gap-2 text-[11px]">
          <input type="checkbox" class="size-3.5 accent-blue-600" checked={ct.archive} onclick={(e) => { const c = e.currentTarget.checked; updateType(typeKey, (t) => ({ ...t, archive: c })); }} />
          A page that lists them all
        </label>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium">Fields</span>
        <button type="button" class="text-[11px] text-blue-600 hover:underline" data-content-add-field="1"
          onclick={() => updateType(typeKey, (x) => ({ ...x, fields: [...x.fields, ContentModel.field(keyFrom("New field", new Set(x.fields.map((f) => f.key)), 40), "New field")] }))}>+ Add field</button>
      </div>
      <div class="flex flex-col gap-1.5">
        {#each ct.fields as f, i (i)}<FieldEditor {typeKey} index={i} field={f} />{/each}
      </div>
      <div class="flex items-center justify-between pt-1">
        <span class="text-xs font-medium">Entries</span>
        {#if isNew}<span class={SMALL}>Save first</span>{/if}
      </div>
      <div class="flex flex-col gap-1">
        {#if !panel.entries.length}
          <p class={SMALL}>None yet. Entries are added in the site's admin, by a site template or by the agent.</p>
        {:else}
          {#each panel.entries as e (e.id)}
            <a class="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted" href={e.editUrl} target="_blank">
              <span class="truncate" translate="no">{e.title}</span><span class={SMALL}>{e.status}</span>
            </a>
          {/each}
        {/if}
      </div>
      <button type="button" class="self-start text-[11px] text-destructive hover:underline"
        onclick={() => { panel.draft = { ...panel.draft, types: panel.draft.types.filter((t) => t.key !== typeKey) }; panel.open = null; }}>Remove this type (its entries are kept)</button>
    </div>
  {/if}
</div>
