<script lang="ts">
  // Opacity shown as a percentage (Figma), stored as 0–1 (StylePanel.opacityBox).
  import { opacityPercent, parseOpacity, sourceOf } from "@auvyx/editor-core";
  import Dot from "./Dot.svelte";
  import { boxCls, fieldOf, set, sourceText, tip } from "./state.svelte";
  import { startScrub } from "./scrub";
  const f = $derived(fieldOf("opacity"));
  let draft = $state<string | null>(null);
</script>

<div class={boxCls}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span class={["w-3 shrink-0 text-center text-[10px] font-medium", "cursor-ew-resize select-none", sourceText(sourceOf(f))]} title={tip(f)}
    onpointerdown={(e) => startScrub(e, "opacity", f, { step: 0.01, unit: "", min: 0 })}>◐</span>
  <input class="h-full w-full min-w-0 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/70"
    value={draft ?? opacityPercent(f.own) ?? ""} placeholder={opacityPercent(f.inherited) ?? "100"}
    oninput={(e) => {
      const v = e.currentTarget.value;
      draft = v;
      const p = parseOpacity(v);
      set("opacity", p.valid ? p.value : undefined, "opacity");
    }}
    onblur={() => (draft = null)} />
  <Dot prop="opacity" />
  <span class="text-[10px] text-muted-foreground">%</span>
</div>
