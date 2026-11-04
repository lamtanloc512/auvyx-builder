<script lang="ts">
  // A two-state pressed/unpressed button (data-state on/off, aria-pressed).
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";
  import { toggleClasses, type ToggleSize, type ToggleVariant } from "./variants";

  interface Props extends Omit<HTMLButtonAttributes, "type"> {
    pressed?: boolean;
    variant?: ToggleVariant;
    size?: ToggleSize;
    children?: Snippet;
  }

  let {
    pressed = $bindable(false),
    variant = "default",
    size = "default",
    disabled = false,
    class: cls = "",
    onclick,
    children,
    ...rest
  }: Props = $props();
</script>

<button
  type="button"
  data-slot="toggle"
  class={cx(toggleClasses(variant, size), cls)}
  data-state={pressed ? "on" : "off"}
  aria-pressed={pressed ? "true" : "false"}
  {disabled}
  onclick={(e) => {
    pressed = !pressed;
    onclick?.(e);
  }}
  {...rest}
>
  {@render children?.()}
</button>
