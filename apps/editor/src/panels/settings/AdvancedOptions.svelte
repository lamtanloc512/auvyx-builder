<script lang="ts">
  // Flatsome's "Advanced" group at the end of every element's panel (SettingsPanel.advancedOptions): label, tag, class,
  // id, visibility, custom CSS; a section's theme mode; a sandbox's code; the entrance animation; data bindings.
  import { LEVELS, SECTION_TAGS, setVisibility, visibilityOf, type Level } from "@auvyx/editor-core";
  import { compileScopedCss } from "@auvyx/style-engine";
  import { Input, Select } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { proLocked, proShown, session } from "../../lib/session.svelte";
  import { devices, updater } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  import ProBadge from "./ProBadge.svelte";
  import SandboxSettings from "./SandboxSettings.svelte";
  import AnimateRow from "./AnimateRow.svelte";
  import DataSection from "./DataSection.svelte";
  import ExportButtons from "../../lib/export/ExportButtons.svelte";
  const node = $derived(store.node);
  // A section's theme mode (WebExport.mode / withMode): a class on the section.
  const MODES = ["auvyx-isolated", "auvyx-shadow", "auvyx-follow"];
  const modeOf = (cls: string) => { const p = cls.split(/\s+/); return p.includes("auvyx-shadow") ? "shadow" : p.includes("auvyx-isolated") ? "isolated" : "follow"; };
  const withMode = (cls: string, next: string) => [...cls.split(/\s+/).filter((c) => c && !MODES.includes(c)), ...(next === "isolated" ? ["auvyx-isolated"] : next === "shadow" ? ["auvyx-shadow"] : [])].join(" ");
</script>

<div>
  {#if node && node.kind !== "Raw"}
    {@const n = node}
    {@const update = updater(n.id)}
    {#key n.id}
      <div class="flex flex-col gap-3 px-3 pb-3 text-xs">
        <div class="flex flex-col gap-2">
          <Row name="Label"><Input class="h-7 text-xs" placeholder="Hero" value={n.label} oninput={(e) => update("label", (x) => ({ ...x, label: e.currentTarget.value }))} /></Row>
          <!-- The HTML element a section is (a technical choice, so it lives here). -->
          {#if n.kind === "Section"}
            <Row name="Tag"><Select size="sm" value={n.tag} options={SECTION_TAGS.map((t) => ({ value: t, label: `<${t}>` }))} onValue={(v: string) => update("tag", (x) => ({ ...x, tag: v }))} /></Row>
          {/if}
          <Row name="Class"><Input class="h-7 text-xs" placeholder="my-class" value={n.className} oninput={(e) => update("class", (x) => ({ ...x, className: e.currentTarget.value.trim() }))} /></Row>
          <Row name="ID"><Input class="h-7 text-xs" placeholder="section-id" value={n.anchor} oninput={(e) => update("id", (x) => ({ ...x, anchor: e.currentTarget.value.trim().replace(/[^A-Za-z0-9_-]/g, "") }))} /></Row>
          <Row name="Show"><Select size="sm" value={visibilityOf(n.styles, devices)} options={LEVELS.map(([value, label]) => ({ value, label }))} onValue={(v: string) => update("show", (x) => ({ ...x, styles: setVisibility(x.styles, devices, v as Level) }))} /></Row>
          {#if proShown}
          <div class="flex flex-col gap-1">
            <!-- Auvyx Builder Pro's (docs/editions.md): shown only while Pro is installed; without its licence what is there
                 stays and shows, and cannot change. -->
            <div class="flex items-center gap-1 text-[11px] text-muted-foreground">Custom CSS{#if proLocked}<ProBadge />{/if}</div>
            <!-- Asked on click, not on focus: the Pro dialog gives focus back to what opened it when it closes, and a
                 focus handler would ask again — the dialog reopening in a loop. -->
            <textarea readonly={proLocked}
              onclick={() => { if (proLocked) session.ask("custom-code"); }}
              onkeydown={(e) => { if (proLocked && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); session.ask("custom-code"); } }}
              class="min-h-24 w-full resize-y rounded-[3px] border border-input bg-transparent px-2 py-1.5 font-mono text-[11px] leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              data-auvyx-custom-css="" placeholder={"& { transition: transform .3s }\n&:hover { transform: translateY(-4px) }\n& > p { margin: 0 }"} spellcheck={false}
              value={n.css} oninput={(e) => update("css", (x) => ({ ...x, css: e.currentTarget.value }))}></textarea>
            {#if n.css.trim() === ""}<span class="text-[10px] text-muted-foreground">& is this element. Scoped: it cannot reach the rest of the page.</span>
            {:else if compileScopedCss(n.css) === null}<span class="text-[10px] text-destructive">Not applied: unbalanced braces, &lt;, a backslash, @import, or a url() that is not https or a site path.</span>
            {:else}<span class="text-[10px] text-muted-foreground">Applied.</span>{/if}
          </div>
          {/if}
        </div>
        <div>
          {#if n.kind === "Section"}
            <!-- Follow theme inherits the host. Isolated resets the section. Shadow puts it in a declarative shadow root. -->
            <div class="flex flex-col gap-2 border-t border-border pt-3" data-theme-mode="">
              <Row name="Theme"><Select size="sm" value={modeOf(n.className)} options={[{ value: "follow", label: "Follow theme" }, { value: "isolated", label: "Isolated" }, { value: "shadow", label: "Shadow" }]} onValue={(v: string) => update("theme-mode", (x) => ({ ...x, className: withMode(x.className, v) }))} /></Row>
              <p class="text-[11px] text-muted-foreground">Follow theme uses the theme type and colors. Isolated resets this section. Shadow keeps a theme rule with !important outside it.</p>
              <ExportButtons id={n.id} />
            </div>
          {/if}
        </div>
        <SandboxSettings id={n.id} {update} />
        <AnimateRow id={n.id} {update} />
        <DataSection id={n.id} kind={n.kind} {update} />
      </div>
    {/key}
  {/if}
</div>
