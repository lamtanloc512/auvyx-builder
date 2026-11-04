<script lang="ts">
  // "The AI proposed code: review" (docs/mcp-v2.md, Code waits): a save an AI connection made without the code scope waits
  // in the page's auvyx_mcp_pending; a person who may script approves it (saved then, as them) or discards it.
  import { config } from "../lib/config";
  import { store } from "../lib/store.svelte";
  import { toast } from "../lib/toast.svelte";

  const pending = config.mcpPending ?? null;
  let open = $state(false);
  let busy = $state(false);
  let gone = $state(false);
  const pretty = (json: string) => { try { return JSON.stringify(JSON.parse(json), null, 2); } catch { return json; } };

  async function decide(decision: "approve" | "discard") {
    if (!pending || busy) return;
    if (decision === "approve" && !store.safe && !confirm("Approve the AI's proposal? It is saved as a new version and the editor reloads; your unsaved changes are kept on this device and offered back.")) return;
    busy = true;
    try {
      const res = await fetch(config.restRoot.replace(/\/?$/, "/") + pending.route, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-WP-Nonce": pending.nonce },
        body: JSON.stringify({ decision }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast(body?.message ?? `Could not ${decision} (${res.status})`); return; }
      gone = true;
      if (decision === "approve") { toast("Approved: reloading with the AI's version"); location.reload(); }
      else toast("Discarded the AI's proposal");
    } finally { busy = false; }
  }
</script>

{#if pending && !gone}
  <div class="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-950" data-mcp-pending>
    <div class="flex items-center gap-3">
      <span>The AI proposed code{pending.token ? ` (${pending.token})` : ""}: review. {pending.elements.length} element{pending.elements.length === 1 ? "" : "s"} kept aside; this page is unchanged.</span>
      <button type="button" class="rounded-md border border-current/30 px-2 py-0.5 font-medium hover:bg-black/5" onclick={() => (open = !open)}>{open ? "Hide" : "Review"}</button>
      {#if pending.canApprove}
        <button type="button" class="rounded-md border border-current/30 px-2 py-0.5 font-medium hover:bg-black/5" disabled={busy} onclick={() => decide("approve")}>Approve</button>
        <button type="button" class="rounded-md border border-current/30 px-2 py-0.5 hover:bg-black/5" disabled={busy} onclick={() => decide("discard")}>Discard</button>
      {:else}
        <span class="opacity-75">An administrator who may add code approves it.</span>
      {/if}
    </div>
    {#if open}
      <div class="mt-1.5 max-h-64 space-y-2 overflow-auto">
        {#each pending.elements as el (el.id)}
          <div>
            <div class="font-medium">{el.block || "Element"} · {el.id}</div>
            {#if el.code}<pre class="whitespace-pre-wrap rounded bg-white/70 p-1.5 font-mono text-[11px]">{pretty(el.code)}</pre>{/if}
            {#if el.html}<pre class="whitespace-pre-wrap rounded bg-white/70 p-1.5 font-mono text-[11px]">{el.html}</pre>{/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
