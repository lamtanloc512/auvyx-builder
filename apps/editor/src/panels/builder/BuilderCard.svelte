<script lang="ts">
  // The board card of the builder header or footer holding the selection; nothing elsewhere (BuilderUi.card).
  import { builder } from "../../lib/builder.svelte";
  import { store } from "../../lib/store.svelte";
  import HeaderBuilderPanel from "./HeaderBuilderPanel.svelte";
  import FooterBuilderPanel from "./FooterBuilderPanel.svelte";

  const board = $derived(builder.board(store.doc, store.selected));
  const key = $derived(board ? `${board.kind}:${board.root}` : "");
</script>

<div>
  {#key key}
    {#if board?.kind === "header"}<HeaderBuilderPanel root={board.root} />
    {:else if board?.kind === "footer"}<FooterBuilderPanel root={board.root} />{/if}
  {/key}
</div>
