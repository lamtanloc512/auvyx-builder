<script lang="ts">
  // Inline Lucide icon, the same markup as the Studio's Ico.scala.
  import type { HTMLAttributes } from "svelte/elements";
  import { Ico, type IconName } from "./icons";

  interface Props extends HTMLAttributes<HTMLSpanElement> {
    name: IconName;
    size?: number;
  }

  let { name, size = 16, class: cls = "", ...rest }: Props = $props();

  const svg = $derived(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${Ico[name]}</svg>`
  );
</script>

<span class={["inline-flex shrink-0 items-center justify-center", cls].filter(Boolean).join(" ")} {...rest}>{@html svg}</span>
