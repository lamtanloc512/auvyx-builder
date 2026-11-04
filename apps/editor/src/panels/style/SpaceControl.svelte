<script lang="ts">
  // Margin/padding box (U/SpaceControl.scala, Webstudio-style) instead of handles on the canvas.
  //   hover a side → that band is highlighted on the canvas with its px value (spaceHint)
  //   drag a side  → scrub (right/up = more), snaps to spacing tokens; Shift = all sides, Alt = opposite side
  //   click a side → inline editor: value, token chips, which sides to apply to, reset
  // Values: blue = set on this breakpoint, orange = inherited, grey = computed (theme / block CSS).
  import { getStyle, lengthToPx, logicalProperty, scrubValue, shortSpace, spaceLabelAt, spacePolygon, spaceSides, spacingScrub, SIDES, SPACE_H as H, SPACE_MX as Mx, SPACE_MY as My, SPACE_W as W, type Side, type SpaceBox, type SpaceModifiers, type SpacingToken } from "@auvyx/editor-core";
  import { resolveValue, type StateId } from "@auvyx/style-engine";
  import { tick } from "svelte";
  import { drag } from "../../lib/pointer";
  import { spaceHint } from "../../lib/spaceHint.svelte";
  import { store } from "../../lib/store.svelte";
  import { bps, Cursors, Tokens } from "./state.svelte";
  import { onFrame } from "./scrub";

  type Cell = { box: SpaceBox; side: Side };
  type Group = "One" | "Pair" | "All";
  const keyOf = (c: Cell) => `${c.box}-${c.side}`;
  const group = (m: SpaceModifiers): Group => (m.shift ? "All" : m.alt ? "Pair" : "One");
  const modifiers = (g: Group): SpaceModifiers => ({ shift: g === "All", alt: g === "Pair" });
  const cells: Cell[] = (["margin", "padding"] as SpaceBox[]).flatMap((box) => SIDES.map((side) => ({ box, side })));
  const tokens: SpacingToken[] = Tokens.spacing.flatMap((t) => { const px = lengthToPx(t.value, 16); return px === undefined ? [] : [{ slug: t.slug, px }]; });
  const tokenVar = (slug: string) => `var(--wp--preset--spacing--${slug})`;
  const tokenName = (name: string) => name.replace(/^Auvyx /, "").trim();
  const names = Tokens.spacing.map((t) => ({ slug: t.slug, name: t.name }));

  // ---- the selected element's measured box (px), re-measured every frame like the overlay ----
  type Measured = { padding: Record<Side, number>; margin: Record<Side, number>; rtl: boolean };
  const zero = { Top: 0, Right: 0, Bottom: 0, Left: 0 };
  let box = $state<Measured>({ padding: { ...zero }, margin: { ...zero }, rtl: false });
  $effect(() => {
    let raf = 0, last = "";
    const loop = () => {
      const el = store.selected ? store.elements.get(store.selected) : undefined;
      const cs = el?.isConnected ? el.ownerDocument.defaultView?.getComputedStyle(el) : undefined;
      if (cs) {
        const sides = (p: string) => ({ Top: parseFloat(cs.getPropertyValue(`${p}-top`)) || 0, Right: parseFloat(cs.getPropertyValue(`${p}-right`)) || 0, Bottom: parseFloat(cs.getPropertyValue(`${p}-bottom`)) || 0, Left: parseFloat(cs.getPropertyValue(`${p}-left`)) || 0 });
        const next: Measured = { padding: sides("padding"), margin: sides("margin"), rtl: cs.direction === "rtl" };
        const s = JSON.stringify(next);
        if (s !== last) { last = s; box = next; }
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  });
  const measured = (c: Cell) => box[c.box][c.side];
  const propOf = (c: Cell, rtl = box.rtl) => logicalProperty(c.box, c.side, rtl);

  function cellValue(c: Cell): { own?: string; inherited?: string } {
    const n = store.node;
    if (!n) return {};
    const bp = store.breakpoint, st = store.styleState, p = propOf(c);
    const own = getStyle(n.styles, bp, st, p);
    const r = resolveValue(n.styles, bps(), bp, st as StateId, p);
    const inherited = (r && r.breakpointId !== bp ? r.value : undefined) ?? (st !== "default" ? resolveValue(n.styles, bps(), bp, "default", p)?.value : undefined);
    return { own, inherited };
  }

  function write(c: Cell, g: Group, css: string | undefined, key: string) {
    const id = store.selected;
    if (id) store.setStyles(id, spaceSides(c.side, modifiers(g)).map((s) => [logicalProperty(c.box, s, box.rtl), css]), `${key}:${id}`);
  }

  // ---- state ----
  let hovered = $state<[Cell, Group] | null>(null);
  let scrubbing = $state<[Cell, Group, string] | null>(null);
  let editing = $state<[Cell, Group] | null>(null);
  // Highlighted cells (panel) and bands (canvas): the scrubbed, edited or hovered cell plus its modifier group.
  const active = $derived<[Cell, Group] | null>(scrubbing ? [scrubbing[0], scrubbing[1]] : editing ?? hovered);
  const activeKeys = $derived(new Set(active ? spaceSides(active[0].side, modifiers(active[1])).map((s) => keyOf({ box: active[0].box, side: s })) : []));
  $effect(() => {
    const a = active;
    spaceHint.value = a ? { box: a[0].box, sides: spaceSides(a[0].side, modifiers(a[1])) } : null;
  });
  $effect(() => () => { spaceHint.value = null; });

  function startScrub(c: Cell, ev: PointerEvent) {
    if (!store.selected) return;
    ev.preventDefault();
    const [sx, sy] = [ev.clientX, ev.clientY];
    const start = measured(c);
    const key = `space${Date.now()}`;
    const rtl = box.rtl;
    let moved = false;
    const cursor = c.side === "Top" || c.side === "Bottom" ? Cursors.ns : Cursors.ew;
    drag(cursor, (e) => {
      const [dx, dy] = [e.x - sx, e.y - sy];
      if (moved || Math.abs(dx) + Math.abs(dy) > 3) {
        moved = true;
        const m = { shift: e.shift, alt: e.alt, meta: e.meta };
        // Right and up mean "more", whatever the side.
        const result = spacingScrub(c.box, c.side, start, Math.round(dx - dy), m, rtl, tokens);
        const id = store.selected;
        if (id) onFrame(() => store.setStyles(id, result.patch, `${key}:${id}`));
        scrubbing = [c, group(m), result.label];
      }
    }, (e) => {
      scrubbing = null;
      if (!moved) { editing = [c, group({ shift: e.shift, alt: e.alt })]; openEditor(); }
    }, () => (scrubbing = null));
  }

  // ---- the inline editor ----
  let g = $state<Group>("One");
  let draft = $state<string | null>(null);
  let input = $state<HTMLInputElement>();
  function openEditor() {
    g = editing?.[1] ?? "One";
    draft = null;
    tick().then(() => input?.focus());
  }
  const put = (c: Cell, css: string | undefined, key: string) => write(c, g, css, key);
  const close = () => (editing = null);
  const sideName = (c: Cell) => c.side.toLowerCase();
  const chips: [string, string][] = [["0", "0"], ...Tokens.spacing.map((t) => [tokenName(t.name), tokenVar(t.slug)] as [string, string])];
  const chipPx = (css: string) => { const t = Tokens.spacing.find((t) => tokenVar(t.slug) === css); const p = t ? lengthToPx(t.value, 16) : undefined; return p === undefined ? "0" : String(Math.round(p)); };
</script>

<div class="flex flex-col gap-2">
  <div class="relative mx-auto select-none" style:width="{W}px" style:height="{H}px">
    <svg class="absolute inset-0 overflow-visible" width={W} height={H}>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="4" stroke-dasharray="3 2" class="fill-none stroke-border" />
      <rect x={Mx} y={My} width={W - 2 * Mx} height={H - 2 * My} rx="3" class="fill-none stroke-border" />
      {#each cells as c (keyOf(c))}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <polygon points={spacePolygon(c.box, c.side)} data-space={keyOf(c)}
          class={[c.side === "Top" || c.side === "Bottom" ? "cursor-ns-resize" : "cursor-ew-resize", "transition-colors",
            activeKeys.has(keyOf(c)) ? (c.box === "padding" ? "fill-pink-500/25" : "fill-orange-400/30") : c.box === "padding" ? "fill-muted/60 hover:fill-muted" : "fill-transparent hover:fill-muted/60"]}
          onmouseenter={(e) => (hovered = [c, group({ shift: e.shiftKey, alt: e.altKey })])}
          onmousemove={(e) => { if (!scrubbing) hovered = [c, group({ shift: e.shiftKey, alt: e.altKey })]; }}
          onmouseleave={() => (hovered = null)}
          onpointerdown={(e) => startScrub(c, e)} />
      {/each}
      <rect x={2 * Mx} y={2 * My} width={W - 4 * Mx} height={H - 4 * My} rx="2" class="fill-background stroke-border" />
    </svg>
    <span class="pointer-events-none absolute top-1 left-1.5 text-[9px] font-medium tracking-wide text-muted-foreground uppercase">Margin</span>
    <span class="pointer-events-none absolute text-[9px] font-medium tracking-wide text-muted-foreground uppercase" style:left="{Mx + 5}px" style:top="{My + 3}px">Padding</span>
    {#each cells as c (keyOf(c))}
      {@const v = cellValue(c)}
      {@const [lx, ly] = spaceLabelAt(c.box, c.side)}
      {@const x = v.own ?? v.inherited}
      <div class={["pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-mono text-[10px] leading-none whitespace-nowrap", v.own !== undefined ? "font-semibold text-blue-600" : v.inherited !== undefined ? "text-orange-600" : "text-muted-foreground"]}
        style:left="{lx}px" style:top="{ly}px">{x === undefined ? `${Math.round(measured(c))}` : shortSpace(x, measured(c), names)}</div>
    {/each}
    <!-- readout in the content box while scrubbing -->
    <div class="pointer-events-none absolute flex items-center justify-center px-1 text-center text-[10px] leading-tight text-foreground"
      style:left="{2 * Mx}px" style:top="{2 * My}px" style:width="{W - 4 * Mx}px" style:height="{H - 4 * My}px">{scrubbing ? scrubbing[2].split(" · ").at(-1) ?? "" : ""}</div>
  </div>
  {#if !editing}
    <p class="text-center text-[10px] leading-snug text-muted-foreground">Drag a side to change, click to type. Shift: all sides · Alt: opposite side</p>
  {:else}
    {@const c = editing[0]}
    {@const v = cellValue(c)}
    <div class="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-2">
      <div class="flex items-center gap-1.5">
        <span class={`text-[11px] font-medium ${c.box === "padding" ? "text-pink-600" : "text-orange-600"}`}>{`${c.box.charAt(0).toUpperCase()}${c.box.slice(1)} ${sideName(c)}`}</span>
        <div class="flex-1"></div>
        <button class="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground" onclick={() => { put(c, undefined, "reset"); close(); }}>Reset</button>
        <button class="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground" onclick={close}>Done</button>
      </div>
      <input bind:this={input} class="h-7 w-full rounded-md border border-input bg-background px-2 font-mono text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
        placeholder={v.inherited ?? `${Math.round(measured(c))}px`} value={draft ?? v.own ?? ""}
        oninput={(e) => { const s = e.currentTarget.value; draft = s; const t = s.trim(); put(c, t ? (t !== "" && !isNaN(Number(t)) ? `${t}px` : t) : undefined, "type"); }}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") close();
          else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const step = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1);
            const next = scrubValue(v.own, v.inherited ?? `${Math.round(measured(c))}px`, step, { min: c.box === "padding" ? 0 : undefined });
            draft = next;
            put(c, next, "step");
          }
        }} />
      <!-- spacing tokens (theme.json presets): one click, consistent rhythm -->
      <div class="flex flex-wrap gap-1">
        {#each chips as [name, css] (name)}
          <button class={["flex h-7 min-w-9 flex-col items-center justify-center rounded-md border border-input bg-background px-1.5 leading-none hover:border-primary", v.own === css && "border-primary bg-primary/10 text-primary"]}
            title={css} onclick={() => { draft = null; put(c, css, "token"); }}>
            <span class="text-[11px] font-medium">{name}</span>
            <span class="text-[9px] text-muted-foreground">{chipPx(css)}</span>
          </button>
        {/each}
      </div>
      <!-- which sides: the Alt/Shift shortcuts, made visible -->
      <div class="flex gap-0.5 rounded-md bg-muted/70 p-0.5">
        {#each [["One", sideName(c).charAt(0).toUpperCase() + sideName(c).slice(1)], ["Pair", c.side === "Top" || c.side === "Bottom" ? "Top + bottom" : "Left + right"], ["All", "All sides"]] as [grp, label] (grp)}
          <button class={["h-6 flex-1 rounded-sm text-[11px] text-muted-foreground hover:text-foreground", g === grp && "bg-background text-foreground shadow-sm"]}
            onclick={() => {
              g = grp as Group;
              if (editing) editing = [editing[0], g];
              // apply the current value to the newly included sides
              if (v.own !== undefined) put(c, v.own, "group");
            }}>{label}</button>
        {/each}
      </div>
    </div>
  {/if}
</div>
