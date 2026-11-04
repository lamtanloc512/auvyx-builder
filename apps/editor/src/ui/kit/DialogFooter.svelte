<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    children?: Snippet;
  }

  let { class: cls = "", children, ...rest }: Props = $props();
</script>

<div data-slot="dialog-footer" class={cx("cn-dialog-footer flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", cls)} {...rest}>{@render children?.()}</div>
