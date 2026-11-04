<script lang="ts">
  // The floating panel (Floating.content): portaled, positioned against the trigger, dismissed on outside
  // mouse down, Escape or window blur. A `hidden` placeholder stays where the component is used.
  import type { Snippet } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import type { HTMLAttributes } from "svelte/elements";
  import { cx, place, portalTarget, type FloatingAnchor, type Placement } from "./anchor.svelte";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    anchor: FloatingAnchor;
    placement?: Placement;
    contentClass?: string;
    /** Rows for roving keyboard focus (Floating.keyboardNav); none = no keyboard navigation. */
    itemSelector?: string;
    children?: Snippet;
  }

  let { anchor, placement = {}, contentClass = "", itemSelector, class: cls = "", children, ...rest }: Props = $props();

  const items = (panel: HTMLElement): HTMLElement[] =>
    itemSelector ? Array.from(panel.querySelectorAll<HTMLElement>(itemSelector)) : [];

  function focusAt(panel: HTMLElement, index: number) {
    const list = items(panel);
    if (list.length) list[((index % list.length) + list.length) % list.length].focus();
  }

  function move(panel: HTMLElement, delta: number) {
    const list = items(panel);
    const current = list.indexOf(document.activeElement as HTMLElement);
    focusAt(panel, current < 0 ? (delta > 0 ? 0 : list.length - 1) : current + delta);
  }

  function onKey(ev: KeyboardEvent) {
    const panel = anchor.content;
    if (!panel || !itemSelector) return;
    switch (ev.key) {
      case "ArrowDown":
        ev.preventDefault();
        move(panel, 1);
        break;
      case "ArrowUp":
        ev.preventDefault();
        move(panel, -1);
        break;
      case "Home":
        ev.preventDefault();
        focusAt(panel, 0);
        break;
      case "End":
        ev.preventDefault();
        focusAt(panel, items(panel).length - 1);
        break;
      case "Enter":
      case " ": {
        ev.preventDefault();
        const el = document.activeElement;
        if (el instanceof HTMLElement) el.click();
        break;
      }
    }
  }

  const portal: Attachment<HTMLDivElement> = (panel) => {
    const { target, host } = portalTarget(panel.parentElement ?? panel);
    target.appendChild(panel);
    anchor.content = panel;
    // Capture phase: scroll containers do not bubble their scroll events.
    const onScroll = () => {
      if (anchor.isOpen) place(anchor, placement);
    };
    document.addEventListener("scroll", onScroll, true);
    panel.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      panel.removeEventListener("keydown", onKey);
      if (anchor.content === panel) anchor.content = null;
      panel.remove();
      host?.remove();
    };
  };

  let first = true;
  $effect(() => {
    const open = anchor.isOpen;
    const el = anchor.content;
    // Like Laminar's first emission (before the ref exists): no data-open / data-closed until the first change.
    if (first) first = false;
    else if (el) {
      if (open) {
        el.setAttribute("data-open", "");
        el.removeAttribute("data-closed");
        // The panel lives in <body>: carry the corner of the place it opened from.
        const t = anchor.trigger;
        if (t) {
          const r = getComputedStyle(t).getPropertyValue("--radius");
          if (r) el.style.setProperty("--radius", r);
        }
      } else {
        el.setAttribute("data-closed", "");
        el.removeAttribute("data-open");
      }
    }
    if (open) {
      requestAnimationFrame(() => place(anchor, placement));
      if (itemSelector)
        requestAnimationFrame(() => {
          const panel = anchor.content;
          if (!panel) return;
          const list = items(panel);
          // A listbox reopens on its current selection; a menu falls back to the first row.
          const el = list.find((e) => e.getAttribute("aria-selected") === "true") ?? list[0];
          if (el) {
            el.focus();
            el.scrollIntoView({ block: "nearest" });
          } else panel.focus();
        });
    }
  });

  function onDocMouseDown(ev: MouseEvent) {
    if (!anchor.isOpen) return;
    const path = ev.composedPath();
    const insideTrigger = anchor.trigger !== null && path.includes(anchor.trigger);
    const insidePanel = anchor.panels.some((p) => path.includes(p));
    if (!insideTrigger && !insidePanel) anchor.close();
  }

  function onDocKeyDown(ev: KeyboardEvent) {
    // An open submenu handles Escape itself.
    if (anchor.isOpen && ev.key === "Escape" && !anchor.hasOpenNested) {
      anchor.close();
      anchor.trigger?.focus();
    }
  }
</script>

<svelte:window
  onresize={() => {
    if (anchor.isOpen) place(anchor, placement);
  }}
  onblur={() => {
    if (anchor.isOpen) anchor.close();
  }}
/>
<svelte:document onmousedown={onDocMouseDown} onkeydown={onDocKeyDown} />

<div class="hidden">
  <div
    class={cx(contentClass, cls)}
    style:display={anchor.isOpen ? "block" : "none"}
    aria-hidden={anchor.isOpen ? "false" : "true"}
    data-state={anchor.isOpen ? "open" : "closed"}
    {...rest}
    {@attach portal}
  >
    {@render children?.()}
  </div>
</div>
