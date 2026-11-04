<script lang="ts">
  // The site header's / footer's settings in the Content tab (U/HeaderPanel.scala, U/FooterPanel.scala), for a header or
  // footer that is not a builder one yet: opt in to the builder (one commit, one Undo). A ready (legacy) header keeps its
  // layout and parts (`legacy`), a hand-made one starts from the Marketplace (header) or Store (footer) preset.
  // A builder header or footer has its board (BuilderCard) instead.
  import { config } from "../../lib/config";
  import { BoardError, run } from "../../lib/builder.svelte";
  import { store } from "../../lib/store.svelte";
  import { FooterBuilder as FB, HeaderBuilder as HB } from "../../lib/builderCore";
  import ErrorLine from "./ErrorLine.svelte";

  let { area }: { area: "header" | "footer" } = $props();
  const error = new BoardError();

  /** The root of the document is a header or footer when its tag says so, or when the document is that part (Bar.of). */
  const node = $derived.by(() => {
    const n = store.node;
    if (!n || n.kind !== "Section" || !store.doc.roots.includes(n.id)) return null;
    const isBar = config.isPart && (config.partArea === "header" || config.partArea === "footer") ? config.partArea === area : n.tag === area;
    if (!isBar) return null;
    return (area === "header" ? HB.isHeaderBuilder(n.className) : FB.isFooterBuilder(n.className)) ? null : n;
  });

  const state = $derived.by(() => {
    if (!node) return null;
    if (area === "footer") return FB.readLegacyFooter(node.className) ? "ready" : "none";
    const c = HB.readLegacyHeader(node.className);
    return !c ? "none" : c.commerce !== undefined ? "commerce" : "ready";
  });

  const texts = {
    header: {
      none: ["marketplace", "Or build it as rows and slots of items, per width, starting from the Marketplace layout. This replaces what is in the header now (you can undo)."],
      commerce: ["legacy", "Edit it as rows and slots of items, per width. Converting keeps its layout, menus and texts; one Undo goes back."],
      ready: ["legacy", "Edit this header as rows and slots of items, per width. Converting keeps its layout, parts, menus and texts; one Undo goes back."],
    },
    footer: {
      none: ["store", "Or build it as rows of columns of items, starting from the Store layout. This replaces what is in the footer now (you can undo)."],
      commerce: ["legacy", ""],
      ready: ["legacy", "Edit this footer as rows of columns of items. Converting keeps its layout, parts, menus and texts; one Undo goes back."],
    },
  } as const;
</script>

{#if node && state}
  {@const [preset, text] = texts[area][state]}
  <div class="flex flex-col gap-3" {...{ [`data-${area}-panel`]: "1" }}>
    {#if area === "header" && state === "commerce"}
      <p class="text-xs text-muted-foreground" data-header-v2-pending="1">This opt-in commerce header is kept as-is. Its Studio projection is not enabled yet; legacy controls cannot rebuild it.</p>
    {/if}
    <div class="flex flex-col gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 p-3" {...{ [`data-${area}-convert`]: preset }}>
      <span class="text-xs font-semibold">{area === "header" ? "Header builder" : "Footer builder"}</span>
      <p class="text-[11px] leading-relaxed text-muted-foreground">{text}</p>
      <ErrorLine {error} />
      <button type="button" class="h-7 rounded-md bg-primary text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
        onclick={() => run(`${area}_set_preset`, { preset }, error)}>Convert to builder</button>
    </div>
  </div>
{/if}
