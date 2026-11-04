<script lang="ts">
  // Standalone appearance screen (U/Customize.scala), opened from Preview when the editor has no site: site tokens on the
  // left, the rendered page on the right. Does not edit the document. On a site (WordPress) Preview keeps the site's own
  // preview link, as in Auvyx Studio.
  import { untrack } from "svelte";
  import { type Doc, HtmlRenderer, decodeTree } from "@auvyx/editor-core";
  import defaults from "../../../../shared/defaults/design-system.json";
  import blocksCss from "../../../../products/builder/assets/blocks.css?raw";
  import { Button, ScrollArea, Select, Separator, selectItems } from "../ui/kit";
  import { config } from "../lib/config";
  import Collapse from "./Collapse.svelte";

  const KEY = "auvyx-studio:appearance";
  interface Look { colors: Record<string, string>; radius: string; font: string }
  interface Token { slug: string; name: string; value: string }

  const radii: [string, string][] = [["0", "None"], ["8px", "Small"], ["16px", "Large"]];
  const fonts: [string, string][] = [["system", "System"], ["serif", "Serif"], ["mono", "Mono"]];
  const widths: [string, number][] = [["desktop", 1280], ["tablet", 768], ["mobile", 390]];

  type Raw = { slug: string; name?: string; color?: string; size?: string; value?: string };
  const tokens = (list: Raw[] | undefined, fallback: Raw[]): Token[] =>
    (list && list.length ? list : fallback).map((t) => ({ slug: t.slug, name: t.name ?? t.slug, value: t.color ?? t.size ?? t.value ?? "" }));
  const ds = config.designSystem?.tokens;
  const dflt = defaults.tokens as { color: Raw[]; spacing: Raw[]; fontSize: Raw[] };
  const colorTokens = tokens(ds?.color, dflt.color);
  const spacing = tokens(ds?.spacing, dflt.spacing);
  const fontSizes = tokens(ds?.fontSize, dflt.fontSize);

  /** Where the editor started: back to it. */
  const editorUrl = (() => { const u = new URL(location.href); u.searchParams.delete("screen"); return u.toString(); })();

  const defaultLook = (): Look => ({ colors: Object.fromEntries(colorTokens.map((t) => [t.slug, t.value])), radius: "8px", font: "system" });

  function readLook(data: Record<string, unknown>, base: Look): Look {
    const c = data.colors as Record<string, unknown> | undefined;
    const colors = c ? Object.fromEntries(Object.entries(base.colors).map(([slug, fb]) => [slug, typeof c[slug] === "string" && c[slug] !== "" ? (c[slug] as string) : fb])) : base.colors;
    const radius = typeof data.radius === "string" && radii.some(([v]) => v === data.radius) ? data.radius : base.radius;
    const font = typeof data.font === "string" && fonts.some(([v]) => v === data.font) ? data.font : base.font;
    return { colors, radius, font };
  }

  /** One look per device. An older single look is kept as the desktop starting point, not shared live. */
  function loadAll(): Record<string, Look> {
    const base = defaultLook();
    const all = (f: (id: string) => Look) => Object.fromEntries(widths.map(([id]) => [id, f(id)]));
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return all(() => base);
      const data = JSON.parse(raw) as Record<string, unknown>;
      const devices = data.devices as Record<string, Record<string, unknown> | undefined> | undefined;
      return devices ? all((id) => (devices[id] ? readLook(devices[id]!, base) : base)) : all(() => readLook(data, base));
    } catch { return all(() => base); }
  }

  function saveAll(all: Record<string, Look>) {
    try { localStorage.setItem(KEY, JSON.stringify({ devices: all })); } catch { /* private window */ }
  }

  const family = (font: string) =>
    font === "serif" ? 'Georgia, "Times New Roman", serif' : font === "mono" ? "ui-monospace, SFMono-Regular, Menlo, monospace" : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  /** The document this editor opened with (standalone: the sample page). */
  const doc: Doc = (() => { let n = 0; return decodeTree(config.blocks ?? [], () => `c${++n}`); })();

  const esc = HtmlRenderer.escape;
  function page(look: Look): string {
    const hooks: HtmlRenderer.Hooks = {
      raw: (n) => (n.html ? n.html : `<div style="padding:12px;border:1px dashed #94a3b8;color:#64748b;font:13px/1.5 system-ui">${esc(n.blockName || "Block")}</div>`),
      // this preview is an unsandboxed same-origin frame of the editor's own window: authored code is drawn stopped, never run
      code: "stopped",
    };
    const vars = [
      ...colorTokens.map((t) => `--wp--preset--color--${t.slug}:${look.colors[t.slug] ?? t.value}`),
      ...spacing.map((t) => `--wp--preset--spacing--${t.slug}:${t.value}`),
      ...fontSizes.map((t) => `--wp--preset--font-size--${t.slug}:${t.value}`),
    ].join(";");
    const css = HtmlRenderer.renderCss(doc, undefined, hooks);
    const body = HtmlRenderer.renderHtml(doc, { hooks });
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview</title><style>
:root{${vars};--wp--custom--radius--md:${look.radius};--wp--custom--radius--lg:${look.radius}}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0}
body{font:16px/1.6 ${family(look.font)};color:var(--wp--preset--color--auvyx-text,#0f172a);background:var(--wp--preset--color--auvyx-base,#fff)}
h1,h2,h3,h4,h5,h6{font-weight:700;line-height:1.15}
${blocksCss}
${css.ok ? css.value : ""}
</style></head><body>${body.ok ? body.value : "<p>This document cannot be rendered.</p>"}</body></html>`;
  }

  let looks = $state(loadAll());
  let device = $state("desktop");
  let saved = $state(true);
  let colorsOpen = $state(true);
  let typeOpen = $state(true);
  let cornerOpen = $state(true);
  const active = $derived(looks[device] ?? defaultLook());
  function edit(f: (l: Look) => Look) {
    looks = { ...looks, [device]: f(looks[device] ?? defaultLook()) };
    saved = false;
  }

  // the frame follows the look a moment after it changes
  let frame = $state(untrack(() => page(active)));
  $effect(() => {
    const look = active;
    const t = setTimeout(() => (frame = page(look)), 80);
    return () => clearTimeout(t);
  });
</script>

{#snippet section(title: string, open: boolean, toggle: () => void, content: import("svelte").Snippet)}
  <div class="border-b border-border">
    <Button variant="ghost" size="sm" class="h-10 w-full justify-start rounded-none px-4 text-sm font-medium" onclick={toggle}>{open ? `▾ ${title}` : `▸ ${title}`}</Button>
    <Collapse {open} body="flex flex-col gap-3 px-4 pb-4">{@render content()}</Collapse>
  </div>
{/snippet}

{#snippet colors()}
  {#each colorTokens as token (token.slug)}
    <label class="grid grid-cols-[1fr_auto] items-center gap-2 text-xs">
      <span>{token.name.replace(/^Auvyx /, "")}</span>
      <input type="color" class="h-7 w-10 cursor-pointer rounded-md border border-input bg-transparent p-0.5" data-appearance-color={token.slug}
        value={active.colors[token.slug] ?? token.value}
        oninput={(e) => { const v = e.currentTarget.value; edit((l) => ({ ...l, colors: { ...l.colors, [token.slug]: v } })); }} />
    </label>
  {/each}
{/snippet}
{#snippet typography()}
  <Select value={active.font} options={selectItems(fonts)} onValue={(v) => edit((l) => ({ ...l, font: v }))} size="sm" data-appearance-font="1" />
{/snippet}
{#snippet corners()}
  <Select value={active.radius} options={selectItems(radii)} onValue={(v) => edit((l) => ({ ...l, radius: v }))} size="sm" data-appearance-radius="1" />
{/snippet}

<div class="flex h-dvh flex-col bg-background text-foreground" data-customize="1">
  <header class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
    <Button variant="ghost" size="sm" onclick={() => (location.href = editorUrl)}>Back to editor</Button>
    <span class="text-sm font-medium">Customize</span>
    <div class="flex-1"></div>
    <Button size="sm" data-save-appearance="1" disabled={saved} onclick={() => { saveAll(looks); saved = true; }}>{saved ? "Saved" : "Save appearance"}</Button>
  </header>
  <div class="flex min-h-0 flex-1">
    <aside class="flex w-72 shrink-0 flex-col border-r border-border">
      <div class="grid grid-cols-3 gap-1 border-b border-border p-3">
        {#each widths as [id, px] (id)}
          <Button size="sm" variant="outline" class="h-8 px-1 text-[11px] {device === id ? 'bg-background text-foreground shadow-sm' : ''}" title={`${px} px`}
            data-preview-device={id} onclick={() => (device = id)}>{id[0]!.toUpperCase() + id.slice(1)}</Button>
        {/each}
      </div>
      <ScrollArea class="min-h-0 flex-1">
        <p class="px-4 pt-4 text-[11px] leading-relaxed text-muted-foreground">{`${device} appearance. The other devices keep their own.`}</p>
        <Separator />
        {@render section("Colors", colorsOpen, () => (colorsOpen = !colorsOpen), colors)}
        {@render section("Typography", typeOpen, () => (typeOpen = !typeOpen), typography)}
        {@render section("Corners", cornerOpen, () => (cornerOpen = !cornerOpen), corners)}
      </ScrollArea>
    </aside>
    <div class="flex min-w-0 flex-1 justify-center overflow-auto bg-muted/60 p-6">
      <iframe class="h-[calc(100vh-6rem)] max-w-none shrink-0 border-0 bg-white shadow-sm" data-preview-frame="1" title="Preview"
        width="{widths.find(([id]) => id === device)?.[1] ?? 1280}px" srcdoc={frame}></iframe>
    </div>
  </div>
</div>
