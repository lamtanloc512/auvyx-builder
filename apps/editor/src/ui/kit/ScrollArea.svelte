<script lang="ts">
  // Overlay scroll: the native bar is hidden (auvyx-scroll-view) and a Lyra thumb sits on top of the content.
  import type { Snippet } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import type { HTMLAttributes } from "svelte/elements";
  import { cx } from "./anchor.svelte";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** The scrolling element, for callers that scroll it themselves. */
    viewport?: HTMLDivElement | null;
    children?: Snippet;
  }

  let { viewport = $bindable(null), class: cls = "", children, ...rest }: Props = $props();

  let ratio = $state(1);
  let top = $state(0);
  let observer: ResizeObserver | null = null;

  function measure(view: HTMLElement) {
    const max = view.scrollHeight - view.clientHeight;
    const r = view.scrollHeight <= 0 ? 1 : view.clientHeight / view.scrollHeight;
    ratio = r;
    top = max <= 0 ? 0 : (view.scrollTop / max) * (1 - r);
  }

  const watch: Attachment<HTMLDivElement> = (view) => {
    measure(view);
    const obs = new ResizeObserver(() => measure(view));
    observer = obs;
    obs.observe(view);
    const onScroll = () => measure(view);
    view.addEventListener("scroll", onScroll);
    return () => {
      obs.disconnect();
      if (observer === obs) observer = null;
      view.removeEventListener("scroll", onScroll);
    };
  };

  const observeContent: Attachment<HTMLDivElement> = (el) => {
    observer?.observe(el);
  };
</script>

<div class={cx("cn-scroll-area relative min-h-0 overflow-hidden", cls)} data-slot="scroll-area" {...rest}>
  <div
    bind:this={viewport}
    class="auvyx-scroll-view absolute inset-0 overflow-x-hidden overflow-y-auto"
    data-slot="scroll-area-viewport"
    {@attach watch}
  >
    <div {@attach observeContent}>{@render children?.()}</div>
  </div>
  <div
    class="cn-scroll-area-scrollbar pointer-events-none absolute inset-y-0 right-0 z-10"
    data-slot="scroll-area-scrollbar"
    data-orientation="vertical"
    style:display={ratio < 0.995 ? "flex" : "none"}
  >
    <div
      class="cn-scroll-area-thumb absolute inset-x-0.5 rounded-full bg-foreground/30"
      data-slot="scroll-area-thumb"
      style:top="{top * 100}%"
      style:height="{Math.max(ratio, 0.08) * 100}%"
    ></div>
  </div>
</div>
