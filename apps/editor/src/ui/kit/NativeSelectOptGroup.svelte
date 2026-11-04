<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLOptgroupAttributes } from "svelte/elements";

  interface Props extends HTMLOptgroupAttributes {
    children?: Snippet;
  }

  let { children, ...rest }: Props = $props();
</script>

<optgroup data-slot="native-select-opt-group" {...rest}>{@render children?.()}</optgroup>
