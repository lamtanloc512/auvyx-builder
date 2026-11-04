<script lang="ts">
  // shadcn/ui ButtonGroup: joins adjacent [data-slot] controls into one unit.
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";
  import type { Orientation } from "./variants";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    orientation?: Orientation;
    children?: Snippet;
  }

  let { orientation = "horizontal", class: cls = "", children, ...rest }: Props = $props();

  const base =
    "button-group cn-button-group flex w-fit items-stretch [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1";

  const orientationClasses: Record<Orientation, string> = {
    horizontal:
      "cn-button-group-orientation-horizontal [&>[data-slot=dropdown-menu]]:contents [&>*:not(:first-child)]:rounded-l-none! [&>*:not(:first-child)]:border-l-0! [&>*:not(:last-child)]:rounded-r-none! [&>[data-slot=dropdown-menu]:not(:first-child)>[data-slot=dropdown-menu-trigger]]:rounded-l-none! [&>[data-slot=dropdown-menu]:not(:first-child)>[data-slot=dropdown-menu-trigger]]:border-l-0! [&>[data-slot=dropdown-menu]:not(:last-child)>[data-slot=dropdown-menu-trigger]]:rounded-r-none!",
    vertical:
      "cn-button-group-orientation-vertical flex-col [&>[data-slot=dropdown-menu]]:contents [&>*:not(:first-child)]:rounded-t-none! [&>*:not(:first-child)]:border-t-0! [&>*:not(:last-child)]:rounded-b-none!"
  };
</script>

<div
  role="group"
  data-slot="button-group"
  data-orientation={orientation}
  class={cx(`${base} ${orientationClasses[orientation]}`, cls)}
  {...rest}
>
  {@render children?.()}
</div>
