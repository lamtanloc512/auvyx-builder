<script lang="ts">
  // Text (StylePanel.typography): font, weight, size with the type scale, line height and letter spacing, alignment,
  // case, colour.
  import { Icon, Select } from "../../ui/kit";
  import type { IconName } from "../../ui/icons";
  import { fieldOf, fontOptions, set, Tokens } from "./state.svelte";
  import Section from "./Section.svelte";
  import SelectBox from "./SelectBox.svelte";
  import Num from "./Num.svelte";
  import Labeled from "./Labeled.svelte";
  import ColorRow from "./ColorRow.svelte";
  let { open }: { open: boolean } = $props();
  const align = $derived(fieldOf("text-align"));
  const ALIGNS: [string, IconName][] = [["start", "alignLeft"], ["center", "alignCenter"], ["end", "alignRight"]];
  const sizeItems = [{ value: "", label: "" }, ...Tokens.fontSizes.map((t) => ({ value: t.slug, label: `${t.name.replace(/^Auvyx /, "")} · ${t.value}` }))];
</script>

<!-- The design system's type scale, one click from the size box (Flatsome's Size: XS…XL). A picker, not a value: the box beside it shows the size. -->
{#snippet sizeTokens()}
  <div class="w-6 shrink-0" title="Type scale" data-size-tokens="1">
    <Select size="xs" value="" options={sizeItems} onValue={(v: string) => { if (v) set("font-size", `var(--wp--preset--font-size--${v})`, "token"); }} />
  </div>
{/snippet}

<Section title="Text" props={["color", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "text-transform", "font-family"]} {open}>
  <SelectBox prop="font-family" options={fontOptions} empty="Theme font" />
  <div class="grid grid-cols-2 gap-1.5">
    <SelectBox prop="font-weight" options={[["300", "Light"], ["400", "Regular"], ["500", "Medium"], ["600", "Semibold"], ["700", "Bold"], ["800", "Extrabold"], ["900", "Black"]]} />
    <Num prefix="Aa" prop="font-size" options={{ min: 0 }} suffix={sizeTokens} />
  </div>
  <div class="grid grid-cols-2 gap-1.5">
    <Labeled text="Line height"><Num prefix="↕" prop="line-height" options={{ step: 0.05, unit: "", min: 0 }} /></Labeled>
    <Labeled text="Letter spacing"><Num prefix="↔" prop="letter-spacing" options={{ step: 0.01, unit: "em" }} /></Labeled>
  </div>
  <div class="grid grid-cols-[1fr_auto] gap-1.5">
    <div class="flex gap-0.5 rounded-md bg-muted/70 p-0.5">
      {#each ALIGNS as [v, icon] (v)}
        {@const active = align.own === v}
        <button class={["flex h-6 flex-1 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground", active && "bg-background text-foreground shadow-sm", align.inherited === v && !active && "text-orange-600"]}
          title={`Align ${v}`} onclick={() => set("text-align", v, "align")}><Icon name={icon} size={14} /></button>
      {/each}
    </div>
    <div class="w-24"><SelectBox prop="text-transform" options={[["none", "Aa none"], ["uppercase", "AA upper"], ["lowercase", "aa lower"], ["capitalize", "Aa Title"]]} empty="Case" /></div>
  </div>
  <Labeled text="Color"><ColorRow prop="color" /></Labeled>
</Section>
