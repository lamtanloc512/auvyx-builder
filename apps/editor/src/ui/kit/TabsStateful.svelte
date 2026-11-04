<script lang="ts" module>
  import type { Snippet } from "svelte";
  import type { HTMLAttributes, HTMLButtonAttributes } from "svelte/elements";

  export interface TabItem {
    value: string;
    label: string;
    panel: Snippet;
    /** Extra attributes for this tab's trigger (Tab.triggerMods). */
    triggerProps?: HTMLButtonAttributes;
  }
</script>

<script lang="ts">
  // Tabs.stateful: a tablist with arrow/Home/End keys, roving tabindex, data-active and aria-selected.
  import { cx } from "./anchor.svelte";
  import {
    tabsContentClasses,
    tabsListBaseClasses,
    tabsListVariantClasses,
    tabsRootClasses,
    tabsTriggerClasses,
    type TabsListVariant
  } from "./tabs";

  interface Props {
    value: string;
    tabs: TabItem[];
    listVariant?: TabsListVariant;
    /** Extra attributes for the tablist (listMods); `class` is appended. */
    listProps?: HTMLAttributes<HTMLDivElement>;
  }

  let { value = $bindable(), tabs, listVariant = "default", listProps = {} }: Props = $props();

  const { class: listCls = "", onkeydown: listKeydown, ...listRest } = $derived(listProps);

  function focusTab(list: HTMLElement, v: string) {
    list.querySelector<HTMLButtonElement>(`button[role="tab"][data-value="${v}"]`)?.focus();
  }

  function onKey(ev: KeyboardEvent & { currentTarget: EventTarget & HTMLDivElement }) {
    const values = tabs.map((t) => t.value);
    const i = values.indexOf(value);
    if (i >= 0) {
      let next: string | undefined;
      if (ev.key === "ArrowRight") next = values[(i + 1) % values.length];
      else if (ev.key === "ArrowLeft") next = values[(i - 1 + values.length) % values.length];
      else if (ev.key === "Home") next = values[0];
      else if (ev.key === "End") next = values[values.length - 1];
      if (next !== undefined) {
        ev.preventDefault();
        value = next;
        focusTab(ev.currentTarget, next);
      }
    }
    listKeydown?.(ev);
  }
</script>

<div data-slot="tabs" data-orientation="horizontal" class={tabsRootClasses}>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div
    role="tablist"
    data-slot="tabs-list"
    data-variant={listVariant}
    class={cx(`${tabsListBaseClasses} ${tabsListVariantClasses[listVariant]}`, listCls)}
    {...listRest}
    onkeydown={onKey}
  >
    {#each tabs as tab (tab.value)}
      {@const { class: tCls = "", onclick: tClick, ...tRest } = tab.triggerProps ?? {}}
      <button
        type="button"
        role="tab"
        data-slot="tabs-trigger"
        data-value={tab.value}
        class={cx(tabsTriggerClasses, tCls)}
        tabindex={value === tab.value ? 0 : -1}
        data-active={value === tab.value ? "true" : undefined}
        aria-selected={value === tab.value ? "true" : "false"}
        onclick={(e) => {
          value = tab.value;
          tClick?.(e);
        }}
        {...tRest}>{tab.label}</button
      >
    {/each}
  </div>
  {#each tabs as tab (tab.value)}
    <div role="tabpanel" data-slot="tabs-content" class={tabsContentClasses} style:display={value === tab.value ? "block" : "none"}>
      {@render tab.panel()}
    </div>
  {/each}
</div>
