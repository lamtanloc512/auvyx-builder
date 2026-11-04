<script lang="ts">
  // Settings of a WordPress block (RawBlocks.settings): a component (edit it where it lives, or detach), a form, a
  // Custom HTML block, or a platform block's attributes when it can be edited here, else where to edit it.
  import { Settings as S } from "@auvyx/editor-core";
  import { Input, Select } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { library } from "../../lib/library.svelte";
  import { blockType, canScript, convertible, pickTerms, SETTINGS_NOTE, STATIC_NOTE, type BlockAttr } from "../../lib/session.svelte";
  import { convert, convertibleIds } from "../../lib/rawBlocks";
  import FormSettings from "./FormSettings.svelte";
  let { id, blockName }: { id: string; blockName: string } = $props();
  const n = $derived(store.doc.nodes[id]);
  const ref = $derived(n && blockName === "core/block" ? /"ref"\s*:\s*(\d+)/.exec(n.raw)?.[1] : undefined);
  $effect(() => { if (blockName === "core/block") library.ensure(); });
  const item = $derived(ref ? library.items.find((i) => String(i.id) === ref) : undefined);
  const attrs = $derived(n ? S.rawAttrs(n.raw) : undefined);
  const bt = $derived(blockType(blockName));
  const editable = $derived(bt && bt.attrs.length ? bt : undefined);
  const render = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const current = (a: BlockAttr) => (attrs && Object.hasOwn(attrs, a.name) ? render(attrs[a.name]) : render(a.default));
  function set(a: BlockAttr, v: unknown) {
    const now = store.doc.nodes[id];
    const d = now ? S.rawAttrs(now.raw) : undefined;
    if (!now || !d) return;
    const raw = S.withRawAttrs(now.raw, { ...d, [a.name]: v });
    if (raw && raw !== now.raw) store.updateNode(id, (x) => ({ ...x, raw }), `raw:${id}`);
  }
  let queries = $state<Record<string, string>>({});
  function shownTerms(a: BlockAttr, picked: Set<string>) {
    const words = (queries[a.name] ?? "").toLowerCase().split(/\s+/).filter((w) => w !== "");
    const hits = pickTerms(a.pick).filter((t) => picked.has(t.slug) || words.every((w) => `${t.name} ${t.slug}`.toLowerCase().includes(w)));
    return [...hits.filter((t) => picked.has(t.slug)), ...hits.filter((t) => !picked.has(t.slug))].slice(0, 60);
  }
</script>

{#snippet row(name: string, control: import("svelte").Snippet)}
  <div class="grid grid-cols-[96px_1fr] items-center gap-2"><span class="text-[11px] text-muted-foreground">{name}</span><div>{@render control()}</div></div>
{/snippet}

{#if n}
  {#if blockName === "core/block"}
    <div class="flex flex-col gap-2" data-component-settings="1">
      <p class="leading-relaxed text-muted-foreground">A shared component. Changing it changes every page that uses it, the next time the page is shown.</p>
      {#if item?.editUrl}<a class="rounded-md bg-primary px-2 py-1.5 text-center text-xs font-medium text-primary-foreground hover:bg-primary/90" data-component-edit="1" href={item.editUrl} target="_blank">Edit the component</a>{/if}
      <div class="flex flex-col gap-1.5 border-t border-border pt-3">
        <p class="text-[11px] leading-relaxed text-muted-foreground">Detach it to turn this use into ordinary elements you can change here. The component itself stays as it is.</p>
        <button class="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted" data-convert="one" onclick={() => convert([id])}>Detach from the component</button>
      </div>
    </div>
  {:else if blockName === "auvyx/form"}
    <FormSettings {id} />
  {:else if blockName === S.HTML_BLOCK}
    <!-- A Custom HTML block: its HTML, edited here. The site draws the canvas again from it. -->
    <div class="flex flex-col gap-2" data-html-block="1">
      <p class="leading-relaxed text-muted-foreground">This block's HTML, as the page shows it.</p>
      {#if !canScript}<p class="text-[11px] text-muted-foreground">Only a user who may add unfiltered HTML (an administrator) can change it.</p>{/if}
      <textarea class="min-h-64 w-full rounded-[3px] border border-input bg-transparent px-2 py-1.5 font-mono text-[11px] leading-relaxed outline-none focus:border-ring" data-html-code=""
        spellcheck={false} disabled={!canScript} value={S.htmlBlockInner(n.raw)}
        oninput={(e) => { const v = e.currentTarget.value; if (canScript) store.updateNode(id, (x) => ({ ...x, raw: S.htmlBlockMarkup(v, x.raw), html: v }), `html-${id}`); }}></textarea>
    </div>
  {:else}
    <div class="flex flex-col gap-2">
      {#if attrs && editable}
        <div class="flex flex-col gap-2" data-raw-settings={blockName}>
          {#each editable.attrs as a (a.name)}
            {#if a.kind === "boolean"}
              <label class="flex items-center gap-2 text-[11px]">
                <input type="checkbox" data-attr={a.name} checked={current(a) === "true"} onclick={(e) => set(a, e.currentTarget.checked)} />
                {S.niceName(a.name)}
              </label>
            {:else if a.pick && pickTerms(a.pick).length}
              <!-- several values from the site's list, kept comma-separated; a long list gets a search box, what is picked stays first -->
              {@const picked = new Set(current(a).split(",").map((x) => x.trim()).filter((x) => x !== ""))}
              <div class="flex flex-col gap-1" data-attr={a.name}>
                <span class="text-[11px] text-muted-foreground">{S.niceName(a.name)}</span>
                {#if pickTerms(a.pick).length > 8}<Input class="h-7 text-xs" type="search" placeholder="Find {S.niceName(a.name).toLowerCase()}" data-pick-search={a.name} oninput={(e) => (queries[a.name] = e.currentTarget.value)} />{/if}
                {#each shownTerms(a, picked) as t (t.slug)}
                  <label class="flex items-center gap-2 text-[11px]">
                    <input type="checkbox" data-pick={t.slug} checked={picked.has(t.slug)} onclick={(e) => { const on = e.currentTarget.checked; const now = [...picked]; set(a, (on ? [...new Set([...now, t.slug])] : now.filter((x) => x !== t.slug)).join(",")); }} />
                    {t.name}
                  </label>
                {/each}
              </div>
            {:else if a.options.length}
              {#snippet sel()}<Select size="sm" value={current(a)} options={a.options.map((o) => ({ value: o, label: o }))} onValue={(v: string) => set(a, v)} data-attr={a.name} />{/snippet}
              {@render row(S.niceName(a.name), sel)}
            {:else}
              {#snippet inp()}
                <!-- render on commit (Enter / blur), not on every key -->
                <Input class="h-7 text-xs" data-attr={a.name} type={a.kind === "string" ? "text" : "number"} value={current(a)}
                  onchange={(e) => { const v = e.currentTarget.value; if (a.kind === "string") set(a, v); else { const d = Number(v); if (v.trim() !== "" && Number.isFinite(d)) set(a, a.kind === "integer" ? Math.trunc(d) : d); } }} />
              {/snippet}
              {@render row(S.niceName(a.name), inp)}
            {/if}
          {/each}
        </div>
      {:else}
        <p class="leading-relaxed text-muted-foreground">{STATIC_NOTE}</p>
      {/if}
      {#if convertible.has(blockName)}
        <div class="flex flex-col gap-1.5 border-t border-border pt-3">
          <p class="text-[11px] leading-relaxed text-muted-foreground">Turn it into Auvyx elements to edit it here: text, styles, layout. Its look carries over.</p>
          <button class="rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90" data-convert="one" onclick={() => convert([id])}>Convert to Auvyx elements</button>
          <button class="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted" data-convert="all" onclick={() => convert(convertibleIds())}>Convert all such blocks on this page</button>
        </div>
      {:else}
        <p class="text-[11px] leading-relaxed text-muted-foreground">{SETTINGS_NOTE}</p>
      {/if}
    </div>
  {/if}
{/if}
