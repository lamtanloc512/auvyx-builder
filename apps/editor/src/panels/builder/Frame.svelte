<script lang="ts">
  // The board's card (BuilderUi.frame): a header that folds it, the board below; open or folded is kept while the
  // selection moves inside the header or footer.
  import type { Snippet } from "svelte";
  import { Icon } from "../../ui/kit";
  import { builder } from "../../lib/builder.svelte";
  let { name, attr, children }: { name: string; attr: string; children: Snippet } = $props();
</script>

<div class="auvyx-card" {...{ [`data-${attr}`]: "1" }}>
  <button type="button" class="flex h-10 w-full items-center gap-1.5 px-3.5 text-left text-xs font-medium" aria-expanded={builder.open} onclick={() => (builder.open = !builder.open)}>
    <Icon name="chevronRight" size={12} class={builder.open ? "text-muted-foreground rotate-90" : "text-muted-foreground"} />
    <span class="flex-1">{name}</span>
  </button>
  <div class="flex flex-col gap-3 px-3 pb-3 text-xs" style:display={builder.open ? "flex" : "none"}>
    {@render children()}
  </div>
</div>
