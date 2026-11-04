<script lang="ts">
  // Popup (SettingsPanel.popupRow, sections marked auvyx-popup): when it opens, how often, where and how wide. Any section
  // can become one; links to its anchor open it. Auvyx Builder Pro's: without its licence one can be turned back into a
  // section, not made.
  import { Settings as S } from "@auvyx/editor-core";
  import { Select } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { proLocked, proShown, session } from "../../lib/session.svelte";
  import type { Update } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  import ProBadge from "./ProBadge.svelte";
  let { id, update }: { id: string; update: Update } = $props();
  const n = $derived(store.doc.nodes[id]);
  const opts = $derived(S.readPopup(n?.className ?? ""));
  const on = $derived(S.isPopup(n?.className ?? ""));
  const set = (f: (o: S.PopupOpts) => S.PopupOpts) => update("popup", (x) => ({ ...x, className: S.writePopup(x.className, f(S.readPopup(x.className))) }));
  const items = (p: [string, string][]) => p.map(([value, label]) => ({ value, label }));
  function toggle(e: Event & { currentTarget: HTMLInputElement }) {
    const want = e.currentTarget.checked;
    if (want && proLocked) { e.currentTarget.checked = false; session.ask("popup"); return; }
    update("popup", (x) => (!want ? { ...x, className: S.removePopup(x.className) }
      : { ...x, className: S.writePopup(x.className, S.readPopup(x.className)), anchor: x.anchor !== "" ? x.anchor : S.popupAnchorFor(x.label !== "" ? x.label : "popup") }));
  }
</script>

<!-- Popups are Auvyx Builder Pro's (docs/editions.md): the row shows only while Pro is installed. -->
{#if n && proShown}
  <div class="flex flex-col gap-2" data-popup-settings="">
    <label class="flex items-center gap-2 text-xs">
      <input type="checkbox" data-popup-toggle="1" checked={on} onchange={toggle} />
      Show as a popup
      {#if proLocked}<ProBadge />{/if}
    </label>
    {#if on}
      <!-- Without Pro's licence its settings stay visible, and cannot change. -->
      <div class={["flex flex-col gap-2", proLocked && "pointer-events-none opacity-50"]}>
        <Row name="Opens"><Select size="sm" value={opts.trigger} options={items(S.POPUP_TRIGGERS)} onValue={(v: string) => set((o) => ({ ...o, trigger: v }))} /></Row>
        {#if opts.trigger === "load"}
          <Row name="After"><Select size="sm" value={String(opts.delay)} options={S.POPUP_DELAYS.map((d) => ({ value: String(d), label: d === 0 ? "At once" : `${d} seconds` }))} onValue={(v: string) => set((o) => ({ ...o, delay: Number(v) }))} /></Row>
        {:else if opts.trigger === "scroll"}
          <Row name="Past"><Select size="sm" value={String(opts.scroll)} options={S.POPUP_SCROLLS.map((p) => ({ value: String(p), label: `${p}% of the page` }))} onValue={(v: string) => set((o) => ({ ...o, scroll: Number(v) }))} /></Row>
        {:else if opts.trigger === "exit"}
          <p class="text-[11px] leading-relaxed text-muted-foreground">When the pointer leaves the window (desktop). On phones, open it from a link or on scroll instead.</p>
        {/if}
        {#if opts.trigger !== "link"}
          <Row name="Shows"><Select size="sm" value={opts.show} options={items(S.POPUP_SHOWS)} onValue={(v: string) => set((o) => ({ ...o, show: v }))} /></Row>
        {/if}
        <Row name="Where"><Select size="sm" value={opts.place} options={items(S.POPUP_PLACES)} onValue={(v: string) => set((o) => ({ ...o, place: v }))} /></Row>
        <Row name="Width"><Select size="sm" value={opts.size} options={items(S.POPUP_SIZES)} onValue={(v: string) => set((o) => ({ ...o, size: v }))} /></Row>
        <p class="text-[11px] leading-relaxed text-muted-foreground" data-popup-link={n.anchor}>
          {n.anchor !== "" ? `Any link or button to #${n.anchor} opens it. On the canvas it shows in place, to edit.` : "Give it an anchor (Advanced) to open it from a link."}
        </p>
        <p class="text-[11px] leading-relaxed text-muted-foreground">To show it on every page, save it as a component and show it at the very top, on every page.</p>
      </div>
    {/if}
  </div>
{/if}
