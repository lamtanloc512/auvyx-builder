<script lang="ts">
  // shadcn/ui Badge; `href` renders the anchor form (where the `[a&]:hover:*` utilities apply).
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";

  export type BadgeVariant = "default" | "secondary" | "outline" | "destructive" | "ghost" | "link";

  interface Props extends HTMLAnchorAttributes {
    variant?: BadgeVariant;
    href?: string;
    children?: Snippet;
  }

  let { variant, href, class: cls = "", children, ...rest }: Props = $props();

  const base =
    "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3";

  const variantClasses: Record<BadgeVariant, string> = {
    default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
    destructive:
      "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
    outline: "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
    ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
    link: "text-primary underline-offset-4 [a&]:hover:underline"
  };

  const classes = $derived(
    cx(`badge cn-badge group/badge ${base}`, variant && `cn-badge-variant-${variant} ${variantClasses[variant]}`, cls)
  );
</script>

{#if href !== undefined}
  <a {href} data-slot="badge" class={classes} data-variant={variant} {...rest}>{@render children?.()}</a>
{:else}
  <span data-slot="badge" class={classes} data-variant={variant} {...rest as Record<string, unknown>}>{@render children?.()}</span>
{/if}
