<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";

  interface Props extends HTMLAttributes<HTMLHeadingElement> {
    children?: Snippet;
  }

  let { class: cls = "", children, ...rest }: Props = $props();
</script>

<h2 data-slot="dialog-title" class={cx("cn-font-heading cn-dialog-title leading-none font-medium", cls)} {...rest}>{@render children?.()}</h2>
