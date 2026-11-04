<script lang="ts">
  // The media library (wp/v2/media): browse, search, upload by button or by dropping files, or paste a link.
  import { Button, Input } from "../ui/kit";
  import { store } from "../lib/store.svelte";
  import { ui } from "../lib/ui.svelte";
  import { rest, connected, thumb, pageUrl, uploadMedia, type Media } from "../lib/host";
  const hasSite = () => connected;

  const node = $derived(ui.media ? store.doc.nodes[ui.media.id] : undefined);
  const video = $derived(node?.kind === "Video");
  const PER_PAGE = 40;

  let items = $state<Media[]>([]);
  let page = $state(1);
  let pages = $state(1);
  let search = $state("");
  let loading = $state(false);
  let uploading = $state(0);
  let error = $state("");
  let chosen = $state<Media | null>(null);
  let dropping = $state(false);
  let url = $state("");
  let input = $state<HTMLInputElement>();
  let dialog: HTMLDialogElement;

  async function load(reset: boolean) {
    if (!hasSite()) return;
    loading = true;
    error = "";
    const next = reset ? 1 : page + 1;
    try {
      const q = new URLSearchParams({ media_type: video ? "video" : "image", per_page: String(PER_PAGE), page: String(next), orderby: "date", order: "desc", _fields: "id,source_url,alt_text,mime_type,title,media_details" });
      if (search.trim()) q.set("search", search.trim());
      const { data, headers } = await rest<Media[]>(`wp/v2/media?${q}`);
      items = reset ? data : [...items, ...data];
      page = next;
      pages = Number(headers.get("X-WP-TotalPages") ?? 1);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  let timer: ReturnType<typeof setTimeout>;
  function onSearch() {
    clearTimeout(timer);
    timer = setTimeout(() => load(true), 300);
  }

  async function upload(files: FileList | File[]) {
    const list = [...files].filter((f) => f.type.startsWith(video ? "video/" : "image/"));
    if (!list.length) { error = video ? "Choose a video file." : "Choose an image file (JPEG, PNG, WebP, GIF, AVIF, SVG if your site allows it)."; return; }
    error = "";
    for (const f of list) {
      uploading++;
      try {
        const m = await uploadMedia(f);
        items = [m, ...items];
        chosen = m;
      } catch (e) {
        error = `${f.name}: ${(e as Error).message}`;
      } finally {
        uploading--;
      }
    }
  }

  function use(m: Media | null, src = "") {
    const id = ui.media?.id;
    if (!id) return;
    store.updateNode(id, (n) => m
      ? { ...n, src: n.kind === "Video" ? m.source_url : pageUrl(m), mediaId: n.kind === "Image" ? m.id : n.mediaId, alt: n.kind === "Image" && !n.alt ? m.alt_text : n.alt }
      : { ...n, src, mediaId: 0 });
    close();
  }

  function close() {
    ui.media = null;
  }

  $effect(() => {
    dialog.showModal();
    load(true);
    return () => clearTimeout(timer);
  });
</script>

<dialog bind:this={dialog} class="picker" aria-label={video ? "Choose a video" : "Choose an image"} onclose={close} oncancel={close}>
  <header>
    <strong>{video ? "Choose a video" : "Choose an image"}</strong>
    <Button variant="ghost" size="icon-sm" aria-label="Close" onclick={close}>✕</Button>
  </header>

  {#if hasSite()}
    <div class="bar">
      <Input class="h-8 text-xs" type="search" placeholder="Search the media library" bind:value={search} oninput={onSearch} />
      <Button variant="outline" size="sm" onclick={() => input?.click()} disabled={uploading > 0}>{uploading ? `Uploading ${uploading}…` : "Upload"}</Button>
      <input bind:this={input} type="file" accept={video ? "video/*" : "image/*"} multiple hidden onchange={(e) => e.currentTarget.files && upload(e.currentTarget.files)} />
    </div>

    <div
      class="grid-wrap"
      class:dropping
      role="region"
      aria-label="Media library"
      ondragover={(e) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); dropping = true; } }}
      ondragleave={(e) => { if (e.currentTarget === e.target) dropping = false; }}
      ondrop={(e) => { e.preventDefault(); dropping = false; if (e.dataTransfer?.files.length) upload(e.dataTransfer.files); }}
    >
      {#if items.length}
        <ul class="grid">
          {#each items as m (m.id)}
            <li>
              <button class="tile" class:on={chosen?.id === m.id} onclick={() => (chosen = m)} ondblclick={() => use(m)} title={m.title.rendered}>
                {#if m.mime_type.startsWith("video/")}<video src={m.source_url} muted preload="metadata"></video>
                {:else}<img src={thumb(m)} alt={m.alt_text} loading="lazy" />{/if}
              </button>
            </li>
          {/each}
        </ul>
        {#if page < pages}<div class="more"><Button variant="outline" size="sm" disabled={loading} onclick={() => load(false)}>{loading ? "Loading…" : "Load more"}</Button></div>{/if}
      {:else if loading}
        <p class="empty">Loading…</p>
      {:else}
        <p class="empty">{search ? "Nothing matches." : `No ${video ? "videos" : "images"} yet.`} Drop files here or use Upload.</p>
      {/if}
      {#if dropping}<div class="drop-hint">Drop to upload</div>{/if}
    </div>
  {:else}
    <p class="empty">The media library is available inside WordPress. Paste a URL below.</p>
  {/if}

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <footer>
    <form class="url" onsubmit={(e) => { e.preventDefault(); if (url.trim()) use(null, url.trim()); }}>
      <Input class="h-8 text-xs" type="url" placeholder="…or paste a link: https://" bind:value={url} />
      <Button variant="outline" size="sm" disabled={!url.trim()}>Use link</Button>
    </form>
    <div class="chosen">
      {#if chosen}<span class="name">{chosen.title.rendered.replace(/<[^>]+>/g, "")}{chosen.media_details?.width ? ` · ${chosen.media_details.width}×${chosen.media_details.height}` : ""}</span>{/if}
      <Button variant="default" size="sm" disabled={!chosen} onclick={() => use(chosen)}>Use {video ? "video" : "image"}</Button>
    </div>
  </footer>
</dialog>

<style>
  .picker { position: fixed; inset: 0; margin: auto; width: min(960px, calc(100vw - 32px)); height: min(720px, calc(100vh - 32px)); padding: 0; border: 1px solid var(--border); border-radius: var(--radius-xl, 12px); background: var(--background); color: var(--foreground); display: flex; flex-direction: column; box-shadow: 0 24px 64px rgb(0 0 0 / .25); }
  .picker::backdrop { background: rgb(0 0 0 / .45); }
  header, footer, .bar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; }
  header { justify-content: space-between; border-bottom: 1px solid var(--border); }
  .bar :global(.cn-input) { flex: 1; min-width: 0; }
  .grid-wrap { position: relative; flex: 1; min-height: 0; overflow: auto; padding: 0 16px 16px; }
  .grid-wrap.dropping { outline: 2px dashed var(--color-blue-600); outline-offset: -8px; }
  .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; }
  .tile { display: block; width: 100%; aspect-ratio: 1; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-md, 8px); overflow: hidden; background: var(--muted); cursor: pointer; }
  .tile img, .tile video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .tile:hover { border-color: var(--muted-foreground); }
  .tile.on { outline: 3px solid var(--color-blue-600); outline-offset: 1px; border-color: transparent; }
  .more { display: flex; justify-content: center; padding: 16px 0 0; }
  .empty { color: var(--muted-foreground); text-align: center; padding: 48px 16px; margin: 0; }
  .drop-hint { position: absolute; inset: 8px; display: grid; place-items: center; background: color-mix(in oklab, var(--background) 80%, transparent); font-weight: 600; pointer-events: none; }
  .error { margin: 0 16px; padding: 8px 12px; border-radius: var(--radius-md, 8px); background: color-mix(in oklab, var(--destructive) 12%, transparent); color: var(--destructive); }
  footer { border-top: 1px solid var(--border); justify-content: space-between; flex-wrap: wrap; }
  .url { display: flex; gap: 8px; flex: 1 1 320px; min-width: 0; }
  .url :global(.cn-input) { flex: 1; min-width: 0; }
  .chosen { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .name { color: var(--muted-foreground); font-size: var(--text-xs); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
