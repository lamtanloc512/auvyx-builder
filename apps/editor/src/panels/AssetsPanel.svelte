<script lang="ts">
  // Assets (U/AssetsPanel.scala), Figma-style: the site's patterns and components, the theme's sections, and the kits as
  // big cover cards; inside a kit, every section/block with a live thumbnail. Click inserts, drag places it on the canvas.
  import { Icon } from "../ui/kit";
  import { config } from "../lib/config";
  import { library } from "../lib/library.svelte";
  import { dnd } from "../lib/dnd.svelte";
  import { session, type Feature } from "../lib/session.svelte";
  import { assetsKit } from "../lib/products.svelte";
  import { available, dragTree, insertTemplate, load, markupOf, templates, type Group, type Template } from "../lib/templates";
  import { frameWidth, thumbnail } from "../lib/templates.preview";

  let query = $state("");
  let group = $state<Group>("Section");
  library.ensure();
  void load();
  const patterns = ((config.patterns ?? []) as unknown as { slug: string; title: string; description?: string }[]).slice(0, 30);
  const rowCls = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted";
  const ask = (f: Feature) => session.ask(f); // Pro installed without its licence
  // Templates.kits order (the Scala catalog), then kits an add-on brings, Starter last; only kits this site can build
  const KIT_ORDER = ["EzyPlatform", "Skeleton", "Editorial", "Maison", "Bento", "Product display", "Geometric", "Bloom", "Serene", "Academy", "Atelier", "Electronics", "Beauty", "Appoint", "Unfold", "Haven", "Harbour & Hill", "Timber", "Library"];
  const usable = templates.filter(available);
  const kitNames = [...KIT_ORDER, ...new Set(usable.map((t) => t.kit).filter((k) => !KIT_ORDER.includes(k) && k !== "Starter")), "Starter"].filter((k) => usable.some((t) => t.kit === k));
  const hits = $derived(query.trim() ? usable.filter((t) => `${t.title} ${t.category} ${t.description} ${t.kit}`.toLowerCase().includes(query.trim().toLowerCase())) : []);
  const inKit = $derived(assetsKit.kit ? usable.filter((t) => t.kit === assetsKit.kit && (t.group === group || (group === "Block" && t.group === "Layout"))) : []);
  const open = (name: string) => { assetsKit.kit = name; group = "Section"; };
</script>

<!-- TemplatePreview -->
{#snippet preview(t: Template, maxHeight: number)}
  <div class="relative w-full overflow-hidden rounded-md bg-white ring-1 ring-black/5" {@attach thumbnail({ key: t.id, markup: () => markupOf(t), width: frameWidth(t.group), padded: t.group !== "Section", maxHeight })}></div>
{/snippet}

{#snippet card(t: Template)}
  <div class="group flex cursor-grab flex-col gap-1.5 active:cursor-grabbing" title="Click to insert, or drag onto the canvas" data-template={t.id} role="button" tabindex="0"
    onpointerdown={(ev) => dnd.arm({ tree: dragTree(t), label: t.title, section: t.group === "Section" }, ev)}
    onclick={() => { if (dnd.takeClick()) void insertTemplate(t, ask); }} onkeydown={(e) => e.key === "Enter" && void insertTemplate(t, ask)}>
    <div class="rounded-lg p-0.5 ring-blue-600 group-hover:ring-2">{@render preview(t, 420)}</div>
    <div class="flex items-baseline justify-between gap-2 px-0.5">
      <span class="truncate text-xs font-medium">{t.title}</span>
      <span class="shrink-0 text-[10px] text-muted-foreground">{t.category}</span>
    </div>
  </div>
{/snippet}

{#snippet kitCover(name: string)}
  {@const items = usable.filter((t) => t.kit === name)}
  {@const cover = items.find((t) => t.group === "Section")}
  <button type="button" class="flex w-full flex-col gap-2 rounded-xl bg-muted/60 p-2 text-left hover:bg-muted" data-kit={name} onclick={() => open(name)}>
    {#if cover}{@render preview(cover, 200)}{/if}
    <div class="px-1 pb-1">
      <div class="text-[13px] font-semibold">{name}</div>
      <div class="text-[11px] text-muted-foreground">{items.filter((t) => t.group === "Section").length} sections · {items.filter((t) => t.group !== "Section").length} blocks</div>
    </div>
  </button>
{/snippet}

<div class="flex flex-col gap-3 p-3 text-xs">
  <div class="flex h-8 items-center gap-2 rounded-md bg-muted/70 px-2.5 ring-ring/50 focus-within:bg-background focus-within:ring-1">
    <Icon name="search" size={14} class="text-muted-foreground" />
    <input class="h-full w-full bg-transparent text-xs outline-none" placeholder="Search all kits" bind:value={query} />
  </div>
  {#if query.trim()}
    <div class="flex flex-col gap-4">
      <p class="text-muted-foreground">{hits.length} results</p>
      {#each hits as t (t.id)}{@render card(t)}{/each}
    </div>
  {:else if assetsKit.kit === null}
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1" data-library="1">
        <p class="text-[11px] font-semibold">Your patterns &amp; components</p>
        {#if !library.items.length}
          <p class="leading-relaxed text-muted-foreground">None yet. Select a section on the canvas, right-click and choose Save as pattern or Save as component.</p>
        {:else}
          {#each library.items as item (item.id)}
            <div class={rowCls} data-library-item={String(item.id)}>
              <button class="min-w-0 flex-1 truncate text-left" title="Insert" onclick={() => library.insert(item)}>{item.title}</button>
              <span class="shrink-0 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{item.synced ? "Component" : "Pattern"}</span>
              {#if item.editUrl}<a class="shrink-0 text-[10px] text-muted-foreground hover:text-foreground" href={item.editUrl} target="_blank">Edit</a>{/if}
            </div>
          {/each}
        {/if}
      </div>
      {#if patterns.length}
        <div class="flex flex-col gap-1">
          <p class="text-[11px] font-semibold">Theme sections</p>
          {#each patterns as p (p.slug)}
            <button class={rowCls} title={p.description ?? ""} data-theme-pattern={p.slug} onclick={() => library.insertThemePattern(p.slug)}><span class="truncate">{p.title}</span></button>
          {/each}
        </div>
      {/if}
      <p class="text-[11px] font-semibold">Kits</p>
      {#each kitNames as k (k)}{@render kitCover(k)}{/each}
      <p class="leading-relaxed text-muted-foreground">A kit is a set of sections and blocks with one look. Insert one, then click into it: everything is made of the elements in the Add panel.</p>
    </div>
  {:else}
    <div class="flex flex-col gap-3">
      <button type="button" class="flex items-center gap-1 self-start text-[11px] text-muted-foreground hover:text-foreground" onclick={() => (assetsKit.kit = null)}><Icon name="chevronLeft" size={14} />All kits</button>
      <p class="text-[13px] font-semibold">{assetsKit.kit}</p>
      <div class="flex gap-0.5 rounded-md bg-muted/70 p-0.5">
        {#each [["Section", "Sections"], ["Block", "Blocks"]] as [gr, label] (gr)}
          <button type="button" class={["h-6 flex-1 rounded-sm text-[11px] text-muted-foreground", gr === group && "bg-background text-foreground shadow-sm"]} onclick={() => (group = gr as Group)}>{label}</button>
        {/each}
      </div>
      <div class="flex flex-col gap-4">{#each inKit as t (t.id)}{@render card(t)}{/each}</div>
    </div>
  {/if}
</div>
