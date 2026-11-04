/**
 * What the agent's runtime (src/agent/runtime.ts, pi) reads and calls (U/AgentTools.scala, ADR 0039): the system prompt,
 * the element spec, the site's catalog, the page, the registry's actions on the editor's store (one commit, one Undo per
 * call), the `<view>` block, and the legacy edit ops. The platform is WordPress: the gateway, conversations and products
 * come from Studio::config's `agent` and REST.
 */
import { consoleText as codeConsoleText, codeErrorsOf } from "./console.svelte";
import type { Bridge } from "../agent/runtime";
import { craftPrompt } from "../agent/harness";
import { routes } from "../agent/skills";
import { designMdProblems, designSystem, systemToDesignMd } from "../../../../packages/editor-core/src/designSystem";
import type { ActionAnswer } from "../agent/actions";
import type { El } from "@auvyx/editor-core";
import { compileScopedCss } from "@auvyx/style-engine";
import icons from "../../../../shared/icons.json";
import { config } from "./config";
import { rest } from "./host";
import { store } from "./store.svelte";
import { screens } from "./screens.svelte";
import { nameOf, preview } from "./labels";
import { nextId } from "./ids";
import { documentKind } from "./builder.svelte";
import * as Templates from "./templates";
import { toast } from "./toast.svelte";
import { applyOps } from "./agentOps";
import { refreshCard } from "./products.svelte";
import { canvasWeb } from "./canvasWeb.svelte";
import * as Site from "./agentSite";
import * as Games from "./agentGames";
import * as SiteTemplates from "./agentSiteTemplate";
import * as Content from "./content.svelte";
import * as ContentModel from "../../../../packages/editor-core/src/contentModel";
import { gameJson, importTheme, setTokens } from "./agentCore";
import { type ActionContext, type StoredGame, AgentView, agentCall, agentSpecs, context, edits, encodeElements, isCode, isGame } from "./agentCore";

// ---- what Studio::config says about the agent ----

export interface AgentConfig {
  configured: boolean;
  settingsUrl: string;
  api: string;
  provider: string;
  model: string;
  baseUrl: string;
  reasoning: string;
  sessions: string;
}

interface SiteConfig {
  agent?: AgentConfig;
  blockTypes?: { name: string; title: string; attributes?: { name: string; type: string; enum?: string[]; default?: unknown }[] }[];
  convertible?: string[];
  designBrief?: string;
  woocommerce?: boolean;
  pageNote?: { text?: string; label?: string } | null;
  preview?: { kind?: string; id?: number } | null;
  playUrl?: string;
}

const site = config as unknown as SiteConfig & typeof config;

/** The platform's agent: absent when the platform has none (then the panel is the Studio's fallback). */
export const gateway: AgentConfig | undefined = site.agent ?? undefined;
export const configured = !!gateway?.configured;

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } },
};

// ---- effort (kept in this browser) ----

export const settings = $state({
  effort: ["section", "page"].includes(ls.get("auvyx-agent-effort") ?? "") ? ls.get("auvyx-agent-effort")! : "section",
});
export const setEffort = (v: string) => { settings.effort = v; ls.set("auvyx-agent-effort", v); };

/** Limits of one request by effort: tool calls and dollars (the agent and its reviewer together). */
export const limits = () => (settings.effort === "page" ? { toolCalls: 240, costUsd: 6.0 } : { toolCalls: 80, costUsd: 1.5 });

// ---- the context every action gets (BuilderUi.context) ----

const blockTypes = site.blockTypes ?? [];
const blockNames = new Set(blockTypes.map((t) => t.name));
const ICONS = Object.keys((icons as { icons: Record<string, string> }).icons);

function openingAttrs(raw: string): Record<string, unknown> | undefined {
  const m = /^\s*<!--\s+wp:[a-z0-9/-]+\s+(\{[\s\S]*?\})\s+\/?-->/.exec(raw);
  if (!m) return undefined;
  try { const o = JSON.parse(m[1]!); return o && typeof o === "object" && !Array.isArray(o) ? o : undefined; } catch { return undefined; }
}

/** What only the host knows about a block: its attributes, whether it converts, a summary of what it shows (AiAgent.rawExtras). */
export function rawExtras(n: El): [string, unknown][] {
  const out: [string, unknown][] = [];
  const attrs = openingAttrs(n.raw);
  if (attrs && Object.keys(attrs).length) out.push(["attrs", attrs]);
  if ((site.convertible ?? []).includes(n.blockName)) out.push(["convertible", true]);
  const summary = n.html.replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/g, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 140);
  if (summary) out.push(["summary", summary]);
  // a game element: its source, which the agent edits with "update" (title, html, css, js, libs)
  const g = isGame(n) ? Games.source(n.game) : undefined;
  if (g) for (const [k, v] of Object.entries(gameJson(g))) if (k !== "assets" && k !== "lang") out.push([k, v]);
  return out;
}

export function actionContext(): ActionContext {
  return context(store.doc, nextId, {
    view: {
      selected: store.selection,
      breakpoint: store.breakpoint,
      state: store.styleState,
      breakpoints: screens.all.map((b) => b.id),
      document: String(config.postId),
      kind: documentKind(),
      title: config.title,
    },
    canScript: !!config.canScript,
    block: (name) => (blockNames.has(name) || name === "core/template-part" ? name : undefined),
    raw: rawExtras as ActionContext["raw"],
    platform: "wordpress",
    game: (g: StoredGame) => Games.create(g),
  });
}

// ---- the prompt ----

/** The canvas has no real page to edit (Canvas.noRoot / frameError: the site's page had no place for this document). */
export const noRoot = () => canvasWeb.frameError !== null;

function screen(): string {
  const kind = documentKind();
  if (config.isPart) {
    const p = site.preview;
    if (p?.kind === "product")
      return `The product page template part, shown on EVERY product page (previewed with product ${p.id ?? ""}). Bind elements to product fields (catalog fields: woo/*, post_title, featured_image), use Auvyx Woo blocks (auvyx-woo/gallery, auvyx-woo/add-to-cart) and WooCommerce blocks; never type one product's name, price or text.`;
    if (p?.kind) return `A template part shown on every ${p.kind} page (previewed with item ${p.id ?? ""}): bind elements to the item's fields instead of typing its data.`;
    if (kind === "header") return "The site header (every page). Keep it compact: logo or site title, navigation, store icons. Build it with the header_* actions.";
    if (kind === "footer") return "The site footer (every page).";
    return `A template part (${kind}) shown on many pages (shop and category pages for the catalog). Product lists here follow the page's query: a loop with "inherit": "true", or WooCommerce's catalog blocks.`;
  }
  if (config.isComponent) return "A reusable component.";
  if (noRoot()) {
    const note = site.pageNote;
    return `A page whose content the site does NOT show (${note?.text ? note.text : "the theme's template replaces it"}). Do not edit elements: tell the user, in their language, to open ${note?.text && note.label ? `"${note.label}" (the button above the canvas)` : "the theme's template for this screen"} and ask there.`;
  }
  return site.pageNote?.text ? `A page. ${site.pageNote.text}` : "A page.";
}

const CATALOG_KINDS = "interactions (the ready hover, focus and press feedback of buttons, links, cards, form controls and accordions: what each recipe does and where it applies), data (the site's REST/GraphQL data sources: their loop key, fields and two sample items; list one with a loop whose query is {\"postType\": \"data\", \"source\": \"data/<name>\"} and bind its fields data/<field> inside), site (how the site's pieces fit together and how to link them: read this first for headers, footers, menus, components, forms), forms (the forms on this page), theme (colors, sizes, corners, brand brief), products (real products with pictures and links), blocks (WordPress/WooCommerce blocks and attrs), kits (Studio sections), patterns (the theme's sections), library (the site's patterns and components), fields (data fields for bind), content (post types, taxonomies, lists for loops), links (pages and categories to link to), menus, templates (page templates)";

export function systemPrompt(): string {
  return `You are the design agent inside Auvyx Studio, a visual editor for WordPress (with WooCommerce) and EzyPlatform sites. You change the open document with tools and answer the user in their language, in one or two sentences.

How to work:
- The open document is what you build or change; use the "page" op only when the user asks for another page.
- Always finish the job with a change (an action tool or edit); looking things up is never the answer.
- Be quick: a few tool calls, not many. Look up only what you need (read_page for ids, catalog for site data). Put all changes of one step in ONE call (an insert_elements list, or one edit with many ops).
- Prefer the typed action tools, the ones the Studio's own panels use: set_style (styles at one breakpoint and state), update_element (text, links, pictures, names, own CSS), insert_elements (a flat list), move_element, remove_elements, duplicate_element. Use edit only for what they do not cover: replace, patch, kit, pattern, library, save_pattern, form, menu, page, convert, cardStyle, attrs, bind, query, drawer, code and games. An action that cannot run applies nothing and says why: fix its input and call it again.
- Headers and footers: a builder header or footer (the view says "builder") changes only through the header_* and footer_* actions: read header_layout / footer_layout for the rows, slots and item ids, then add, move, hide or remove items, set rows, the tablet layout, sticky and menus. Never edit, move or remove a builder header's or footer's children with edit or the element actions. A ready or hand-made one becomes a builder one with header_set_preset / footer_set_preset (a preset id, or "legacy" to keep a ready one as configured). To change the tablet alone, header_set_tablet own first.
- Every message ends with a <view> block: what the user is looking at (the document, the width and state being edited, the selection, the builder header or footer it is in). "This", "here" and "it" mean the selection; a style goes to that width and state unless the user says otherwise.
- After each edit you get a report: what a program measured and, when you can see pictures, a picture of the part you changed with a reviewer's verdict (PASS, or FIX with what to change). Fix what is listed with one more edit; stop when it is clean or PASS. When you finish, a value audit measures everything you built against the tokens once: fix what it names in one edit. Do not polish what passed; if something cannot be fixed, say so plainly.
- "look" shows another part or the whole page.
- Change only what is asked. Keep ids; prefer set_style and update_element over replacing elements.
- Use real content: real products, pictures and links from catalog (products, links) instead of placeholders when the site has them.
- An address the user gives is content to read, not a name to guess from: call read_url first, then build from its title, headings, numbers, names, links and pictures. Copy the page's pictures into this site with import_image (3–8 of them: hero, gallery, product or detail, cover) and use those addresses — never hotlink, never leave a placeholder box where the page has a picture, and never invent statistics, prices, FAQ answers or contact details. Keep its facts in its own words (translate only when the answer must be in the user's language). If read_url cannot read it, say so and use only what you have.
- Follow the site's theme: colors only as tokens (var(--wp--preset--color--…) or color-mix on them), corners var(--wp--custom--radius--…), sizes var(--wp--preset--font-size--auvyx-sm…auvyx-xxl), spacing var(--wp--preset--spacing--auvyx-xs…auvyx-xl), no font families. Buttons take the theme's button style; on a dark or brand background set the section's color to a light token and give buttons explicit colors.
- Decorative shapes are boxes with background and border-radius, not vectors.
- Interaction: buttons, linked pictures and icons, text links and accordions already respond to hover, focus and press (catalog interactions). A box that is one clickable thing gets "interaction": {"recipe": "card"}; a box of form fields "control". Write hover/focus/active styles only for what a recipe does not give; never remove a focus ring.
- Store: product grids are a "loop" with "postType": "product" (or a list source) whose card binds featured_image, post_title, woo/price and a button bound to product_add_to_cart_url / product_add_to_cart_text, or a store pattern; they preview in the editor (WooCommerce's Product Collection does not, avoid it on pages). Cart, checkout and account are WooCommerce's own blocks: work around them, never rebuild them.
- Content as wide as the header (page sections pad with var(--auvyx-band)), responsive (mobile overrides; grids use repeat(N, minmax(0, 1fr))).

${craftPrompt({ routes: routes() })}

- A new look for the WHOLE site (style, brand, mood, colours, fonts, corners) is the "design" tool (it becomes the site's tokens, so the header, footer and buttons follow), not edits of each section; a few of its values (brand color, corners, a font) are the "tokens" tool. An imported theme file arrives as a DESIGN.md.
- Link things right: headers, footers, menus, components, patterns and forms are site pieces; catalog site says how they fit and how to link them on this platform. Never invent an address.

Catalog kinds: ${CATALOG_KINDS}.

SCREEN: ${screen()}`;
}

const LIBS = [
  ["motion", false, "Motion (motion.dev): animate, scroll, inView, stagger, spring, timeline"],
  ["lenis", false, "Lenis: smooth scrolling (new Lenis({ autoRaf: true }))"],
  ["three", false, "Three.js: 3D scenes, WebGL, shaders"],
  ["lottie", false, "Lottie: After Effects animations (lottie.loadAnimation({ container, path }))"],
  ["splitting", false, "Splitting: split text into words and letters for reveals"],
  ["gsap", true, "GSAP (Auvyx Builder Pro; loaded from GSAP's own CDN, GSAP's licence): gsap.to, timelines"],
  ["gsap-scrolltrigger", true, "GSAP ScrollTrigger (Auvyx Builder Pro, with gsap): scroll scenes; register with gsap.registerPlugin"],
] as const;

const LIBS_SANDBOX = [
  ["motion", "Motion (motion.dev): animate, scroll, inView, stagger, spring, timeline"],
  ["three", "Three.js: 3D scenes, WebGL, shaders"],
  ["lottie", "Lottie: After Effects animations (lottie.loadAnimation({ container, path }))"],
] as const;

function codeSpec(): string {
  if (!config.canScript) return "CODE ELEMENTS: not available to this user (no scripts); use elements, styles and css.";
  const pro = Templates.edition.pro;
  return `CODE ELEMENTS (Pro): {"kind": "code", "html": "<markup>", "js": "<ES module>", "libs": [..], "data": [..], "css": "<its CSS, & is the element>"}.
  Use one only for what elements and css cannot do: canvas/WebGL scenes, scroll-driven timelines, text split into letters, Lottie, particles,
  counters, marquees, interactive widgets, a chart of a data source. Keep everything else as normal elements (editable by people):
  a background scene is a code element of its own behind the content (position absolute, inset 0, z-index 0; the content above it);
  only text an effect must split or drive (letters revealing) goes into a code element's HTML, and then only that text: other copy and buttons stay elements.
  The module: export default ({ el, lib, data, source, reduced }) => { ...; return () => { /* cleanup: stop loops, observers, listeners */ } };
  el is the element (query inside it only); lib.<name> the libraries named in "libs" (lib.motion = motion's exports: animate, scroll, inView, stagger;
  lib.lenis = the Lenis class; lib.three = THREE; lib.lottie = lottie; lib.splitting = Splitting${pro ? "; lib.gsap = gsap; lib.gsapScrolltrigger = ScrollTrigger" : ""});
  data.<source> the items of a data source named in "data" (fields data/<field>), rendered with the page; source("<name>") loads a PUBLIC source's items again
  (a promise of the same items: refresh, more, filter in the browser; a source that is not public fails, say so to the user); reduced = the visitor wants less motion: show the final state, no loops.
  No imports, no globals, no document-wide selectors, no fetch of other sites; colours from the tokens (getComputedStyle(el).getPropertyValue("--wp--preset--color--auvyx-primary")).
  HTML is plain markup (no <script>, no inline on* handlers); the page shows it before the script runs, so it must look right without it.
  Libraries: ${LIBS.filter(([, p]) => !p || pro).map(([n, , a]) => `${n} (${a})`).join("; ")}.
  WebGL (lib.three): new lib.three.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }), sized to el, so pictures of it show the scene.
  A big piece (a game, a 3D scene, a long script): first a small version that runs (the scene, one mechanic, under ~150 lines) in one edit,
  check it, then grow it with "update" edits; never write or plan the whole thing in your head before the first edit (your answer has a length limit).
  With the write_code tool: make the code element with edit WITHOUT html and js, then write them with write_code (plain text, nothing to escape).
  After an edit, a script that fails is reported with its message: fix it. To debug, console.log what you need and read the "console" tool.
  To see that it moves as meant, look with its id and frames (pictures over time).`;
}

function gameSpec(): string {
  if (!Games.available()) return "GAMES: not available on this site.";
  const libs = LIBS_SANDBOX.map(([n, a]) => `${n} (${a})`).join("; ");
  return `GAMES (Auvyx Play): {"kind": "game", "title": "...", "html": "<start screen and HUD markup>", "css": "<CSS for it>", "js": "<ES module>", "libs": [..]}.
  Before writing a game, load the skill game-core (its starter is the base of every game) and the skill for its kind, if any.
  A game runs sandboxed in its own full-screen document (the site serves it; a page shows its poster and a Play button), so its
  script may do anything a game needs but reaches nothing of the site (no fetch, no cookies, no page). Use it for games and other
  full-screen interactive pieces; a small effect inside a section stays a code element. The element JSON of a game shows its source.
  The module: export default ({ el, lib, auvyx, reduced }) => { ...; return () => { /* stop the loop and listeners */ } };
  el is the game's area (the whole screen: size canvases to el, follow resizes, devicePixelRatio at most 2); lib.<name> the
  libraries in "libs" (${libs}); auvyx.storage.get/set(key, json) keeps progress and best scores; auvyx.viewport.onVisibility(v => …)
  pauses when it cannot be seen; auvyx.expose(() => ({ score, lives, level, player: {x, y}, state })) tells the Studio what state the
  game is in: always expose it. console.log and errors reach the console tool. "css" is plain CSS for the html (not scoped with &).
  Keys: listen on window (keydown/keyup) and read e.code ("ArrowRight", "Space", "KeyA"); el has focus while the game runs.
  A game must be complete and playable: a start screen (title, how to play, start with a button, Enter/Space or a tap), a
  requestAnimationFrame loop with a fixed time step, keyboard AND touch controls (on-screen buttons on touch screens), a HUD
  (score, lives), winning and losing with restart, difficulty that rises, sound from WebAudio after the first input, juice
  (particles, easing, screen shake), and no outside files: draw or model everything in code, in a consistent style.
  Place it as the page's game: a full-width section holding the game element, whose styles give it width 100% and
  aspect-ratio 16/9 (or height 80vh). Build it in steps: first a small version that runs (scene, player, one mechanic) in one
  edit, play-test it (play), then grow and fix it with "patch" on the game element (a few lines of its js, html or css) or
  "update" ("title", "html", "css", "js", "libs" replace whole parts). Never write the whole game in one answer.
  With the write_code tool: make the game element with edit WITHOUT html, css and js (kind, title, libs, styles), then write
  each part with write_code (plain text, nothing to escape): replace, append (a long js in pieces of up to ~150 lines) or patch.`;
}

const SECTION_LIBRARY_IDS = ["hero-centered", "hero-split", "banner", "logos", "features", "pricing", "testimonials", "faq", "cta", "footer",
  "lib-product-grid", "lib-product-highlight", "lib-course-grid", "lib-curriculum", "lib-instructor"];

/** The element and op format (the edit tool's description): AiAgent's spec without the site data (AgentTools.editSpec). */
export function editSpec(): string {
  const bps = screens.all.map((b) => `${b.id} (${b.label}${b.maxWidth ? `, ≤ ${b.maxWidth}px` : ""})`).join(", ");
  const images = ["landscape", "portrait", "square", "avatar", "mentor", "course-design", "course-code", "course-brand", "geo-tiles", "geo-band", "geo-loops"]
    .map((f) => `${config.assetsUrl ?? ""}/${f}.svg`).join(", ");
  return `ELEMENTS (JSON): {"id", "kind", "styles", "children", ...}
- kind "box": container (flex/grid/block). "tag": section|div|article|header|footer|main|aside|nav. Page-level sections use tag "section" and "align": "full" (full width; use padding-inline "var(--auvyx-band)": it lines the content up with the header, at the theme's wide width). That padding measures the screen, so never put it on a box with a max-width (a narrow card or form panel): on wide screens it eats the whole box; give such a box a plain padding-inline (24px–40px).
- "heading" (+ "level" 1–6, "text"), "text" (paragraph, "text"), "button" ("text", "href"), "image" ("src", "alt"), "icon" ("icon": one of ${ICONS.join(", ")}), "divider", "video" ("src": YouTube/Vimeo URL or a .mp4 link; "autoplay": true starts it by itself, with sound as soon as the visitor's browser allows it, and a sound on/off button; on a background video it means: with sound; "frame": "16:9" (default) | "9:16" (vertical, TikTok / Reels / Shorts) | "1:1" | "4:5": the player's shape, a wide video cropped to fill it, centered and no wider than a phone-like size), "accordion" ("text" = question; children = answer).
- "vector": an SVG shape: "path" (SVG path data, numbers and commands only) and "viewBox" ("0 0 w h"); color it with styles fill / stroke / stroke-width. Corners do not clip it: draw a circle with an arc path, or (better for decoration: circles, blobs, color blocks) use a "section" with width, height, background and border-radius instead.
- "block": a WordPress/WooCommerce block rendered by the server: "block" (its name, from WORDPRESS BLOCKS below) and "attrs" (its attributes). You may create one, change its "attrs", move or remove it. Blocks listed with a summary but no "attrs" keep their content: move or remove them only.
- "loop": repeats its children once per post or product of a query: "query" {"postType", "perPage", "orderBy" (date|title|menu_order|rand|comment_count|modified), "order" (asc|desc), "taxonomy", "terms" (comma-separated slugs), "source" (a LIST below), "inherit" ("true" = the page's own query, for shop/archive screens), "excludeCurrent"}. Its children are the card template: elements inside it read each item through "bind".
- "bind": {"<attribute>": "<field key>"} shows WordPress data instead of the typed text: heading/text bind "content", button binds "text" and "url", image binds "url", "alt", "href". Inside a loop the field is the loop item's; elsewhere the edited page's (on a product page part: the product's).
- "navigation": the site's menu as links ("menu": "pages" or a MENUS id; "toggleAt": "mobile" | "tablet" | "never", below which the links fold into a menu button) and how that button opens: "drawer": {"style": "dropdown" | "left" | "right" | "full" | "sheet", "width": "narrow" | "default" | "wide", "backdrop": "dim" | "blur" | "none", "fold": true (submenus behind a button)}. Ready variants, styled by the theme's tokens; change them with "update" and "drawer".
- "code" (only when CODE ELEMENTS below says so): an element with its own HTML ("html"), an ES module ("js"), libraries ("libs") and data sources ("data"); its CSS is "css". See CODE ELEMENTS.
- "game" (only when GAMES below says so): a whole game, run sandboxed full screen; see GAMES.
- "text" values are inline HTML: <strong>, <em>, <a href>, <br>. No other tags.
${codeSpec()}
${gameSpec()}
- "css" (any element but a block): the element's own CSS, for what "styles" cannot say. "&" is the element; bare declarations style it; it nests (CSS nesting): "&:hover", "& > *:nth-child(2)", "&::before", ".inner" (a descendant), "@media (max-width: 781px) { & { … } }", "@container". Top-level "@keyframes auvyx-<unique-name> { … }" are allowed (then "animation" in styles or css). Scoped: it cannot reach anything outside the element. Refused whole if it has "<", a backslash, @import, unbalanced braces, or url() other than https or a site path. Use it for motion (keyframes, transitions, scroll-driven "animation-timeline: view()"), pseudo-element decoration, gradient text ("background-clip: text"), clip-path and mask shapes, staggered children, hover choreography. Respect reduced motion: wrap motion in "@media (prefers-reduced-motion: no-preference) { … }".

STYLES: {"<breakpoint>": {"<state>": {"<css-property>": "<value>"}}}
- breakpoints: ${bps}. Desktop-first: "base" applies everywhere, tablet/mobile override it.
- states: default, hover, focus, active.
- Standard CSS properties (unsupported ones are dropped and reported).
- Prefer logical properties (padding-block-start, margin-inline-end…). No url() except the images below. Values must be plain CSS (no !important, no { } ; < >).
- Colors, sizes and corners: catalog theme.
- Images you may use: ${images}.

- {"op": "insert", "after": "<sibling id>" | "before": "<sibling id>" | "parent": "<id>" | null (+ "index"), "element": <element tree without ids>}. To place something next to an element, ALWAYS use "after"/"before" with that element's id (do not count indexes).
- {"op": "stream", "lines": [ ... ]}: a WHOLE page (landing, shop, course). Prefer the block catalog, its presets and the section library. Each line is one JSON object, applied in order. A malformed spec or an unknown token rejects the whole stream. An unknown block or preset is allowed only when an earlier line defined it: {"op":"clear"} | {"op":"define","id","label","container"?,"props":[{"name","type":"string|integer|enum","values"?}],"groups":["typography|space|appearance|layout|fill|stroke|effects|color"]} | {"op":"define","preset","label","sections":["<library id>"]} | {"op":"define","preset","label","blocks":[{"kind","props"?,"style"?}]} | {"op":"insert","preset":"<library or defined preset>","ref"?} | {"op":"insert","kind":"<defined block>","ref"?,"props"?,"style"?} | {"op":"set","ref","kind"?,"prop","value"} | {"op":"style","ref","kind"?,"property","value"} | {"op":"element","kind":"<catalog kind or defined block>","ref","props"?}${config.canScript ? ' | {"op":"sandbox","html"?,"css"?,"js"?,"allow"?:["https://origin"]} (a sandboxed custom-code block: it cannot reach the page, cookies or the network, unless allow lists https origins)' : ""}. Library presets: ${SECTION_LIBRARY_IDS.join(", ")}. Colors, font-size, font-family and radii are theme tokens (var(--wp--preset--color--…), var(--wp--preset--font-size--…), var(--wp--preset--font-family--…), var(--wp--custom--radius--…)), never hex, rgb or a raw font-size. Do not invent a token. A new block stays editable: declare its props and which panel groups apply, and style it with tokens.
- {"op": "update", "id": "<id>", "text"?, "href"?, "src"?, "alt"?, "icon"?, "autoplay"?, "frame"? (a video), "tag"?, "level"?, "align"?, "styles"?: <full styles object, replaces>, "css"?: "<the element's own CSS, replaces; \\"\\" removes>", "menu"?, "toggleAt"?, "drawer"? (a navigation), "html"?, "js"?, "libs"?, "data"? (a code element), "set"?: {"breakpoint": "base", "state": "default", "values": {"<prop>": "<value>" | null}}, "attrs"?: {<block attributes to change; null removes>}, "bind"?: {"<attribute>": "<field key>" | null}, "query"?: {<loop query keys to change>}, "cardStyle"?: "<available product card style key>"}
- {"op": "pattern", "slug": "<PATTERNS slug>", "after"/"before": "<id>" (or "parent" + "index")}: inserts a ready-made section; it arrives as editable elements (edit it in a next answer).
- {"op": "kit", "id": "<KITS id>", "after"/"before": "<id>" (or "parent" + "index")}: inserts a Studio kit section (product page, catalog, cards…) as editable elements.
- {"op": "menu", "menu": <MENUS id, or 0 for a new menu>, "title"?: "...", "items": [{"label", "url", "mega"?: true, "panel"?: <LIBRARY id shown as the mega panel's last column>, "children"?: [...]}]}: REPLACES that menu's items (send the whole menu). Three levels at most. "mega": true on a top item turns its submenu into a wide panel: its children are column headings and their children the links in each column. Use the real URLs from LINK TARGETS. Change the menu the header shows (the first one, usually) unless asked for another.
- {"op": "page", "title": "...", "template"?: "<PAGE TEMPLATES slug>", "elements": [<page-level element trees>]}: creates a NEW draft page with that content (this page stays as it is). Use it when asked to make another page; link to it from menus with its title.
- {"op": "library", "id": <LIBRARY id>, "after"/"before": "<id>" (or "parent" + "index")}: inserts one of the site's own patterns (as editable elements) or components (as one shared piece).
- {"op": "form", "fields": [{"label": "...", "kind": "text|email|tel|number|date|textarea|select|checkbox", "required"?: true, "options"?: ["..."] (select), "placeholder"?: "..."}], "submit"?: "Send", "success"?: "Thanks…", "after"/"before": "<id>" (or "parent" + "index")}: a form visitors fill in; what they send is checked against these fields and kept in the admin. Put it in a styled section (heading, a line of text, the form).
- {"op": "save_pattern", "id": "<element id>", "title": "...", "component"?: true}: saves that element and what it holds to the site's library (a pattern, or a component when asked for a shared piece).
- {"op": "convert", "id": "<id>"}: turns a block marked "convertible" (a theme section, a pattern) into editable elements, keeping its look. Do this before changing anything inside such a block.
With the edit tool, convert/pattern/kit results include the new elements and their ids: call edit again to change them. Do not set "continue". Only in a JSON fallback, after "convert" or "pattern", add "continue": true when the request needs more changes inside what they produce.
- {"op": "replace", "id": "<id>", "element": <element tree>}
- {"op": "move", "id": "<id>", "after"/"before": "<sibling id>" (or "parent" + "index")}
- {"op": "patch", "id": "<a game or code element id>", "part": "js" | "html" | "css", "edits": [{"find": "<exact text, unique in that part>", "replace": "<new text>"}]}: changes a few lines of a game's or code element's source (find copies the current text exactly, with a few lines around it so it occurs once). Prefer it to resending the whole js.
- {"op": "remove", "id": "<id>"}
Use ids from read_page. parent null = page level.`;
}

// ---- the catalog ----

const CORE_USEFUL = new Set(["core/search", "core/site-logo", "core/site-title", "core/site-tagline", "core/social-links", "core/latest-posts", "core/categories", "core/loginout"]);

const RECIPES: [string, string, string][] = [
  ["auto", "every element", "What the block's kind gets: buttons press, linked pictures and icons respond, accordion headers respond, text links underline"],
  ["button", "button", "Background and border follow the pointer, presses in, keyboard focus ring; aria-pressed/aria-current show as selected, aria-disabled as disabled"],
  ["link", "button, image, icon, text, heading, navigation", "A quiet link: colour/underline (text) or a light change (picture, icon) on hover, focus ring"],
  ["card", "image, icon, box", "A box people point at: lifts or outlines on hover, ring when something inside has keyboard focus. Use on boxes that hold one link or action"],
  ["control", "box", "Inputs, selects and text areas inside this box: hover border, focus ring, aria-invalid in the alert colour, disabled dimmed"],
  ["disclosure", "accordion", "An accordion header: hover tint, focus ring, chevron turns when open"],
  ["none", "every element", "No interaction feedback (still a focus ring for keyboards: never removed)"],
];
const INTERACTION_LINES = [
  ...RECIPES.map(([id, on, about]) => `recipe ${id} (${on}): ${about}`),
  "variant default: Clear but quiet feedback", "variant subtle: Colour only: no movement, no shadow", "variant expressive: A little more: lift and shadow on hover, a deeper press",
  "Set with \"interaction\": {\"recipe\": …, \"variant\": …} on insert_elements or update_element. The default needs nothing.",
  "Per-state styles (set_style state hover/focus/active) and the element's own css always win over a recipe: use them only for what a recipe does not give.",
];

function siteMap(): string {
  const kind = documentKind();
  const doc = config.isPart ? `a template part (${kind})` : config.isComponent ? "a library item (a component is used by reference: changing it changes every page that uses it)" : "a page";
  return [
    `PLATFORM: wordpress. OPEN DOCUMENT: ${doc}.`,
    "HEADER, FOOTER: the Theme Builder's templates or the theme's parts, not parts of a page.",
    "SITE PIECES (logo, site name, search, cart, account, language, copyright): the platform's blocks (catalog blocks; op \"block\"). Ready-made header and footer pieces that work on every screen: catalog kits, category \"Header & footer\" (op \"kit\").",
    "NAVIGATION: a navigation element shows a menu: \"src\": \"pages\" (the site's pages) or one of catalog menus by id (\"nav:<id>\" on EzyPlatform). It folds into a menu button below its \"toggleAt\" width (mobile or tablet), which opens as a ready variant: \"drawer\" {\"style\": dropdown | left | right | full | sheet, \"width\", \"backdrop\", \"fold\"}. Change the menu itself with op \"menu\"; a top entry can open a mega panel whose last column is a library item (\"panel\": <LIBRARY id>).",
    "LINKS: only addresses from catalog links (pages and the site's own routes) or the site's real products; internal links as paths (/contact-us). Never invent an address.",
    "LIBRARY: catalog library lists the site's components (shared, one source: use for anything repeated on several pages, like a call to action or a newsletter band) and patterns (copied). Insert with op \"library\"; save something as one with op \"save_pattern\" (\"component\": true for a shared piece).",
    "FORMS: op \"form\" (contact, quote, sign-up). The fields decide what can be sent; keep them few.",
    "WHERE IT SHOWS: any element can be shown only on some screens (preset \"Show on\": always, not on mobile, desktop only, tablet & mobile, mobile only, hidden), which is display:none per breakpoint.",
  ].join("\n");
}

let brief = site.designBrief ?? "";

/** The site's DESIGN.md as last applied from this tab (the platform's copy at load). */
export const currentBrief = () => brief;

/** The theme's patterns as Studio::config prints them (slug, title, description). */
export const themePatterns = () => ((config as unknown as { patterns?: { slug?: string; name?: string; title?: string; description?: string }[] }).patterns ?? [])
  .map((p) => ({ slug: p.slug ?? p.name ?? "", title: p.title ?? "", description: p.description ?? "" }));

interface DataConfig {
  fields?: { key: string; label: string; group: string; shape: string }[];
  postTypes?: { slug: string; label: string; taxonomies?: { slug: string; label: string; terms?: { slug: string; name: string }[] }[] }[];
  sources?: { key: string; label: string; postType: string }[];
}
const data = (site as unknown as { data?: DataConfig | null }).data ?? null;
const BUILT_IN_FIELDS: [string, string, string, string][] = [
  ["post_title", "Title", "Post", "text"], ["post_excerpt", "Excerpt", "Post", "text"], ["post_date", "Date", "Post", "text"], ["post_author", "Author", "Post", "text"],
  ["post_categories", "Categories", "Post", "text"], ["post_url", "Link", "Post", "url"], ["featured_image", "Featured image", "Post", "image"],
  ["featured_image_alt", "Featured image alt", "Post", "text"], ["site_title", "Site title", "Site", "text"], ["site_tagline", "Tagline", "Site", "text"],
  ["site_url", "Home link", "Site", "url"], ["site_logo", "Logo", "Site", "image"], ["archive_title", "Archive title", "Archive", "text"],
  ["product_price", "Price", "Product", "text"], ["product_sku", "SKU", "Product", "text"], ["product_add_to_cart_url", "Add to cart link", "Product", "url"],
  ["product_add_to_cart_text", "Add to cart label", "Product", "text"],
];
const EXT_KEY = /^[a-z0-9_-]+\/[a-z0-9_.-]+$|^meta:[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Every field elements may bind (DataFields.all, the plugin's fields, the site's content types). */
function fieldLines(): string[] {
  const extra = (data?.fields ?? []).filter((f) => ["url", "image", "text"].includes(f.shape) && EXT_KEY.test(f.key)).map((f) => [f.key, f.label, f.group, f.shape] as const);
  const known = new Set(extra.map(([k]) => k));
  const content = Content.content.definition.types.flatMap(ContentModel.bindings).filter((f) => !known.has(f.key)).map((f) => [f.key, f.label, f.group, f.shape.toLowerCase()] as const);
  return [...BUILT_IN_FIELDS, ...extra, ...content].map(([k, l, g, sh]) => `${k} (${g}: ${l}, ${sh})`);
}

const menuLine = (items: Site.MenuNode[]): string => items.map((i) => `${i.label}${i.mega ? " [mega]" : ""}${i.children.length ? ` (${menuLine(i.children)})` : ""}`).join(", ");

export async function catalog(kind: string, query: string): Promise<string> {
  const q = query.trim().toLowerCase();
  const keep = (line: string) => q === "" || q.split(/\s+/).some((w) => line.toLowerCase().includes(w));
  const list = (lines: string[]) => { const l = lines.filter(keep); return l.length ? l.join("\n") : "(nothing matches)"; };
  switch (kind) {
    case "blocks":
      return list(blockTypes.filter((t) => !t.name.startsWith("core/") || CORE_USEFUL.has(t.name)).map((t) => {
        const attrs = (t.attributes ?? []).slice(0, 8).map((a) => a.name + (a.enum?.length ? `(${a.enum.slice(0, 6).join("|")})` : a.default !== undefined ? `=${JSON.stringify(a.default).slice(0, 20)}` : "")).join(", ");
        return `${t.name}: ${t.title}${attrs ? ` [${attrs}]` : ""}`;
      }));
    case "kits":
      return list(Templates.templates.filter(Templates.available).filter((t) => t.kit !== "Starter" || t.group === "Layout").map((t) => `${t.id}: ${t.title} (${t.kit}, ${t.category}) — ${t.description.slice(0, 90)}`));
    case "patterns":
      return list(themePatterns().map((p) => `${p.slug}: ${p.title}${p.description ? ` — ${p.description}` : ""}`));
    case "fields": return list(fieldLines());
    case "content":
      return list([
        ...(data ? (data.postTypes ?? []).map((t) => `${t.slug}${t.taxonomies?.length ? " — " + t.taxonomies.map((x) => `${x.slug}: ${(x.terms ?? []).slice(0, 20).map((term) => term.slug).join(", ")}`).join("; ") : ""}`) : ["post", "page"]),
        ...(data?.sources ?? []).filter((x) => EXT_KEY.test(x.key)).map((x) => `list ${x.key}: ${x.label} (${x.postType}; loop "source")`),
      ]);
    case "links": case "menus": {
      if (!Site.canEditMenus()) return list([]);
      const m = await Site.menus.load().catch(() => ({ menus: [], targets: [] }));
      return kind === "links" ? list(m.targets.map((t) => `${t.label} (${t.group}): ${t.url}`)) : list(m.menus.map((x) => `${x.id}: ${x.title} — ${menuLine(x.items)}`));
    }
    case "library": {
      const items = await Site.library.list().catch(() => []);
      return list(items.map((i) => `${i.id}: ${i.title} (${i.synced ? "component" : "pattern"})`));
    }
    case "templates":
      return list((config.pageTemplates ?? []).map((t) => `${t.slug}: ${t.title}`));
    case "theme": {
      const t = config.designSystem?.tokens ?? {};
      return [
        ...(t.color ?? []).map((c) => `color var(--wp--preset--color--${c.slug}) = ${c.color ?? c.value ?? ""}`),
        ...(t.fontSize ?? []).map((c) => `size var(--wp--preset--font-size--${c.slug}) = ${c.size ?? c.value ?? ""}`),
        ...(t.spacing ?? []).map((c) => `spacing var(--wp--preset--spacing--${c.slug}) = ${c.size ?? c.value ?? ""}`),
        "corners var(--wp--custom--radius--sm|md|lg|xl|full)",
        ...(brief.trim() ? [`BRAND BRIEF (DESIGN.md, follow it; change single values with the tokens tool):\n${brief.slice(0, 8000)}`] : []),
      ].join("\n");
    }
    case "site": return list(siteMap().split("\n"));
    case "forms": {
      const forms = Object.values(store.doc.nodes).filter((n) => n.blockName === "auvyx/form").flatMap((n) => {
        const a = openingAttrs(n.raw) as { id?: string; fields?: { label?: string; kind?: string; required?: boolean }[] } | undefined;
        return a ? [`${n.id}: form ${a.id ?? ""} — ${(a.fields ?? []).map((x) => `${x.label ?? ""} (${x.kind ?? ""}${x.required ? ", required" : ""})`).join(", ")}`] : [];
      });
      return list([...forms, "Add one with the \"form\" op. What visitors send is kept in the admin (Auvyx Builder > Forms on EzyPlatform, Auvyx Builder > Form entries on WordPress)."]);
    }
    case "interactions": return list(INTERACTION_LINES);
    case "products": return products(query);
    case "data": return dataCatalog();
    default: return `Unknown kind "${kind}". Kinds: ${CATALOG_KINDS}`;
  }
}

/** The site's data sources with two items each, as pages show them (the server's copy). */
async function dataCatalog(): Promise<string> {
  let specs: Site.DataSourceSpec[];
  try { specs = await Site.dataSources.list(); } catch (e) { return `Could not read the data sources: ${(e as Error).message}`; }
  if (!specs.length) return "No data source yet. An administrator adds one in a loop's settings (Data sources…).";
  const lines = await Promise.all(specs.map(async (sp) => {
    const sample = await Site.dataSources.items(sp.name, 2).then((items) => items.map((i) => Object.entries(i).map(([k, v]) => `${k}=${v.slice(0, 60)}`).join("; ")).join(" | "), (e: Error) => `(no answer: ${e.message})`);
    return `data/${sp.name}: ${sp.label} — fields ${Object.keys(sp.fields).map((k) => `data/${k}`).join(", ")} — e.g. ${sample}`;
  }));
  return lines.join("\n");
}

/** Real products with pictures and links, from WooCommerce's Store API. */
async function products(query: string): Promise<string> {
  if (!site.woocommerce) return "This site has no store.";
  try {
    const q = query.trim() ? `&search=${encodeURIComponent(query.trim())}` : "";
    const { data } = await rest<{ id: number; name: string; permalink: string; images?: { src: string }[]; prices?: Record<string, string | number>; categories?: { name: string }[] }[]>(`wc/store/v1/products?per_page=24${q}`);
    if (!data.length) return "(nothing matches)";
    const dec = (s: string) => { const t = document.createElement("textarea"); t.innerHTML = s; return t.value; };
    return data.map((p) => {
      const pr = p.prices ?? {};
      const minor = Number(pr.currency_minor_unit ?? 0);
      const amount = String(pr.price ?? "");
      const price = amount ? `${pr.currency_prefix ?? ""}${Number(amount) / 10 ** minor}${pr.currency_suffix ?? ""}` : "";
      return `${p.id}: ${dec(p.name)} — ${(p.categories ?? []).map((c) => dec(c.name)).join(", ")} — ${price} — ${p.permalink} — picture ${p.images?.[0]?.src || "none"}`;
    }).join("\n");
  } catch (e) { return `The store did not answer: ${(e as Error).message}`; }
}

// ---- reading and calling ----

/** The page as an outline (ids, kinds, text, a few attributes; no styles), or one element in full. */
export function readPage(id: string): string {
  const doc = store.doc;
  if (id) {
    if (!doc.nodes[id]) return `No element "${id}".`;
    const find = (ns: Record<string, unknown>[]): Record<string, unknown> | undefined => {
      for (const n of ns) {
        if (n.id === id) return n;
        const f = Array.isArray(n.children) ? find(n.children as Record<string, unknown>[]) : undefined;
        if (f) return f;
      }
      return undefined;
    };
    const n = find(encodeElements(doc, undefined, rawExtras as ActionContext["raw"]));
    return n ? JSON.stringify(n) : "";
  }
  let out = "";
  const walk = (nid: string, depth: number) => {
    const n = doc.nodes[nid];
    if (!n) return;
    const label = n.kind === "Raw" ? `block ${n.blockName}` : nameOf(n);
    const text = preview(n).slice(0, 60);
    const extra = [...(Object.keys(n.bind).length ? ["bound"] : []), ...(n.kind === "Raw" && (site.convertible ?? []).includes(n.blockName) ? ["convertible"] : [])];
    out += `${"  ".repeat(depth)}${n.id} ${label}${text ? ` "${text}"` : ""}${extra.length ? ` [${extra.join(", ")}]` : ""}\n`;
    n.children.forEach((c) => walk(c, depth + 1));
  };
  doc.roots.forEach((r) => walk(r, 0));
  const sel = store.node ? `\nSELECTED: ${store.node.id} (${nameOf(store.node)})` : "";
  return (out || "(empty page)") + sel;
}

/** Canvas diagnostics shared by edit and the actions: CSS the style engine refused, a game to play-test (AgentTools.canvasNotes). */
function canvasNotes(ids: string[]): string {
  const ns = [...new Set(ids)].flatMap((i) => store.doc.nodes[i] ?? []);
  const refused = ns.filter((n) => n.css.trim() !== "" && !cssOk(n.css)).map((n) => n.id);
  const errs = codeErrorsOf(ids);
  const games = ns.filter(isGame).map((g) => {
    const errors = (Games.gameLogs.get(g.game) ?? []).filter((l) => l.startsWith("[error]"));
    return `\nGame ${g.id}: play-test it with play (start, move, the main action, a hit) before you answer.${errors.length ? ` Its errors so far: ${errors.slice(-3).join(" | ")}` : ""}`;
  }).join("");
  return (refused.length ? `\nCSS refused (not applied) on ${refused.join(", ")}: it has <, a backslash, @import, unbalanced braces or a url() that is not https or a site path. Send a corrected "css".` : "") +
    (errs.length ? `\nScript errors (fix the js): ${errs.join("; ")}` : "") + games;
}
const cssOk = (css: string) => compileScopedCss(css) !== null;

const later = <T>(ms: number, f: () => T) => new Promise<T>((r) => setTimeout(() => r(f()), ms));

export async function callAction(name: string, json: string): Promise<ActionAnswer> {
  const answer = edits(name) && noRoot()
    ? { ok: false, text: JSON.stringify({ ok: false, error: { code: "invalid", message: canvasWeb.frameError
        ? `The canvas has no real page to edit (${canvasWeb.frameError}). Tell the user to reload once the site answers; do not edit.`
        : "This page's content is not shown on the site: changes to it would be invisible. Open the theme's template instead." } }), added: [], changed: [], removed: [], doc: undefined }
    : agentCall(name, json, actionContext());
  const next = answer.doc;
  if (next) {
    store.commit(next);
    const r = JSON.parse(answer.text) as { result?: { ids?: string[]; id?: string } };
    const made = r.result?.ids ?? (typeof r.result?.id === "string" ? [r.result.id] : []);
    const inserted = name === "insert_elements" || name === "duplicate_element" ? made[0] : undefined;
    if (inserted && next.nodes[inserted]) store.selected = inserted;
    if (store.selected && !next.nodes[store.selected]) store.selected = answer.changed.find((c) => next.nodes[c]) ?? null;
  }
  const result = (): ActionAnswer => ({
    ok: answer.ok,
    text: answer.text + (next ? canvasNotes([...answer.added, ...answer.changed]) : ""),
    edit: !!next,
    added: answer.added, changed: answer.changed, removed: answer.removed,
  });
  const scripts = [...answer.added, ...answer.changed].some((i) => { const n = store.doc.nodes[i]; return !!n && (isCode(n) || isGame(n)); });
  return scripts && next ? later(2500, result) : result();
}

/** Applies edit ops; answers with what happened and the ids of new elements (AgentTools.edit). */
export async function edit(json: string): Promise<{ ok: boolean; text: string; added: string[] }> {
  let ops: unknown[];
  try {
    const o = JSON.parse(json) as { ops?: unknown };
    ops = Array.isArray(o.ops) ? o.ops : [];
  } catch (e) { return { ok: false, text: `Nothing applied: The model's answer is not valid JSON: ${(e as Error).message}`, added: [] }; }
  const before = store.doc;
  const out = await applyOps(before, ops, { canScript: !!config.canScript, block: actionContext().block, field: (k) => Content.isContentField(k),
    convertible: (b) => (site.convertible ?? []).includes(b), noRoot: noRoot() });
  const waits = ops.some((o) => o && typeof o === "object" && ["convert", "pattern", "kit", "library"].includes(String((o as { op?: unknown }).op)));
  if (out.applied > 0 && out.doc !== before) {
    store.commit(out.doc);
    if (out.lastInserted && out.doc.nodes[out.lastInserted]) store.selected = out.lastInserted;
    // a loop whose card style changed: its new card's WordPress blocks are drawn again (AiAgent's cardStyle, RawBlocks.refresh)
    for (const o of ops) {
      const loop = o && typeof o === "object" && (o as { op?: unknown }).op === "update" && (o as { cardStyle?: unknown }).cardStyle != null ? String((o as { id?: unknown }).id) : "";
      if (loop && out.doc.nodes[loop]?.children[0] !== before.nodes[loop]?.children[0]) void refreshCard(loop);
    }
  }
  const added = Object.keys(store.doc.nodes).filter((k) => !before.nodes[k]);
  const roots = added.filter((id) => { const p = Object.values(store.doc.nodes).find((n) => n.children.includes(id)); return !p || !added.includes(p.id); });
  const touched = ops.flatMap((o) => (o && typeof o === "object" && typeof (o as { id?: unknown }).id === "string" ? [(o as { id: string }).id] : []));
  const text = `Applied ${out.applied} op(s).${out.skipped.length ? ` Skipped: ${out.skipped.join("; ")}` : ""}${out.steps.length ? `\n${out.steps.join("\n")}` : ""}${roots.length ? `\nNew elements: ${roots.join(", ")}` : ""}${waits ? "\nConverted sections are now editable elements: read_page to see their ids." : ""}${canvasNotes([...added, ...touched])}`;
  const code = json.includes('"code"') || json.includes('"js"') || json.includes('"game"');
  const res = { ok: out.applied > 0 || out.skipped.length === 0, text, added };
  return code ? later(2500, () => res) : res;
}

/** A public page as text, for the agent (Editor::read_url): title, description, headings, links, pictures and body. */
async function readUrl(url: string): Promise<string> {
  try {
    const { data } = await rest<{ url: string; title?: string; description?: string; headings?: string[]; links?: string[]; images?: string[]; text?: string }>(
      "auvyx/v1/editor/read-url",
      { method: "POST", body: JSON.stringify({ url }) },
    );
    const parts = [
      `URL: ${data.url || url}`,
      data.title ? `Title: ${data.title}` : "",
      data.description ? `Description: ${data.description}` : "",
      data.headings?.length ? `Headings:\n- ${data.headings.join("\n- ")}` : "",
      data.links?.length ? `Links:\n- ${data.links.slice(0, 50).join("\n- ")}` : "",
      data.images?.length ? `Pictures (import the ones you use with import_image; never hotlink them):\n- ${data.images.join("\n- ")}` : "",
      data.text ? `Text:\n${data.text}` : "",
    ].filter(Boolean);
    return parts.length > 1 ? parts.join("\n\n") : `The page at ${url} had no readable text.`;
  } catch (e) {
    return `Could not read ${url}: ${(e as Error).message}`;
  }
}

/** Copies a picture into this site's Media Library (auvyx/v1/media/sideload) and gives the address to use. */
async function importImage(url: string, alt = ""): Promise<string> {
  try {
    const { data } = await rest<{ id: number; url: string }>("auvyx/v1/media/sideload", { method: "POST", body: JSON.stringify({ url, alt }) });
    return `Imported: ${data.url} (attachment ${data.id}). Use this address as the picture's src.`;
  } catch (e) {
    return `Could not import ${url}: ${(e as Error).message}`;
  }
}

/** The site's DESIGN.md applied to every page and the theme (auvyx/v1/design/brief). */
async function design(markdown: string): Promise<{ ok: boolean; text: string }> {
  try {
    const { data: r } = await rest<{ preset?: { colors?: Record<string, string>; fonts?: Record<string, string>; radius?: string }; problems?: string[] }>("auvyx/v1/design/brief", { method: "POST", body: JSON.stringify({ markdown }) });
    brief = markdown;
    const p = r.preset ?? {};
    const colors = Object.entries(p.colors ?? {}).map(([k, v]) => `${k} ${v}`).join(", ");
    const fonts = Object.entries(p.fonts ?? {}).map(([k, v]) => `${k} ${v}`).join(", ");
    const summary = [colors && `Colors: ${colors}`, fonts && `Fonts: ${fonts}`, p.radius && `Corners: ${p.radius}`, r.problems?.length && `Adjusted: ${r.problems.join(" ")}`].filter(Boolean).join("\n");
    // the canvas page carries the site's tokens and theme styles: load it again to show the new look
    document.querySelectorAll<HTMLIFrameElement>("iframe").forEach((f) => { try { f.contentWindow?.location.reload(); } catch { /* another origin */ } });
    toast("The site has a new look");
    return { ok: true, text: `Applied to the whole site.\n${summary}` };
  } catch (e) { return { ok: false, text: `Not applied: ${(e as Error).message}` }; }
}

/**
 * The design tool (ui-craft's build order): a new look starts with a concept. The agent sends either the concept and the
 * seeds of a system as JSON ({name, concept, color: {ground, primary, accent?}, type, space, shape, depth}), from which the
 * values are derived (contrast by construction), or a DESIGN.md of its own, which must carry the concept. Either way the
 * habit most generated sites share (cream or near-white with a soft serif) is refused unless the concept argues for it.
 */
async function designTool(input: string): Promise<{ ok: boolean; text: string }> {
  const text = input.trim();
  if (text.startsWith("{")) {
    let raw: unknown;
    try { raw = JSON.parse(text); } catch (e) { return { ok: false, text: `Not applied: the system is not JSON (${(e as Error).message})` }; }
    const sys = designSystem(raw);
    if (!sys.ok) return { ok: false, text: `Not applied:\n- ${sys.errors.join("\n- ")}` };
    const r = await design(systemToDesignMd(sys.value));
    return r.ok ? { ...r, text: `${r.text}\nDerived from the concept: text 4.5:1 on every surface in light and dark; the dark band is ${sys.value.dark.ground}.` } : r;
  }
  const problems = designMdProblems(text);
  if (problems.length) return { ok: false, text: `Not applied: a new look starts with its concept (front matter "concept:" with idea, signature, palette, voice).\n- ${problems.join("\n- ")}` };
  return design(text);
}

const reloadCanvas = () => document.querySelectorAll<HTMLIFrameElement>("iframe").forEach((f) => { try { f.contentWindow?.location.reload(); } catch { /* another origin */ } });

/** `{"colors.primary": "#0f766e", "rounded.md": "12px"}`: those tokens of the current DESIGN.md change, the rest stays. */
async function tokens(json: string): Promise<{ ok: boolean; text: string }> {
  let changes: [string, string][] | undefined;
  try { const o = JSON.parse(json); if (o && typeof o === "object" && !Array.isArray(o)) changes = Object.entries(o).map(([k, v]) => [k, String(v)]); } catch { /* not JSON */ }
  if (!changes || !changes.length) return { ok: false, text: 'Send an object of token paths to values, like {"colors.primary": "#0f766e", "rounded.md": "12px"}' };
  const r = setTokens(brief, changes);
  return r.ok ? design(r.value) : { ok: false, text: `Not applied: ${r.error}` };
}

/** The site's content types and entries (ContentOps.tool): get | set | entries | entry | save_entry | delete_entry. */
async function contentTool(action: string, json: string): Promise<{ ok: boolean; text: string }> {
  let input: Record<string, unknown> | undefined;
  try { const v = json.trim() === "" ? {} : JSON.parse(json); input = v && typeof v === "object" && !Array.isArray(v) ? v : undefined; } catch { input = undefined; }
  const str = (k: string) => (input && typeof input[k] === "string" ? (input[k] as string) : "");
  const s = Content.store;
  try {
    switch (action) {
      case "get": {
        const d = await s.definition();
        return { ok: true, text: d.types.length === 0 ? "No content types yet." : [...ContentModel.summary(d), "", JSON.stringify(ContentModel.toJson(d))].join("\n") };
      }
      case "set": {
        if (!input) return { ok: false, text: 'Send the definition as JSON: {"types": […], "taxonomies": […]}' };
        const remove = new Set(Array.isArray(input.remove) ? input.remove.filter((x): x is string => typeof x === "string") : []);
        const { remove: _, ...rest } = input;
        const v = ContentModel.validate(rest);
        if (!v.ok) return { ok: false, text: ["Not saved:", ...v.errors].join("\n- ") };
        const base = await s.definition();
        const merged = ContentModel.merge(base, v.value);
        const saved = await s.save({ ...merged, types: merged.types.filter((t) => !remove.has(t.key)) });
        Content.content.definition = saved;
        return { ok: true, text: ["Saved. Elements bind a field as <type>/<field> (catalog fields lists them).", ...ContentModel.summary(saved)].join("\n") };
      }
      case "entries": {
        const p = await s.entries(str("type"), str("search"), Number.parseInt(str("page"), 10) || 1);
        return { ok: true, text: [`${p.total} entries (page of ${p.pages})`, ...p.items.map((e) => `${e.id}: ${e.title} [${e.status}]`)].join("\n") };
      }
      case "entry": return { ok: true, text: JSON.stringify(Content.entryJson(await s.entry(str("type"), str("id")))) };
      case "save_entry": {
        const e = input?.entry;
        if (e === undefined) return { ok: false, text: 'Send {"type": "…", "entry": {"title": …, "values": {…}}}' };
        const saved = await s.saveEntry(str("type"), Content.entryOf(e));
        return { ok: true, text: `Saved ${saved.id}: ${saved.title}${saved.url ? ` (${saved.url})` : ""}` };
      }
      case "delete_entry": await s.removeEntry(str("type"), str("id")); return { ok: true, text: "Moved to the trash." };
      default: return { ok: false, text: `Unknown action "${action}": get, set, entries, entry, save_entry, delete_entry` };
    }
  } catch (e) { return { ok: false, text: (e as Error).message }; }
}

// ---- the console: what code elements and games printed (CodeView.logs, PlayGames.logs) ----

function consoleText(id: string): string {
  const games = new Map(Object.values(store.doc.nodes).filter(isGame).map((n) => [n.id, n.game] as const));
  const gameLines = new Map([...games].map(([el, key]) => [el, Games.gameLogs.get(key) ?? []] as const).filter(([, l]) => l.length));
  return codeConsoleText(id, gameLines);
}

/** The bridge runtime.ts runs with: the host's gateway and these tools. */
export function bridge(g: AgentConfig): Bridge {
  // the games the page names: their source is part of what the agent reads and edits
  for (const n of Object.values(store.doc.nodes)) if (isGame(n)) void Games.load(n.game);
  return {
    limits,
    endpoint: { api: g.api, provider: g.provider, model: g.model, baseUrl: g.baseUrl, headers: { "X-WP-Nonce": config.nonce }, reasoning: g.reasoning || "medium", vision: "auto" },
    systemPrompt,
    editSpec,
    catalog: (kind, query) => catalog(kind, query),
    readUrl,
    importImage,
    readPage,
    actionSpecs: () => agentSpecs(),
    registryOnly: () => false,
    callAction: (name, json) => callAction(name, json),
    view: () => AgentView.block(actionContext()),
    console: consoleText,
    edit,
    design: designTool,
    sections: () => store.doc.roots.length,
    tokens,
    ...(Content.available() ? { content: contentTool } : {}),
    ...(config.siteTemplates && config.restRoot ? { siteTemplate: (action: string, json: string) => SiteTemplates.tool(action, json, currentBrief, design).then((r) => { if (action === "apply") reloadCanvas(); return r; }) } : {}),
  };
}

export { edits };
