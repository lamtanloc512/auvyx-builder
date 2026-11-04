<script lang="ts">
  // A card like Subframe's (StylePanel.section): the title, a dot when something is set here, actions on the right,
  // the controls always shown. A section that starts closed (rarely used) keeps a chevron and opens with a height animation.
  import type { Snippet } from "svelte";
  import { Icon } from "../../ui/kit";
  import { hasAny } from "./state.svelte";
  let { title, props, open = true, actions, children }: { title: string; props: readonly string[]; open?: boolean; actions?: Snippet; children: Snippet } = $props();
  const startsOpen = (() => open)();
  let shown = $state(startsOpen);
</script>

<div class="auvyx-card" data-style-section={title}>
  <div class="flex h-10 items-center gap-1.5 px-3.5">
    {#if !startsOpen}
      <button type="button" class="text-muted-foreground" onclick={() => (shown = !shown)}><Icon name="chevronRight" size={12} class={shown ? "rotate-90" : ""} /></button>
    {/if}
    <span class="flex-1 text-xs font-medium">{title}</span>
    <span class="size-1.5 rounded-full bg-blue-500" style:display={hasAny(props) ? "block" : "none"}></span>
    {@render actions?.()}
  </div>
  {#if startsOpen}
    <div class="flex flex-col gap-2.5 px-3 pb-3">{@render children()}</div>
  {:else}
    <div class={["grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", shown ? "grid-rows-[1fr]" : "grid-rows-[0fr]"]}>
      <div class={["min-h-0 overflow-hidden transition-[visibility,opacity] duration-200 motion-reduce:transition-none", shown ? "visible opacity-100" : "invisible opacity-0"]} aria-hidden={!shown}>
        <div class="flex flex-col gap-2.5 px-3 pb-3">{@render children()}</div>
      </div>
    </div>
  {/if}
</div>
