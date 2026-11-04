<script lang="ts">
  // "Add New Header" / "Add New Footer" of the Theme Builder (U/NewPartPage.scala, docs/theme-builder.md), Auvyx Editor
  // opened with `?view=new-part&type=header`: name it, pick where to start (empty, the theme's own, or a ready-made one
  // from the read-only site templates a theme or add-on brings), then it opens in the editor. It shows nowhere until its
  // first Publish asks where (Conditions).
  import { onMount } from "svelte";
  import { type Doc, emptyDoc, serialize, SiteTemplate } from "@auvyx/editor-core";
  import { Input } from "../ui/kit";
  import { config } from "../lib/config";
  import { rest } from "../lib/host";
  import { available, elementContext, get, list, read, type Summary } from "../lib/siteTemplates";
  import { siteSnapshot } from "../lib/agentSite";

  const params = new URLSearchParams(location.search);
  const kind = params.get("type") === "footer" ? "footer" : "header";
  const Word = kind === "footer" ? "Footer" : "Header";
  const GENERATED_BASE = "https://auvyx.invalid/assets";
  const assetsUrl = (config.assetsUrl || new URL("placeholders", location.href).href).replace(/\/$/, "");
  const scriptsBase = assetsUrl.replace(/placeholders$/, "").replace(/\/$/, "") + "/";

  let name = $state("");
  let busy = $state<string | null>(null);
  let error = $state("");
  let kits = $state<Summary[]>([]);

  type Got = { ok: true; doc: Doc } | { ok: false; error: string };
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  /** The Theme Builder screen, to go back to (and to come back to from the new template). */
  const builderUrl = (() => {
    const u = new URL(location.href);
    return `${u.origin}${u.pathname.replace("post.php", "admin.php")}?page=auvyx-builder-parts`;
  })();

  async function load() {
    if (!available()) return;
    try { kits = (await list()).filter((t) => t.builtIn); } catch { /* none */ }
  }

  /** Creates the template from a starting document and opens it, with the way back to the Theme Builder. */
  async function create(label: string, doc: () => Promise<Got>) {
    const title = name.trim() || Word;
    busy = `Creating “${title}” from ${label}…`;
    error = "";
    const d = await doc().catch((e): Got => ({ ok: false, error: msg(e) }));
    if (!d.ok) { busy = null; error = d.error; return; }
    try {
      const { data } = await rest<{ id: number; editUrl?: string }>("auvyx/v1/theme-builder", { method: "POST", body: JSON.stringify({ type: kind, title, content: serialize(d.doc) }) });
      const to = new URL(data.editUrl ?? "", location.href);
      to.searchParams.set("auvyx-back", builderUrl);
      to.searchParams.set("auvyx-back-title", "Theme Builder");
      location.href = to.toString();
    } catch (e) { busy = null; error = msg(e); }
  }

  /**
   * The menu the site's header shows now (`nav:6`): a ready-made header's menus show it (they name the site template's
   * own, which this site does not have).
   */
  async function siteMenu(): Promise<string | undefined> {
    try {
      const header = (await siteSnapshot()).parts.find(([area]) => area === "header")?.[1];
      return header ? Object.values(header.nodes).find((n) => n.kind === "Nav" && n.src.startsWith("nav:"))?.src : undefined;
    } catch { return undefined; }
  }

  async function fromKit(t: Summary): Promise<Got> {
    if (!available()) return { ok: false, error: "Site templates are not available here." };
    const menu = await siteMenu();
    let text: string;
    try { text = await get(t.id); } catch (e) { return { ok: false, error: msg(e) }; }
    const full = read(text);
    if (!full.ok) return { ok: false, error: `The template has problems: ${full.error}` };
    const navs: Record<string, string> = menu ? Object.fromEntries(full.value.menus.map((m) => [m.key, menu])) : {};
    const trees = full.value.parts[kind];
    if (!trees || !trees.length) return { ok: false, error: `“${t.title}” has no ${kind}.` };
    return { ok: true, doc: SiteTemplate.document(trees, elementContext(), navs) };
  }

  async function fromTheme(): Promise<Got> {
    if (!available()) return { ok: false, error: "Site templates are not available here." };
    try {
      const part = (await siteSnapshot()).parts.find(([area]) => area === kind)?.[1];
      return part ? { ok: true, doc: part } : { ok: false, error: `The theme has no ${kind} this site shows.` };
    } catch (e) { return { ok: false, error: msg(e) }; }
  }

  /** The live site with a choice in place (`?auvyx-preview-header=theme`), scaled down: the theme's own. */
  const home = (() => {
    const u = new URL("/", location.href);
    u.searchParams.set(`auvyx-preview-${kind}`, "theme");
    return u.toString();
  })();

  /** A ready-made site's picture, its top (the header) or its bottom (the footer). */
  const screenshot = (t: Summary) => {
    const url = t.screenshot.replace(GENERATED_BASE + "/", scriptsBase).replaceAll('"', "");
    return url ? `background-image:url("${url}");background-size:100% auto;background-position:${kind === "footer" ? "bottom" : "top"};background-repeat:no-repeat` : undefined;
  };

  onMount(() => { void load(); });
</script>

{#snippet shell(label: string, sub: string, shot: import("svelte").Snippet | null, shotStyle: string | undefined, go: () => void, key: string)}
  <div class="flex flex-col overflow-hidden rounded-xl border border-border bg-background" data-new-part-choice={key}>
    <div class="relative h-[96px] w-full overflow-hidden border-b border-border bg-muted" style={shotStyle}>{#if shot}{@render shot()}{/if}</div>
    <div class="flex items-center justify-between gap-2 p-3">
      <div class="flex min-w-0 flex-col">
        <div class="flex items-center gap-1.5"><span class="truncate text-sm font-medium">{label}</span></div>
        <span class="truncate text-[11px] text-muted-foreground">{sub}</span>
      </div>
      <button class="h-8 shrink-0 rounded-md bg-blue-600 px-3 text-xs font-medium text-white disabled:opacity-40" data-new-part-use={key}
        disabled={busy !== null} onclick={go}>Insert</button>
    </div>
  </div>
{/snippet}

{#snippet blank()}<div class="flex h-full items-center justify-center text-3xl text-muted-foreground">+</div>{/snippet}
{#snippet live()}
  <iframe src={home} tabindex="-1" aria-hidden="true" title="" class="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
    style="width:1280px;height:420px;transform:scale(0.27)"
    onload={(ev) => { if (kind === "footer") try { (ev.currentTarget as HTMLIFrameElement).contentWindow?.scrollTo(0, 1000000); } catch { /* another origin */ } }}></iframe>
{/snippet}

<div class="flex h-screen flex-col bg-shell text-foreground" data-new-part-page={kind}>
  <div class="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
    <a class="auvyx-pill whitespace-nowrap" href={builderUrl}>← Theme Builder</a>
    <span class="whitespace-nowrap text-sm font-semibold">{`Add New ${Word}`}</span>
    <div class="flex-1"></div>
    <span class="text-xs text-muted-foreground">Name</span>
    <div class="w-64"><Input class="h-8 text-sm" data-new-part-name="1" placeholder={`e.g. Main ${kind}`} bind:value={name} /></div>
  </div>
  <div class="min-h-0 flex-1 overflow-y-auto p-6">
    <p class="mb-4 max-w-2xl text-sm text-muted-foreground">Choose where to start. You design it in the Studio next; when you publish it, you choose where it shows.</p>
    {#if busy}<p class="mb-3 text-sm">{busy}</p>{/if}
    {#if error}<p class="mb-3 text-sm text-destructive">{error}</p>{/if}
    <div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
      {@render shell("Blank", `An empty ${kind} to build from scratch`, blank, undefined, () => create("an empty one", () => Promise.resolve({ ok: true, doc: emptyDoc })), "blank")}
      {@render shell(`Your theme’s ${kind}`, "A copy of the one your site shows now", live, undefined, () => create(`the theme’s ${kind}`, fromTheme), "theme")}
      {#each kits as t (t.id)}
        {@render shell(t.title, `From the “${t.title}” site template`, null, screenshot(t), () => create(`“${t.title}”`, () => fromKit(t)), t.id)}
      {/each}
    </div>
  </div>
</div>
