<script lang="ts">
  // A non-interactive label segment inside a ButtonGroup (upstream's ButtonGroupText).
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    children?: Snippet;
  }

  let { class: cls = "", children, ...rest }: Props = $props();
</script>

<div
  data-slot="button-group-text"
  class={cx(
    "cn-button-group-text flex items-center gap-2 rounded-md border bg-muted px-4 text-sm font-medium [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
    cls
  )}
  {...rest}
>
  {@render children?.()}
</div>
