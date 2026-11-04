<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";
  import { tabsTriggerClasses } from "./tabs";

  interface Props extends Omit<HTMLButtonAttributes, "type"> {
    children?: Snippet;
  }

  let { class: cls = "", children, ...rest }: Props = $props();
</script>

<button type="button" role="tab" data-slot="tabs-trigger" class={cx(tabsTriggerClasses, cls)} {...rest}>{@render children?.()}</button>
