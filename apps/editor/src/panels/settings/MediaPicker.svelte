<script lang="ts" module>
  export interface Picked { url: string; alt: string; id?: number }
</script>

<script lang="ts">
  // U/MediaPicker.scala: upload, then the Media Library's recent images and the placeholders, inline; a pick gives
  // the picture's address, alt text and attachment id.
  import { Icon } from "../../ui/kit";
  import { config } from "../../lib/config";
  import { connected, rest, uploadMedia } from "../../lib/host";
  let { onPick }: { onPick: (m: Picked) => void } = $props();
  const placeholders: Picked[] = ["landscape", "square", "portrait", "avatar"].map((n) => ({ url: `${config.assetsUrl ?? ""}/${n}.svg`, alt: n }));
  let library = $state<Picked[]>(connected ? [] : placeholders);
  let status = $state("");
  $effect(() => {
    if (!connected) return;
    rest<{ id?: number; source_url: string; alt_text: string }[]>("wp/v2/media?media_type=image&per_page=24&_fields=id,source_url,alt_text")
      .then(({ data }) => (library = [...data.map((m) => ({ url: m.source_url, alt: m.alt_text, id: m.id })), ...placeholders]))
      .catch(() => {});
  });
  async function upload(files: FileList | null) {
    if (!files || !files.length) return;
    status = "Uploading…";
    try {
      const m = await uploadMedia(files[0]!);
      status = "";
      const item = { url: m.source_url, alt: m.alt_text, id: m.id };
      library = [item, ...library];
      onPick(item);
    } catch (e) {
      status = `Failed: ${(e as Error).message}`;
    }
  }
</script>

<div class="flex flex-col gap-2">
  {#if connected}
    <label class="flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-input hover:border-primary hover:text-primary">
      <Icon name="upload" size={14} />{status || "Upload image"}
      <input type="file" accept="image/*" class="hidden" onchange={(e) => upload(e.currentTarget.files)} />
    </label>
  {/if}
  <div class="grid grid-cols-4 gap-1">
    {#each library as media, i (media.url + i)}
      <button class="aspect-square overflow-hidden rounded-md border border-border hover:border-primary" title={media.alt} onclick={() => onPick(media)}>
        <img src={media.url} alt={media.alt} class="size-full object-cover" />
      </button>
    {/each}
  </div>
</div>
