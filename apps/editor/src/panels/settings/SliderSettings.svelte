<script lang="ts">
  // Flatsome's Slider options on a slider (SettingsPanel.sliderSettings): a section that scroll-snaps sideways, its
  // children the slides. Behaviour is class tokens on the slider (SliderOptions); size is written into every slide at
  // once, one undo step.
  import { Settings as S, ancestors, getStyle, update, type El } from "@auvyx/editor-core";
  import { Icon } from "../../ui/kit";
  import type { IconName } from "../../ui/icons";
  import { store } from "../../lib/store.svelte";
  import { decode, nameOf } from "../../lib/labels";
  import { BASE, SMALL, breakpoints, duplicateOne } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  import Seg from "./Seg.svelte";

  let { id }: { id: string } = $props();
  const n = $derived(store.doc.nodes[id]);
  const track = $derived(n ? S.isTrack(n, breakpoints(), store.breakpoint) : false);

  const slidesOf = (x: El) => x.children.map((c) => store.doc.nodes[c]).filter((c): c is El => !!c);
  const common = (x: El, prop: string) => { const vs = [...new Set(slidesOf(x).map((s) => getStyle(s.styles, BASE, "default", prop)))]; return vs.length === 1 ? vs[0] : undefined; };
  const gapOf = (x: El) => getStyle(x.styles, BASE, "default", "gap") ?? "0px";
  const perOf = (x: El) => S.perViewOf(common(x, "flex"));
  const opts = $derived(n ? S.readSlider(n.className) : S.SLIDER_DEFAULTS);
  const layout = $derived(n ? S.sliderLayoutOf(opts, perOf(n)) : "Single");

  function setOpts(f: (o: S.SliderOpts) => S.SliderOpts) {
    store.updateNode(id, (x) => ({ ...x, className: S.writeSlider(x.className, f(S.readSlider(x.className))) }), `slider-opts:${id}`);
  }
  /** Size every slide, the slider's gap and (Focus) its side padding, plus its options, in one commit. */
  function reshape(per: number, gap: string, height: string | undefined, o: (x: S.SliderOpts) => S.SliderOpts = (x) => x) {
    const doc = store.doc;
    const cur = doc.nodes[id];
    if (!cur) return;
    const next0 = o(S.readSlider(cur.className));
    const focus = next0.focus;
    const withTrack = update(doc, id, (t) => ({ ...t, className: S.writeSlider(t.className, next0), styles: S.setStyles(t.styles, BASE, "default", [["gap", gap], ["padding-inline", focus ? S.FOCUS_SIDE : undefined]]) }));
    const next = cur.children.reduce((d, sid) => update(d, sid, (sl) => {
      const desk = S.setStyles(sl.styles, BASE, "default", S.slidePatch(per, gap, height, focus));
      // Phones show one slide at a time.
      return { ...sl, styles: S.setStyles(desk, SMALL, "default", [["flex", per > 1 && !focus ? "0 0 100%" : undefined]]) };
    }), withTrack);
    store.commit(next);
  }
  function pickLayout(l: S.SliderLayout) {
    const cur = store.doc.nodes[id];
    if (!cur) return;
    reshape(l === "Multiple" ? Math.max(perOf(cur), 3) : 1, gapOf(cur), undefined, (o) => S.withSliderLayout(o, l));
  }
  /** Plays the entrance on the slide in view (the canvas has no slider script): what the page does on each slide. */
  function previewEnter() {
    const t = store.elements.get(id), cur = store.doc.nodes[id];
    if (!t || !cur) return;
    const els = cur.children.map((c) => store.elements.get(c)).filter((e): e is HTMLElement => !!e);
    const left = t.scrollLeft;
    const el = els.reduce<HTMLElement | null>((best, e) => (!best || Math.abs(e.offsetLeft - t.offsetLeft - left) < Math.abs(best.offsetLeft - t.offsetLeft - left) ? e : best), null);
    if (!el) return;
    const body = t.ownerDocument.body;
    els.forEach((e) => e.classList.remove("is-active"));
    body.classList.add("auvyx-slider-ready");
    el.classList.add("is-active");
    setTimeout(() => { el.classList.remove("is-active"); body.classList.remove("auvyx-slider-ready"); }, 1600);
  }
  const slideTitle = (s: El): string => {
    const walk = (e: El): string | undefined => (e.kind === "Heading" ? decode(e.text) : e.children.map((c) => store.doc.nodes[c]).filter((c): c is El => !!c).map(walk).find((x) => x !== undefined));
    return walk(s) ?? nameOf(s);
  };
  const rootOf = (i: string) => store.doc.nodes[[i, ...ancestors(store.doc, i)].at(-1)!];
  function setWidth(full: boolean) {
    const r = rootOf(id);
    if (!r) return;
    store.commit(update(store.doc, r.id, (x) => ({ ...x, align: full ? "full" : "", styles: r.id === id ? x.styles : S.setStyles(x.styles, BASE, "default", [["padding-inline", full ? "0" : undefined]]) })));
  }
  function videoOf(sid: string) {
    store.selected = sid;
    setTimeout(() => { const el = document.querySelector<HTMLElement>("[data-bg-video] input"); if (el) { el.scrollIntoView(false); el.focus(); } }, 120);
  }
  const MINI = "flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";
</script>

{#snippet mini(icon: IconName, tip: string, enabled: boolean, run: () => void, extra = "", data: Record<string, string> = {})}
  <button type="button" class="{MINI} {extra}" title={tip} aria-label={tip} disabled={!enabled} {...data} onclick={(e) => { e.stopPropagation(); run(); }}><Icon name={icon} size={13} /></button>
{/snippet}

<div>
  {#if n && track}
    <div class="flex flex-col gap-2 rounded-md border border-border p-2" data-slider-settings="1">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-semibold">Slider</span>
        <span class="text-[11px] text-muted-foreground">{n.children.length} slides</span>
      </div>
      <!-- The slides: pick one to edit it, copy or delete it (Flatsome's slide list). -->
      <div class="flex flex-col gap-0.5" data-slider-slides="1">
        {#each slidesOf(n) as s, i (s.id)}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="group flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-1.5 hover:bg-muted" data-slide-row={String(i + 1)} onclick={() => (store.selected = s.id)}>
            <span class="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] tabular-nums">{i + 1}</span>
            <span class="min-w-0 flex-1 truncate text-[11px]">{slideTitle(s)}</span>
            {@render mini("play", "Background video for this slide", true, () => videoOf(s.id), "", { "data-slide-video": String(i + 1) })}
            {@render mini("copy", "Duplicate slide", true, () => duplicateOne(s.id))}
            {@render mini("trash", "Delete slide", n.children.length > 1, () => store.remove(s.id), "hover:bg-red-50 hover:text-red-600", { "data-slide-delete": String(i + 1) })}
          </div>
        {/each}
      </div>
      <button type="button" class="h-7 rounded-md border border-dashed border-input text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground" data-slider-add="1"
        onclick={() => { const last = store.doc.nodes[id]?.children.at(-1); if (last) duplicateOne(last); }}>+ Add slide</button>

      <span class="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Layout</span>
      <Row name="Type"><Seg options={S.SLIDER_LAYOUTS.map((l) => [l, l] as [S.SliderLayout, string])} active={layout} attr="layout" pick={pickLayout} /></Row>
      <div>{#if layout === "Multiple"}<Row name="Per view"><Seg options={S.PER_VIEW_CHOICES.map((p) => [p, String(p)] as [number, string])} active={perOf(n)} attr="per-view" pick={(p) => reshape(p, gapOf(n), undefined)} /></Row>{/if}</div>
      <!-- Edge to edge: the page-level section holding the slider breaks out of the content column, without side padding. -->
      <Row name="Width"><Seg options={[[false, "Content"], [true, "Full width"]]} active={rootOf(n.id)?.align === "full"} attr="width" pick={setWidth} /></Row>
      <Row name="Height"><Seg options={S.HEIGHT_CHOICES} active={common(n, "min-height")} attr="height" pick={(h) => reshape(perOf(n), gapOf(n), h)} /></Row>
      <Row name="Gap"><Seg options={[["0px", "0"], ["8px", "S"], ["16px", "M"], ["24px", "L"]]} active={gapOf(n) === "0" ? "0px" : gapOf(n)} attr="gap" pick={(g) => reshape(perOf(n), g, undefined)} /></Row>

      <span class="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Animation</span>
      <div>{#if layout === "Single" || layout === "Gallery"}<Row name="Transition"><Seg options={[[false, "Slide"], [true, "Fade"]]} active={opts.fade} attr="transition" pick={(f) => setOpts((o) => ({ ...o, fade: f }))} /></Row>{/if}</div>
      <div>
        {#if layout !== "Multiple"}
          <Row name="Content">
            <div class="flex flex-col gap-1">
              <Seg options={S.SLIDER_ENTERS} active={opts.enter} attr="enter" layout="grid grid-cols-4" pick={(e) => { setOpts((o) => ({ ...o, enter: e })); if (e) setTimeout(previewEnter, 60); }} />
              <div>{#if opts.enter}<button type="button" class="self-start text-[11px] text-primary hover:underline" data-enter-preview="1" onclick={previewEnter}>▶ Play on the canvas</button>{/if}</div>
            </div>
          </Row>
        {/if}
      </div>
      <Row name="Autoplay"><Seg options={S.AUTOPLAY_CHOICES.map((a) => [a, a === 0 ? "Off" : `${a}s`] as [number, string])} active={opts.autoplay} attr="autoplay" pick={(a) => setOpts((o) => ({ ...o, autoplay: a }))} /></Row>
      <Row name="Loop"><Seg options={[[true, "On"], [false, "Off"]]} active={opts.loop} attr="loop" pick={(l) => setOpts((o) => ({ ...o, loop: l }))} /></Row>

      <span class="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Navigation</span>
      <Row name="Arrows"><Seg options={[["", "Hide"], ["circle", "Circle"], ["simple", "Simple"]]} active={opts.arrows ? opts.arrowStyle : ""} attr="arrows"
        pick={(a) => setOpts((x) => (a === "" ? { ...x, arrows: false } : { ...x, arrows: true, arrowStyle: a }))} /></Row>
      <div>{#if layout !== "Gallery"}<Row name="Dots"><Seg options={[["", "Hide"], ["dots", "Dots"], ["dashes", "Dashes"]]} active={opts.dots ? opts.dotStyle : ""} attr="dots"
          pick={(d) => setOpts((x) => (d === "" ? { ...x, dots: false } : { ...x, dots: true, dotStyle: d }))} /></Row>{/if}</div>
      <Row name="Colour"><Seg options={[[false, "Light"], [true, "Dark"]]} active={opts.dark} attr="nav-colour" pick={(d) => setOpts((o) => ({ ...o, dark: d }))} /></Row>
      <Row name="Position"><Seg options={[[false, "Inside"], [true, "Outside"]]} active={opts.outside} attr="nav-position" pick={(p) => setOpts((o) => ({ ...o, outside: p }))} /></Row>
      <p class="text-[11px] leading-relaxed text-muted-foreground">Each slide is a Banner: click it to edit its picture, text and button. Arrows, dots, thumbnails, fade, autoplay and the content animation run on the published page (Preview); the canvas keeps slides side by side for editing.</p>
    </div>
  {/if}
</div>
