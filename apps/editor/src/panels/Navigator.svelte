<script lang="ts" module>
  import { ancestors as anc } from "@auvyx/editor-core";
  import { store as st } from "../lib/store.svelte";
  /** Expand the ancestors, open the tree and scroll the row into view (canvas clicks call this). */
  export function reveal(id: string) {
    const up = new Set(anc(st.doc, id));
    st.collapsed = new Set([...st.collapsed].filter((c) => !up.has(c)));
    st.leftPanel = "navigator";
    setTimeout(() => document.querySelector(`[data-nav-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }), 0);
  }
</script>

<script lang="ts">
  // The layers tree (U/Navigator.scala): select, hover sync, collapse, drag to reorder or move inside.
  import { KINDS, ancestors, parentOf, subtreeIds, type Doc } from "@auvyx/editor-core";
  import { Icon } from "../ui/kit";
  import { iconOf, nameOf, previewBrief } from "../lib/labels";
  import { store } from "../lib/store.svelte";
  import { ui } from "../lib/ui.svelte";

  type Drop = "before" | "after" | "inside";
  let dragId = $state<string | null>(null);
  let dropTarget = $state<[string, Drop] | null>(null);
  const INDENT = 8;
  const HUES = [215, 265, 325, 35, 150, 185];
  const tone = (level: number, alpha: number) => `hsl(${HUES[level % HUES.length]} 75% 60% / ${alpha})`;

  const rows = $derived.by(() => {
    const out: [string, number][] = [];
    const walk = (ids: readonly string[], depth: number) => {
      for (const id of ids) {
        const n = store.doc.nodes[id];
        if (!n) continue;
        out.push([id, depth]);
        if (!store.collapsed.has(id)) walk(n.children, depth + 1);
      }
    };
    walk(store.doc.roots, 0);
    return out;
  });
  const inside = $derived(store.selected && store.doc.nodes[store.selected] ? new Set(subtreeIds(store.doc, store.selected)) : new Set<string>());
  const selection = $derived(new Set(store.selection));

  function nudge(id: string, by: number) {
    const parent = parentOf(store.doc, id);
    const siblings = parent ? store.doc.nodes[parent]!.children : store.doc.roots;
    const i = siblings.indexOf(id), j = i + by;
    if (i >= 0 && j >= 0 && j < siblings.length) store.move(id, parent, j);
  }

  function dropIt() {
    const dragged = dragId, t = dropTarget;
    dragId = null; dropTarget = null;
    if (!dragged || !t) return;
    const [target, where] = t;
    const doc: Doc = store.doc;
    if (where === "inside") { store.move(dragged, target, doc.nodes[target]?.children.length ?? 0); return; }
    const parent = parentOf(doc, target);
    const siblings = (parent ? doc.nodes[parent]!.children : doc.roots).filter((c) => c !== dragged);
    store.move(dragged, parent, siblings.indexOf(target) + (where === "after" ? 1 : 0));
  }
  const toggle = (id: string) => { const c = new Set(store.collapsed); if (c.has(id)) c.delete(id); else c.add(id); store.collapsed = c; };
</script>

<div class="flex w-max min-w-full flex-col py-1 text-xs select-none" role="tree" tabindex="-1" onmouseleave={() => (store.hovered = null)}>
  {#each rows as [id, depth] (id + ":" + depth)}
    {@const n = store.doc.nodes[id]!}
    {@const sel = selection.has(id)}
    {@const drop = dropTarget && dropTarget[0] === id ? dropTarget[1] : null}
    {@const branch = ancestors(store.doc, id).reverse().map((a) => inside.has(a))}
    <div
      class={["group relative mx-1.5 flex h-8 min-w-max cursor-default items-center gap-1.5 rounded-md pr-2",
        sel && "bg-blue-500/10 text-foreground dark:bg-blue-400/15", store.hovered === id && !sel && "bg-muted", dragId === id && "opacity-40",
        drop === "before" && "shadow-[inset_0_2px_0_var(--primary)]", drop === "after" && "shadow-[inset_0_-2px_0_var(--primary)]",
        drop === "inside" && "bg-primary/20 outline outline-1 -outline-offset-1 outline-primary"]}
      data-nav-id={id} data-nav-selected={String(sel)} style:padding-left="{8 + depth * INDENT}px" draggable="true"
      role="treeitem" aria-selected={sel} tabindex="-1"
      onclick={() => { store.selected = id; store.extra = new Set(); }}
      onkeydown={(e) => { if (e.key === "Enter") store.selected = id; }}
      oncontextmenu={(ev) => { ev.preventDefault(); ui.menu = { id, x: ev.clientX, y: ev.clientY }; }}
      onmouseenter={() => (store.hovered = id)}
      ondragstart={(ev) => { dragId = id; if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", id); } }}
      ondragover={(ev) => {
        if (!dragId || dragId === id) return;
        ev.preventDefault();
        const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
        const ratio = (ev.clientY - r.top) / r.height;
        dropTarget = [id, KINDS[n.kind].container && ratio > 0.3 && ratio < 0.7 ? "inside" : ratio < 0.5 ? "before" : "after"];
      }}
      ondrop={(ev) => { ev.preventDefault(); dropIt(); }}
      ondragend={() => { dragId = null; dropTarget = null; }}
    >
      {#each { length: depth } as _, level}
        <span class="pointer-events-none absolute inset-y-0 w-0.5 rounded-full" style:background-color={tone(level, branch[level] ? 1 : 0.4)} style:left="{8 + level * INDENT + 6}px"></span>
      {/each}
      {#if KINDS[n.kind].container && n.children.length}
        <button class="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground" onclick={(e) => { e.stopPropagation(); toggle(id); }}>
          <Icon name={store.collapsed.has(id) ? "chevronRight" : "chevronDown"} size={12} />
        </button>
      {:else}<span class="w-4"></span>{/if}
      <Icon name={iconOf(n.kind)} size={14} class="text-muted-foreground" />
      <span class="shrink-0 font-medium" translate={n.label ? "no" : "yes"}>{nameOf(n)}</span>
      <span class="truncate text-muted-foreground" translate="no">{previewBrief(n)}</span>
      <button class="hidden size-5 shrink-0 rounded-sm text-muted-foreground group-hover:inline-flex hover:text-foreground" title="Move up" data-nav-up={id} onclick={(e) => { e.stopPropagation(); nudge(id, -1); }}>↑</button>
      <button class="hidden size-5 shrink-0 rounded-sm text-muted-foreground group-hover:inline-flex hover:text-foreground" title="Move down" data-nav-down={id} onclick={(e) => { e.stopPropagation(); nudge(id, 1); }}>↓</button>
      <button class={["ml-auto flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground", !n.locked && "invisible group-hover:visible"]}
        data-lock={id} title={n.locked ? "Unlock (⇧⌘L)" : "Lock (⇧⌘L)"}
        onclick={(e) => { e.stopPropagation(); store.updateNode(id, (x) => ({ ...x, locked: !x.locked })); }}><Icon name={n.locked ? "lock" : "lockOpen"} size={12} /></button>
    </div>
  {/each}
</div>
