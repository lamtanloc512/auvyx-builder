<script lang="ts">
  // The site's data sources (U/DataSourcesDialog.scala): REST or GraphQL endpoints a loop lists, over the site's
  // auvyx/v1/data-sources (list, save, test, delete). The server asks them and keeps the answer; tokens never come back.
  import { DataSources as D } from "@auvyx/editor-core";
  import { Button, Dialog, DialogClose, DialogDescription, DialogHeader, DialogTitle, Input, Select } from "../../ui/kit";
  import { rest } from "../../lib/host";
  import { session } from "../../lib/session.svelte";
  import { toast } from "../../lib/toast.svelte";
  let { open = $bindable(false) }: { open?: boolean } = $props();

  interface Answer { items: Record<string, string>[]; sample: string; error: string }
  let editing = $state<string | null>(null);
  let name = $state(""), label = $state(""), url = $state(""), method = $state("GET"), body = $state(""), list = $state(""), ttl = $state("300"), pub = $state(false);
  let headers = $state<[string, string][]>([]);
  let fields = $state<[string, string][]>([]);
  let answer = $state<Answer | null>(null);
  let busy = $state(false);
  let error = $state("");
  const canEdit = session.canEditDataSources;

  let wasOpen = false;
  $effect(() => {
    // DataSourcesDialog.open: a fresh list, the overview
    if (open && !wasOpen) { session.refresh(); editing = null; answer = null; error = ""; }
    wasOpen = open;
  });

  function edit(spec: D.Spec | null) {
    const s = spec ?? D.spec({ name: "", url: "https://", fields: [["title", "title"]] });
    editing = spec ? spec.name : "";
    name = s.name; label = s.label; url = s.url; method = s.method; body = s.body; list = s.list; ttl = String(s.ttl); pub = s.public;
    headers = s.headers.map(([k, v]) => [k, v]);
    fields = s.fields.map(([k, v]) => [k, v]);
    answer = null;
    error = "";
  }
  const spec = (): D.Spec => ({
    name: name.trim(), label: label.trim(), url: url.trim(), method,
    headers: headers.map(([k, v]) => [k.trim(), v] as [string, string]).filter(([k]) => k !== ""),
    body: method === "POST" ? body : "", list: list.trim(),
    fields: fields.map(([k, v]) => [k.trim(), v.trim()] as [string, string]).filter(([k]) => k !== ""),
    ttl: /^-?\d+$/.test(ttl.trim()) ? Number(ttl.trim()) : 300, public: pub,
  });
  function run(path: string, saved: boolean) {
    const v = D.validate(spec());
    if ("error" in v) { error = v.error; return; }
    busy = true;
    error = "";
    rest<{ items?: Record<string, unknown>[]; sample?: string; error?: string }>(path, { method: "POST", body: JSON.stringify(D.toJson(v.ok, true)) }).then(
      ({ data }) => {
        busy = false;
        const a: Answer = { items: (data.items ?? []).map((it) => Object.fromEntries(Object.entries(it).map(([k, x]) => [k, String(x)]))), sample: data.sample ?? "", error: data.error ?? "" };
        answer = a;
        if (a.error) error = a.error;
        if (saved) { session.refresh(); editing = v.ok.name; toast(`Data source “${v.ok.label}” saved`); }
      },
      (e: Error) => { busy = false; error = e.message; },
    );
  }
  function remove(n: string) {
    rest(`auvyx/v1/data-sources/${n}?_method=DELETE`, { method: "POST", body: "{}" }).then(() => { session.refresh(); editing = null; }, (e: Error) => (error = e.message));
  }
  const keys = $derived(answer ? [...new Set(answer.items.flatMap((it) => Object.keys(it)))] : []);
</script>

{#snippet field(text: string, control: import("svelte").Snippet)}
  <div class="flex flex-col gap-1"><span class="text-xs font-medium">{text}</span>{@render control()}</div>
{/snippet}
{#snippet pairs(rows: [string, string][], set: (r: [string, string][]) => void, keyHint: string, valueHint: string, attr: string)}
  <div class="flex flex-col gap-1">
    {#each rows as [k, v], i (i)}
      <div class="grid grid-cols-[1fr_1.4fr_auto] gap-1" {...{ [`data-${attr}`]: String(i) }}>
        <Input class="h-8 text-xs" placeholder={keyHint} value={k} oninput={(e) => set(rows.map((r, j) => (j === i ? [e.currentTarget.value, r[1]] : r)))} />
        <Input class="h-8 font-mono text-xs" placeholder={valueHint} value={v} oninput={(e) => set(rows.map((r, j) => (j === i ? [r[0], e.currentTarget.value] : r)))} />
        <button class="h-8 px-2 text-xs text-muted-foreground hover:text-foreground" title="Remove" onclick={() => set(rows.filter((_, j) => j !== i))}>×</button>
      </div>
    {/each}
    <button class="self-start text-[11px] text-primary hover:underline" onclick={() => set([...rows, ["", ""]])}>+ Add</button>
  </div>
{/snippet}

<Dialog bind:open contentBoxClass="gap-4 sm:max-w-2xl">
  <DialogClose />
  <DialogHeader>
    <DialogTitle>Data sources</DialogTitle>
    <DialogDescription>REST or GraphQL endpoints the site lists in loops. The server asks them and keeps the answer; tokens never reach the browser.</DialogDescription>
  </DialogHeader>
  <div class="max-h-[70vh] overflow-y-auto pr-1" data-data-sources="">
    {#if editing !== null}
      <div class="flex flex-col gap-3" data-data-source-editor="">
        <div class="grid grid-cols-2 gap-2">
          {#snippet nameC()}<Input class="h-8 text-xs" data-ds-name="" placeholder="products" disabled={editing !== ""} bind:value={name} />{/snippet}
          {#snippet labelC()}<Input class="h-8 text-xs" placeholder="Products API" bind:value={label} />{/snippet}
          {@render field("Name", nameC)}
          {@render field("Label", labelC)}
        </div>
        <div class="grid grid-cols-[88px_1fr] gap-2">
          {#snippet methodC()}<Select size="sm" bind:value={method} options={[{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }]} />{/snippet}
          {#snippet urlC()}<Input class="h-8 font-mono text-xs" data-ds-url="" placeholder="https://api.example.com/products" bind:value={url} />{/snippet}
          {@render field("Method", methodC)}
          {@render field("Address", urlC)}
        </div>
        {#if method === "POST"}
          {#snippet bodyC()}<textarea class="min-h-20 w-full rounded-[3px] border border-input bg-transparent px-2 py-1.5 font-mono text-xs outline-none" spellcheck={false} bind:value={body}></textarea>{/snippet}
          {@render field('Body (a GraphQL query is {"query": "…", "variables": {…}})', bodyC)}
        {/if}
        {#snippet headersC()}{@render pairs(headers, (r) => (headers = r), "Authorization", "Bearer …", "ds-header")}{/snippet}
        {@render field("Headers (tokens are kept encrypted; leave a stored one empty to keep it)", headersC)}
        <div class="grid grid-cols-[1fr_96px] gap-2">
          {#snippet listC()}<Input class="h-8 font-mono text-xs" data-ds-list="" placeholder="data.items" bind:value={list} />{/snippet}
          {#snippet ttlC()}<Input class="h-8 text-xs" type="number" min="0" max="86400" bind:value={ttl} />{/snippet}
          {@render field("List path in the answer (empty: the answer itself)", listC)}
          {@render field("Keep (seconds)", ttlC)}
        </div>
        {#snippet fieldsC()}{@render pairs(fields, (r) => (fields = r), "title", "name", "ds-field")}{/snippet}
        {@render field("Fields: a name elements bind (data/name) and its path in one item", fieldsC)}
        <label class="flex items-start gap-2 text-xs">
          <input type="checkbox" class="mt-0.5" data-ds-public="" bind:checked={pub} />
          <span>Scripts may load it again (source("name") in a code element). Anyone can then read these fields at the site's data address; never the headers.</span>
        </label>
        {#if error}<p class="text-xs text-destructive" data-ds-error="">{error}</p>{/if}
        {#if answer}
          <div class="flex flex-col gap-2 rounded-[3px] border border-border bg-muted/30 p-2" data-ds-answer="">
            {#if !answer.items.length}<p class="text-xs text-muted-foreground">No items: check the list path.</p>
            {:else}
              <div class="max-h-40 overflow-auto">
                <table class="w-full text-[11px]">
                  <thead><tr>{#each keys as k (k)}<th class="px-1 text-left font-medium text-muted-foreground">{k}</th>{/each}</tr></thead>
                  <tbody>{#each answer.items as it, i (i)}<tr>{#each keys as k (k)}<td class="max-w-40 truncate px-1">{it[k] ?? "—"}</td>{/each}</tr>{/each}</tbody>
                </table>
              </div>
            {/if}
            {#if answer.sample}
              <details>
                <summary class="cursor-pointer text-[11px] text-muted-foreground">The first item as the endpoint gave it</summary>
                <pre class="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[10px]">{answer.sample}</pre>
              </details>
            {/if}
          </div>
        {/if}
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" data-ds-test="" disabled={busy} onclick={() => run("auvyx/v1/data-sources/test", false)}>Ask it</Button>
          {#if canEdit}
            <Button size="sm" data-ds-save="" disabled={busy} onclick={() => run("auvyx/v1/data-sources", true)}>{busy ? "Asking…" : "Save"}</Button>
          {:else}
            <span class="text-[11px] text-muted-foreground">Only an administrator can save data sources.</span>
          {/if}
          <span class="flex-1"></span>
          {#if editing && canEdit}
            {@const n = editing}
            <button class="text-xs text-destructive hover:underline" onclick={() => { if (confirm(`Delete the data source “${n}”? Loops that list it show nothing.`)) remove(n); }}>Delete</button>
          {/if}
          <button class="text-xs text-muted-foreground hover:text-foreground" onclick={() => (editing = null)}>Back</button>
        </div>
      </div>
    {:else}
      <div class="flex flex-col gap-2">
        {#each session.dataSourceList as s (s.name)}
          <button class="flex flex-col items-start gap-0.5 rounded-[3px] border border-border px-3 py-2 text-left hover:bg-muted/50" data-ds-item={s.name} onclick={() => edit(s)}>
            <span class="text-sm font-medium">{s.label}</span>
            <span class="font-mono text-[11px] text-muted-foreground">{s.method} {s.url}</span>
            <span class="text-[11px] text-muted-foreground">Loop: data/{s.name} · fields {s.fields.map(([k]) => "data/" + k).join(", ")}</span>
          </button>
        {/each}
        {#if !session.dataSourceList.length}<p class="text-xs text-muted-foreground">No data source yet. Add a REST or GraphQL endpoint; a Posts loop set to “Data source” lists its items, and elements inside bind its fields.</p>{/if}
        {#if canEdit}<Button variant="outline" size="sm" class="self-start" data-ds-new="" onclick={() => edit(null)}>+ New data source</Button>{/if}
      </div>
    {/if}
  </div>
</Dialog>
