<script lang="ts">
  // One field of a content type (ContentPanel.fieldEditor): label (its key follows until edited), move, remove, kind,
  // key, required, and what the kind needs (options, the linked type, row fields, bounds).
  import { Icon } from "../../ui/kit";
  import * as ContentModel from "../../../../../packages/editor-core/src/contentModel";
  import { keyFrom, panel, updateType } from "../../lib/content.svelte";
  import { INPUT, SMALL } from "./styles";

  let { typeKey, index, field: f }: { typeKey: string; index: number; field: ContentModel.Field } = $props();

  function change(g: (x: ContentModel.Field) => ContentModel.Field) {
    updateType(typeKey, (t) => ({ ...t, fields: t.fields.map((x, i) => (i === index ? g(x) : x)) }));
  }
  function move(by: number) {
    updateType(typeKey, (t) => {
      const j = index + by;
      if (j < 0 || j >= t.fields.length) return t;
      const fields = [...t.fields];
      [fields[index], fields[j]] = [fields[j]!, fields[index]!];
      return { ...t, fields };
    });
  }
  const num = (v: string) => { const t = v.trim(); return t !== "" && Number.isFinite(Number(t)) ? Number(t) : undefined; };
  const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
</script>

<div class="flex flex-col gap-1.5 rounded-lg bg-muted/40 p-2" data-content-field={String(index)}>
  <div class="flex items-center gap-1">
    <div class="min-w-0 flex-1">
      <input class={INPUT} placeholder="Label" value={f.label}
        oninput={(e) => { const l = e.currentTarget.value; change((x) => (x.key === "" || x.key === keyFrom(x.label, new Set(), 40) ? { ...x, label: l, key: keyFrom(l, new Set(), 40) } : { ...x, label: l })); }} />
    </div>
    <button type="button" class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" title="Move up" onclick={() => move(-1)}><Icon name="chevronDown" size={13} class="rotate-180" /></button>
    <button type="button" class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" title="Move down" onclick={() => move(1)}><Icon name="chevronDown" size={13} /></button>
    <button type="button" class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive" title="Remove this field"
      onclick={() => updateType(typeKey, (t) => ({ ...t, fields: t.fields.filter((_, i) => i !== index) }))}><Icon name="trash" size={13} /></button>
  </div>
  <div class="grid grid-cols-2 gap-1.5">
    <select class={INPUT} value={f.kind} onchange={(e) => { const k = e.currentTarget.value; change((x) => ({ ...x, kind: k })); }}>
      {#each ContentModel.KINDS as [k, name] (k)}<option value={k}>{name}</option>{/each}
    </select>
    <input class={INPUT} placeholder="key" value={f.key} oninput={(e) => { const k = e.currentTarget.value.trim(); change((x) => ({ ...x, key: k })); }} />
  </div>
  <label class="flex items-center gap-2 text-[11px]">
    <input type="checkbox" class="size-3.5 accent-blue-600" checked={f.required} onclick={(e) => { const c = e.currentTarget.checked; change((x) => ({ ...x, required: c })); }} />
    Required
  </label>
  {#if f.kind === "select"}
    <div class="flex flex-col gap-1">
      <textarea class={`${INPUT} h-16 py-1`} placeholder="One option per line" value={f.options.join("\n")}
        oninput={(e) => { const v = e.currentTarget.value; change((x) => ({ ...x, options: v.split("\n").map((o) => o.trim()).filter((o) => o !== "") })); }}></textarea>
      <label class="flex items-center gap-2 text-[11px]">
        <input type="checkbox" class="size-3.5 accent-blue-600" checked={f.multiple} onclick={(e) => { const c = e.currentTarget.checked; change((x) => ({ ...x, multiple: c })); }} />
        Several may be picked
      </label>
    </div>
  {:else if f.kind === "relation"}
    <div class="flex flex-col gap-1">
      <select class={INPUT} value={f.to} onchange={(e) => { const v = e.currentTarget.value; change((x) => ({ ...x, to: v })); }}>
        <option value="">Links to…</option>
        {#each panel.draft.types as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
        {#each [["post", "Posts"], ["page", "Pages"], ["product", "Products"]] as [k, n] (k)}<option value={k}>{n}</option>{/each}
      </select>
      <label class="flex items-center gap-2 text-[11px]">
        <input type="checkbox" class="size-3.5 accent-blue-600" checked={f.multiple} onclick={(e) => { const c = e.currentTarget.checked; change((x) => ({ ...x, multiple: c })); }} />
        Several entries
      </label>
    </div>
  {:else if f.kind === "repeater"}
    <div class="flex flex-col gap-1">
      <span class={SMALL}>Row fields: key:type, one per line (name:text, size:number)</span>
      <textarea class={`${INPUT} h-16 py-1`} value={f.fields.map((s) => `${s.key}:${s.kind}`).join("\n")}
        oninput={(e) => {
          const v = e.currentTarget.value;
          change((x) => ({ ...x, fields: v.split("\n").map((l) => l.trim()).filter((l) => l !== "").map((line) => {
            const at = line.indexOf(":");
            const [k, kind] = at < 0 ? [line.trim(), "text"] : [line.slice(0, at).trim(), line.slice(at + 1).trim()];
            return ContentModel.field(k, capitalize(k.replace(/_/g, " ")), kind);
          }) }));
        }}></textarea>
    </div>
  {:else if f.kind === "number" || f.kind === "money"}
    <div class="grid grid-cols-2 gap-1.5">
      <input class={INPUT} placeholder="Min" value={f.min === undefined ? "" : String(f.min)} oninput={(e) => { const v = num(e.currentTarget.value); change((x) => ({ ...x, min: v })); }} />
      <input class={INPUT} placeholder="Max" value={f.max === undefined ? "" : String(f.max)} oninput={(e) => { const v = num(e.currentTarget.value); change((x) => ({ ...x, max: v })); }} />
    </div>
  {/if}
</div>
