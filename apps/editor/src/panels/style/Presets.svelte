<script lang="ts">
  // Presets (U/QuickSettings.scala): Flatsome-style one-click choices for the element, shown when it has any.
  import { ProductCards, Settings as S, applyPreset, presetActive, presetGroups, update, type PresetChoice } from "@auvyx/editor-core";
  import { config } from "../../lib/config";
  import { store, SCREENS } from "../../lib/store.svelte";
  import { bps } from "./state.svelte";
  import Section from "./Section.svelte";
  import { Button, Select } from "../../ui/kit";
  import { browseProductKits, cardStyles, hasProductOptions, paginationOf, productDisplay, setCardStyle, setPagination } from "../../lib/products.svelte";
  const part = config.isPart ? config.partArea : undefined;
  const devices = SCREENS.map((s) => s.id);
  const groups = $derived(store.node ? presetGroups(store.node, store.doc.roots.includes(store.node.id), part) : []);
  // QuickSettings.available: the element has presets, or product options
  const shown = $derived(groups.length > 0 || (!!store.node && hasProductOptions(store.node)));
  const cardItems = [{ value: "", label: "Custom" }, ...cardStyles.map((s) => ({ value: s.key, label: s.name }))];
  const pageItems = [{ value: "off", label: "None" }, ...S.PAGINATION.map(([value, label]) => ({ value, label }))];
  function pick(id: string, c: PresetChoice) {
    const bp = store.breakpoint, st = store.styleState;
    // Applies to every selected element (one commit).
    const ids = store.selected === id ? store.selection : [id];
    store.commit(ids.reduce((d, i) => update(d, i, (n) => applyPreset(n, devices, bp, st, c)), store.doc));
  }
</script>

<div style:display={shown ? "block" : "none"}>
  <Section title="Presets" props={[]}>
    <div class="flex flex-col gap-2.5">
      {#if store.node && shown}
        {@const n = store.node}
        <div class="flex flex-col gap-2.5">
          {#if n.kind === "Loop" || n.kind === "Section"}
            <!-- QuickSettings.productOptions: card style and pagination of a product loop; the Product display presets -->
            <div class="flex flex-col gap-2" data-product-presets="1">
              {#if ProductCards.isProductLoop(n)}
                <div class="flex flex-col gap-2">
                  {#if cardStyles.length}
                    <div>
                      <span class="text-[11px] text-muted-foreground">Card style</span>
                      <Select size="sm" value={ProductCards.loopCardStyle(store.doc, n)} options={cardItems} onValue={(key: string) => void setCardStyle(n.id, key)} data-product-card-style="1" />
                    </div>
                  {/if}
                  <div>
                    <span class="text-[11px] text-muted-foreground">Pagination</span>
                    <Select size="sm" value={paginationOf(n.query)} options={pageItems} onValue={(key: string) => setPagination(n.id, key)} data-product-pagination="1" />
                  </div>
                </div>
              {/if}
              {#if productDisplay.length}
                <Button variant="secondary" size="sm" class="w-full text-[11px]" data-product-display-browse="1" onclick={browseProductKits}>Browse product display presets</Button>
              {/if}
            </div>
          {/if}
          {#each groups as g (g.title)}
            <div class="flex flex-col gap-1">
              <span class="text-[11px] text-muted-foreground">{g.title}</span>
              <!-- Many choices sit in rows of three, so no label runs into the next. -->
              <div class={g.choices.length > 5 ? "grid grid-cols-3 gap-0.5 rounded-md bg-muted/70 p-0.5" : "flex flex-wrap gap-0.5 rounded-md bg-muted/70 p-0.5"}>
                {#each g.choices as c (c.name)}
                  <button class={["min-h-6 min-w-8 flex-1 rounded-sm px-1.5 py-1 text-[11px] leading-tight text-balance break-words text-muted-foreground hover:text-foreground", presetActive(n, bps(), devices, store.breakpoint, store.styleState, c) && "bg-background text-foreground shadow-sm"]}
                    data-preset={`${g.title}:${c.name}`} onclick={() => pick(n.id, c)}>{c.name}</button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </Section>
</div>
