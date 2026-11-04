<script lang="ts">
  // Formatting toolbar above the text being edited (U/RichToolbar.scala). Buttons keep the canvas selection.
  import { command, inline, richLink } from "../lib/actions.svelte";
  import { viewport } from "../lib/viewport.svelte";
  let { rect }: { rect: { x: number; y: number; w: number; h: number } | null } = $props();
  let linkValue = $state("https://");
  let saved: Range | null = null;
  let input = $state<HTMLInputElement>();

  $effect(() => { if (richLink.open) openLink(); });
  function openLink() {
    const t = inline.el;
    if (!t) return;
    const sel = t.ownerDocument.defaultView!.getSelection()!;
    saved = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    inline.keepOpen = true;
    linkValue = "https://";
    richLink.open = true;
    setTimeout(() => input?.focus(), 0);
  }
  function applyLink(url: string | null) {
    const t = inline.el;
    if (t) {
      t.focus();
      if (saved) { const sel = t.ownerDocument.defaultView!.getSelection()!; sel.removeAllRanges(); sel.addRange(saved); }
      inline.keepOpen = false;
      const u = url?.trim();
      if (u && u !== "https://") command("createLink", u);
    }
    richLink.open = false;
  }
  const z = $derived(viewport.zoom);
</script>

{#snippet tool(label: string, tip: string, use: () => void, extra: string = "")}
  <button class="flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs text-background/80 hover:bg-background/15 hover:text-background {extra}" title={tip}
    onmousedown={(e) => { e.preventDefault(); use(); }}>{label}</button>
{/snippet}

<div class="pointer-events-auto absolute z-30 flex items-center gap-0.5 rounded-lg bg-foreground p-0.5 shadow-lg"
  style:display={inline.el && rect ? "flex" : "none"} style:left="{Math.max(0, (rect?.x ?? 0) * z)}px" style:top="{Math.max(0, (rect?.y ?? 0) * z - 40)}px">
  {#if !richLink.open}
    <div class="flex items-center gap-0.5">
      {@render tool("B", "Bold (⌘B)", () => command("bold"), "font-bold")}
      {@render tool("I", "Italic (⌘I)", () => command("italic"), "italic")}
      {@render tool("Link", "Link (⌘K)", openLink)}
      {@render tool("Unlink", "Remove link", () => command("unlink"))}
      {@render tool("Clear", "Clear formatting", () => { command("removeFormat"); command("unlink"); })}
    </div>
  {:else}
    <div class="flex items-center gap-1 p-0.5">
      <input bind:this={input} class="h-7 w-56 rounded-md bg-background px-2 text-xs text-foreground outline-none" placeholder="https:// or #section-id" bind:value={linkValue}
        onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(linkValue); } else if (e.key === "Escape") applyLink(null); }} />
      {@render tool("Apply", "Apply link", () => applyLink(linkValue))}
      {@render tool("✕", "Cancel", () => applyLink(null))}
    </div>
  {/if}
</div>
