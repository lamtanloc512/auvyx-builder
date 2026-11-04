<script lang="ts">
  // shadcn/ui Button; `href` renders the anchor form. Without variant/size it carries only the default hooks,
  // like the Scala defaultHooks (data-variant/data-size="default" + cn-button-*-default, no utilities).
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";
  import { buttonBase, buttonSizeClasses, buttonVariantClasses, type ButtonSize, type ButtonVariant } from "./variants";

  type Props = Omit<HTMLButtonAttributes, "type"> &
    Pick<HTMLAnchorAttributes, "target" | "rel" | "download" | "hreflang" | "referrerpolicy"> & {
      variant?: ButtonVariant;
      size?: ButtonSize;
      href?: string;
      type?: "button" | "submit" | "reset";
      ref?: HTMLElement | null;
      children?: Snippet;
    };

  let { variant, size, href, type = "button", ref = $bindable(null), class: cls = "", children, ...rest }: Props = $props();

  const r = $derived(rest as Record<string, unknown>);
  const dataVariant = $derived(variant ?? (r["data-variant"] === undefined ? "default" : undefined));
  const dataSize = $derived(size ?? (r["data-size"] === undefined ? "default" : undefined));
  const classes = $derived(
    cx(
      `cn-button group/button ${buttonBase}`,
      variant && `cn-button-variant-${variant} ${buttonVariantClasses[variant]}`,
      size && `cn-button-size-${size} ${buttonSizeClasses[size]}`,
      cls,
      !variant && dataVariant && "cn-button-variant-default",
      !size && dataSize && "cn-button-size-default"
    )
  );
</script>

{#if href !== undefined}
  <a bind:this={ref} {href} data-slot="button" class={classes} data-variant={dataVariant} data-size={dataSize} {...rest as HTMLAnchorAttributes}>{@render children?.()}</a>
{:else}
  <button bind:this={ref} {type} data-slot="button" class={classes} data-variant={dataVariant} data-size={dataSize} {...rest as HTMLButtonAttributes}>{@render children?.()}</button>
{/if}
