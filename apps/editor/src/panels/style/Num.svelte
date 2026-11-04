<script lang="ts">
  // Figma-style number box (StylePanel.num): scrubbable prefix + input + override dot (+ optional suffix control).
  // The input previews while typing, ↑/↓ steps (Shift ×10); empty shows the inherited or computed value.
  import type { Snippet } from "svelte";
  import { effective, scrubValue, sourceOf, type ScrubOptions } from "@auvyx/editor-core";
  import Dot from "./Dot.svelte";
  import { boxCls, computed, fieldOf, pretty, set, sourceText, tip } from "./state.svelte";
  import { startScrub } from "./scrub";
  let { prefix, prop, options = {}, suffix }: { prefix: string; prop: string; options?: ScrubOptions; suffix?: Snippet } = $props();
  const f = $derived(fieldOf(prop));
  let draft = $state<string | null>(null);
  // A token reads as its name ("XL", "Text 35%") until the field is focused, then shows the raw value.
  const shown = $derived(draft ?? (effective(f) === undefined ? "" : pretty(effective(f)!)));
</script>

<div class={boxCls}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span class={["w-3 shrink-0 text-center text-[10px] font-medium", "cursor-ew-resize select-none", sourceText(sourceOf(f))]} title={tip(f)}
    onpointerdown={(e) => startScrub(e, prop, f, options)}>{prefix}</span>
  <input class="h-full w-full min-w-0 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/70" value={shown}
    placeholder={f.inherited ?? computed(prop)}
    oninput={(e) => { const v = e.currentTarget.value; draft = v; set(prop, v.trim() ? v : undefined, "type"); }}
    onfocus={() => { if (draft === null) draft = effective(f) ?? ""; }}
    onblur={() => (draft = null)}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const dir = e.key === "ArrowUp" ? 1 : -1;
        const next = scrubValue(f.own, f.inherited ?? computed(prop), dir * (e.shiftKey ? 10 : 1), options);
        draft = next;
        set(prop, next, "step");
      }
    }} />
  <Dot {prop} />
  {@render suffix?.()}
</div>
