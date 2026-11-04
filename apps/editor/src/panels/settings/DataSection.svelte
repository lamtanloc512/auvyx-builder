<script lang="ts">
  // SettingsPanel.dataSection: each bindable attribute shows static content or a WordPress field (DataFields). In a
  // Posts loop, fields read each post; elsewhere, this page.
  import { Settings as S, type Kind } from "@auvyx/editor-core";
  import { Input, Select, type SelectItem } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { proLocked, session } from "../../lib/session.svelte";
  import type { Update } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  let { id, kind, update }: { id: string; kind: Kind; update: Update } = $props();
  const attrs = $derived(S.bindableAttrs(kind));
  const n = $derived(store.doc.nodes[id]);
  $effect(() => { if (attrs.length) session.ensure(); });
  const M = S.META_PREFIX;
  function options(shape: S.Shape): SelectItem[] {
    const known = [...S.DATA_FIELDS, ...session.extraFields];
    const fs = S.dataOptions(shape, session.extraFields);
    const groups = [...new Set(fs.map((f) => f.group))].sort((a, b) => known.findIndex((f) => f.group === a) - known.findIndex((f) => f.group === b));
    return [{ value: "", label: "Static" }, ...groups.flatMap((g) => fs.filter((f) => f.group === g).map((f) => ({ value: f.key, label: f.label, group: g }))), { value: M, label: "Custom field…", group: "Other" }];
  }
  function pick(attr: string, v: string) {
    // Auvyx Builder Pro's fields (`pro/…`) are listed while it is installed; binding one needs its licence.
    if (v.startsWith("pro/") && proLocked) { session.ask("pro-data"); return; }
    update(`bind-${attr}`, (x) => {
      const bind = { ...x.bind };
      if (v === "") delete bind[attr];
      else bind[attr] = v === M ? (x.bind[attr]?.startsWith(v) ? x.bind[attr]! : v) : v;
      // A bound link needs an element to carry it (button href, image link).
      const href = v !== "" && ((attr === "url" && kind === "Button") || attr === "href") && x.href === "" ? "#" : x.href;
      return { ...x, bind, href };
    });
  }
</script>

{#if n && attrs.length}
  <div class="mt-2 flex flex-col gap-2 border-t border-border pt-3" data-data-section="">
    <div class="text-[11px] font-medium">Data</div>
    {#each attrs as [attr, name, shape] (attr)}
      {@const key = n.bind[attr] ?? ""}
      {@const choice = key.startsWith(M) ? M : key}
      <div class="flex flex-col gap-1">
        <Row {name}><Select size="sm" value={choice} options={options(shape)} onValue={(v: string) => pick(attr, v)} data-bind={attr} /></Row>
        {#if choice === M}
          <Row name="Key"><Input class="h-7 text-xs" placeholder="custom field name" value={key.slice(M.length)} oninput={(e) => { const v = e.currentTarget.value; update(`bind-${attr}`, (x) => ({ ...x, bind: { ...x.bind, [attr]: M + v.trim() } })); }} /></Row>
        {/if}
      </div>
    {/each}
    <p class="text-[11px] leading-relaxed text-muted-foreground">In a Posts loop, fields read each post; elsewhere, this page.</p>
  </div>
{/if}
