<script lang="ts" module>
  export interface SelectItem {
    value: string;
    label: string;
    group?: string;
    disabled?: boolean;
  }

  /** sm: a settings row (bordered). md: a dialog field. field: the Style panel's filled box. xs: an inline picker. */
  export type SelectSize = "sm" | "md" | "field" | "xs";

  export function selectItems(pairs: [string, string][]): SelectItem[] {
    return pairs.map(([value, label]) => ({ value, label }));
  }
</script>

<script lang="ts">
  // A trigger showing the chosen label that opens a portaled, keyboard-navigable listbox. A hidden native
  // <select> bound to the same value stays inside for forms, tests and automation.
  import type { HTMLAttributes } from "svelte/elements";
  import Icon from "../Icon.svelte";
  import Floating from "./Floating.svelte";
  import { cx, FloatingAnchor, triggerAttrs, triggerRef } from "./anchor.svelte";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    value?: string;
    options: SelectItem[];
    onValue?: (value: string) => void;
    size: SelectSize;
    /** Extra classes on the trigger itself (a height that must match its neighbours). */
    triggerClass?: string;
  }

  let { value = $bindable(""), options, onValue, size, triggerClass = "", class: cls = "", ...rest }: Props = $props();

  const anchor = new FloatingAnchor();

  const contentClass =
    "cn-select-content z-50 max-h-72 min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2";

  const triggerSize: Record<SelectSize, string> = {
    sm: "h-7 gap-1 border-input px-2 text-xs shadow-xs",
    md: "h-9 gap-2 border-input px-3 text-sm shadow-xs",
    field: "h-7 gap-1 border-transparent bg-muted/70 px-1.5 text-[11px] hover:bg-muted",
    xs: "h-5 gap-0.5 border-transparent px-1 text-[10px] text-muted-foreground hover:bg-background hover:text-foreground"
  };

  const label = $derived(options.find((o) => o.value === value)?.label ?? value);

  function pick(v: string) {
    anchor.close();
    anchor.focusTrigger();
    value = v;
    onValue?.(v);
  }

  // Opening lands on the chosen row, scrolled into view.
  $effect(() => {
    if (!anchor.isOpen) return;
    requestAnimationFrame(() => {
      const panel = anchor.content;
      if (!panel) return;
      const el =
        panel.querySelector<HTMLElement>("[data-slot=select-item][data-selected]") ??
        panel.querySelector<HTMLElement>("[data-slot=select-item]");
      if (el) {
        el.scrollIntoView(false);
        el.focus();
      }
    });
  });
</script>

<div data-slot="select" class={cx("cn-select relative w-full min-w-0", cls)} {...rest}>
  <button
    type="button"
    data-slot="select-trigger"
    class="cn-select-trigger flex w-full min-w-0 items-center justify-between rounded-md border bg-transparent text-left outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:border-ring {triggerSize[size]} {triggerClass}"
    aria-haspopup="listbox"
    {...triggerAttrs(anchor)}
    {@attach triggerRef(anchor)}
    onclick={(e) => {
      e.stopPropagation();
      anchor.toggle();
    }}
    onkeydown={(e) => {
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !anchor.isOpen) {
        e.preventDefault();
        anchor.open();
      }
    }}
  >
    <span class="truncate">{label}</span>
    <Icon name="chevronDown" size={size === "xs" ? 10 : 14} class="shrink-0 text-muted-foreground" />
  </button>
  <select
    data-slot="select-native"
    class="sr-only"
    tabindex={-1}
    aria-hidden="true"
    {value}
    onchange={(e) => {
      const v = e.currentTarget.value;
      value = v;
      onValue?.(v);
    }}
  >
    {#each options as item}
      <option value={item.value}>{item.label}</option>
    {/each}
  </select>
  <Floating
    {anchor}
    placement={{ side: "bottom", align: "start", matchTriggerWidth: true }}
    {contentClass}
    itemSelector="[data-slot=select-item]:not([data-disabled])"
    data-slot="select-content"
    role="listbox"
  >
    {#if anchor.isOpen}
      {#each options as item, i}
        {#if item.group && (i === 0 || options[i - 1].group !== item.group)}
          <div class="px-2 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground">{item.group}</div>
        {/if}
        <!-- svelte-ignore a11y_click_events_have_key_events (Enter/Space handled by the panel) -->
        <div
          data-slot="select-item"
          role="option"
          tabindex={-1}
          aria-selected={item.value === value ? "true" : "false"}
          data-selected={item.value === value ? "" : undefined}
          data-disabled={item.disabled ? "" : undefined}
          data-value={item.value}
          class="relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-xs outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
          onclick={() => {
            if (!item.disabled) pick(item.value);
          }}
        >
          <span class="truncate">{item.label}</span>
          {#if item.value === value}
            <span class="absolute right-2 flex size-3.5 items-center justify-center"><Icon name="check" size={14} /></span>
          {/if}
        </div>
      {/each}
    {/if}
  </Floating>
</div>
