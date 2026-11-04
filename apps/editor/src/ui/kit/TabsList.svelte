<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";
  import { tabsListBaseClasses, tabsListVariantClasses, type TabsListVariant } from "./tabs";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    variant?: TabsListVariant;
    children?: Snippet;
  }

  let { variant = "default", class: cls = "", children, ...rest }: Props = $props();
</script>

<div
  role="tablist"
  data-slot="tabs-list"
  data-variant={variant}
  class={cx(`${tabsListBaseClasses} ${tabsListVariantClasses[variant]}`, cls)}
  {...rest}
>
  {@render children?.()}
</div>
