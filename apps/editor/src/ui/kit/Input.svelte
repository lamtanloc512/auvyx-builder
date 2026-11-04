<script lang="ts">
  // shadcn/ui Input: a native input.
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";

  interface Props extends HTMLInputAttributes {
    ref?: HTMLInputElement | null;
  }

  let { value = $bindable(), ref = $bindable(null), class: cls = "", ...rest }: Props = $props();

  const base =
    "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";
</script>

<input bind:this={ref} data-slot="input" class={cx(`input cn-input ${base}`, cls)} bind:value {...rest} />
