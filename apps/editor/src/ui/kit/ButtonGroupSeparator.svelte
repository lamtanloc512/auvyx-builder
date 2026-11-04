<script lang="ts">
  // A Separator inside a ButtonGroup (vertical by default).
  import type { HTMLAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";
  import Separator from "./Separator.svelte";
  import type { Orientation } from "./variants";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    orientation?: Orientation;
  }

  let { orientation = "vertical", class: cls = "", ...rest }: Props = $props();
</script>

<Separator
  {orientation}
  data-slot="button-group-separator"
  class={cx(
    "cn-button-group-separator relative self-stretch bg-input data-[orientation=horizontal]:mx-px data-[orientation=horizontal]:w-auto data-[orientation=vertical]:my-px data-[orientation=vertical]:h-auto",
    cls
  )}
  {...rest}
/>
