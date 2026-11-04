<script lang="ts">
  // The Elements panel (U/AddPanel.scala): Widgets | Sections | Components | Globals, search, collapsible groups.
  // Click inserts; drag places it on the canvas. Templates come from the Scala catalog's patterns (lib/templates.ts).
  import type { Snippet } from "svelte";
  import { Button, Icon, Input, TabsStateful } from "../ui/kit";
  import type { IconName } from "../ui/icons";
  import { builtins, buildRow, categories, readFavorites, rowPresets, writeFavorites, type Def } from "../lib/elements";
  import {
    BANNERS, PAGE_LAYOUTS, PARTS, PART_ELEMENTS, SECTION_LIBRARY, available, byId, dragTree, edition, headerPiece, insertLayout, insertTemplate,
    layoutComplete, layoutMarkup, layoutTemplates, load, markupOf, templates, type PageLayout, type Template,
  } from "../lib/templates";
  import { session, type Feature } from "../lib/session.svelte";
  import { frameWidth, thumbnail } from "../lib/templates.preview";
  import { dnd } from "../lib/dnd.svelte";
  import { store } from "../lib/store.svelte";

  const picked = new URLSearchParams(location.search).get("elements") ?? "";
  let tab = $state(["widgets", "sections", "components", "globals"].includes(picked) ? picked : "widgets");
  let query = $state("");
  let rowPicker = $state(false);
  let favorites = $state<string[]>(readFavorites());
  const open = $state<Record<string, boolean>>({});

  // ProLock.ask: Auvyx Builder Pro installed without its licence (the Inspector's Pro dialog). Without Pro, its tiles are not here.
  const ask = (f: Feature) => session.ask(f);

  const all = builtins(ask);
  // the templates' markup, for drags and thumbnails (one chunk)
  load();

  const placeholder = $derived(tab === "components" ? "Search components…" : tab === "sections" ? "Search sections…" : tab === "globals" ? "Search globals…" : "Search widgets…");
  const ql = $derived(query.toLowerCase());
  const shown = (label: string) => !ql || label.toLowerCase().includes(ql);
  const hits = $derived(all.filter((d) => !ql || d.title.toLowerCase().includes(ql) || d.keywords.some((k) => k.toLowerCase().includes(ql)) || d.id.includes(ql)));
  const favs = $derived(favorites.map((id) => hits.find((d) => d.id === id)).filter(Boolean) as Def[]);
  const byCategory = $derived(categories.map((c) => [c, hits.filter((d) => d.category === c.id)] as const).filter(([, ds]) => ds.length));
  const isOpen = (id: string, dflt = id !== "widgets") => !!query || (open[id] ?? dflt);

  // Sections: SectionLibrary's categories
  const library = $derived(SECTION_LIBRARY.map((cat) => [cat.title, cat.ids.map(byId).filter((t): t is Template =>
    !!t && available(t) && (!ql || shown(cat.title) || shown(t.title) || shown(t.description)))] as const));
  // Components: page layouts, banners, rows
  const pages = $derived(PAGE_LAYOUTS.filter((l) => layoutComplete(l) && layoutTemplates(l).every(available) && (shown(l.title) || shown(l.description))));
  const banners = $derived(BANNERS.map(byId).filter((t): t is Template => !!t && (shown(t.title) || shown(t.description))));
  const rows = $derived(templates.filter((t) => t.group === "Layout" && available(t) && (shown(t.title) || shown(t.description))));
  // Globals: header and footer parts
  const partsOf = (category: string) => templates.filter((t) => t.category === category && t.id.includes("-part-") && !headerPiece(t) && available(t) && (shown(t.title) || shown(t.description)));
  const parts = $derived(partsOf(PARTS));
  const partElements = $derived(partsOf(PART_ELEMENTS));

  function toggleFavorite(id: string) {
    favorites = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    writeFavorites(favorites);
  }
  function wheel(e: WheelEvent) {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); el.scrollLeft += e.deltaY; }
  }
  const armTemplate = (t: Template, ev: PointerEvent) => dnd.arm({ tree: dragTree(t), label: t.title, section: t.group === "Section" }, ev);
  const defTitle = (d: Def) => (d.pro ? `${d.hint || d.title} (Auvyx Builder Pro)` : d.hint ? d.hint : d.drag ? "Click to insert, or drag onto the canvas" : "Click to insert");
  /** AddPanel.tplIcon. */
  const tplIcon = (id: string): IconName => {
    const m: Record<string, IconName> = {
      "banner-box": "image", "banner-slider": "slides", hotspot: "plus", "shop-the-look": "bag", gallery: "grid", popup: "square", counter: "chart",
      progress: "minus", "star-rating": "star", "icon-list": "menu", alert: "help", toc: "menu", share: "share", "flip-box": "repeat", "before-after": "image",
      marquee: "slides", map: "search", breadcrumbs: "text", search: "search", "product-search": "search", "icon-box": "star", "price-card": "price",
      pricing: "price", testimonial: "quote", "team-member": "user", team: "user", stat: "chart", stats: "chart", "follow-icons": "share", buttons: "button",
      "title-divider": "minus", "faq-item": "help", faq: "help", logo: "text", logos: "text",
    };
    return m[id] ?? (id.startsWith("row-") ? "columns3" : "layoutTemplate");
  };
  // the strip brings the chosen tab into view
  $effect(() => {
    const v = tab;
    requestAnimationFrame(() => document.querySelector(`[data-add-tabs] [data-value="${v}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  });
</script>

{#snippet mark(icon: IconName)}
  <span class="flex size-8 shrink-0 items-center justify-center text-foreground [&_svg]:overflow-visible"><Icon name={icon} size={18} /></span>
{/snippet}

{#snippet badge()}
  <span class="ml-auto shrink-0 rounded-sm bg-violet-600/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300" data-pro-badge="">Pro</span>
{/snippet}

{#snippet tile(d: Def)}
  {#if d.id === "row"}
    <div class={["flex min-h-9 cursor-grab items-center gap-2 rounded-md border border-border bg-background px-1.5 py-1 text-left active:cursor-grabbing hover:border-ring", rowPicker && "border-ring"]}
      title="Click to pick a column preset, or drag onto the canvas" data-add="Row" role="button" tabindex="0"
      onpointerdown={(ev) => d.drag && dnd.arm(d.drag, ev)} onclick={() => { if (dnd.takeClick()) rowPicker = !rowPicker; }} onkeydown={(e) => e.key === "Enter" && (rowPicker = !rowPicker)}>
      {@render mark("columns3")}<span class="text-xs leading-tight">Row</span>
    </div>
    {#if rowPicker || query}
      <div class="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-2" data-row-presets="1">
        <span class="px-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Presets</span>
        <div class="grid grid-cols-3 gap-1.5">
          {#each rowPresets as [label, weights] (label)}
            <button type="button" class="flex flex-col items-center gap-1.5 rounded-md border border-transparent bg-background p-2 hover:border-ring" title={label} data-preset={label}
              onclick={() => { const [r, x] = buildRow(weights); store.insertTree(r, x); rowPicker = false; }}>
              <span class="flex h-7 w-full gap-px">{#each weights as w, i (i)}<span class="h-full rounded-[2px] bg-muted-foreground/35" style:flex-grow={w}></span>{/each}</span>
              <span class="text-[10px] leading-tight text-muted-foreground">{label}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {:else}
    <div class={["group/tile relative flex min-h-9 items-center gap-2 rounded-md border border-border bg-background px-1.5 py-1 pr-6 text-left hover:border-ring", d.drag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"]}
      title={defTitle(d)} {...(d.data ? { [`data-${d.data[0]}`]: d.data[1] } : {})} data-element={d.id} role="button" tabindex="0"
      onpointerdown={(ev) => { if (!d.pro && d.drag) dnd.arm(d.drag, ev); }} onclick={() => { if (!d.drag || dnd.takeClick() || d.pro) d.insert(); }} onkeydown={(e) => e.key === "Enter" && d.insert()}>
      {@render mark(d.icon)}
      <span class="min-w-0 truncate text-xs leading-tight" data-tile-name="1">{d.title}</span>
      {#if d.pro}{@render badge()}{/if}
      <button type="button" class={["absolute top-1/2 right-1 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/tile:opacity-100 hover:text-foreground", favorites.includes(d.id) && "opacity-100 text-amber-500"]}
        title="Keep in Favorites" data-favorite={d.id} onpointerdown={(e) => e.stopPropagation()} onclick={(e) => { e.stopPropagation(); toggleFavorite(d.id); }}><Icon name="star" size={12} /></button>
    </div>
  {/if}
{/snippet}

<!-- AddPanel.group: a ghost button that folds its cards -->
{#snippet group(id: string, title: string, count: number, cards: Snippet, dflt?: boolean)}
  {#if count}
    <div class="flex flex-col gap-3">
      <Button variant="ghost" size="sm" class="h-9 w-full justify-start gap-2 px-1 font-semibold" aria-expanded={isOpen(id, dflt)} onclick={() => (open[id] = !isOpen(id, dflt))}>
        <Icon name="chevronRight" size={14} class={["text-muted-foreground", isOpen(id, dflt) && "rotate-90"].filter(Boolean).join(" ")} />{title}
      </Button>
      {#if isOpen(id, dflt)}<div class="grid grid-cols-1 gap-1">{@render cards()}</div>{/if}
    </div>
  {/if}
{/snippet}

{#snippet defGroup(id: string, title: string, ds: Def[])}
  {#snippet cards()}{#each ds as d (d.id)}{@render tile(d)}{/each}{/snippet}
  {@render group(id, title, ds.length, cards)}
{/snippet}

<!-- TemplatePreview: the template drawn small, as tall as its content (capped) -->
{#snippet preview(key: string, markup: () => string | null, width: number, padded: boolean, maxHeight: number)}
  <div class="relative w-full overflow-hidden rounded-md bg-white ring-1 ring-black/5" {@attach thumbnail({ key, markup, width, padded, maxHeight })}></div>
{/snippet}

{#snippet templateCard(t: Template)}
  <button type="button" class="flex cursor-grab flex-col gap-2 rounded-lg border border-border bg-background p-2 text-left active:cursor-grabbing hover:border-ring"
    title="Click to insert, or drag onto the canvas" data-template={t.id}
    onpointerdown={(ev) => armTemplate(t, ev)} onclick={() => { if (dnd.takeClick()) insertTemplate(t, ask); }}>
    {@render preview(t.id, () => markupOf(t), frameWidth(t.group), t.group !== "Section", 88)}
    <div class="px-1 pb-1">
      <div class="flex items-center gap-1 text-xs font-medium">{t.title}</div>
      <div class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{t.description}</div>
    </div>
  </button>
{/snippet}

{#snippet templateCards(ts: Template[])}{#each ts as t (t.id)}{@render templateCard(t)}{/each}{/snippet}

<!-- AddPanel.tplTile: a template as a small tile -->
{#snippet tplTile(t: Template)}
  <div class="flex min-h-9 cursor-grab items-center gap-2 rounded-md border border-border bg-background px-1.5 py-1 text-left active:cursor-grabbing hover:border-ring"
    title={t.description} data-add-tpl={t.id} role="button" tabindex="0"
    onpointerdown={(ev) => armTemplate(t, ev)} onclick={() => { if (dnd.takeClick()) insertTemplate(t); }} onkeydown={(e) => e.key === "Enter" && insertTemplate(t)}>
    {@render mark(tplIcon(t.id))}
    <span class="text-xs leading-tight">{t.title}</span>
  </div>
{/snippet}

{#snippet layoutCard(l: PageLayout)}
  <button type="button" class="flex flex-col gap-2 rounded-lg border border-border bg-background p-2 text-left hover:border-ring"
    title="Add this whole page (one undo step)" data-page-layout={l.id} onclick={() => insertLayout(l, ask)}>
    {@render preview(`layout:${l.id}`, () => layoutMarkup(l), 1280, false, 180)}
    <div class="px-1 pb-1"><div class="text-xs font-medium">{l.title}</div><div class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{l.description}</div></div>
  </button>
{/snippet}

{#snippet empty()}<div></div>{/snippet}

<div class="flex flex-col gap-5 p-4 text-xs">
  <TabsStateful bind:value={tab} listVariant="line"
    listProps={{ class: "w-full overflow-x-auto pb-1.5 [scrollbar-width:none]", style: "justify-content:flex-start", "data-add-tabs": "1", onwheel: wheel } as Record<string, unknown>}
    tabs={[{ value: "widgets", label: "Widgets", panel: empty }, { value: "sections", label: "Sections", panel: empty }, { value: "components", label: "Components", panel: empty }, { value: "globals", label: "Globals", panel: empty }]} />
  <div class="relative">
    <Icon name="search" size={14} class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-muted-foreground" />
    <Input class="h-9 text-xs" style="padding-left:2.25rem" {placeholder} bind:value={query} />
  </div>
  {#if tab === "widgets"}
    <div class="flex flex-col gap-4" data-add-groups="1">
      {#if !hits.length}<p class="text-[11px] text-muted-foreground">Nothing matches.</p>{/if}
      {@render defGroup("favorites", "Favorites", favs)}
      {#each byCategory as [c, ds] (c.id)}{@render defGroup(c.id, c.title, [...ds])}{/each}
    </div>
  {:else if tab === "sections"}
    <!-- Relume-style library: categories, a live thumbnail, and a page-level insert -->
    <div class="flex flex-col gap-5" data-section-library="1">
      {#each library as [title, cards] (title)}
        {#snippet these()}{@render templateCards(cards)}{/snippet}
        {@render group(`section:${title}`, title, cards.length, these, true)}
      {/each}
      {#if !edition.pro}
        <!-- The one place the free editor names Auvyx Builder Pro (docs/editions.md): no locked tiles, no nag elsewhere. -->
        <p class="text-[11px] leading-snug text-muted-foreground" data-pro-more="">More section kits and blocks come with
          <a class="underline underline-offset-2 hover:text-foreground" href={edition.upgradeUrl} target="_blank" rel="noopener">Auvyx Builder Pro</a>.</p>
      {/if}
    </div>
  {:else if tab === "components"}
    <div class="flex flex-col gap-4">
      {#snippet layouts()}{#each pages as l (l.id)}{@render layoutCard(l)}{/each}{/snippet}
      {#snippet bannerCards()}{@render templateCards(banners)}{/snippet}
      {#snippet rowCards()}{@render templateCards(rows)}{/snippet}
      {@render group("components:pages", "Page layouts", pages.length, layouts, true)}
      {@render group("components:banners", "Banners", banners.length, bannerCards, true)}
      {@render group("components:rows", "Rows", rows.length, rowCards, true)}
      <Button variant="secondary" class="h-10 w-full justify-between" onclick={() => (store.leftPanel = "assets")}>Sections and blocks<Icon name="chevronRight" size={14} /></Button>
    </div>
  {:else}
    <div class="flex flex-col gap-4" data-site-parts="1">
      {#if !parts.length && !partElements.length}<p class="text-[11px] text-muted-foreground">No header or footer parts match.</p>{/if}
      {#snippet partCards()}{@render templateCards(parts)}{/snippet}
      {#snippet elementTiles()}{#each partElements as t (t.id)}{@render tplTile(t)}{/each}{/snippet}
      {@render group("globals:parts", "Header & footer", parts.length, partCards, true)}
      <!-- Flatsome's header builder elements: drop them into a header row -->
      {@render group("globals:elements", "Header elements", partElements.length, elementTiles, true)}
    </div>
  {/if}
</div>
