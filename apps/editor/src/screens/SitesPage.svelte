<script lang="ts">
  // The Site templates screen (U/SitesPage.scala, docs/site-templates.md), outside the page editor: Auvyx Editor opened with
  // `?view=sites`, shown in an admin tab (WordPress: Auvyx Builder > Site templates). A whole site applied in one go (pages,
  // menus, header, footer, front page, colors); this site saved as one; a `auvyx-site/1` file downloaded or imported, or an
  // Elementor export (a saved template or an unzipped kit's files) turned into one. The page editor offers the templates'
  // pages one by one (Page templates); the agent does all of it through its `site_template` tool.
  import { onMount } from "svelte";
  import { SiteTemplate } from "@auvyx/editor-core";
  import { readJson, type JVal } from "@auvyx/editor-core/import";
  import { Input } from "../ui/kit";
  import { config } from "../lib/config";
  import { rest } from "../lib/host";
  import { get, read, type Summary } from "../lib/siteTemplates";
  import * as Ops from "../lib/agentSiteTemplate";
  import { siteSnapshot } from "../lib/agentSite";
  import { encodeTemplate } from "../lib/agentCore";
  import { isZip, utf8, zipTexts } from "./sites/zip";
  import { detect, pictures, relink, site } from "./sites/elementorSite";

  const GENERATED_BASE = "https://auvyx.invalid/assets";
  const extra = config as unknown as { designBrief?: string; studioUrl?: string };
  const assetsUrl = (config.assetsUrl || new URL("placeholders", location.href).href).replace(/\/$/, "");
  /** Where Auvyx's scripts and pictures are (Session.scriptsBase). */
  const scriptsBase = assetsUrl.replace(/\/$/, "").replace(/placeholders$/, "").replace(/\/$/, "") + "/";
  const shot = (s: string) => s.replace(GENERATED_BASE + "/", scriptsBase).replaceAll('"', "");

  let applied = $state<[string, string | undefined] | null>(null);
  let items = $state<Summary[]>([]);
  let loading = $state(false);
  let busy = $state<string | null>(null);
  let report = $state("");
  let saveTitle = $state("");
  let saveDescription = $state("");

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const s = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));

  async function reload() {
    loading = true;
    try {
      const { data } = await rest<{ items?: Record<string, unknown>[] }>("auvyx/v1/site-templates");
      items = (data.items ?? []).map((o) => ({
        id: s(o.id), title: s(o.title), description: s(o.description), screenshot: s(o.screenshot),
        pages: Array.isArray(o.pages) ? o.pages.map(s) : [], builtIn: o.builtIn === true,
        // WpHost reads no blueprint flag (WordPress cannot remove a demo from here): "Remove demo" stays hidden
        blueprint: false,
      }));
    } catch (e) {
      report = `Could not list the templates: ${msg(e)}`;
    }
    loading = false;
  }

  function run(label: string, f: () => Promise<string>) {
    busy = label;
    report = "";
    f().then((text) => { busy = null; report = text; void reload(); }, (e) => { busy = null; report = msg(e); void reload(); });
  }

  /** The site's DESIGN.md applied to the Auvyx tokens and the theme (WpHost.designBriefs). */
  async function applyBrief(markdown: string): Promise<{ ok: boolean; text: string }> {
    try {
      await rest("auvyx/v1/design/brief", { method: "POST", body: JSON.stringify({ markdown }) });
      return { ok: true, text: "Applied" };
    } catch (e) { return { ok: false, text: `Not applied: ${msg(e)}` }; }
  }

  const tool = (action: string, json: string) => Ops.tool(action, json, () => extra.designBrief ?? "", applyBrief);

  /** Where to go next: the template's front page in the editor, when applying set it. */
  async function frontEditUrl(): Promise<string | undefined> {
    try {
      const front = (await siteSnapshot()).pages.find((p) => p.front);
      return front && extra.studioUrl ? extra.studioUrl.replace("{id}", front.id) : undefined;
    } catch { return undefined; }
  }

  async function applyTemplate(t: Summary) {
    const plan = `Apply “${t.title}” to this site?\n\nIt creates ${t.pages.length} new page(s) (${t.pages.join(", ")}) and its menus, replaces the site's header, footer and front page, and changes its colors and fonts. Existing pages are kept.`;
    if (!confirm(plan)) return;
    busy = `Applying “${t.title}”…`;
    report = "";
    applied = null;
    try {
      const d = read(await get(t.id));
      if (!d.ok) { busy = null; report = `The template has problems: ${d.error}`; return; }
      const r = await Ops.apply(d.value, applyBrief);
      const front = d.value.pages.some((p) => p.front) && r.done.some((x) => x.startsWith("Front page")) ? await frontEditUrl() : undefined;
      busy = null;
      report = `Applied “${d.value.title}”:\n${[...r.done.map((x) => `✓ ${x}`), ...r.failed.map((x) => `✗ ${x}`)].join("\n")}`;
      applied = [d.value.title, front];
    } catch (e) { busy = null; report = msg(e); }
  }

  function remove(t: Summary) {
    if (confirm(`Delete the template “${t.title}”? Pages made from it stay.`)) run("Deleting…", () => tool("delete", JSON.stringify({ id: t.id })).then((r) => r.text));
  }

  /** Removes what applying a blueprint and importing its demo made (SiteTemplateOps.removeDemo): WordPress cannot from here. */
  function removeDemo(t: Summary) {
    if (confirm(`Remove the demo of “${t.title}”?\n\nIt removes the products, pictures, reviews and reviewer accounts the demo import made, and the pages, menus and settings applying it made. Your own products, pages and menus are not touched.`)) {
      applied = null;
      run("Removing the demo…", () => Promise.resolve("This site cannot remove a demo from here."));
    }
  }

  async function download(t: Summary) {
    try {
      const json = await get(t.id);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      a.setAttribute("download", `${t.id}.json`);
      a.click();
    } catch (e) { report = msg(e); }
  }

  /**
   * A chosen file as text files: itself, or the `.json` files inside it when it is a zip archive (an exported kit). The
   * path inside a kit's folder or archive tells a page from a template.
   */
  async function readFiles(file: File): Promise<{ ok: true; value: [string, string][] } | { ok: false; error: string }> {
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const buf = await file.arrayBuffer().catch(() => new ArrayBuffer(0));
    if (isZip(buf)) return zipTexts(buf, (n) => n.endsWith(".json") && !n.startsWith("__MACOSX/"));
    return { ok: true, value: [[path, utf8(new Uint8Array(buf))]] };
  }

  /**
   * Copies the template's pictures from the old site into this site's Media Library, one at a time, and points the
   * template at the copies. Pictures that cannot be copied keep their old address and are counted.
   */
  async function copyPictures(t: SiteTemplate.SiteTemplate): Promise<[SiteTemplate.SiteTemplate, number, string[]]> {
    const origin = location.origin;
    const pics = pictures(t, (u) => u.startsWith(origin) || u.startsWith(SiteTemplate.GENERATED_ASSETS));
    const copied = new Map<string, string>();
    const failed: string[] = [];
    for (const [i, [url, alt]] of pics.entries()) {
      busy = `Copying pictures into the Media Library: ${i + 1} of ${pics.length}…`;
      try {
        const { data } = await rest<{ url?: string }>("auvyx/v1/media/sideload", { method: "POST", body: JSON.stringify({ url, alt }) });
        if (data.url) copied.set(url, data.url); else failed.push(url);
      } catch { failed.push(url); }
    }
    return [relink(t, copied, encodeTemplate), copied.size, failed];
  }

  let n = 0;
  /**
   * Files from the computer: a `auvyx-site` file is checked and kept as one of the site's templates; Elementor's files (one
   * exported template, an exported kit's .zip, or its unzipped .json files chosen together) become one template first,
   * with their pictures copied into the Media Library.
   */
  function importFiles(files: File[]) {
    run(files.length === 1 ? `Importing ${files[0]!.name}…` : `Importing ${files.length} files…`, async () => {
      const results = await Promise.all(files.map(readFiles));
      const problems = results.flatMap((r) => (r.ok ? [] : [r.error]));
      const texts = results.flatMap((r) => (r.ok ? r.value : []));
      const parsed = texts.map(([name, text]): [string, string, JVal | undefined] => { try { return [name, text, readJson(text)]; } catch { return [name, text, undefined]; } });
      if (!texts.length) return problems.join("\n");
      if (parsed.some(([, , j]) => j !== undefined && detect(j))) {
        const made = site(parsed.flatMap(([name, , j]) => (j !== undefined ? [[name, j] as [string, JVal]] : [])), SiteTemplate.GENERATED_ASSETS, () => `el${++n}`);
        if (!made.ok) return made.error;
        const [template, copied, failed] = await copyPictures(made.value.template);
        busy = "Saving the template…";
        const { ok, text } = await tool("save", encodeTemplate(template));
        if (!ok) return text;
        const sk = made.value;
        const notes = [
          copied > 0 ? `${copied} picture(s) copied into the Media Library.` : "",
          failed.length ? `${failed.length} picture(s) could not be copied and still load from the old site: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""}` : "",
          sk.kept.length ? `Not converted (marked with a dashed box to rebuild): ${sk.kept.join(", ")}.` : "",
          sk.skipped.length ? `Not Elementor files, left out: ${sk.skipped.join(", ")}.` : "",
        ].filter(Boolean);
        const parts = Object.keys(template.parts);
        return [`“${template.title}” is ready: ${template.pages.length} page(s)${parts.length ? `, ${parts.join(" and ")}` : ""}. Apply it from its card.`, ...notes, ...problems].join("\n");
      }
      const saved = await Promise.all(texts.map(([name, text]) => tool("save", text).then((r) => `${name}: ${r.text}`)));
      return [...saved, ...problems].join("\n");
    });
  }

  /** "View the site": the site's home. */
  const siteHome = config.viewUrl.split("?")[0]!.replace(/^(https?:\/\/[^/]+).*$/, "$1/");

  onMount(() => { void reload(); });
</script>

<div class="flex h-dvh min-w-0 max-w-full flex-col overflow-hidden bg-background text-foreground" data-site-templates-page="1">
  <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-3">
    <span class="text-sm font-semibold">Site templates</span>
    <span class="min-w-0 flex-1 basis-80 text-xs text-muted-foreground">A whole site — design, header, footer, menus and pages — in one file. Moving from Elementor? Import its exported template or kit (.zip). To change one page, use Page templates in the page editor.</span>
    <label class="flex h-8 shrink-0 cursor-pointer items-center rounded-md border border-border px-3 text-xs hover:bg-muted" data-site-template-import="1"
      title="An Auvyx site template (.json), or Elementor's: an exported template, an exported kit (.zip), or the kit's .json files chosen together">
      Import…
      <input type="file" accept="application/json,.json,application/zip,.zip" multiple class="hidden"
        onchange={(ev) => {
          const el = ev.currentTarget;
          if (el.files && el.files.length > 0) importFiles([...el.files]);
          el.value = "";
        }} />
    </label>
  </div>
  <div class="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_280px]">
    <div class="min-h-0 min-w-0 overflow-y-auto p-5">
      {#if loading && !items.length}
        <p class="text-xs text-muted-foreground">Loading…</p>
      {:else if !items.length}
        <p class="text-xs text-muted-foreground">No site templates yet. Save this site as one, import a file, or ask the AI to make one.</p>
      {:else}
        <div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {#each items as t (t.id)}
            <div class="flex flex-col overflow-hidden rounded-lg border border-border bg-background" data-site-template={t.id}>
              <div class="aspect-[16/10] w-full border-b border-border bg-muted bg-cover bg-top" data-site-template-shot={t.id}
                style={t.screenshot ? `background-image:url("${shot(t.screenshot)}")` : undefined}></div>
              <div class="flex flex-1 flex-col gap-1 p-3">
                <div class="flex items-center gap-2"><span class="text-sm font-semibold">{t.title}</span>
                  {#if t.builtIn}<span class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Built in</span>{/if}</div>
                {#if t.description}<p class="text-xs text-muted-foreground">{t.description}</p>{/if}
                <p class="text-[11px] text-muted-foreground">{`${t.pages.length} page(s): ${t.pages.slice(0, 6).join(", ")}`}</p>
                <div class="flex-1"></div>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <button class="h-7 whitespace-nowrap rounded-md bg-blue-600 px-3 text-xs font-medium text-white disabled:opacity-40" data-site-template-apply={t.id}
                    disabled={busy !== null} onclick={() => applyTemplate(t)}>Apply</button>
                  {#if t.blueprint}
                    <button class="h-7 whitespace-nowrap rounded-md border border-border px-2.5 text-xs hover:bg-muted disabled:opacity-40" data-site-template-remove-demo={t.id}
                      disabled={busy !== null} onclick={() => removeDemo(t)}>Remove demo</button>
                  {/if}
                  <button class="h-7 whitespace-nowrap rounded-md border border-border px-2.5 text-xs hover:bg-muted" onclick={() => download(t)}>Download</button>
                  {#if !t.builtIn}
                    <button class="h-7 whitespace-nowrap rounded-md border border-border px-2.5 text-xs text-red-600 hover:bg-muted disabled:opacity-40"
                      disabled={busy !== null} onclick={() => remove(t)}>Delete</button>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    <div class="flex min-h-0 flex-col gap-3 overflow-y-auto border-l border-border bg-muted/30 p-4">
      <div>
        {#if applied}
          <div class="flex flex-col gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900" data-site-template-done="1">
            <span class="font-medium">{`“${applied[0]}” is on your site.`}</span>
            <div class="flex gap-2">
              {#if applied[1]}<a class="rounded-md bg-emerald-700 px-3 py-1.5 font-medium text-white" href={applied[1]} target="_top">Edit the home page</a>{/if}
              <a class="rounded-md border border-emerald-400 px-3 py-1.5" href={siteHome} target="_blank">View the site</a>
            </div>
          </div>
        {/if}
      </div>
      {#if busy}<p class="text-xs text-muted-foreground">{busy}</p>{/if}
      {#if report}
        <pre class="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-2 text-[11px] leading-relaxed" data-site-template-report="1">{report}</pre>
      {/if}
      <span class="mt-2 text-xs font-semibold">Save this site as a template</span>
      <p class="text-[11px] leading-relaxed text-muted-foreground">Its pages, menus, header, footer and design brief, ready to apply on another Auvyx site (WordPress or EzyPlatform).</p>
      <Input class="h-8 text-xs" placeholder="Name" bind:value={saveTitle} />
      <Input class="h-8 text-xs" placeholder="Short description" bind:value={saveDescription} />
      <button class="h-8 rounded-md bg-blue-600 px-3 text-xs font-medium text-white disabled:opacity-40" data-site-template-capture="1"
        disabled={saveTitle.trim() === "" || busy !== null}
        onclick={() => {
          const args = { id: SiteTemplate.slugify(saveTitle), title: saveTitle.trim(), description: saveDescription.trim() };
          run("Saving this site…", () => tool("capture", JSON.stringify(args)).then((r) => r.text));
        }}>Save as template</button>
    </div>
  </div>
</div>
