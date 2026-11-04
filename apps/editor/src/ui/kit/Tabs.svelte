<script lang="ts">
  // Tabs root primitive (Tabs.apply). For the managed version see TabsStateful.
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";
  import { tabsRootClasses } from "./tabs";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    children?: Snippet;
  }

  let { class: cls = "", children, ...rest }: Props = $props();
</script>

<div data-slot="tabs" data-orientation="horizontal" class={cx(tabsRootClasses, cls)} {...rest}>{@render children?.()}</div>
