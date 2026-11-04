<script lang="ts">
  // A colour (StylePanel.colorRow): swatch with the native picker, the value (a token shows its hex and name), the
  // override dot, then the design system's colours one click away.
  import { effective } from "@auvyx/editor-core";
  import Dot from "./Dot.svelte";
  import { boxCls, computed, fieldOf, set, Tokens } from "./state.svelte";
  let { prop }: { prop: string } = $props();
  const f = $derived(fieldOf(prop));
  const tokenOf = (v: string) => Tokens.colors.find((t) => v === `var(--wp--preset--color--${t.slug})`);
  const swatch = $derived.by(() => { const v = f.own ?? f.inherited; return v !== undefined ? tokenOf(v)?.value ?? v : computed(prop); });
  const token = $derived(effective(f) !== undefined ? tokenOf(effective(f)!) : undefined);
</script>

<div class="flex flex-col gap-1.5">
  <div class={boxCls}>
    <label class="relative size-4 shrink-0 cursor-pointer rounded-sm border border-black/10 bg-[length:6px_6px] bg-[conic-gradient(#ddd_25%,#fff_0_50%,#ddd_0_75%,#fff_0)]">
      <div class="absolute inset-0 rounded-sm" style:background-color={swatch}></div>
      <input type="color" class="absolute inset-0 cursor-pointer opacity-0" oninput={(e) => set(prop, e.currentTarget.value, "color")} />
    </label>
    <!-- A token shows its value (click a swatch or type to change); anything else is an editable value. -->
    <input class="h-full min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none" data-color-hex={prop} spellcheck={false} placeholder="#000000"
      value={effective(f) !== undefined ? tokenOf(effective(f)!)?.value ?? effective(f) : ""}
      oninput={(e) => { const v = e.currentTarget.value; set(prop, v.trim() ? v : undefined, "hex"); }} />
    {#if token}<span class="shrink-0 truncate text-[10px] text-muted-foreground" title="Detach token (use the hex value)">{token.name.replace(/^Auvyx /, "")}</span>{/if}
    <Dot {prop} />
  </div>
  <div class="flex gap-1">
    {#each Tokens.colors as t (t.slug)}
      <button class={["size-4 rounded-sm border border-black/10", f.own === `var(--wp--preset--color--${t.slug})` && "ring-2 ring-ring ring-offset-1"]}
        style:background-color={t.value} title={t.name} onclick={() => set(prop, `var(--wp--preset--color--${t.slug})`, "token")}></button>
    {/each}
  </div>
</div>
