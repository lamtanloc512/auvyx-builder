<script lang="ts">
  // ProLock.dialog: what Auvyx Builder Pro adds, for the feature that asked (session.ask).
  import { Dialog, DialogClose, DialogDescription, DialogHeader, DialogTitle } from "../../ui/kit";
  import { edition, feature, session } from "../../lib/session.svelte";
  let open = $state(false);
  $effect(() => { open = session.proFeature !== null; });
  $effect(() => { if (!open) session.proFeature = null; });
  const pf = $derived(session.proFeature ? feature(session.proFeature) : { title: "", description: "" });
</script>

<Dialog bind:open contentBoxClass="sm:max-w-md">
  <DialogClose />
  <DialogHeader>
    <DialogTitle>{pf.title} · Auvyx Builder Pro</DialogTitle>
    <DialogDescription>{pf.description}</DialogDescription>
  </DialogHeader>
  <div class="flex flex-col gap-3 text-xs" data-pro-dialog="">
    <p class="leading-relaxed text-muted-foreground">
      {edition.pro ? "Auvyx Builder Pro is installed: activate its licence key to use it." : "Everything you already use stays free. Pro adds more blocks, every site template, the theme-builder controls and more kinds of data."}
    </p>
    <p class="leading-relaxed text-muted-foreground">What you build with Pro keeps showing on your site whatever happens to the licence.</p>
    <div class="flex flex-wrap items-center gap-2">
      <a class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90" href={edition.upgradeUrl} target="_blank" rel="noopener" data-pro-upgrade="">
        {edition.pro ? "Get a licence key" : "Get Auvyx Builder Pro"}
      </a>
      {#if edition.manageUrl}
        <a class="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted" href={edition.manageUrl} target="_blank" rel="noopener">{edition.pro ? "Activate my key" : "Compare editions"}</a>
      {/if}
    </div>
  </div>
</Dialog>
