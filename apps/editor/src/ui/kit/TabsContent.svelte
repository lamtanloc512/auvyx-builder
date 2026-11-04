<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";
  import { tabsContentClasses } from "./tabs";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    children?: Snippet;
  }

  let { class: cls = "", children, ...rest }: Props = $props();
</script>

<div role="tabpanel" data-slot="tabs-content" class={cx(tabsContentClasses, cls)} {...rest}>{@render children?.()}</div>
