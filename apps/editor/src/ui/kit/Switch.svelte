<script lang="ts">
  // A role=switch button; `data-state` checked/unchecked is what the packs select on.
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";

  interface Props extends Omit<HTMLButtonAttributes, "type"> {
    checked?: boolean;
    children?: Snippet;
  }

  let { checked = $bindable(false), class: cls = "", onclick, children, ...rest }: Props = $props();

  const base =
    "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";
  const dataState = $derived(checked ? "checked" : "unchecked");
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked ? "true" : "false"}
  data-slot="switch"
  data-size="default"
  data-state={dataState}
  class={cx(`input cn-switch group/switch ${base}`, checked ? "bg-primary" : "bg-input", cls)}
  onclick={(e) => {
    checked = !checked;
    onclick?.(e);
  }}
  {...rest}
>
  <span
    data-slot="switch-thumb"
    data-state={dataState}
    class={cx(
      "cn-switch-thumb pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform",
      checked ? "translate-x-4" : "translate-x-0"
    )}
  ></span>
  {@render children?.()}
</button>
