<script lang="ts">
  // The native `title` fallback (Tooltip.native).
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";

  interface Props extends HTMLAttributes<HTMLSpanElement> {
    text: string;
    children?: Snippet;
  }

  let { text, class: cls = "", children, ...rest }: Props = $props();
</script>

<span title={text} data-tooltip={text} class={cx("cursor-help", cls)} {...rest}>{@render children?.()}</span>
