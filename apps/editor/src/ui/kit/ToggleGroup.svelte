<script lang="ts" module>
  import type { Snippet } from "svelte";
  import type { HTMLAttributes, HTMLButtonAttributes } from "svelte/elements";

  export interface ToggleGroupItem {
    value: string;
    /** Text, or a snippet (an icon). */
    label: string | Snippet;
    disabled?: boolean;
    /** Extra attributes for the item button (Item.mods); `class` is appended. */
    props?: HTMLButtonAttributes;
  }
</script>

<script lang="ts">
  // A row of toggle buttons: `type="single"` binds `value` (string | undefined), `type="multiple"` binds `values`.
  import { cx } from "./anchor.svelte";
  import { toggleClasses, type Orientation, type ToggleSize, type ToggleVariant } from "./variants";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    type?: "single" | "multiple";
    value?: string | undefined;
    values?: string[];
    variant?: ToggleVariant;
    size?: ToggleSize;
    spacing?: number;
    orientation?: Orientation;
    items: ToggleGroupItem[];
  }

  let {
    type = "single",
    value = $bindable(undefined),
    values = $bindable([]),
    variant = "default",
    size = "default",
    spacing = 0,
    orientation = "horizontal",
    items,
    class: cls = "",
    onkeydown,
    ...rest
  }: Props = $props();

  const rootClasses =
    "cn-toggle-group group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] data-vertical:flex-col data-vertical:items-stretch";

  const itemBase =
    "cn-toggle-group-item shrink-0 focus:z-10 focus-visible:z-10 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t";

  const isOn = (v: string) => (type === "single" ? value === v : values.includes(v));

  function press(v: string) {
    if (type === "single") value = value === v ? undefined : v;
    else values = values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
  }

  // Arrow keys (per orientation) and Home/End move focus, skipping disabled items.
  function onKey(event: KeyboardEvent & { currentTarget: EventTarget & HTMLDivElement }) {
    const k = event.key;
    const delta =
      orientation === "horizontal"
        ? k === "ArrowRight" ? 1 : k === "ArrowLeft" ? -1 : 0
        : k === "ArrowDown" ? 1 : k === "ArrowUp" ? -1 : 0;
    const jump = k === "Home" ? "first" : k === "End" ? "last" : null;
    if (delta !== 0 || jump) {
      const buttons = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-slot='toggle-group-item']:not(:disabled)")
      );
      const current = (event.target as Element | null)?.closest("[data-slot='toggle-group-item']");
      const i = buttons.findIndex((b) => current != null && b === current);
      if (buttons.length && i >= 0) {
        event.preventDefault();
        const next = jump === "first" ? 0 : jump === "last" ? buttons.length - 1 : (i + delta + buttons.length) % buttons.length;
        buttons[next].focus();
      }
    }
    onkeydown?.(event);
  }
</script>

<div
  role="group"
  data-slot="toggle-group"
  data-variant={variant}
  data-size={size}
  data-spacing={String(spacing)}
  data-horizontal={orientation === "horizontal" ? "" : undefined}
  data-vertical={orientation === "vertical" ? "" : undefined}
  style="--gap: {spacing}"
  class={cx(rootClasses, cls)}
  onkeydown={onKey}
  {...rest}
>
  {#each items as item (item.value)}
    {@const { class: iCls = "", onclick: iClick, ...iRest } = item.props ?? {}}
    <button
      type="button"
      data-slot="toggle-group-item"
      data-variant={variant}
      data-size={size}
      data-spacing={String(spacing)}
      class={cx(`${itemBase} ${toggleClasses(variant, size)}`, iCls)}
      data-state={isOn(item.value) ? "on" : "off"}
      aria-pressed={isOn(item.value) ? "true" : "false"}
      disabled={item.disabled ?? false}
      onclick={(e) => {
        press(item.value);
        iClick?.(e);
      }}
      {...iRest}
    >
      {#if typeof item.label === "string"}{item.label}{:else}{@render item.label()}{/if}
    </button>
  {/each}
</div>
