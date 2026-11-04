<script lang="ts">
  // shadcn/ui Separator: a plain role=separator div.
  import type { HTMLAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";
  import type { Orientation } from "./variants";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    orientation?: Orientation;
  }

  let { orientation = "horizontal", class: cls = "", ...rest }: Props = $props();
</script>

<div
  role="separator"
  data-slot="separator"
  data-orientation={orientation}
  class={cx(`cn-separator shrink-0 bg-border ${orientation === "horizontal" ? "h-px w-full" : "h-full w-px"}`, cls)}
  {...rest}
></div>
