<script lang="ts">
  // Native checkbox; `data-checked` (present/absent) mirrors `checked` for the style packs.
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";

  interface Props extends Omit<HTMLInputAttributes, "type" | "checked"> {
    checked?: boolean;
    indeterminate?: boolean;
  }

  let { checked = $bindable(false), indeterminate = $bindable(false), class: cls = "", ...rest }: Props = $props();

  const base =
    "input cn-checkbox peer size-4 shrink-0 rounded-[4px] border border-primary shadow-xs outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 checked:bg-primary checked:text-primary-foreground";
</script>

<input
  type="checkbox"
  data-slot="checkbox"
  class={cx(base, cls)}
  bind:checked
  bind:indeterminate
  data-checked={checked ? "" : undefined}
  {...rest}
/>
