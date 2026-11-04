<script lang="ts">
  // Native <dialog> with showModal()/close(): the browser gives focus trap and scroll lock; this adds the exit
  // animation (data-closed until animationend or exitMs), focus restore, and Escape/backdrop dismiss.
  import type { Snippet } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import type { HTMLAttributes, HTMLDialogAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";
  import { dialogContentBoxClass, dialogContentShellClass, dialogRootExitClass, setDialogContext } from "./dialog";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    open?: boolean;
    /** Replaces the default box model ("gap-6 p-6 sm:max-w-md") instead of appending to it. */
    contentBoxClass?: string;
    dismissOnOutsideClick?: boolean;
    dismissOnEscape?: boolean;
    /** How long to keep the dialog open after `open` goes false so the exit animation can finish. */
    exitMs?: number;
    /** Class on the <dialog> itself (Sheet/Drawer-style surfaces pass their own). */
    rootClass?: string;
    /** data-slot of the content panel. */
    contentSlot?: string;
    /** Replaces the whole content class (shell + box), for surfaces with their own panel. */
    contentClass?: string;
    /** Attributes for the <dialog> itself. */
    rootProps?: HTMLDialogAttributes;
    children?: Snippet;
  }

  let {
    open = $bindable(false),
    contentBoxClass = dialogContentBoxClass,
    dismissOnOutsideClick = true,
    dismissOnEscape = true,
    exitMs = 150,
    rootClass = "dialog",
    contentSlot = "dialog-content",
    contentClass,
    rootProps = {},
    class: cls = "",
    children,
    ...rest
  }: Props = $props();

  setDialogContext({ close: () => (open = false) });

  const { class: rootPropsCls = "", ...rootRest } = $derived(rootProps);

  let el: HTMLDialogElement | null = $state(null);
  let closing = false;
  let exitTimer: ReturnType<typeof setTimeout> | null = null;
  let returnFocus: HTMLElement | null = null;
  let removeExitListeners = () => {};

  function syncOpenAttrs(node: Element, isOpen: boolean) {
    if (isOpen) {
      node.setAttribute("data-open", "");
      node.removeAttribute("data-closed");
    } else {
      node.setAttribute("data-closed", "");
      node.removeAttribute("data-open");
    }
  }

  function endExitPhase() {
    if (exitTimer !== null) clearTimeout(exitTimer);
    exitTimer = null;
    removeExitListeners();
    removeExitListeners = () => {};
    closing = false;
  }

  const contentOf = (d: HTMLDialogElement) => d.querySelector(`[data-slot='${contentSlot}']`);

  function restoreFocus() {
    // The trigger may be gone (route change): only restore when it is still in the document.
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
    returnFocus = null;
  }

  function finishClose(d: HTMLDialogElement) {
    endExitPhase();
    if (d.open) d.close();
    restoreFocus();
  }

  function openDialog(d: HTMLDialogElement) {
    endExitPhase();
    // Attributes first, so showModal() does not paint a frame of the previous exit state.
    syncOpenAttrs(d, true);
    const c = contentOf(d);
    if (c) syncOpenAttrs(c, true);
    if (!d.open) {
      const focused = document.activeElement;
      if (
        focused instanceof HTMLElement &&
        focused !== document.body &&
        focused !== document.documentElement &&
        !d.contains(focused)
      )
        returnFocus = focused;
      d.showModal();
    }
  }

  function requestClose(d: HTMLDialogElement) {
    if (!d.open || closing) return;
    closing = true;
    syncOpenAttrs(d, false);
    const c = contentOf(d);
    if (c) syncOpenAttrs(c, false);
    // The panel's animationend wins; exitMs is the fallback for a panel without animation.
    const onEnd = (ev: Event) => {
      const t = ev.target;
      if (t instanceof Element && (t.getAttribute("data-slot") === contentSlot || t === d) && closing) finishClose(d);
    };
    d.addEventListener("animationend", onEnd);
    d.addEventListener("transitionend", onEnd);
    removeExitListeners = () => {
      d.removeEventListener("animationend", onEnd);
      d.removeEventListener("transitionend", onEnd);
    };
    exitTimer = setTimeout(() => {
      if (closing) finishClose(d);
    }, exitMs);
  }

  const listen: Attachment<HTMLDialogElement> = (d) => {
    // Escape fires `cancel` first: prevent it and run the exit animation ourselves.
    const onCancel = (ev: Event) => {
      ev.preventDefault();
      if (dismissOnEscape) open = false;
    };
    // form method=dialog or an outside d.close() still mirror into `open`.
    const onNativeClose = () => {
      endExitPhase();
      if (open) open = false;
      restoreFocus();
    };
    const onClick = (ev: MouseEvent) => {
      if (dismissOnOutsideClick && ev.target === ev.currentTarget) open = false;
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("close", onNativeClose);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("close", onNativeClose);
      d.removeEventListener("click", onClick);
      endExitPhase();
    };
  };

  $effect(() => {
    const d = el;
    if (!d) return;
    if (open) openDialog(d);
    else requestClose(d);
  });

  const dataState = $derived(open ? "open" : "closed");
</script>

<dialog
  bind:this={el}
  class={cx(`${rootClass} whitespace-normal ${dialogRootExitClass(exitMs)}`, rootPropsCls)}
  {...rootRest}
  data-state={dataState}
  {@attach listen}
>
  <div data-slot={contentSlot} data-state={dataState} class={cx(contentClass ?? `${dialogContentShellClass} ${contentBoxClass}`, cls)} {...rest}>
    {@render children?.()}
  </div>
</dialog>
