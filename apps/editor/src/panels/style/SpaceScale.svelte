<script lang="ts">
  // 0 · XS · S · M · L · XL from the design system's spacing tokens, applied to every property in `props` at once (StylePanel.spaceScale).
  import { effective, scaleStep } from "@auvyx/editor-core";
  import { fieldOf, setAll, Tokens } from "./state.svelte";
  let { name, props }: { name: string; props: string[] } = $props();
  const steps: [string, string][] = [["0", "0"], ...Tokens.spacing.map((t) => [t.name.replace(/^Auvyx /, ""), `var(--wp--preset--spacing--${t.slug})`] as [string, string])];
  const current = $derived(scaleStep(props.map((p) => effective(fieldOf(p))), steps));
  const titleOf = (value: string) => { const t = Tokens.spacing.find((t) => value.includes(t.slug)); return t ? `${name}: ${t.value}` : `${name}: none`; };
</script>

<div class="grid grid-cols-[52px_1fr] items-center gap-1.5" data-space-scale={name}>
  <span class="text-[11px] text-muted-foreground">{name}</span>
  <div class="flex gap-0.5 rounded-md bg-muted/70 p-0.5">
    {#each steps as [label, value] (label)}
      <button type="button" class={["h-6 flex-1 rounded-sm text-[10px] text-muted-foreground hover:text-foreground", current === label && "bg-background text-foreground shadow-sm"]}
        title={titleOf(value)} onclick={() => setAll(props.map((p) => [p, value]))}>{label}</button>
    {/each}
  </div>
</div>
