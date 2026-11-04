<script lang="ts">
  // Native <select> in a wrapper with the chevron beside it. `class` and other attributes go on the <select>.
  import type { Snippet } from "svelte";
  import type { HTMLSelectAttributes } from "svelte/elements";
  import Icon from "../Icon.svelte";
  import { cx } from "./anchor.svelte";

  interface Props extends HTMLSelectAttributes {
    children?: Snippet;
  }

  let { value = $bindable(), class: cls = "", children, ...rest }: Props = $props();
</script>

<div
  data-slot="native-select-wrapper"
  data-size="default"
  class="cn-native-select-wrapper group/native-select relative w-full has-[select:disabled]:opacity-50"
>
  <select
    data-slot="native-select"
    data-size="default"
    class={cx(
      "cn-native-select flex h-9 w-full min-w-0 appearance-none items-center justify-between rounded-md border border-input bg-transparent py-1 pr-8 pl-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
      cls
    )}
    bind:value
    {...rest}
  >
    {@render children?.()}
  </select>
  <Icon
    name="chevronDown"
    size={14}
    data-slot="native-select-icon"
    class="cn-native-select-icon pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 select-none text-muted-foreground"
  />
</div>
