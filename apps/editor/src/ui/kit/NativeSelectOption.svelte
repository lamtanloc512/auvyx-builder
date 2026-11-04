<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLOptionAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";

  interface Props extends HTMLOptionAttributes {
    children?: Snippet;
  }

  let { class: cls = "", children, ...rest }: Props = $props();
</script>

<option data-slot="native-select-option" class={cx("bg-[Canvas] text-[CanvasText]", cls)} {...rest}>{@render children?.()}</option>
