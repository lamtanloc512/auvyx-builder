<script lang="ts">
  // SettingsPanel.interactionRows: the ready hover, focus and press feedback (InteractionRecipes): a recipe and how much
  // it moves. Per-state styles in the Style tab still win over them.
  import { Settings as S, type Kind } from "@auvyx/editor-core";
  import { Select } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import type { Update } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  let { id, kind, update }: { id: string; kind: Kind; update: Update } = $props();
  const choice = $derived(S.readRecipe(store.doc.nodes[id]?.className ?? ""));
  const auto = $derived(S.RECIPES.find((r) => r.id === S.automaticRecipe(kind))?.label ?? "");
  const options = $derived(S.recipesFor(kind).flatMap((rid) => S.RECIPES.filter((r) => r.id === rid)).map((r) => ({ value: r.id, label: r.id === "auto" ? `Automatic (${auto})` : r.label })));
  const set = (key: string, f: (c: { recipe: string; variant: string }) => { recipe: string; variant: string }) =>
    update(key, (n) => ({ ...n, className: S.writeRecipe(n.className, f(S.readRecipe(n.className))) }));
  const off = $derived(choice.recipe === "none" || (choice.recipe === "auto" && S.automaticRecipe(kind) === "none"));
</script>

<div class="flex flex-col gap-2" data-interaction-recipe="">
  <Row name="Interaction"><Select size="sm" value={choice.recipe} {options} onValue={(v: string) => set("interaction", (c) => ({ ...c, recipe: v }))} /></Row>
  {#if !off}
    <Row name="Motion"><Select size="sm" value={choice.variant} options={S.RECIPE_VARIANTS.map((v) => ({ value: v.id, label: v.label }))} onValue={(v: string) => set("interaction-variant", (c) => ({ ...c, variant: v }))} /></Row>
  {/if}
</div>
