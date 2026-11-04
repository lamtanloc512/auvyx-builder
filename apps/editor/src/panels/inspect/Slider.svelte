<script lang="ts">
  // Range + number for a numeric value, with its unit (ElementPanel.slider): px keeps the property's own range, % and
  // the viewport units live on 0–100, and picking another unit rewrites the number (450 px → 450 %). A value that is not
  // a plain number (a token, calc()) shows as typed.
  import Field from "./Field.svelte";
  import Reset from "./Reset.svelte";
  import { Select, Slider } from "../../ui/kit";
  import { BOX, setStyle, styleValue } from "./style.svelte";
  let {
    prop, label, min, max, step = 1, unit = "px", units = [],
  }: { prop: string; label: string; min: number; max: number; step?: number; unit?: string; units?: string[] } = $props();

  /** The units offered here: the caller's, else px and the usual CSS ones ("" for a plain number). */
  const choice = $derived(units.length ? units : unit === "" ? [] : ["px", "%", "rem", "vw", "vh"]);
  const v = $derived(styleValue(prop));
  /** 450px → 450; anything else → null. */
  const numOf = (s: string, u: string) => {
    const t = (u ? s.trim().replace(new RegExp(`${u}$`), "") : s).trim();
    return t !== "" && !isNaN(Number(t)) ? Number(t) : null;
  };
  // The picked unit stays while the value is empty or written some other way.
  let pickedOverride = $state<string | null>(null);
  const picked = $derived(pickedOverride ?? unit);
  const current = $derived(choice.find((u) => v.value.trim().endsWith(u)) ?? picked);
  const num = $derived(numOf(v.value, current));
  const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
  const range = $derived(current === "px" ? { min, max, step } : { min: 0, max: 100, step: 1 });

  function changeUnit(u: string) {
    pickedOverride = u;
    if (num !== null) setStyle(prop, fmt(num) + u, true);
  }
</script>

<Field {label} control={prop} responsive wide>
  <div class="grid grid-cols-[minmax(0,1fr)_76px_auto_24px] items-center gap-2">
    <Slider min={range.min} max={range.max} step={range.step} aria-label={label} value={num ?? range.min}
      onchange={(n) => setStyle(prop, fmt(n) + current, true)} />
    <input class={[`${BOX} text-right tabular-nums`, !v.own && "italic text-muted-foreground"]} value={num === null ? v.value : fmt(num)}
      oninput={(e) => { const t = e.currentTarget.value.trim(); setStyle(prop, t ? (!isNaN(Number(t)) ? t + current : t) : undefined, true); }} />
    {#if choice.length > 1}
      <Select size="xs" class="w-14 shrink-0" value={current} options={choice.map((u) => ({ value: u, label: u }))} onValue={changeUnit} aria-label={`Unit of ${label}`} />
    {:else}
      <span class="text-[11px] text-muted-foreground">{current}</span>
    {/if}
    <Reset show={v.own} onreset={() => { pickedOverride = null; setStyle(prop, undefined); }} />
  </div>
</Field>
