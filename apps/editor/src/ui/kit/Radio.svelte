<script lang="ts">
  // A native radio input styled as a radio-group item; bind `group` to the chosen value.
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";

  interface Props extends Omit<HTMLInputAttributes, "type"> {
    group?: unknown;
  }

  let { name = "", group = $bindable(), value, class: cls = "", ...rest }: Props = $props();
</script>

<input
  type="radio"
  {name}
  data-slot="radio-group-item"
  class={cx(
    "input cn-radio-group-item aspect-square size-4 rounded-full border border-primary text-primary shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    cls
  )}
  {value}
  bind:group
  {...rest}
/>
