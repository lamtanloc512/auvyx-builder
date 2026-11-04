<script lang="ts">
  // The keyboard list (U/Shortcuts.scala dialog) and the document source (U/TopBar.scala exportDialog).
  import { serialize } from "@auvyx/editor-core";
  import { Button, Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Kbd } from "../ui/kit";
  import { SHORTCUT_GROUPS } from "../lib/shortcuts.svelte";
  import { store } from "../lib/store.svelte";
  import { ui } from "../lib/ui.svelte";
</script>

<Dialog bind:open={ui.shortcuts} contentBoxClass="sm:max-w-md">
  <DialogClose />
  <DialogHeader>
    <DialogTitle>Keyboard</DialogTitle>
    <DialogDescription>The editor is keyboard-first: every tool and action has a key. Ctrl works where ⌘ is shown.</DialogDescription>
  </DialogHeader>
  <div class="max-h-[60vh] flex flex-col gap-4 overflow-y-auto pr-1">
    {#each SHORTCUT_GROUPS as [name, rows] (name)}
      <div class="flex flex-col gap-1.5">
        <p class="text-xs font-semibold">{name}</p>
        {#each rows as [keys, what] (what)}
          <div class="flex items-center justify-between gap-4 text-xs">
            <span class="text-muted-foreground">{what}</span>
            <span class="flex shrink-0 gap-1">{#each keys as k (k)}<Kbd>{k}</Kbd>{/each}</span>
          </div>
        {/each}
      </div>
    {/each}
  </div>
</Dialog>

<Dialog bind:open={ui.source} contentBoxClass="sm:max-w-3xl">
  <DialogClose />
  <DialogHeader>
    <DialogTitle>Document source</DialogTitle>
    <DialogDescription>The native document format used by this platform.</DialogDescription>
  </DialogHeader>
  <pre class="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{ui.source ? serialize(store.doc) : ""}</pre>
  <DialogFooter>
    <span class="mr-auto text-xs text-muted-foreground"><Kbd>⌘</Kbd> <Kbd>C</Kbd> to copy</span>
    <Button variant="outline" size="sm" onclick={() => (ui.source = false)}>Close</Button>
  </DialogFooter>
</Dialog>
