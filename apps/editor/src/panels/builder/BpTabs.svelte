<script lang="ts">
  // Desktop / Tablet / Mobile, synced with the canvas screen (BuilderUi.tabs).
  import { Icon } from "../../ui/kit";
  import { BPS, bpLabel, bpOf, screenOf } from "../../lib/builder.svelte";
  import { store } from "../../lib/store.svelte";
  let { attr }: { attr: string } = $props();
  const bp = $derived(bpOf(store.breakpoint));
  const icon = { desktop: "monitor", tablet: "tablet", mobile: "phone" } as const;
</script>

<div class="flex gap-0.5 rounded-md bg-muted/70 p-0.5" {...{ [`data-${attr}`]: "bp" }} role="tablist">
  {#each BPS as b (b)}
    <button
      type="button"
      role="tab"
      class={["flex h-7 flex-1 items-center justify-center gap-1 rounded-sm text-[11px] text-muted-foreground hover:text-foreground", bp === b && "bg-background text-foreground shadow-sm"]}
      aria-selected={bp === b}
      data-value={b}
      onclick={() => (store.breakpoint = screenOf(b))}
    ><Icon name={icon[b]} size={12} />{bpLabel(b)}</button>
  {/each}
</div>
