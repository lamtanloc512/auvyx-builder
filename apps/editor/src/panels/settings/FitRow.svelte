<script lang="ts">
  // SettingsPanel.fitRow: Fit works on ordinary elements too, so a heading or image can fill or hug inside a Row or Col.
  import { Settings as S } from "@auvyx/editor-core";
  import { store } from "../../lib/store.svelte";
  import Choices from "./Choices.svelte";
  import { setChoice } from "../../lib/settingsOps";
  let { id }: { id: string } = $props();
  const current = $derived(S.uiProp(store.doc.nodes[id] ?? ({ className: "" } as never), "fit", "auto"));
</script>

<div class="grid grid-cols-[40px_1fr] items-start gap-1">
  <div class="flex flex-col gap-0.5 pt-1"><span class="text-[11px] text-muted-foreground">Fit</span></div>
  <Choices {current} options={S.FIT_FIELD.choices} oneLine pick={(v) => { if (store.selected) setChoice(store.selected, "fit", v); }} />
</div>

