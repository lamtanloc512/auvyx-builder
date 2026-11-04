/**
 * The document as element trees with ids (the Scala `ElementJson.encode`): what read_page answers for one element, in
 * the very form insert_elements and the agent's edit ops take.
 */
import type { Doc, El } from "../model";
import { nameOf, readDrawer } from "../elementJson";
import type { Json, JsonObj } from "./schema";

const split = (c: string) => c.split(/[ \t\n\x0B\f\r]+/);
const RECIPES = ["auto", "button", "link", "card", "control", "disclosure", "none"];
const VARIANTS = ["default", "subtle", "expressive"];

export const isCode = (n: El) => n.kind === "Section" && (n.className.split(" ").includes("auvyx-code") || n.script !== "" || n.markup !== "");
export const isGame = (n: El) => n.kind === "Section" && n.game !== "";

/** InteractionRecipes.isMarker / read / toJson. */
export const isInteractionMarker = (t: string) =>
  t.startsWith("auvyx-ix-v-") ? VARIANTS.includes(t.slice(11)) : t.startsWith("auvyx-ix-") && RECIPES.includes(t.slice(9));
export function interaction(className: string): { recipe: string; variant: string } {
  const t = split(className).filter((x) => x !== "");
  return {
    recipe: t.find((x) => !x.startsWith("auvyx-ix-v-") && x.startsWith("auvyx-ix-") && RECIPES.includes(x.slice(9)))?.slice(9) ?? "auto",
    variant: t.find((x) => x.startsWith("auvyx-ix-v-") && VARIANTS.includes(x.slice(11)))?.slice(11) ?? "default",
  };
}
/** The interaction choice as the element tree writes it; absent when it is the default. */
export function interactionJson(c: { recipe: string; variant: string }): JsonObj | undefined {
  if (c.recipe === "auto" && c.variant === "default") return undefined;
  const o: JsonObj = {};
  if (c.recipe !== "auto") o.recipe = c.recipe;
  if (c.variant !== "default") o.variant = c.variant;
  return o;
}
export const RECIPE_IDS = RECIPES;
export const VARIANT_IDS = VARIANTS;
export function recipesFor(k: El["kind"]): string[] {
  switch (k) {
    case "Button": return ["auto", "button", "link", "none"];
    case "Image": case "Icon": return ["auto", "link", "card", "none"];
    case "Section": return ["auto", "card", "control", "none"];
    case "Accordion": return ["auto", "disclosure", "none"];
    case "Text": case "Heading": case "Nav": return ["auto", "link", "none"];
    default: return ["auto", "none"];
  }
}

const FRAMES = [{ id: "16:9", ratio: "16 / 9" }, { id: "9:16", ratio: "9 / 16" }, { id: "1:1", ratio: "1 / 1" }, { id: "4:5", ratio: "4 / 5" }];
const frameOf = (n: El) => {
  const ratio = ((n.styles.base as Record<string, Record<string, string>> | undefined)?.default?.["aspect-ratio"] ?? "").replace(/\s+/g, "");
  return FRAMES.find((f) => f.ratio.replace(/\s+/g, "") === ratio) ?? FRAMES[0]!;
};

export function encode(doc: Doc, roots?: readonly string[], raw: (n: El) => [string, Json][] = () => [], ids = true): JsonObj[] {
  const node = (id: string): JsonObj => {
    const n = doc.nodes[id]!;
    const o: JsonObj = {};
    const cls = split(n.className);
    if (ids) o.id = n.id;
    o.kind = isCode(n) ? "code" : isGame(n) ? "game" : nameOf(n.kind);
    if (isGame(n)) o.game = n.game;
    if (isCode(n)) { o.html = n.markup; o.js = n.script; o.libs = [...n.libs]; o.data = [...n.uses]; }
    if (n.kind === "Section") o.tag = n.tag;
    if (n.kind === "Heading") o.level = n.level;
    if (n.text !== "") o.text = n.text;
    if (n.href !== "") o.href = n.href;
    if (n.kind === "Path") { o.path = n.src; o.viewBox = n.alt; }
    else if (n.kind === "Nav") {
      o.menu = n.src;
      o.toggleAt = n.alt;
      const d = readDrawer(n.className);
      o.drawer = { style: d.style, width: d.width, backdrop: d.backdrop, fold: d.fold };
    } else {
      if (n.src !== "") o.src = n.src;
      if (n.alt !== "") o.alt = n.alt;
    }
    const bg = cls.includes("auvyx-bg-video");
    if (n.kind === "Video" && !bg && cls.includes("auvyx-video-autoplay")) o.autoplay = true;
    if (n.kind === "Video" && !n.className.split(" ").includes("auvyx-bg-video") && frameOf(n) !== FRAMES[0]) o.frame = frameOf(n).id;
    const own = cls.filter((c) => c !== "" && !c.startsWith("auvyx-drawer-") && c !== "auvyx-code" && c !== "auvyx-video-autoplay" && c !== "auvyx-video-crop" && !isInteractionMarker(c));
    if (own.length && n.kind !== "Raw") o.class = own.join(" ");
    if (n.anchor !== "" && n.kind !== "Raw") o.anchor = n.anchor;
    if (n.kind !== "Raw") { const ix = interactionJson(interaction(n.className)); if (ix) o.interaction = ix; }
    if (n.icon !== "") o.icon = n.icon;
    if (n.align !== "") o.align = n.align;
    if (n.kind === "Raw") { o.block = n.blockName; for (const [k, v] of raw(n)) o[k] = v; }
    if (Object.keys(n.bind).length) o.bind = { ...n.bind };
    if (n.kind === "Loop") o.query = { ...n.query };
    if (Object.keys(n.styles).length) o.styles = JSON.parse(JSON.stringify(n.styles));
    if (n.css !== "") o.css = n.css;
    if (n.children.length) o.children = n.children.filter((c) => doc.nodes[c]).map(node);
    return o;
  };
  return (roots ?? doc.roots).filter((r) => doc.nodes[r]).map(node);
}
