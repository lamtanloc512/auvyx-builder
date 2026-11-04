<script lang="ts">
  // SettingsPanel.cardOptions: Flatsome's product box options on the loop: show or hide each part of the card template
  // (every item follows) and an image hover effect. Hiding uses the same display:none as the Show menu.
  import { ProductCards, Settings as S, setVisibility, visibilityOf, type El } from "@auvyx/editor-core";
  import { Select } from "../../ui/kit";
  import { store } from "../../lib/store.svelte";
  import { nameOf } from "../../lib/labels";
  import { session } from "../../lib/session.svelte";
  import { devices, type Update } from "../../lib/settingsOps";
  import Row from "./Row.svelte";
  import { cardStyles, setCardStyle } from "../../lib/products.svelte";
  let { id, update }: { id: string; update: Update } = $props();
  const n = $derived(store.doc.nodes[id]);
  /** The first data-bound element (or image/button) on each branch is one part; wrappers are looked through. */
  const parts = $derived.by(() => {
    const doc = store.doc;
    const walk = (cid: string): El[] => { const c = doc.nodes[cid]; return !c ? [] : Object.keys(c.bind).length || c.kind === "Button" || c.kind === "Image" ? [c] : c.children.flatMap(walk); };
    const first = n?.children[0] ? doc.nodes[n.children[0]] : undefined;
    return first ? first.children.flatMap(walk) : [];
  });
  const partName = (p: El) => { const k = ["content", "url", "text"].map((a) => p.bind[a]).find((x) => x !== undefined); return k === undefined ? nameOf(p) : S.dataLabel(k, session.extraFields).split(": ").at(-1)!; };
  const hover = $derived(n?.className.split(" ").find((c) => c.startsWith("auvyx-hover-"))?.slice(12) ?? "");
</script>

<div class="flex flex-col gap-2 border-t border-border pt-2" data-card-options="1">
  <!-- Product loops: the card presets (ProductCards), applied by replacing the card with a fresh one. -->
  {#if n && S.queryValue(n.query, "postType") === "product"}
    <Row name="Style">
      <div data-card-style="1">
        <Select size="sm" value={ProductCards.loopCardStyle(store.doc, n)} options={[{ value: "", label: "Custom" }, ...cardStyles.map((s) => ({ value: s.key, label: s.name }))]}
          onValue={(key: string) => void setCardStyle(id, key)} />
      </div>
    </Row>
  {/if}
  <Row name="Card">
    <div class="flex flex-col gap-1">
      {#each parts as part (part.id)}
        <label class="flex items-center gap-2 text-[11px]" data-card-part={partName(part)}>
          <input type="checkbox" checked={visibilityOf(part.styles, devices) !== "Hidden"} onclick={(e) => { const on = e.currentTarget.checked; store.updateNode(part.id, (x) => ({ ...x, styles: setVisibility(x.styles, devices, on ? "Always" : "Hidden") }), `card-part:${part.id}`); }} />
          {partName(part)}
        </label>
      {/each}
    </div>
  </Row>
  <Row name="Hover">
    <Select size="sm" value={hover} options={[{ value: "", label: "None" }, { value: "zoom", label: "Zoom image" }, { value: "fade", label: "Fade image" }, { value: "gray", label: "Colour on hover" }, { value: "lift", label: "Lift card" }]}
      onValue={(v: string) => update("card-hover", (x) => ({ ...x, className: [...x.className.split(" ").filter((c) => c !== "" && !c.startsWith("auvyx-hover-")), ...(v ? [`auvyx-hover-${v}`] : [])].join(" ") }))} />
  </Row>
</div>
