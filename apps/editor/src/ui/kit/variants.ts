// Class recipes shared by several components (verbatim from the Scala kit).

export type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "link";
export type ButtonSize = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";

export const buttonBase =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export const buttonVariantClasses: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/80",
  destructive:
    "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
  outline:
    "border-border bg-background hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "hover:bg-muted hover:text-foreground dark:hover:bg-muted/50",
  link: "text-primary underline-offset-4 hover:underline"
};

export const buttonSizeClasses: Record<ButtonSize, string> = {
  default: "h-8 gap-1.5 px-2.5",
  xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
  sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
  lg: "h-9 gap-1.5 px-2.5",
  icon: "size-8",
  "icon-xs": "size-6 rounded-[min(var(--radius-md),10px)] [&_svg:not([class*='size-'])]:size-3",
  "icon-sm": "size-7 rounded-[min(var(--radius-md),12px)]",
  "icon-lg": "size-9"
};

/** Upstream's `buttonVariants({ variant, size })` (Button.classes). Callers must set data-variant / data-size too. */
export function buttonClasses(variant: ButtonVariant = "default", size: ButtonSize = "default"): string {
  return `cn-button group/button ${buttonBase} cn-button-variant-${variant} ${buttonVariantClasses[variant]} cn-button-size-${size} ${buttonSizeClasses[size]}`;
}

/** Everything a real button carries (Button.appearance), to spread on parts that must look like one. */
export function buttonAppearance(
  variant: ButtonVariant = "default",
  size: ButtonSize = "default"
): { class: string; "data-variant": ButtonVariant; "data-size": ButtonSize } {
  return { class: buttonClasses(variant, size), "data-variant": variant, "data-size": size };
}

export type ToggleVariant = "default" | "outline";
export type ToggleSize = "default" | "sm" | "lg";

export const toggleBase =
  "cn-toggle group/toggle inline-flex items-center justify-center whitespace-nowrap outline-none hover:bg-muted focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";

/** Toggle.classes, shared with ToggleGroup items. */
export function toggleClasses(variant: ToggleVariant, size: ToggleSize): string {
  return `${toggleBase} cn-toggle-variant-${variant} cn-toggle-size-${size}`;
}

export type Orientation = "horizontal" | "vertical";
