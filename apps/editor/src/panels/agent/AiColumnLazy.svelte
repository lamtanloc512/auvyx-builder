<script lang="ts">
  // The AI column, loaded the first time it opens (the agent and its runtime are not part of the editor's first load);
  // then it stays mounted and folds with store.aiOpen.
  import type { Component } from "svelte";
  import { store } from "../../lib/store.svelte";

  let Column = $state<Component | null>(null);
  let loading = false;
  $effect(() => {
    if (store.aiOpen && !Column && !loading) {
      loading = true;
      void import("./AiColumn.svelte").then((m) => (Column = m.default));
    }
  });
</script>

{#if Column}<Column />{/if}
