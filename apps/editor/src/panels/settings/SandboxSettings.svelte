<script lang="ts">
  // A sandboxed custom-code block (SettingsPanel.sandboxSettings, SandboxCode): its HTML, CSS and script, run in an
  // iframe, not on the page.
  import { store } from "../../lib/store.svelte";
  import { canScript } from "../../lib/session.svelte";
  import type { Update } from "../../lib/settingsOps";
  let { id, update }: { id: string; update: Update } = $props();
  const n = $derived(store.doc.nodes[id]);
  const AREA = "w-full resize-y rounded-[3px] border border-input bg-transparent px-2 py-1.5 font-mono text-[11px] leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
</script>

{#snippet field(key: string, name: string, rows: string)}
  <div class="flex flex-col gap-1">
    <span class="text-[11px] text-muted-foreground">{name}</span>
    <textarea class="{AREA} {rows}" {...{ [`data-sandbox-${key}`]: "" }} spellcheck={false} disabled={!canScript} value={n?.fields[key] ?? ""}
      oninput={(e) => { const v = e.currentTarget.value; if (canScript) update(`sandbox-${key}`, (x) => ({ ...x, fields: { ...x.fields, [key]: v } })); }}></textarea>
  </div>
{/snippet}

<div>
  {#if n && n.kind === "Section" && n.className.split(" ").includes("auvyx-sandbox")}
    <div class="flex flex-col gap-2" data-sandbox-settings="">
      {#if !canScript}<p class="text-[11px] text-muted-foreground">Only a user who may add scripts (an administrator) can change this block.</p>{/if}
      <p class="text-[11px] text-muted-foreground">This block runs in a sandbox. It cannot reach the page, cookies, or the network, unless an allowlisted https origin is set.</p>
      {@render field("html", "HTML", "min-h-24")}
      {@render field("css", "CSS", "min-h-16")}
      {@render field("js", "Script", "min-h-24")}
      {@render field("allow", "Allowlisted origins", "min-h-12")}
    </div>
  {/if}
</div>
