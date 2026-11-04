/**
 * The builder's templates (the Scala `Templates`, `SectionLibrary`, `PageLayouts`): the list comes from the patterns the
 * Scala catalog writes (products/builder/patterns/generated, through vite.config.ts `templates()`), plus what add-ons add
 * (Auvyx Builder Pro's library, `config.templates`, docs/editions.md: the free plugin ships no Pro template). The markup is
 * loaded on first use (add-ons' from `auvyx/v1/templates/markup`) and read back into elements with `markupToTree` +
 * `decodeTree` (byte for byte the Studio's, see packages/editor-core/test/markupTree.test.ts). Inserting follows
 * U/Store.scala insertTemplate / insertLayout.
 */
import list from "virtual:auvyx-templates";
import editions from "@auvyx/shared/editions.json";
import { ancestors, decodeTree, el, flatten, insert as ins, insertionPoint, markupToTree, type Doc, type El } from "@auvyx/editor-core";
import { config } from "./config";
import { pageLevel } from "./defaults";
import { nextId } from "./ids";
import { store } from "./store.svelte";
import { toast } from "./toast.svelte";

export type Group = "Section" | "Block" | "Layout";
export interface Template { id: string; group: Group; category: string; title: string; description: string; kit: string; blocks: string[] }
export interface Built { root: El; nodes: Record<string, El> }

/** Templates add-ons add (Patterns::manifest(true)): their platform blocks are only known once their markup is here. */
type Added = Omit<Template, "blocks"> & { library?: string };
const added = ((config as unknown as { templates?: Added[] }).templates ?? []).filter((t) => t && typeof t.id === "string");
const addedIds = new Set(added.map((t) => t.id));

export const templates: Template[] = [
  ...list.filter((t) => !addedIds.has(t.id)).map((t) => ({ ...t, kit: t.kit || "Starter" })),
  ...added.map((t) => ({ id: t.id, group: t.group, category: t.category, title: t.title, description: t.description, kit: t.kit || "Starter", blocks: [] })),
];
const index = new Map(templates.map((t) => [t.id, t]));
export const byId = (id: string): Template | undefined => index.get(id);

/** SiteParts.Category / ElementsCategory. */
export const PARTS = "Header & footer";
export const PART_ELEMENTS = "Header elements";

// ---- what this site has (Session) -------------------------------------------------------------

interface SiteConfig {
  edition?: { pro?: boolean; licensed?: boolean; upgradeUrl?: string; manageUrl?: string } | null;
  blockTypes?: { name: string }[];
  woocommerce?: boolean;
  canScript?: boolean;
}
const site = config as unknown as SiteConfig;

/** Edition.State: Auvyx Builder Pro installed (`pro`) and its licence active (`licensed`). */
export const edition = {
  pro: site.edition ? !!site.edition.pro : true,
  licensed: site.edition ? !!site.edition.licensed : true,
  upgradeUrl: site.edition?.upgradeUrl || editions.upgradeUrl,
  manageUrl: site.edition?.manageUrl ?? "",
};

/** The block types the site registered (Session.blocks); none sent: every block counts as there. */
const registered = site.blockTypes ? new Set(site.blockTypes.map((b) => b.name)) : null;
export const hasBlock = (name: string) => !registered || registered.has(name);
/** RawBlocks.available: every platform block a template uses is registered here. */
export const available = (t: Template) => t.blocks.every(hasBlock);
export const commerce = !!site.woocommerce;
/** Session.canScript: a host that does not say allows it. */
export const canScript = site.canScript ?? true;

// ---- the markup (lazy) --------------------------------------------------------------------------

let markup: Record<string, string> | null = null;
let loading: Promise<Record<string, string>> | null = null;
/** Add-ons' markup (`auvyx/v1/templates/markup`, Patterns::rest_markup): every added template in one request. */
const addedMarkup = async (): Promise<Record<string, string>> => {
  if (!added.length) return {};
  try {
    const r = await fetch(`${config.restRoot}auvyx/v1/templates/markup`, { headers: { "X-WP-Nonce": config.nonce }, credentials: "same-origin" });
    const data = r.ok ? ((await r.json()) as Record<string, unknown>) : {};
    return Object.fromEntries(Object.entries(data).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return {};
  }
};
/** Loads the templates' markup (one chunk, plus the add-ons'); resolved at once when it is here. */
export const load = () =>
  (loading ??= Promise.all([import("virtual:auvyx-templates-markup"), addedMarkup()]).then(([m, more]) => {
    markup = { ...m.default, ...more };
    // an added template's platform blocks, as the bundled list knows them (RawBlocks.available)
    for (const t of templates) if (addedIds.has(t.id) && more[t.id]) t.blocks = blocksOf(more[t.id]!);
    return markup;
  }));

/** The platform blocks a markup uses that Auvyx does not model (vite.config.ts MODELED). */
const MODELED = new Set(["auvyx/section", "auvyx/heading", "auvyx/text", "auvyx/snippet", "auvyx/button", "auvyx/image", "auvyx/icon", "auvyx/divider", "auvyx/video", "auvyx/vector", "auvyx/accordion", "auvyx/loop", "auvyx/carousel", "auvyx/nav"]);
const blocksOf = (m: string) => [...new Set([...m.matchAll(/<!-- wp:([a-z0-9-]+\/[a-z0-9-]+)/g)].map((x) => x[1]!).filter((b) => !MODELED.has(b)))];
export const ready = () => markup !== null;

/** Templates.GeneratedBase / GeneratedAssets: the generator's asset addresses, the site's in their place (Patterns.php). */
const GENERATED_BASE = "https://auvyx.invalid/assets";
const assets = config.assetsUrl ?? "";
const withAssets = (m: string) =>
  m.split(`${GENERATED_BASE}/placeholders`).join(assets).split(GENERATED_BASE).join(assets.replace(/\/placeholders\/?$/, ""));

/** The template's markup with this site's asset addresses (null until `load()` resolved). */
export const markupOf = (t: Template): string | null => (markup?.[t.id] !== undefined ? withAssets(markup[t.id]!) : null);

/** Templates.build: the template as elements with fresh ids. */
export function build(t: Template): Built | null {
  const m = markupOf(t);
  if (m === null) return null;
  const doc = decodeTree(markupToTree(m), nextId);
  const id = doc.roots[0];
  if (!id) return null;
  const { [id]: root, ...nodes } = doc.nodes;
  return { root: root!, nodes };
}

// ---- inserting (U/Store.scala) ------------------------------------------------------------------

/** After a library insert, the next section lands after this root (multi-insert from Add). */
let insertAfterRoot: string | null = null;

/** A header or footer piece on the page itself goes in a band that keeps it in the flow. */
const BAND = "var(--auvyx-band, max(24px, calc((100% - 1200px) / 2)))";

/** Store.insertTemplate. */
export async function insertTemplate(t: Template, _ask?: unknown) {
  await load();
  const built = build(t);
  if (!built) { toast(`${t.title}: not available`); return; }
  if (t.group === "Section") {
    const doc = store.doc;
    const after = insertAfterRoot ? doc.roots.indexOf(insertAfterRoot) : -1;
    let at = after >= 0 ? after + 1 : -1;
    if (at < 0) {
      const top = store.selected && doc.nodes[store.selected] ? [store.selected, ...ancestors(doc, store.selected)].at(-1)! : null;
      const i = top ? doc.roots.indexOf(top) + 1 : 0;
      at = i > 0 ? i : doc.roots.length;
    }
    store.commit(ins(doc, built.root, null, at, built.nodes));
    store.selected = built.root.id;
    insertAfterRoot = built.root.id;
  } else if (t.category === PARTS && insertionPoint(store.doc, store.selected)[0] === null) {
    const band = el(nextId(), "Section", {
      tag: "div", align: "full", children: [built.root.id],
      styles: { base: { default: { "padding-block-start": "16px", "padding-block-end": "16px", "padding-inline-start": BAND, "padding-inline-end": BAND, "margin-block-start": "0" } } },
    });
    store.insertTree(band, { ...built.nodes, [built.root.id]: built.root });
  } else store.insertTree(built.root, built.nodes);
}

/** The drag payload's tree (Dnd.Payload.Tpl): the template built at drop time (its markup is loaded before). */
export const dragTree = (t: Template) => (): [El, Record<string, El>] => {
  const b = build(t);
  return b ? [b.root, b.nodes] : [el(nextId(), "Section", { label: t.title }), {}];
};

// ---- page layouts (PageLayouts) -------------------------------------------------------------------

export interface PageLayout { id: string; title: string; description: string; sections: string[] }

export const PAGE_LAYOUTS: PageLayout[] = [
  { id: "store-home", title: "Mega shop", description: "Slider with side banners, trust bar, new products, two stories, sale products, newsletter.",
    sections: ["store-hero", "trust-bar", "ed-new-in", "ed-stories", "ma-on-sale", "ed-newsletter"] },
  { id: "big-sale", title: "Big sale", description: "Sale banner, categories, new products, sale products, newsletter.",
    sections: ["banner", "trust-bar", "ed-categories", "ed-new-in", "ma-on-sale", "ed-newsletter"] },
  { id: "editorial-shop", title: "Editorial shop", description: "Full-bleed hero, category tiles, new in, stories, newsletter.",
    sections: ["ed-hero", "ed-categories", "ed-new-in", "ed-stories", "ed-newsletter"] },
  { id: "maison-shop", title: "Maison shop", description: "Serif hero with products, collection grid, promises, quote.",
    sections: ["ma-hero", "ma-catalog", "ma-craft", "ma-quote"] },
  { id: "bento-shop", title: "Bento shop", description: "Dark product tiles, a scrolling product strip and a closing banner.",
    sections: ["bento-hero", "bento-row", "bento-banner"] },
  { id: "fashion-store", title: "Fashion store", description: "Focus slider, category tiles, new in, a shoppable lookbook, the journal and a newsletter.",
    sections: ["focus-slider", "category-tiles", "ed-new-in", "lookbook", "latest-posts", "ed-newsletter"] },
  { id: "deals-store", title: "Deals store", description: "Two promotions, trust bar, deal of the day with a countdown, categories, sale products, newsletter.",
    sections: ["split-banners", "trust-bar", "deal-of-the-day", "category-tiles", "ma-on-sale", "ed-newsletter"] },
  { id: "product-launch", title: "Product launch", description: "Video hero, features, testimonials, pricing, FAQ and a call to action.",
    sections: ["hero-video", "features", "testimonials", "pricing", "faq", "cta"] },
  { id: "landing", title: "Landing page", description: "Hero, features, stats, pricing, testimonials, FAQ and a call to action.",
    sections: ["hero-centered", "features", "stats", "pricing", "testimonials", "faq", "cta"] },
];

export const layoutTemplates = (l: PageLayout) => l.sections.map(byId).filter((t): t is Template => !!t);
/** A layout this site has every section of (Auvyx Builder Pro's sections come with Pro). */
export const layoutComplete = (l: PageLayout) => l.sections.every((id) => index.has(id));

const isH1 = (e: El) => e.kind === "Heading" && e.level === 1;

/** PageLayouts.build: one h1 on the page; when neither the layout nor the page has one, the first heading becomes it. */
function buildLayout(l: PageLayout, promote: boolean): Built[] {
  const built = layoutTemplates(l).map(build).filter((b): b is Built => !!b);
  const all = (b: Built) => [b.root, ...Object.values(b.nodes)];
  if (!promote || built.some((b) => all(b).some(isH1))) return built;
  const i = built.findIndex((b) => all(b).some((e) => e.kind === "Heading"));
  if (i < 0) return built;
  const b = built[i]!;
  const doc: Doc = { roots: [b.root.id], nodes: { ...b.nodes, [b.root.id]: b.root } };
  const first = flatten(doc).find(({ el: e }) => e.kind === "Heading")!.el.id;
  const promoted = { ...doc.nodes, [first]: { ...doc.nodes[first]!, level: 1 } };
  const { [b.root.id]: root, ...nodes } = promoted;
  built[i] = { root: root!, nodes };
  return built;
}

/** Store.insertLayout: the whole page after the current page sections, as one undo step. */
export async function insertLayout(l: PageLayout, _ask?: unknown) {
  await load();
  const hasH1 = Object.values(store.doc.nodes).some(isH1);
  const built = buildLayout(l, !hasH1);
  const start = store.doc.roots.length;
  const next = built.reduce((d, b, i) => ins(d, pageLevel(b.root), null, start + i, b.nodes), store.doc);
  store.commit(next);
  store.selected = built[0]?.root.id ?? null;
}

/** The layout as one markup (its sections stacked), for its thumbnail. */
export const layoutMarkup = (l: PageLayout): string | null => {
  const parts = layoutTemplates(l).map(markupOf);
  return parts.every((p) => p !== null) ? parts.join("\n\n") : null;
};

// ---- the section library (SectionLibrary) ----------------------------------------------------------

export const SECTION_LIBRARY: { title: string; ids: string[] }[] = [
  { title: "Hero", ids: ["hero-centered", "hero-split", "banner"] },
  { title: "Logos", ids: ["logos"] },
  { title: "Features", ids: ["features"] },
  { title: "Pricing", ids: ["pricing"] },
  { title: "Testimonials", ids: ["testimonials"] },
  { title: "FAQ", ids: ["faq"] },
  { title: "CTA", ids: ["cta"] },
  { title: "Footer", ids: ["footer"] },
  { title: "Ecommerce", ids: ["lib-product-grid", "lib-product-highlight"] },
  { title: "LMS", ids: ["lib-course-grid", "lib-curriculum", "lib-instructor"] },
];

/** Flatsome's Banner presets (AddPanel components). */
export const BANNERS = ["banner-box", "banner-left", "banner-right", "banner-boxed", "banner-huge"];

/** AddPanel.headerPiece: header pieces are hidden (the header is a ready header with variants, HeaderPanel). */
export const headerPiece = (t: Template) =>
  t.category === PART_ELEMENTS || (t.category === PARTS && ["header", "top-bar", "actions"].some((s) => t.id.includes(s))) ||
  (t.group === "Section" && (t.category === "Header" || t.id === "header"));

/** Clears the "after this root" memory (a cleared page). */
export const forgetInsertPoint = () => { insertAfterRoot = null; };
