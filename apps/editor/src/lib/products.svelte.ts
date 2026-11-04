/**
 * Product loops in Auvyx Editor (U/UiCatalog.scala `productDisplay`, `productCardStyles`, `setCardStyle`; U/QuickSettings
 * `productOptions`): the card presets this site offers, restyling a loop's card, its pagination, and the Product display
 * kit. The pure part is editor-core's `ProductCards`; a preset's card is the card of its `pc-<key>` kit, built from the
 * generated patterns like every template (byte for byte the Studio's card).
 */
import { ProductCards, Settings, decodeTree, subtreeIds, type Doc, type TreeNode } from "@auvyx/editor-core";
import { rest } from "./host";
import { nextId } from "./ids";
import * as Templates from "./templates";
import { store } from "./store.svelte";
import { devices } from "./settingsOps";

/** UiCatalog.productDisplay: the Product display kit's templates this site can insert. */
export const productDisplay = Templates.templates.filter((t) => t.kit === ProductCards.PRODUCT_KIT && Templates.available(t));
const displayIds = new Set(productDisplay.map((t) => t.id));

/** UiCatalog.productCardStyles */
export const cardStyles = ProductCards.productCardStyles((id) => displayIds.has(id));

/** A fresh card of preset `key` (null until the templates' markup is loaded: `Templates.load()`). */
const cardOf = (key: string) => {
  const t = Templates.byId(ProductCards.cardTemplateId(key));
  const built = t ? Templates.build(t) : null;
  return built ? ProductCards.cardOfTemplate(built) : null;
};

/** What UiCatalog.restyleCards needs here. */
export const restyleContext = (): ProductCards.RestyleContext => ({ styles: cardStyles, cardOf, devices });

/** UiCatalog.restyleCards on a document (the templates' markup must be loaded). */
export const restyle = (doc: Doc, loopId: string, key: string): Doc | null => ProductCards.restyleCards(doc, loopId, key, restyleContext());

/** UiCatalog.setCardStyle: one undo step per loop (`card-style:<id>`), then the card's WordPress blocks drawn again. */
export async function setCardStyle(loopId: string, key: string) {
  await Templates.load();
  const next = restyle(store.doc, loopId, key);
  if (!next) return;
  store.commit(next, `card-style:${loopId}`);
  void refreshCard(loopId);
}

const SELF_CLOSING = /^\s*<!--\s+wp:([a-z0-9_\-/]+)(\s+(\{[\s\S]*\}))?\s+\/-->\s*$/;

/**
 * RawBlocks.refresh on each WordPress block of a loop's card (UiCatalog.setCardStyle, AiAgent's cardStyle): the site
 * renders it again (auvyx/v1/render) and its markup is kept as WordPress writes it (attributes equal to their defaults
 * dropped), so the saved page is the Studio's. Forms are drawn from their own definition: nothing to ask.
 */
export async function refreshCard(loopId: string) {
  const card = store.doc.nodes[loopId]?.children[0];
  if (card === undefined) return;
  const raws = subtreeIds(store.doc, card).map((i) => store.doc.nodes[i]!).filter((n) => n.kind === "Raw" && n.blockName !== "auvyx/form");
  await Promise.all(raws.map(async (n) => {
    const m = SELF_CLOSING.exec(n.raw);
    if (!m) return;
    let attrs: unknown = {};
    try { attrs = m[3] ? JSON.parse(m[3]) : {}; } catch { attrs = {}; }
    try {
      const { data } = await rest<{ blocks?: TreeNode[] }>("auvyx/v1/render", { method: "POST", body: JSON.stringify({ block: m[1], attrs }) });
      const fresh = decodeTree(data.blocks ?? [], nextId);
      const root = fresh.roots[0] ? fresh.nodes[fresh.roots[0]] : undefined;
      const current = store.doc.nodes[n.id];
      if (root && current && root.raw && current.raw !== root.raw) store.updateNode(n.id, (x) => ({ ...x, raw: root.raw, html: root.html }), `raw:${n.id}`);
    } catch { /* the canvas still draws the block from its markup */ }
  }));
}

/** QuickSettings' pagination: "off", or a DataFields.Pagination key ("" numbers, "button", "scroll"). */
export const paginationOf = (query: Readonly<Record<string, string>>) =>
  Settings.queryValue(query, "paginate") === "true" ? Settings.queryValue(query, "more") : "off";

export function setPagination(id: string, key: string) {
  store.updateNode(id, (n) => ({
    ...n,
    query: Object.fromEntries(Settings.normalizeQuery({ ...n.query, paginate: key === "off" ? "false" : "true", more: key === "off" ? "" : key })),
  }), `pagination:${id}`);
}

/** QuickSettings.hasProductOptions: a product loop, or a loop or section while the Product display kit is offered. */
export const hasProductOptions = (n: { kind: string; query: Readonly<Record<string, string>> }) =>
  (n.kind === "Loop" && Settings.queryValue(n.query, "postType") === "product") || ((n.kind === "Loop" || n.kind === "Section") && productDisplay.length > 0);

/** AssetsPanel.openKit: the kit the Assets panel opens on (the Product display presets). */
export const assetsKit = $state<{ kit: string | null }>({ kit: null });

/** "Browse product display presets": the Assets panel, opened on the Product display kit. */
export function browseProductKits() {
  assetsKit.kit = ProductCards.PRODUCT_KIT;
  store.leftPanel = "assets";
  store.leftOpen = true;
}
