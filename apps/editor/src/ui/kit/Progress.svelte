<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** 0 to 100. */
    value?: number;
    children?: Snippet;
  }

  let { value = 0, class: cls = "", children, ...rest }: Props = $props();
</script>

<div
  role="progressbar"
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={value}
  data-slot="progress"
  class={cx("progress cn-progress relative h-2 w-full overflow-hidden rounded-full bg-primary/20", cls)}
  {...rest}
>
  <span
    data-slot="progress-indicator"
    class="cn-progress-indicator h-full w-full flex-1 bg-primary transition-all"
    style="transform:translateX(-{100 - value}%)"
  ></span>
  {@render children?.()}
</div>
