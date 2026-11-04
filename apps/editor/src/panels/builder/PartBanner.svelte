<script lang="ts">
  // Notices under the top bar about the part being edited (U/Banners.scala): where a Theme Builder header or footer shows
  // (kept current as its conditions change), and which product a product page part is previewed with.
  import { Select, selectItems } from "../../ui/kit";
  import { config } from "../../lib/config";
  import { conditions } from "../../lib/conditions.svelte";
  import { store } from "../../lib/store.svelte";
  import { toast } from "../../lib/toast.svelte";
  import { nextId } from "../../lib/ids";
  import { FooterBuilder as FB, HeaderBuilder as HB } from "../../lib/builderCore";

  // A header or footer part that is still the theme's own blocks: start an Auvyx one. The Studio starts a ready (legacy)
  // header here and offers "Convert to builder" next; Auvyx Editor starts the builder header / footer right away.
  const area = config.isPart && (config.partArea === "header" || config.partArea === "footer") ? config.partArea : null;
  const themeOnly = $derived(!!area && store.doc.roots.length > 0 && store.doc.roots.every((r) => !store.doc.nodes[r] || store.doc.nodes[r]!.kind === "Raw"));
  function start() {
    const env = { newId: nextId, platform: "wordpress" as const };
    const doc = area === "header" ? HB.newHeader(HB.headerPresetById("marketplace")!, env) : FB.newFooter(FB.footerPresetById("store")!, env);
    const root = doc.roots[0]!;
    store.commit({ ...store.doc, roots: doc.roots, nodes: { ...doc.nodes, [root]: { ...doc.nodes[root]!, align: "full" } } });
    store.selected = root;
    toast(`Ready ${area}: pick a layout and the parts you want on the right`);
  }

  type Preview = { id?: string | number; kind?: string; choices?: { id: string | number; title: string }[]; url?: string };
  const preview = (config as unknown as { preview?: Preview | null }).preview;
  const p = preview && String(preview.id ?? "") ? preview : null;

  function switchTo(id: string) {
    if (!p || id === String(p.id)) return;
    if (store.safe || confirm("Switch the preview? Unsaved changes are kept on this device and offered back."))
      location.href = String(p.url ?? "").replace("{id}", encodeURIComponent(id)).replace("%7Bid%7D", encodeURIComponent(id));
  }
</script>

{#if themeOnly}
  <div class="flex shrink-0 items-center gap-3 border-b px-3 py-1.5 text-xs border-violet-200 bg-violet-50 text-violet-900" data-part-starter={area}>
    <span>This {area} is the theme's design. Use a ready {area}: pick a layout and the parts you want.</span>
    <button type="button" class="rounded-md border border-current/30 px-2 py-0.5 font-medium hover:bg-black/5" onclick={start}>Use a ready {area}</button>
  </div>
{/if}
{#if conditions.available}
  {@const summary = conditions.current?.summary ?? ""}
  <div class={["flex shrink-0 items-center gap-3 border-b px-3 py-1.5 text-xs", summary ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"]} data-page-note="">
    <span>{summary ? `This ${conditions.word} shows on: ${summary}. What you change here shows there.` : `This ${conditions.word} has no display conditions yet, so it shows nowhere. Publish it to choose where.`}</span>
    <button type="button" class="rounded-md border border-current/30 px-2 py-0.5 font-medium hover:bg-black/5" onclick={() => conditions.show()}>Display Conditions</button>
  </div>
{/if}
{#if p}
  <div class="flex shrink-0 items-center gap-3 border-b px-3 py-1.5 text-xs border-blue-200 bg-blue-50 text-blue-900" data-preview-with="">
    <span>{p.kind === "product" ? "This part is shown on every product page. Previewing with" : "Previewing with"}</span>
    <div class="w-56 bg-white">
      <Select value={String(p.id)} options={selectItems((p.choices ?? []).map((c) => [String(c.id), c.title]))} size="xs" onValue={switchTo} />
    </div>
  </div>
{/if}
