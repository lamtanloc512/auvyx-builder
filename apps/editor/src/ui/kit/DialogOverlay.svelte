<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";
  import { dialogExitFillClass } from "./dialog";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    children?: Snippet;
  }

  let { class: cls = "", children, ...rest }: Props = $props();
</script>

<div
  data-slot="dialog-overlay"
  class={cx(
    `cn-dialog-overlay fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 ${dialogExitFillClass}`,
    cls
  )}
  {...rest}
>
  {@render children?.()}
</div>
