<script lang="ts">
  // SettingsPanel.pickItems: hand-picked items (Flatsome's searchable "ids"): tick posts or products by title; they show
  // in the picked order and replace the query.
  import { Settings as S } from "@auvyx/editor-core";
  import { Input } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { rest } from "../../lib/host";
  import { previewItem } from "../../lib/session.svelte";
  import type { Update } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  let { id, update }: { id: string; update: Update } = $props();
  let open = $state(false);
  let search = $state("");
  let items = $state.raw<[string, string][]>([]);
  const n = $derived(store.doc.nodes[id]);
  const ids = $derived(n ? S.queryValue(n.query, "include").split(",").filter((x) => x !== "") : []);
  function write(v: string[]) {
    update("query-include", (x) => ({ ...x, query: Object.fromEntries(S.normalizeQuery({ ...x.query, include: v.join(","), source: v.length ? "" : S.queryValue(x.query, "source") })) }));
  }
  /** WpContent.query: auvyx/v1/data/posts with the loop's query (and the edited post as `current`). */
  function load(postType: string) {
    const params: [string, string][] = [...S.normalizeQuery({ postType, perPage: "50", orderBy: "title", order: "asc" }), ...(previewItem ? [["current", previewItem] as [string, string]] : [])];
    const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    rest<{ items?: Record<string, string>[] }>(`auvyx/v1/data/posts?${qs}`).then(
      (r) => { items = (r.data.items ?? []).flatMap((row) => (row._id ? [[row._id, row.post_title ?? `#${row._id}`] as [string, string]] : [])); },
      () => { items = []; },
    );
  }
  const shown = $derived(items.filter(([, t]) => search === "" || t.toLowerCase().includes(search.toLowerCase())));
</script>

<div data-loop-pick="1">
  <Row name="Items">
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center gap-2 text-[11px]">
        <button type="button" class="h-7 rounded-md border border-input px-2 hover:bg-muted" data-loop-pick-toggle="1"
          onclick={() => { if (!open && n) load(S.queryValue(n.query, "postType")); open = !open; }}>{open ? "Done" : "Choose…"}</button>
        {ids.length === 0 ? "By query" : `${ids.length} picked`}
        {#if ids.length}<button type="button" class="text-muted-foreground underline hover:text-foreground" onclick={() => write([])}>Clear</button>{/if}
      </div>
      {#if open}
        <div class="flex flex-col gap-1">
          <Input class="h-7 text-xs" placeholder="Search by title" bind:value={search} />
          <div class="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {#each shown as [pid, title] (pid)}
              <label class="flex items-center gap-2 text-[11px]" data-loop-pick-item={pid}>
                <input type="checkbox" checked={ids.includes(pid)} onclick={(e) => { const on = e.currentTarget.checked; write(on ? [...ids, pid] : ids.filter((x) => x !== pid)); }} />
                <span class="truncate">{title}</span>
                {#if ids.includes(pid)}<span class="ml-auto text-muted-foreground tabular-nums">{ids.indexOf(pid) + 1}</span>{/if}
              </label>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </Row>
</div>
