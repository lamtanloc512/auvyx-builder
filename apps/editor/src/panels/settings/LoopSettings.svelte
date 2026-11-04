<script lang="ts">
  // Posts loop (SettingsPanel.loopSettings): which posts, how many, in what order; hand-picked items; the card's parts.
  import { DataSources, Settings as S, type El } from "@auvyx/editor-core";
  import { Input, Select } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { contentTypes, hasContent, session } from "../../lib/session.svelte";
  import type { Update } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  import PickItems from "./PickItems.svelte";
  import CardOptions from "./CardOptions.svelte";
  import DataSourcesDialog from "./DataSourcesDialog.svelte";
  let { id, update }: { id: string; update: Update } = $props();
  session.ensure();
  const n = $derived(store.doc.nodes[id]);
  const q = (key: string) => (n ? S.queryValue(n.query, key) : "");
  const norm = (x: El, patch: Record<string, string>) => ({ ...x, query: Object.fromEntries(S.normalizeQuery({ ...x.query, ...patch })) });
  const set = (key: string) => (v: string) => update(`query-${key}`, (x) => norm(x, { [key]: v }));
  const baseTypes: [string, string][] = contentTypes.length ? contentTypes.map((t) => [t.slug, t.label]) : [["post", "Posts"], ["page", "Pages"]];
  // A data source (REST, GraphQL) is listed like a kind of content: "Data" lists one of them.
  const types = $derived(session.dataSources ? [...baseTypes, ["data", "Data source"] as [string, string]] : baseTypes);
  const items = (p: [string, string][]) => p.map(([value, label]) => ({ value, label }));
  const isData = $derived(q("postType") === "data");
  const lists = $derived(session.sources.filter((s) => s.contentType === q("postType")));
  const taxes = $derived(contentTypes.find((t) => t.slug === q("postType"))?.taxonomies ?? []);
  const taxonomy = $derived(taxes.find((t) => t.slug === q("taxonomy") && t.terms.length));
  let dialogOpen = $state(false);
</script>

{#snippet check(key: string, text: string)}
  <label class="flex items-center gap-2 text-[11px]">
    <input type="checkbox" checked={q(key) === "true"} onclick={(e) => set(key)(String(e.currentTarget.checked))} />
    {text}
  </label>
{/snippet}

{#if n}
  <div class="flex flex-col gap-2" data-loop-settings="">
    <Row name="Show">
      <Select size="sm" value={q("postType")} options={items(types)} onValue={(v: string) => update("query-postType", (x) => {
        // Data: the first source at once, so the loop shows something; anything else starts from its query.
        const first = v === "data" && session.dataSourceList[0] ? DataSources.sourceKey(session.dataSourceList[0].name) : "";
        return norm(x, { postType: v, source: first });
      })} />
    </Row>
    {#if isData}
      <div class="flex flex-col gap-1">
        {#if !lists.length}<p class="text-[11px] text-muted-foreground">No data source yet.</p>
        {:else}<Row name="Source"><Select size="sm" value={q("source")} options={lists.map((s) => ({ value: s.key, label: s.label }))} onValue={set("source")} /></Row>{/if}
        <button class="self-start rounded-[3px] px-1.5 py-0.5 text-[11px] text-primary hover:bg-muted" data-data-sources-open="" onclick={() => (dialogOpen = true)}>Data sources…</button>
      </div>
    {:else if lists.length}
      <Row name="List"><Select size="sm" value={q("source")} options={[{ value: "", label: "By query" }, ...lists.map((s) => ({ value: s.key, label: s.label }))]} onValue={set("source")} /></Row>
    {/if}
    <Row name="Count"><Input class="h-7 text-xs" type="number" min="1" max="50" value={q("perPage")} oninput={(e) => set("perPage")(e.currentTarget.value)} /></Row>
    <div style:display={isData ? "none" : ""}><Row name="Order by"><Select size="sm" value={q("orderBy")} options={items(S.ORDER_BY)} onValue={set("orderBy")} /></Row></div>
    <div style:display={isData ? "none" : ""}><Row name="Order"><Select size="sm" value={q("order")} options={[{ value: "desc", label: "Newest / Z → A" }, { value: "asc", label: "Oldest / A → Z" }]} onValue={set("order")} /></Row></div>
    <Row name="Skip"><Input class="h-7 text-xs" type="number" min="0" max="100" value={q("offset")} oninput={(e) => set("offset")(e.currentTarget.value)} /></Row>
    {#if taxes.length}
      <Row name="Filter"><Select size="sm" value={q("taxonomy")} options={[{ value: "", label: "All" }, ...taxes.map((t) => ({ value: t.slug, label: t.label }))]} onValue={(v: string) => update("query-taxonomy", (x) => norm(x, { taxonomy: v, terms: "" }))} /></Row>
    {/if}
    {#if taxonomy}
      <div class="ml-[68px] flex max-h-40 flex-col gap-1 overflow-y-auto" data-loop-terms="">
        {#each taxonomy.terms as term (term.slug)}
          <label class="flex items-center gap-2 text-[11px]">
            <input type="checkbox" checked={q("terms").split(",").includes(term.slug)} onclick={(e) => { const c = e.currentTarget.checked; update("query-terms", (x) => {
              const now = S.queryValue(x.query, "terms").split(",").filter((t) => t !== "");
              const next = c ? [...new Set([...now, term.slug])] : now.filter((t) => t !== term.slug);
              return norm(x, { terms: next.join(",") });
            }); }} />
            {term.name}
          </label>
        {/each}
      </div>
    {/if}
    <div style:display={isData ? "none" : ""}>
      <div class="flex flex-col gap-2">
        {@render check("paginate", "Enable pagination")}
        {#if q("paginate") === "true"}<Row name="Pages"><Select size="sm" value={q("more")} options={items(S.PAGINATION)} onValue={set("more")} /></Row>{/if}
        {@render check("excludeCurrent", "Leave out the current post")}
        {@render check("inherit", "Use the page's posts on archives and blog pages")}
        {#if hasContent}<PickItems {id} {update} />{:else}<div></div>{/if}
      </div>
    </div>
    <CardOptions {id} {update} />
    <p class="text-[11px] leading-relaxed text-muted-foreground">The first item is the template: edit it, the rest follow.</p>
  </div>
  <DataSourcesDialog bind:open={dialogOpen} />
{/if}
