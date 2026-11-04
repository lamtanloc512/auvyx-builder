<script lang="ts">
  // Countdown end (SettingsPanel.countdownRow, sections marked auvyx-timer): picked in local time, stored as a UTC class token.
  import { Settings as S } from "@auvyx/editor-core";
  import { store } from "../../lib/store.svelte";
  import type { Update } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  let { id, update }: { id: string; update: Update } = $props();
  const n = $derived(store.doc.nodes[id]);
  const two = (v: number) => String(Math.trunc(v)).padStart(2, "0");
  function local(utc: string) {
    const d = new Date(utc + ":00Z");
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
  }
  function setEnd(v: string) {
    const utc = v === "" ? "" : new Date(v).toISOString().slice(0, 16);
    update("countdown", (x) => ({ ...x, className: S.withCountdownUntil(x.className, utc) }));
  }
  const until = $derived(n ? S.countdownUntil(n.className) : undefined);
</script>

<div>
  {#if n && S.isCountdown(n.className)}
    <Row name="Ends">
      <!-- The browser only reports a complete date and time; an empty value (cleared) arrives on change. -->
      <input type="datetime-local" class="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs" data-countdown-ends="1"
        value={until ? local(until) : ""} oninput={(e) => { if (e.currentTarget.value) setEnd(e.currentTarget.value); }} onchange={(e) => { if (!e.currentTarget.value) setEnd(""); }} />
    </Row>
  {/if}
</div>
