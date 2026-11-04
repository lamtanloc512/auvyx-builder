<script lang="ts">
  // Display Conditions of a header or footer template, as in Elementor's Theme Builder (U/ConditionsDialog.scala,
  // docs/theme-builder.md): rows of Include / Exclude and a rule. Asked at the first Publish (a template with none shows
  // nowhere), and from the top bar's "Display Conditions" or the Theme Builder's "Edit Conditions" (`?auvyx-conditions=1`).
  import { Button, Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Select, selectItems, type SelectItem } from "../../ui/kit";
  import { conditionOptions, conditions, newCondition, type PartCondition } from "../../lib/conditions.svelte";
  import { proLocked, proShown } from "../style/state.svelte";
  import { toast } from "../../lib/toast.svelte";

  const word = $derived(conditions.word);
  const opts = conditionOptions;
  // Auvyx Builder Pro's rules are offered only while it is installed (docs/editions.md).
  const ruleItems = $derived<SelectItem[]>(opts.rules.filter((r) => !r.pro || proShown).map((r) => ({ value: r.value, label: r.pro && proLocked ? `${r.label} · PRO` : r.label })));

  function pickRule(i: number, v: string) {
    if (opts.rules.some((r) => r.value === v && r.pro) && proLocked) { askPro(); return; }
    conditions.update(i, (c) => ({ ...c, rule: v }));
  }
  // ProLock.ask("display-rules"): Pro is installed, its licence is not active
  const askPro = () => toast("Activate Auvyx Builder Pro's licence to use this rule.");
  const name = (id: string) => opts.pages.find(([v]) => v === id)?.[1] ?? `#${id}`;
  const toggle = (list: string[], v: string, on: boolean) => (on ? [...new Set([...list, v])] : list.filter((x) => x !== v));
</script>

{#snippet pagesField(i: number, r: PartCondition)}
  <div class="flex flex-col gap-1.5 pl-1">
    <div class="flex flex-wrap items-center gap-1">
      {#each r.ids as id (id)}
        <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">{name(id)}<button type="button" class="text-muted-foreground hover:text-foreground" aria-label="Remove {name(id)}"
          onclick={() => conditions.update(i, (c) => ({ ...c, ids: c.ids.filter((x) => x !== id) }))}>×</button></span>
      {/each}
      <button type="button" class="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground" data-cond-pick={String(i)}
        onclick={() => { conditions.query = ""; conditions.picking = conditions.picking === i ? null : i; }}>{r.ids.length ? "+ Add" : "Choose pages…"}</button>
    </div>
    {#if conditions.picking === i}
      {@const q = conditions.query}
      {@const chosen = conditions.rows[i]?.ids ?? []}
      <div class="flex flex-col gap-1 rounded-md border border-border p-2">
        <input class="h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring" placeholder="Find a page…" bind:value={conditions.query} />
        <div class="flex max-h-36 flex-col overflow-y-auto">
          {#each opts.pages.filter(([, t]) => !q || t.toLowerCase().includes(q.toLowerCase())).slice(0, 80) as [id, t] (id)}
            <label class="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted" data-cond-page={t}>
              <input type="checkbox" checked={chosen.includes(id)} onchange={(e) => { const on = e.currentTarget.checked; conditions.update(i, (c) => ({ ...c, ids: toggle(c.ids, id, on) })); }} />
              {t}
            </label>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet kindsField(i: number, r: PartCondition)}
  <div class="flex flex-wrap gap-x-4 gap-y-1 pl-1">
    {#each opts.postTypes as [v, t] (v)}
      <label class="flex items-center gap-1.5 text-xs">
        <input type="checkbox" checked={r.postTypes.includes(v)} onchange={(e) => { const on = e.currentTarget.checked; conditions.update(i, (c) => ({ ...c, postTypes: toggle(c.postTypes, v, on) })); }} />
        {t}
      </label>
    {/each}
  </div>
{/snippet}

<Dialog bind:open={conditions.open} contentBoxClass="gap-4 sm:max-w-xl!">
  <DialogClose />
  <DialogHeader>
    <DialogTitle>Where do you want to show your {word}?</DialogTitle>
    <DialogDescription>Set where this {word} is used on your site. Entire Site shows it everywhere; add Exclude to leave pages out. Where none of your {word}s is set, the theme’s own shows.</DialogDescription>
  </DialogHeader>
  <div class="flex flex-col gap-2" data-conditions="1">
    {#each conditions.rows as r, i (i)}
      <div class="flex flex-col gap-2 rounded-lg border border-border bg-background p-2.5" data-cond-row={String(i)}>
        <div class="flex items-center gap-2">
          <div class="w-28 shrink-0">
            <Select value={r.include ? "include" : "exclude"} options={selectItems([["include", "Include"], ["exclude", "Exclude"]])} size="md" data-cond-type={String(i)}
              onValue={(v) => conditions.update(i, (c) => ({ ...c, include: v === "include" }))} />
          </div>
          <div class="min-w-0 flex-1">
            <Select value={r.rule} options={ruleItems} size="md" data-cond-rule={String(i)} onValue={(v) => pickRule(i, v)} />
          </div>
          <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Remove this condition" aria-label="Remove this condition"
            onclick={() => { conditions.picking = null; conditions.rows = conditions.rows.filter((_, j) => j !== i); }}>×</button>
        </div>
        {#if r.rule === "ids"}{@render pagesField(i, r)}{:else if r.rule === "singular"}{@render kindsField(i, r)}{/if}
      </div>
    {/each}
    {#if !conditions.rows.length}
      <p class="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">No conditions: this {word} shows nowhere.</p>
    {/if}
    <button type="button" class="self-start rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted" data-cond-add="1"
      onclick={() => (conditions.rows = [...conditions.rows, newCondition()])}>+ Add Condition</button>
    {#if conditions.current?.conflicts.length}
      <p class="rounded-md bg-amber-50 p-2 text-xs text-amber-900" data-cond-conflict="1">Also set for the same pages: {conditions.current.conflicts.join(", ")}. The newest one shows; a more specific condition (a page over Entire Site) always wins.</p>
    {/if}
    {#if conditions.error}<p class="text-xs text-destructive">{conditions.error}</p>{/if}
  </div>
  <DialogFooter>
    <Button size="sm" data-cond-save="1" disabled={conditions.saving} onclick={() => conditions.save()}>{conditions.saving ? "Saving…" : "Save & Close"}</Button>
  </DialogFooter>
</Dialog>
