<script lang="ts">
  // The spacing controls without their card (StylePanel.spacingControls, ElementPanel's Advanced tab): the scale
  // rows, then the margin and padding box. `card` wraps them in the Style panel's Spacing card instead.
  import { KINDS } from "@auvyx/editor-core";
  import { store } from "../../lib/store.svelte";
  import SpaceScale from "./SpaceScale.svelte";
  import SpaceControl from "./SpaceControl.svelte";
  import { watchComputed } from "./state.svelte";
  watchComputed();
  const padding = ["padding-block-start", "padding-inline-end", "padding-block-end", "padding-inline-start"];
  const container = $derived(!!store.node && KINDS[store.node.kind].container);
</script>

<div class="flex flex-col gap-3" data-style-section="Spacing">
  <SpaceScale name="Padding" props={padding} />
  {#if container}<SpaceScale name="Gap" props={["gap"]} />{:else}<SpaceScale name="Below" props={["margin-block-end"]} />{/if}
  <SpaceControl />
</div>
