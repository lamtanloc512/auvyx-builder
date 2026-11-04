<script lang="ts">
  // The board's refusal, shown until the next call or Dismiss (BuilderUi.errorLine).
  import { Icon } from "../../ui/kit";
  import type { BoardError } from "../../lib/builder.svelte";
  let { error }: { error: BoardError } = $props();
</script>

{#if error.message}
  <div class="flex items-start gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive" role="alert" data-builder-error="1">
    <span class="flex-1">{error.message}</span>
    <button type="button" class="text-destructive/70 hover:text-destructive" aria-label="Dismiss" onclick={() => (error.message = null)}><Icon name="x" size={11} /></button>
  </div>
{/if}
