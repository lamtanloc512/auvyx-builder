<script lang="ts">
  // Right-click menu on canvas elements and Navigator rows (U/ContextMenu.scala).
  import { parentOf } from "@auvyx/editor-core";
  import { store } from "../lib/store.svelte";
  import { ui } from "../lib/ui.svelte";
  import * as A from "../lib/actions.svelte";
  import { library } from "../lib/library.svelte";

  interface Item { label: string; keys: string; enabled: boolean; run: () => void }
  const groups = $derived.by((): Item[][] => {
    const m = ui.menu;
    if (!m) return [];
    const id = m.id, doc = store.doc, n = doc.nodes[id];
    const isText = !!n && ["Heading", "Text", "Button"].includes(n.kind);
    const parent = parentOf(doc, id);
    const siblings = parent ? doc.nodes[parent]!.children : doc.roots;
    const i = siblings.indexOf(id);
    const hidden = A.isHidden(id);
    return [
      [{ label: "Copy", keys: "⌘C", enabled: true, run: () => A.copy(id) }, { label: "Cut", keys: "⌘X", enabled: true, run: () => A.cut(id) },
        { label: "Paste", keys: "⌘V", enabled: true, run: () => A.paste() }, { label: "Duplicate", keys: "⌘D", enabled: true, run: () => store.duplicateSelection() }],
      [{ label: "Copy style", keys: "⌥⌘C", enabled: true, run: () => A.copyStyle(id) }, { label: "Paste style", keys: "⌥⌘V", enabled: A.hasCopiedStyle(), run: () => A.pasteStyle(id) }],
      [{ label: "Move up", keys: "[", enabled: i > 0, run: () => store.reorder(id, -1) }, { label: "Move down", keys: "]", enabled: i >= 0 && i < siblings.length - 1, run: () => store.reorder(id, 1) },
        { label: "Select parent", keys: "Esc", enabled: !!parent, run: () => store.selectParent() }],
      [{ label: store.selection.length > 1 ? "Group selection" : "Group", keys: "⌘G", enabled: true, run: A.group },
        { label: "Ungroup", keys: "⇧⌘G", enabled: A.canUngroup(id), run: A.ungroup },
        { label: n?.locked ? "Unlock" : "Lock", keys: "⇧⌘L", enabled: true, run: () => store.toggleLock() },
        { label: "Add auto layout", keys: "⇧A", enabled: true, run: A.addAutoLayout },
        { label: "Remove auto layout", keys: "⌥⇧A", enabled: A.canRemoveAuto(id), run: A.removeAutoLayout },
        ...(isText ? [{ label: "Edit text", keys: "↵", enabled: true, run: () => A.editText(id) }] : [])],
      [{ label: "Save as pattern…", keys: "", enabled: true, run: () => library.saveSelection(false) }, { label: "Save as component…", keys: "", enabled: true, run: () => library.saveSelection(true) }],
      [{ label: hidden ? "Show" : "Hide on this device", keys: "⇧⌘H", enabled: true, run: () => A.toggleHidden(id) }, { label: "Delete", keys: "⌫", enabled: true, run: () => store.removeSelection() }],
    ];
  });
  const height = $derived(groups.reduce((h, g) => h + g.length * 28 + 9, 0));
</script>

{#if ui.menu}
  {@const m = ui.menu}
  <div class="fixed inset-0 z-50" role="presentation" onmousedown={() => (ui.menu = null)} oncontextmenu={(e) => { e.preventDefault(); ui.menu = null; }}>
    <div class="cn-context-menu-content absolute min-w-56 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md" data-slot="context-menu-content" role="menu" tabindex="-1"
      style:left="{Math.min(m.x, innerWidth - 240)}px" style:top="{Math.max(8, Math.min(m.y, innerHeight - height - 8))}px" onmousedown={(e) => e.stopPropagation()}>
      {#each groups as group, gi (gi)}
        <div>
          {#if gi > 0}<div class="cn-context-menu-separator -mx-1 my-1 h-px bg-border" data-slot="context-menu-separator" role="separator"></div>{/if}
          {#each group as item (item.label)}
            <button class="cn-context-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs outline-none hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              data-slot="context-menu-item" role="menuitem" disabled={!item.enabled} data-menu={item.label} onclick={() => { ui.menu = null; item.run(); }}>
              <span>{item.label}</span>
              <span class="cn-context-menu-shortcut ml-auto text-xs tracking-widest text-muted-foreground" data-slot="context-menu-shortcut">{item.keys}</span>
            </button>
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}
