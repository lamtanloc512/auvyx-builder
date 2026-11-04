<script lang="ts">
  // Flatsome's "Animate" (SettingsPanel.animateRow): an entrance when the element scrolls into view, with an optional
  // delay for stagger. Choosing one plays it on the canvas (the canvas has no observer script; this does it once).
  import { Settings as S } from "@auvyx/editor-core";
  import { Select } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import type { Update } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  let { id, update }: { id: string; update: Update } = $props();
  const current = $derived(S.readAnimate(store.doc.nodes[id]?.className ?? ""));
  function play() {
    const el = store.elements.get(id);
    if (!el) return;
    const body = el.ownerDocument.body;
    el.classList.remove("is-in");
    body.classList.add("auvyx-anim");
    el.getBoundingClientRect(); // restart the animation
    el.ownerDocument.defaultView?.requestAnimationFrame(() => el.classList.add("is-in"));
    setTimeout(() => { body.classList.remove("auvyx-anim"); el.classList.remove("is-in"); }, 1600);
  }
  function set(name: string, delay: number) {
    update("animate", (x) => ({ ...x, className: S.writeAnimate(x.className, name, delay) }));
    if (name) setTimeout(play, 60);
  }
  const now = () => S.readAnimate(store.doc.nodes[id]?.className ?? "");
  const delayLabel = (d: number) => (d === 0 ? "0" : (d * 0.15).toFixed(2).replace(/^0/, "") + "s");
</script>

<div class="flex flex-col gap-1" data-animate="1">
  <Row name="Animate"><Select size="sm" value={current[0]} options={S.ANIMATE_CHOICES.map(([value, label]) => ({ value, label }))} onValue={(v: string) => set(v, now()[1])} /></Row>
  {#if current[0]}
    <Row name="Delay">
      <div class="flex items-center gap-2">
        <div class="flex flex-1 gap-0.5 rounded-md bg-muted/70 p-0.5" data-animate-delay="1">
          {#each S.ANIMATE_DELAYS as d (d)}
            <button type="button" class={["h-6 flex-1 rounded-sm text-[10px] text-muted-foreground hover:text-foreground", current[1] === d && "bg-background text-foreground shadow-sm"]} onclick={() => set(now()[0], d)}>{delayLabel(d)}</button>
          {/each}
        </div>
        <button type="button" class="text-[11px] text-primary hover:underline" data-animate-play="1" onclick={play}>▶ Play</button>
      </div>
    </Row>
  {/if}
</div>
