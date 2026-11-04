<script lang="ts">
  // The body of an accordion (U/Collapse.scala): opens and closes by animating its height (grid rows 0fr ↔ 1fr), so no
  // height is measured. Closed content is hidden from tabbing and screen readers once the close finishes.
  import type { Snippet } from "svelte";
  let { open, body, children }: { open: boolean; body: string; children: Snippet } = $props();
</script>

<div class="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none {open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}">
  <div class="min-h-0 overflow-hidden transition-[visibility,opacity] duration-200 motion-reduce:transition-none {open ? 'visible opacity-100' : 'invisible opacity-0'}" aria-hidden={!open}>
    <div class={body}>{@render children()}</div>
  </div>
</div>
