<script lang="ts">
  // The screens outside the page editor (U/Main.scala start), each a lazy chunk: the editor's own bundle stays lean.
  import type { Component } from "svelte";
  import type { Screen } from "./route";

  let { screen }: { screen: Exclude<Screen, "editor"> } = $props();
  const load: Record<Exclude<Screen, "editor">, () => Promise<{ default: Component }>> = {
    sites: () => import("./SitesPage.svelte"),
    "new-part": () => import("./NewPartPage.svelte"),
    customize: () => import("./Customize.svelte"),
  };
</script>

{#await load[screen]() then m}
  <m.default />
{:catch e}
  <div class="p-6 text-sm text-destructive">{`Could not open this screen: ${(e as Error).message}`}</div>
{/await}
