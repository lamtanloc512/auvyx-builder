<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";

  interface Props extends HTMLAttributes<HTMLParagraphElement> {
    children?: Snippet;
  }

  let { class: cls = "", children, ...rest }: Props = $props();
</script>

<p data-slot="dialog-description" class={cx("cn-dialog-description text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground", cls)} {...rest}>{@render children?.()}</p>
