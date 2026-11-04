<script lang="ts">
  // A header preset drawn from its data (HeaderBuilderPanel.sketch): its desktop rows, each slot's items as small bars.
  import { HeaderBuilder as HB, BuilderParts } from "../../lib/builderCore";
  let { preset }: { preset: HB.HeaderPreset } = $props();

  const toneClass = (t: BuilderParts.Tone) => ({ plain: "bg-background", muted: "bg-muted", dark: "bg-foreground/80", brand: "bg-primary/70" })[t];
  function bar(k: HB.ItemKind, dark: boolean): string {
    const shape = k === "Logo" ? "h-1.5 w-5 rounded-full" : k === "SearchField" ? "h-2 rounded-sm flex-1 min-w-6" : k === "Menu" || k === "Category" ? "h-1 w-6 rounded-full"
      : k === "Text" ? "h-1 w-8 rounded-full" : "size-1.5 rounded-full";
    const ink = k === "Logo" ? (dark ? "bg-background" : "bg-foreground/75")
      : k === "SearchField" ? (dark ? "bg-background/40" : "bg-muted-foreground/20 border border-border")
      : k === "Cart" || k === "Account" || k === "Wishlist" ? (dark ? "bg-background/70" : "bg-primary")
      : dark ? "bg-background/50" : "bg-muted-foreground/40";
    return `${shape} ${ink} `;
  }
  const justify = { start: "justify-start", center: "justify-center", end: "justify-end" } as const;
  const rows = $derived([...preset.desktop].sort((a, b) => HB.ROWS.indexOf(a.kind) - HB.ROWS.indexOf(b.kind)));
</script>

<div class="flex flex-col overflow-hidden rounded-md border border-border">
  {#each rows as r, i (i)}
    {@const tone = r.tone ?? "plain"}
    {@const dark = tone === "dark" || tone === "brand"}
    <div class={["grid grid-cols-[1fr_auto_1fr] items-center gap-1 px-1.5", toneClass(tone), r.kind === "main" ? "h-4" : "h-2.5"]}>
      {#each HB.SLOTS as s (s)}
        <div class={["flex min-w-0 items-center gap-0.5", justify[s]]}>
          {#each HB.specSlot(r, s) as k, j (j)}<div class={bar(k, dark)}></div>{/each}
        </div>
      {/each}
    </div>
  {/each}
</div>
