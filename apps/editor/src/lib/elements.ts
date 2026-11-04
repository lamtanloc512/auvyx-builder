/** The Add panel's registry (U/Elements.scala): tiles by category, what each inserts, what it drags. */
import { KINDS, el, escapeComment, setStyle, type El, type Kind } from "@auvyx/editor-core";
import type { IconName } from "../ui/icons";
import { node } from "./defaults";
import { kindName } from "./labels";
import type { Payload } from "./dnd.svelte";
import { config } from "./config";
import { nextId } from "./ids";
import { SCREENS, store } from "./store.svelte";
import { available, byId, canScript, commerce, dragTree, edition, hasBlock, insertTemplate } from "./templates";

/** What opens the Pro dialog (Auvyx Builder Pro installed without its licence). */
type Feature = "custom-code";
/** ProLock.locked: Pro is installed, its licence is not active. */
const locked = edition.pro && !edition.licensed;

/** `data`: the tile's data key for scripts (`data-add`, `data-add-tpl`, `data-add-el`). `pro`: locked here (a click explains Pro). */
export interface Def { id: string; title: string; category: string; icon: IconName; keywords: string[]; insert: () => void; drag?: Payload; hint?: string; pro?: boolean; data?: [string, string] }
export interface Category { id: string; title: string; order: number }

export const categories: Category[] = [
  { id: "favorites", title: "Favorites", order: 0 }, { id: "layout", title: "Layout", order: 10 }, { id: "basic", title: "Basic", order: 20 },
  { id: "general", title: "General", order: 30 }, { id: "media", title: "Media", order: 40 }, { id: "site", title: "Site", order: 50 },
  { id: "commerce", title: "Commerce", order: 60 }, { id: "theme", title: "Theme", order: 70 }, { id: "widgets", title: "WordPress widgets", order: 80 },
  { id: "design", title: "Design", order: 85 }, { id: "custom", title: "Custom code", order: 90 },
];

const MARKER = "auvyx-ui-";
/** A layout widget's marker classes (UiCatalog.marked): the editor finds rows, columns and grids by them. */
const marked = (n: El, id: string): El => ({ ...n, className: [...n.className.split(" ").filter((c) => c && !c.startsWith(MARKER)), `${MARKER}${id}`, "auvyx-variant-default"].join(" ") });
const set = (n: El, bp: string, decls: [string, string][]) => ({ ...n, styles: decls.reduce((s, [p, v]) => setStyle(s, bp, "default", p, v), n.styles) });

const flowless: [string, string][] = [["padding-block-start", "0px"], ["padding-block-end", "0px"], ["padding-inline-start", "0px"], ["padding-inline-end", "0px"]];

export function buildRowStack(): [El, Record<string, El>] {
  const base = { ...node("Section"), tag: "div" };
  return [marked(set(base, "base", [["display", "flex"], ["flex-direction", "row"], ["flex-wrap", "wrap"], ["gap", "16px"], ["justify-content", "flex-start"], ["align-items", "center"], ...flowless]), "row"), {}];
}

export function buildGrid(): [El, Record<string, El>] {
  const base = { ...node("Section"), tag: "div" };
  return [marked(set(base, "base", [["display", "grid"], ["grid-template-columns", "repeat(3, minmax(0, 1fr))"], ["gap", "16px"], ["justify-items", "stretch"], ["align-items", "stretch"], ...flowless]), "grid"), {}];
}

/** An empty column of a Row, `w` parts wide; each takes the full width on a phone. */
export function newColumn(w = 1): El {
  const base = { ...node("Section"), tag: "div" };
  const withFlex = set(base, "base", [["flex", `${w} 1 0%`], ["min-width", "0px"], ["display", "flex"], ["flex-direction", "column"], ["gap", "16px"],
    ["background-color", "var(--wp--preset--color--auvyx-surface)"], ["color", "var(--wp--preset--color--auvyx-text)"], ["border-radius", "var(--wp--custom--radius--md, 0)"]]);
  return marked(set(withFlex, "mobile", [["flex-basis", "100%"]]), "col");
}

export function buildRow(weights: number[]): [El, Record<string, El>] {
  const [root] = buildRowStack();
  const cols = weights.map(newColumn);
  return [{ ...root, children: cols.map((c) => c.id) }, Object.fromEntries(cols.map((c) => [c.id, c]))];
}

/** Named Row presets (Flatsome-style): label and the flex weights of its columns. */
export const rowPresets: [string, number[]][] = [
  ["One column", [1]], ["2 columns", [1, 1]], ["3 columns", [1, 1, 1]], ["4 columns", [1, 1, 1, 1]], ["Large left", [2, 1]], ["Large right", [1, 2]],
  ["Media left", [3, 5]], ["Media right", [5, 3]], ["1 · 2 · 1", [1, 2, 1]], ["2 · 1 · 1", [2, 1, 1]],
];

const kind = (id: string, k: Kind, category: string, icon: IconName, ...keywords: string[]): Def =>
  ({ id, title: kindName(k), category, icon, keywords, insert: () => store.insert(k), drag: { new: k }, data: ["add", KINDS[k].label] });

/** Elements.icons: names an extension (and the builder's own tiles) use for `icon`, on the panel's icon set. */
export const ICONS: Record<string, IconName> = {
  square: "square", columns: "columns3", heading: "heading", text: "text", button: "button", image: "image", divider: "minus", star: "star",
  accordion: "accordion", video: "play", code: "code", slides: "slides", menu: "menu", loop: "repeat", vector: "penTool", spacer: "betweenH",
  card: "card", box: "box", list: "menu", quote: "quote", tabs: "panelTop", counter: "chart", progress: "minus", rating: "star", bell: "help",
  share: "share", map: "search", gallery: "grid", clock: "repeat", price: "price", search: "search", link: "link", block: "puzzle",
  pattern: "layoutTemplate", cart: "bag", user: "user", form: "form", grid: "grid", plus: "plus",
};

/** A builder template as a tile (Elements.tpl): its title, its description as hint and keyword. Auvyx Builder Pro's
 * templates are tiles only while Pro is active (they come from its library). */
const tpl = (ask: (f: Feature) => void, id: string, category: string, icon: string, ...keywords: string[]): Def | null => {
  const t = byId(id);
  if (!t || !available(t)) return null;
  return { id: `block:${id}`, title: t.title, category, icon: ICONS[icon] ?? "puzzle", keywords: [...keywords, t.description], insert: () => insertTemplate(t, ask),
    hint: t.description, drag: { tree: dragTree(t), label: t.title, section: t.group === "Section" }, data: ["add-tpl", id] };
};


/** Defaults.node(Kind.Snippet): a code sample to start from. */
export const snippet = (): El => el(nextId(), "Snippet", {
  text: "import { neon } from '@neondatabase/serverless';\nconst sql = neon(process.env.DATABASE_URL);\nconst rows = await sql`SELECT version()`;",
  alt: "typescript", className: "auvyx-snippet--dark", styles: { base: { default: { "margin-block-end": "12px", width: "100%" } } },
});

/** DataFields.QueryDefaults. */
const QUERY_DEFAULTS: [string, string][] = [["postType", "post"], ["perPage", "3"], ["orderBy", "date"], ["order", "desc"], ["offset", "0"], ["inherit", "false"],
  ["excludeCurrent", "false"], ["taxonomy", ""], ["terms", ""], ["paginate", "false"], ["source", ""], ["include", ""], ["more", ""]];

/** Defaults.loop (standardLoop): a grid of cards; the card is the template, its content reads each post. Products: price and add to cart. */
export function loop(products: boolean): [El, Record<string, El>] {
  const st = (decls: Record<string, string>) => ({ base: { default: decls } });
  const image = el(nextId(), "Image", { src: `${config.assetsUrl ?? ""}/landscape.svg`, bind: { url: "featured_image", alt: "featured_image_alt" },
    styles: st({ width: "100%", "aspect-ratio": products ? "1/1" : "16/10", "object-fit": "cover", "background-color": "var(--wp--preset--color--auvyx-surface)" }) });
  const meta = el(nextId(), "Text", { text: products ? "Price" : "Date", bind: { content: products ? "product_price" : "post_date" },
    styles: st({ "font-size": products ? "var(--wp--preset--font-size--auvyx-sm)" : "0.8125rem", color: "var(--wp--preset--color--auvyx-muted)", "font-family": "var(--wp--preset--font-family--auvyx-body, inherit)", "margin-block": "0" }) });
  const title = el(nextId(), "Heading", { level: 3, text: "Post title", bind: { content: "post_title" },
    styles: st({ "font-size": products ? "var(--wp--preset--font-size--auvyx-sm)" : "var(--wp--preset--font-size--auvyx-lg)", color: "var(--wp--preset--color--auvyx-text)", "font-family": "var(--wp--preset--font-family--auvyx-heading, inherit)", "margin-block": "0" }) });
  const excerpt = el(nextId(), "Text", { text: "Excerpt", bind: { content: "post_excerpt" },
    styles: st({ color: "var(--wp--preset--color--auvyx-muted)", "font-family": "var(--wp--preset--font-family--auvyx-body, inherit)", "margin-block": "0" }) });
  const more = products
    ? el(nextId(), "Button", { text: "Add to cart", href: "#", bind: { text: "product_add_to_cart_text", url: "product_add_to_cart_url" } })
    : el(nextId(), "Button", { text: "Read more", href: "#", bind: { url: "post_url" } });
  const inner = products ? [title, meta, more] : [meta, title, excerpt, more];
  const body = el(nextId(), "Section", { tag: "div", children: inner.map((n) => n.id),
    styles: st({ display: "flex", "flex-direction": "column", "align-items": "flex-start", gap: "8px", "padding-block-start": "16px", "padding-block-end": "16px", "padding-inline-start": "16px", "padding-inline-end": "16px" }) });
  const card = el(nextId(), "Section", { tag: "article", children: [image.id, body.id],
    styles: st({ display: "flex", "flex-direction": "column", "background-color": "var(--wp--preset--color--auvyx-base)", color: "var(--wp--preset--color--auvyx-text)", "border-width": "1px", "border-style": "solid", "border-color": "var(--wp--preset--color--auvyx-border)", "border-radius": "var(--wp--custom--radius--lg, 0)", overflow: "hidden" }) });
  const cols = products ? 4 : 3;
  let styles = st({ display: "grid", "grid-template-columns": `repeat(${cols}, minmax(0, 1fr))`, gap: "24px" }) as El["styles"];
  styles = setStyle(styles, SCREENS[1]?.id ?? "tablet", "default", "grid-template-columns", "repeat(2, minmax(0, 1fr))");
  styles = setStyle(styles, SCREENS[2]?.id ?? "mobile", "default", "grid-template-columns", products ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)");
  const query = Object.fromEntries([...QUERY_DEFAULTS, ...(products ? [["postType", "product"], ["perPage", "4"]] as [string, string][] : [])]);
  const root = el(nextId(), "Loop", { align: "wide", children: [card.id], query, styles, label: products ? "Products loop" : "" });
  return [root, Object.fromEntries([...inner, image, body, card].map((n) => [n.id, n]))];
}

/** Defaults.code: a code element to start from (a piece of HTML and a module that animates it). */
export const code = (): El => el(nextId(), "Section", {
  tag: "div", className: "auvyx-code", label: "Code", libs: ["motion"],
  markup: '<div class="orb"></div><p class="caption">Your own HTML, CSS and script</p>',
  css: "& { display: grid; place-items: center; gap: 1rem; min-height: 240px; padding: 2rem; }\n& .orb { width: 96px; height: 96px; border-radius: 50%; background: var(--wp--preset--color--auvyx-primary); }\n& .caption { margin: 0; color: var(--wp--preset--color--auvyx-muted); }",
  script: `export default ({ el, lib, reduced }) => {
  if (reduced) return;
  const orb = el.querySelector(".orb");
  const { animate } = lib.motion;
  const run = animate(orb, { scale: [1, 1.15, 1] }, { duration: 2, repeat: Infinity, ease: "easeInOut" });
  return () => run.stop();
};`,
});

/** Forms.element(Forms.starter): a contact form (its definition in the comment; the site draws it). */
export function form(): El {
  const id = `f${Math.random().toString().slice(2, 12)}`;
  const json = `{"id":"${id}","fields":[{"name":"name","label":"Your name","kind":"text","required":true},{"name":"email","label":"Email","kind":"email","required":true},{"name":"message","label":"Message","kind":"textarea","required":true}],"submit":"Send","success":"Thank you. We received your message."}`;
  return el(nextId(), "Raw", { blockName: "auvyx/form", raw: `<!-- wp:auvyx/form ${escapeComment(json)} /-->`, html: "" });
}

/** The builder's elements (Elements.builtins), in the Studio's order. `ask` opens the Pro dialog. */
export const builtins = (ask: (f: Feature) => void = () => {}): Def[] => [
  { id: "row", title: "Row", category: "layout", icon: "columns3", keywords: ["columns", "grid", "structure"], insert: () => {}, hint: "Click to pick a column preset, or drag onto the canvas", drag: { tree: () => buildRow([1, 1]), label: "Row" } },
  { id: "grid", title: "Grid", category: "layout", icon: "grid", keywords: ["grid"], insert: () => { const [r, x] = buildGrid(); store.insertTree(r, x); }, drag: { tree: buildGrid, label: "Grid" } },
  kind("section", "Section", "layout", "square", "container", "box", "flex"),
  kind("heading", "Heading", "basic", "heading", "title", "h1", "h2"),
  kind("text", "Text", "basic", "text", "paragraph", "copy"),
  kind("button", "Button", "basic", "button", "link", "cta"),
  kind("image", "Image", "basic", "image", "photo", "picture"),
  kind("video", "Video", "basic", "play", "youtube", "vimeo", "embed"),
  kind("divider", "Divider", "basic", "minus", "line", "separator"),
  kind("icon", "Icon", "basic", "star"),
  tpl(ask, "icon-box", "general", "star", "feature"),
  tpl(ask, "icon-list", "general", "list", "bullets", "checklist"),
  tpl(ask, "stat", "general", "counter", "number"),
  tpl(ask, "counter", "general", "counter", "number", "stat"),
  tpl(ask, "progress", "general", "progress", "skill"),
  tpl(ask, "star-rating", "general", "rating", "review"),
  tpl(ask, "testimonial", "general", "quote", "review"),
  kind("accordion", "Accordion", "general", "accordion", "faq", "toggle"),
  tpl(ask, "tabs", "general", "tabs"),
  tpl(ask, "alert", "general", "bell", "notice", "message"),
  tpl(ask, "follow-icons", "general", "share", "social", "facebook", "instagram"),
  tpl(ask, "share", "general", "share"),
  tpl(ask, "buttons", "general", "button"),
  tpl(ask, "countdown", "general", "clock", "timer"),
  tpl(ask, "price-card", "general", "price", "pricing", "plan"),
  tpl(ask, "flip-box", "general", "card"),
  tpl(ask, "toc", "general", "list", "table of contents"),
  tpl(ask, "popup", "general", "square", "modal"),
  tpl(ask, "marquee", "general", "slides", "ticker"),
  { id: "snippet", title: kindName("Snippet"), category: "general", icon: "code", keywords: ["code", "highlight"], insert: () => store.insertTree(snippet(), {}),
    drag: { tree: () => [snippet(), {}], label: kindName("Snippet") }, data: ["add", KINDS.Snippet.label] },
  tpl(ask, "banner-box", "media", "image", "banner", "hero"),
  tpl(ask, "banner-slider", "media", "slides", "carousel", "slider"),
  tpl(ask, "gallery", "media", "gallery", "images", "grid"),
  tpl(ask, "before-after", "media", "image", "compare"),
  tpl(ask, "hotspot", "media", "plus"),
  kind("nav", "Nav", "site", "menu", "navigation", "nav"),
  { id: "loop", title: kindName("Loop"), category: "site", icon: "repeat", keywords: ["loop", "blog", "query", "posts"], insert: () => { const [r, x] = loop(false); store.insertTree(r, x); },
    drag: { tree: () => loop(false), label: kindName("Loop") }, data: ["add", KINDS.Loop.label] },
  tpl(ask, "search", "site", "search"),
  tpl(ask, "breadcrumbs", "site", "link"),
  tpl(ask, "map", "site", "map", "google", "location"),
  hasBlock("auvyx/form") && (config as unknown as { blockTypes?: unknown }).blockTypes
    ? { id: "form", title: "Form", category: "site", icon: "form", keywords: ["contact", "auvyx/form"], insert: () => store.insertTree(form(), {}), data: ["add-el", "form"] } as Def : null,
  commerce ? { id: "products", title: "Products", category: "commerce", icon: "bag", keywords: ["shop", "loop", "woocommerce"], insert: () => { const [r, x] = loop(true); store.insertTree(r, x); }, data: ["add-el", "products"] } as Def : null,
  tpl(ask, "product-search", "commerce", "search", "shop"),
  tpl(ask, "shop-the-look", "commerce", "cart", "lookbook"),
  canScript && edition.pro ? { id: "code", title: "Code", category: "custom", icon: "code", keywords: ["html", "css", "script", "three", "gsap"], pro: locked,
    insert: () => (locked ? ask("custom-code") : store.insertTree(code(), {})), hint: "Your own HTML, CSS and an ES module with Motion, Three.js, Lottie, GSAP…",
    drag: locked ? undefined : { tree: () => [code(), {}], label: "Code" }, data: ["add-el", "code"] } as Def : null,
].filter((d): d is Def => d !== null);

// ---- favorites (auvyx-studio:favorites) ----
const FAV = "auvyx-studio:favorites";
export function readFavorites(): string[] { try { return JSON.parse(localStorage.getItem(FAV) ?? "[]"); } catch { return []; } }
export function writeFavorites(ids: string[]) { try { localStorage.setItem(FAV, JSON.stringify(ids)); } catch { /* private window */ } }
export { el };
