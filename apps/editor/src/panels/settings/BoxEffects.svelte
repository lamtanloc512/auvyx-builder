<script lang="ts">
  // Flatsome Banner options as class tokens (SettingsPanel.boxEffects): link the whole box through its button; zoom
  // the background on hover (only offered when the box has a background image).
  import { Settings as S } from "@auvyx/editor-core";
  import { store } from "../../lib/store.svelte";
  import type { Update } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  let { id, update }: { id: string; update: Update } = $props();
  const n = $derived(store.doc.nodes[id]);
  const has = $derived(n ? S.boxEffectsOf(store.doc, n) : { button: false, background: false });
</script>

{#snippet check(token: string, text: string, hint: string)}
  <label class="flex items-center gap-2 text-[11px]" title={hint} data-box-effect={token}>
    <input type="checkbox" checked={S.hasClass(n?.className ?? "", token)} onclick={(e) => { const on = e.currentTarget.checked; update(`box-${token}`, (x) => ({ ...x, className: S.toggleToken(x.className, token, on) })); }} />
    {text}
  </label>
{/snippet}

<div>
  {#if has.button || has.background}
    <Row name="Effects">
      <div class="flex flex-col gap-1">
        {#if has.button}{@render check(S.STRETCH, "Whole box links to its button", "The box becomes clickable and goes where its button goes (one link).")}{/if}
        {#if has.background}{@render check(S.BG_ZOOM, "Zoom background on hover", "The background picture grows a little under the pointer.")}{/if}
      </div>
    </Row>
  {/if}
</div>
