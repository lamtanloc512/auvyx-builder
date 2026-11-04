<script lang="ts">
  // A code element (SettingsPanel.codeSettings, CodeElement): its HTML, its module, the libraries and data sources it
  // names. Its CSS is Advanced › Custom CSS. Only someone who may add scripts changes it.
  import codeLibraries from "../../../../../shared/code-libraries.json";
  import { store } from "../../lib/store.svelte";
  import { canScript, session } from "../../lib/session.svelte";
  import type { Update } from "../../lib/settingsOps";
  import { FrontEnd } from "@auvyx/editor-core";
  import { codeConsole } from "../../lib/console.svelte";
  let { id, update }: { id: string; update: Update } = $props();
  const n = $derived(store.doc.nodes[id]);
  const isCode = $derived(!!n && n.kind === "Section" && (n.className.split(" ").includes("auvyx-code") || n.script !== "" || n.markup !== ""));
  const LIBS: [string, string][] = codeLibraries.libraries.map((l) => [l.name, l.about]);
  const AREA = "w-full resize-y rounded-[3px] border border-input bg-transparent px-2 py-1.5 font-mono text-[11px] leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
  $effect(() => { if (isCode) session.ensure(); });
  // what the source would be refused for on save and publish (SlotCode.validate's profile rules and limits)
  const issues = $derived(n && isCode ? FrontEnd.codeIssues(n) : []);
  const error = $derived(codeConsole.errors[id]);
  const lines = $derived(codeConsole.logs[id] ?? []);
</script>

{#snippet checks(options: [string, string][], current: string[], key: "libs" | "uses", attr: string)}
  <div class="flex flex-col gap-1">
    {#each options as [value, text] (value)}
      <label class="flex items-start gap-2 text-[11px]" {...{ [`data-${attr}`]: value }}>
        <input type="checkbox" class="mt-0.5" disabled={!canScript} checked={current.includes(value)} onclick={(e) => { const c = e.currentTarget.checked; update(`${attr}-${value}`, (x) => ({ ...x, [key]: c ? [...new Set([...x[key], value])] : x[key].filter((v) => v !== value) })); }} />
        <span><span class="font-mono">{value}</span><span class="text-muted-foreground"> — {text}</span></span>
      </label>
    {/each}
  </div>
{/snippet}

<div>
  {#if n && isCode}
    <div class="flex flex-col gap-2" data-code-settings="">
      {#if !canScript}<p class="text-[11px] text-muted-foreground">Only a user who may add scripts (an administrator) can change this element's code.</p>{/if}
      <span class="text-[11px] text-muted-foreground">HTML</span>
      <textarea class="{AREA} min-h-24" data-code-markup="" spellcheck={false} disabled={!canScript} value={n.markup} oninput={(e) => update("markup", (x) => ({ ...x, markup: e.currentTarget.value }))}></textarea>
      <span class="text-[11px] text-muted-foreground">Script (an ES module)</span>
      <textarea class="{AREA} min-h-48" data-code-script="" spellcheck={false} disabled={!canScript} value={n.script}
        placeholder={"export default ({ el, lib, data, source, reduced }) => {\n  // el: this element · lib: the libraries below · data: the data sources below\n  // source(name): a public source's items again (a promise)\n  return () => {} // cleanup\n};"}
        oninput={(e) => update("script", (x) => ({ ...x, script: e.currentTarget.value }))}></textarea>
      {#if issues.length}
        <ul class="list-disc pl-4 text-[11px] text-destructive" data-code-issues="">{#each issues as i, k (k)}<li>{FrontEnd.codeIssue(i)}</li>{/each}</ul>
      {/if}
      {#if error !== undefined}<p class="text-[11px] text-destructive" data-code-error="">The script failed: {error}</p>{/if}
      <!-- What the module printed on the canvas (console.log…), latest last. -->
      {#if lines.length}
        <pre class="max-h-32 overflow-auto whitespace-pre-wrap rounded-[3px] bg-muted/40 px-2 py-1 font-mono text-[10.5px] text-muted-foreground" data-code-console="">{lines.slice(-12).join("\n")}</pre>
      {/if}
      <span class="pt-1 text-[11px] text-muted-foreground">Libraries (loaded only for this element)</span>
      {@render checks(LIBS, n.libs, "libs", "code-lib")}
      {#if session.dataSourceList.length}
        <div class="flex flex-col gap-1">
          <span class="pt-1 text-[11px] text-muted-foreground">Data (its items as data.&lt;name&gt;)</span>
          {@render checks(session.dataSourceList.map((s) => [s.name, s.label]), n.uses, "uses", "code-data")}
        </div>
      {/if}
      <p class="text-[11px] text-muted-foreground">Its CSS is Advanced › Custom CSS (& is this element). The page runs the script when the element comes near the screen.</p>
    </div>
  {/if}
</div>
