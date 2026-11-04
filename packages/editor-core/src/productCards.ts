/**
 * Product card styles (the Scala `ProductCards`, S/ProductCards.scala) and restyling a product loop's card
 * (U/UiCatalog.scala `productCardStyles`, `cardStyle`, `restyleCards`).
 *
 * The presets are data here as in Scala. A card itself is not rebuilt from the Scala builder: it is the card of the
 * preset's own kit, `pc-<key>` (products/builder/patterns/generated, written by the Scala `ProductKits` from
 * `ProductCards.loop`, whose single child is `ProductCards.card`), read back with markupToTree + decodeTree, which is
 * byte for byte the Studio's tree (test/markupTree.test.ts). `cardOf` takes that template's built tree.
 */
import type { Styles } from "@auvyx/style-engine";
import { type Doc, type El, subtreeIds } from "./model";
import { insert, remove, update } from "./ops";
import { queryValue, setStyles } from "./settings";

/** ProductCards.Style: one card preset (see the Scala doc for each field). */
export interface CardStyle {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly ratio: string;
  readonly tile: boolean;
  readonly frame: string;
  readonly align: string;
  readonly layout: string;
  readonly category: boolean;
  readonly rating: boolean;
  readonly swatches: boolean;
  readonly excerpt: boolean;
  readonly actions: string;
  readonly cart: string;
  readonly media: string;
  readonly deal: boolean;
  readonly badges: string;
  readonly outlineBadges: boolean;
  readonly overlay: boolean;
  readonly hover: string;
  readonly columns: readonly [number, number, number];
}

const style = (key: string, name: string, description: string, o: Partial<CardStyle> = {}): CardStyle => ({
  key, name, description, ratio: "1 / 1", tile: true, frame: "none", align: "start", layout: "stack", category: true, rating: false,
  swatches: false, excerpt: false, actions: "none", cart: "none", media: "swap", deal: false, badges: "corner", outlineBadges: false,
  overlay: false, hover: "", columns: [4, 3, 2], ...o,
});

/** ProductCards.styles, in the Scala order. */
export const CARD_STYLES: readonly CardStyle[] = [
  style("classic", "Classic", "Photo on a tile, category, name, stars and price; the second photo on hover; heart, compare and quick view over the photo.",
    { rating: true, actions: "side" }),
  style("minimal", "Minimal", "Centered name and price under a bare photo that zooms on hover.",
    { tile: false, align: "center", category: false, media: "image", hover: "zoom", ratio: "4 / 5" }),
  style("icons", "Icons on hover", "Wishlist, compare and quick view slide in over the photo; an add to cart link under the price.",
    { actions: "side", cart: "link", hover: "zoom", rating: true }),
  style("cart-bar", "Add to cart bar", "A full-width add to cart bar slides up over the photo on hover (always shown on touch screens).",
    { actions: "side", cart: "slide", rating: true }),
  style("quick-buy", "Quick buy", "Options as swatches, quantity and add to cart inside the card, for buying from the grid.",
    { frame: "border", rating: true, cart: "form", outlineBadges: true }),
  style("gallery", "Photo slider", "Every product photo in the card, with arrows and dots; outlined add to cart.",
    { media: "slider", rating: true, cart: "outline", outlineBadges: true }),
  style("list", "List", "Photo beside the name, stars, price, summary, swatches and buttons: for list views and sidebars.",
    { layout: "row", tile: true, rating: true, excerpt: true, swatches: true, actions: "below", cart: "button", columns: [1, 1, 1] }),
  style("deal", "Deal", "Compact card with a countdown to the end of the sale and a sold / available bar.",
    { frame: "border", rating: true, deal: true, cart: "button", category: false, hover: "zoom" }),
  style("bordered", "Bordered", "Framed card with a row of badges, color swatches and a full-width button.",
    { frame: "border", tile: false, badges: "inline", swatches: true, rating: true, cart: "button", hover: "lift" }),
  style("overlay", "Caption on photo", "Tall photo with the name and price over a shade at the bottom: editorial.",
    { ratio: "3 / 4", overlay: true, category: false, tile: false, media: "image", hover: "zoom", columns: [4, 2, 2] }),
];

/** ProductCards.Kit: the kit of the card presets and product sections. */
export const PRODUCT_KIT = "Product display";

/** Style.blocks: the Auvyx Woo blocks a preset's card uses. */
export const cardBlocks = (s: CardStyle): string[] => [
  ...(s.media === "slider" ? ["auvyx-woo/card-media"] : []),
  ...(s.badges !== "none" ? ["auvyx-woo/badges"] : []),
  ...(s.actions !== "none" ? ["auvyx-woo/card-actions"] : []),
  ...(s.swatches ? ["auvyx-woo/swatches"] : []),
  ...(s.cart === "form" ? ["auvyx-woo/add-to-cart"] : []),
  ...(s.deal ? ["auvyx-woo/deal"] : []),
];

export const cardStyleByKey = (key: string): CardStyle | undefined => CARD_STYLES.find((s) => s.key === key);

/** ProductCards.plain: presets made of plain elements only. */
export const PLAIN_CARD_STYLES = CARD_STYLES.filter((s) => cardBlocks(s).every((b) => b === "auvyx-woo/badges"));

/** ProductCards.of: the preset a card was built from (`auvyx-card--<key>` on its root). */
export const cardStyleOf = (className: string): CardStyle | undefined => {
  const c = className.split(" ").find((x) => x.startsWith("auvyx-card--"));
  return c === undefined ? undefined : cardStyleByKey(c.slice("auvyx-card--".length));
};

/** The kit template of a preset's card. */
export const cardTemplateId = (key: string) => `pc-${key}`;

/** UiCatalog.productCardStyles: the presets whose `pc-<key>` kit this site can insert (`has` = RawBlocks.available). */
export const productCardStyles = (has: (templateId: string) => boolean): CardStyle[] => CARD_STYLES.filter((s) => has(cardTemplateId(s.key)));

/** A product loop (the card presets and the product options apply to it). */
export const isProductLoop = (n: El | undefined): boolean => !!n && n.kind === "Loop" && queryValue(n.query, "postType") === "product";

/** UiCatalog.cardStyle: the preset key of a loop's card, "" for a custom card. */
export const loopCardStyle = (doc: Doc, loop: El): string => {
  const first = loop.children[0];
  const card = first === undefined ? undefined : doc.nodes[first];
  return (card && cardStyleOf(card.className)?.key) ?? "";
};

/** ProductCards.loopClass: the loop's own classes for preset `s`: other hover effects removed, the preset's added. */
export const loopClass = (current: string, s: CardStyle): string =>
  [...current.split(" ").filter((c) => c !== "" && !c.startsWith("auvyx-hover-")), ...(s.hover ? [`auvyx-hover-${s.hover}`] : [])].join(" ");

/** ProductCards.loopStyles: grid columns as loop styles for the given breakpoint ids (desktop, tablet, phone). */
export const loopStyles = (current: Styles, s: CardStyle, devices: readonly string[]): Styles =>
  devices.slice(0, 3).reduce((st, bp, i) =>
    setStyles(st, bp, "default", [["grid-template-columns", `repeat(${s.columns[i]}, minmax(0, 1fr))`], ...(i === 0 ? [["display", "grid"] as [string, string]] : [])]), current);

export interface BuiltCard { root: El; nodes: Record<string, El> }

/** The card of a `pc-<key>` kit's built tree (its root is the loop; the card is the loop's single child). */
export const cardOfTemplate = (built: { root: El; nodes: Record<string, El> }): BuiltCard | null => {
  const id = built.root.children[0];
  if (id === undefined || !built.nodes[id]) return null;
  const all: Doc = { roots: [built.root.id], nodes: { ...built.nodes, [built.root.id]: built.root } };
  const ids = subtreeIds(all, id);
  const nodes = Object.fromEntries(ids.slice(1).map((i) => [i, all.nodes[i]!]));
  return { root: all.nodes[id]!, nodes };
};

export interface RestyleContext {
  /** The presets this site offers (productCardStyles). */
  readonly styles: readonly CardStyle[];
  /** A fresh card of a preset, with new ids (null when its kit's markup is not loaded). */
  readonly cardOf: (key: string) => BuiltCard | null;
  /** Store.deviceBreakpoints ids: desktop, tablet, phone. */
  readonly devices: readonly string[];
}

/**
 * UiCatalog.restyleCards: the loop's card replaced by a fresh card of preset `key`, the loop's hover effect and grid
 * columns set from the preset; the loop's id and query are kept. Null when `loopId` is not a product loop or `key` is not
 * offered here.
 */
export function restyleCards(doc: Doc, loopId: string, key: string, ctx: RestyleContext): Doc | null {
  const loop = doc.nodes[loopId];
  if (!isProductLoop(loop)) return null;
  const preset = ctx.styles.find((s) => s.key === key);
  if (!preset) return null;
  const fresh = ctx.cardOf(preset.key);
  if (!fresh) return null;
  const old = loop!.children[0];
  const emptied = old === undefined ? doc : remove(doc, old);
  const withCard = insert(emptied, fresh.root, loopId, 0, fresh.nodes);
  return update(withCard, loopId, (n) => ({ ...n, className: loopClass(n.className, preset), styles: loopStyles(n.styles, preset, ctx.devices) }));
}
