<script lang="ts">
  // The agent in a column of its own, right of the inspector (U/Main.scala rightColumn): width 340 kept in
  // `auvyx-studio:ai-width` (280–560), a resizer, the softest corners (--radius: 10px). It stays mounted once shown, so a
  // running request and its conversation are kept while folded.
  import { store } from "../../lib/store.svelte";
  import { ask } from "../../lib/agent.svelte";
  import { pendingAsk } from "../../lib/agentAsk.svelte";
  import Resizer from "../../shell/Resizer.svelte";
  import AgentPanel from "./AgentPanel.svelte";

  const KEY = "auvyx-studio:ai-width";
  const stored = Number((() => { try { return localStorage.getItem(KEY); } catch { return null; } })());
  let width = $state(Number.isFinite(stored) && stored > 0 ? Math.max(280, Math.min(560, stored)) : 340);
  $effect(() => { const w = width; const t = setTimeout(() => { try { localStorage.setItem(KEY, String(w)); } catch { /* private window */ } }, 300); return () => clearTimeout(t); });

  // a request from the selection's ✦ box, once this panel is here
  $effect(() => {
    const text = pendingAsk.text;
    if (text) { pendingAsk.text = null; ask(text); }
  });
</script>

<div class="relative flex shrink-0 flex-col overflow-hidden rounded-xl bg-background min-w-[280px] max-w-[560px]" data-ai-column="1"
  style:--radius="10px" style:display={store.preview || !store.aiOpen ? "none" : "flex"} style:width="{width}px">
  <Resizer bind:width dflt={340} grow={-1} side="-left-1" min={280} />
  <AgentPanel />
</div>
