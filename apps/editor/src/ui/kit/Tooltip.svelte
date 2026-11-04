<script lang="ts">
  // A portaled, anchored panel with an arrow, opened on hover (200ms) and closed with a 100ms grace.
  // `children` is the trigger; `text` or `content` fills the panel. Other attributes go on the trigger span.
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import Floating from "./Floating.svelte";
  import { cx, FloatingAnchor, hoverKeepOpen, hoverToOpen, triggerAttrs, triggerRef, type Placement } from "./anchor.svelte";

  interface Props extends HTMLAttributes<HTMLSpanElement> {
    text?: string;
    content?: Snippet;
    /** Default: top, centered. */
    placement?: Placement;
    /** Appended to the panel's classes. */
    contentClass?: string;
    children?: Snippet;
  }

  let { text, content, placement = { side: "top" }, contentClass = "", class: cls = "", children, ...rest }: Props = $props();

  const panelClass =
    "cn-tooltip-content group/tooltip-content z-50 w-fit max-w-xs rounded-md bg-foreground px-3 py-1.5 text-xs text-background outline-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2";

  const openDelay = 200;
  const closeDelay = 100;
  const anchor = new FloatingAnchor();
</script>

<span data-slot="tooltip" class="cn-tooltip relative inline-flex">
  <span
    data-slot="tooltip-trigger"
    class={cx("inline-flex", cls)}
    {...triggerAttrs(anchor)}
    {@attach triggerRef(anchor)}
    {@attach hoverToOpen(anchor, openDelay, closeDelay)}
    {...rest}
  >
    {@render children?.()}
  </span>
  <Floating {anchor} {placement} contentClass={panelClass} class={contentClass} data-slot="tooltip-content" role="tooltip" {@attach hoverKeepOpen(anchor, closeDelay)}>
    {#if content}{@render content()}{:else}{text}{/if}
    <span
      data-slot="tooltip-arrow"
      class="cn-tooltip-arrow absolute size-2.5 rotate-45 bg-foreground group-data-[side=top]/tooltip-content:top-full group-data-[side=top]/tooltip-content:left-1/2 group-data-[side=top]/tooltip-content:-translate-x-1/2 group-data-[side=top]/tooltip-content:-translate-y-1/2 group-data-[side=bottom]/tooltip-content:bottom-full group-data-[side=bottom]/tooltip-content:left-1/2 group-data-[side=bottom]/tooltip-content:-translate-x-1/2 group-data-[side=bottom]/tooltip-content:translate-y-1/2 group-data-[side=left]/tooltip-content:left-full group-data-[side=left]/tooltip-content:top-1/2 group-data-[side=left]/tooltip-content:-translate-x-1/2 group-data-[side=left]/tooltip-content:-translate-y-1/2 group-data-[side=right]/tooltip-content:right-full group-data-[side=right]/tooltip-content:top-1/2 group-data-[side=right]/tooltip-content:translate-x-1/2 group-data-[side=right]/tooltip-content:-translate-y-1/2"
    ></span>
  </Floating>
</span>
