/** One name and icon per element, used everywhere (U/Labels.scala). */
import { KINDS, Settings, getStyle, type El, type Kind } from "@auvyx/editor-core";
import type { IconName } from "../ui/icons";
import { session } from "./session.svelte";
import { source as gameSource } from "./agentGames";

export const kindName = (k: Kind) => (k === "Section" ? "Section" : k === "Text" ? "Text" : k === "Loop" ? "Loop" : k === "Carousel" ? "Classic slider" : KINDS[k].label);

/** Flatsome-like names: page-level tags by name, layout boxes by what they do (from their desktop styles). */
function sectionTag(n: El) {
  if (n.tag === "section") return "Section";
  if (n.tag === "article") return "Card";
  if (n.tag !== "div") return n.tag.charAt(0).toUpperCase() + n.tag.slice(1);
  const b = (p: string) => getStyle(n.styles, "base", "default", p);
  const d = b("display");
  if (d === "grid" || d === "inline-grid") return "Grid";
  if (d === "flex" || d === "inline-flex") return b("flex-direction")?.startsWith("column") ? "Stack" : "Row";
  if (d === "block" && (b("position") === "relative" || b("position") === "absolute"))
    return n.children.length ? "Frame" : b("border-radius") === "50%" ? "Ellipse" : "Rectangle";
  return "Frame";
}

function byKind(n: El) {
  switch (n.kind) {
    case "Section": return n.game !== "" ? (gameSource(n.game) ? `Game · ${gameSource(n.game)!.source.title}` : "Game") : n.className.split(" ").includes("auvyx-group") ? "Group" : sectionTag(n);
    case "Heading": return `Heading H${n.level}`;
    case "Raw": {
      const last = n.blockName.replace(/^core\//, "").split("/").at(-1) ?? "";
      return last.charAt(0).toUpperCase() + last.slice(1);
    }
    default: return kindName(n.kind);
  }
}

export const nameOf = (n: El) => n.label || byKind(n);

const decoder = typeof document !== "undefined" ? document.createElement("textarea") : null;
/** Tags dropped, every entity decoded: what a reader sees. */
export const decode = (html: string) => {
  if (!decoder) return html.replace(/<[^>]*>/g, " ");
  decoder.innerHTML = html.replace(/<[^>]*>/g, " ");
  return decoder.value;
};

const SLIDE_FIELDS = ["eyebrow", "title", "body", "button", "href", "image", "color", "alt", "hover", "depth", "depthHover", "parallax", "animate", "posX", "posY", "target", "imageHref"];
/** Carousel.slidesOf(n).headOption's title: null when there are no slides or they do not read (Carousel.parse answers none). */
function firstSlideTitle(n: El): string | null {
  const raw = Settings.carouselValue(n.query, "slides");
  if (!raw) return null;
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list) || !list.length) return null;
    const ok = list.every((x) => !!x && typeof x === "object" && !Array.isArray(x) && SLIDE_FIELDS.every((k) => !(k in x) || typeof (x as Record<string, unknown>)[k] === "string"));
    return ok ? String((list[0] as Record<string, unknown>).title ?? "").slice(0, 160) : null;
  } catch { return null; }
}

/** What a row reads, before cutting: a bound text shows its field, `{Post: Title}` (DataPreview). */
const rawText = (n: El) =>
  n.kind === "Raw" ? n.html : n.kind === "Image" ? n.alt : n.kind === "Icon" ? n.icon : n.kind === "Video" ? n.src
    : n.kind === "Path" ? "" : n.kind === "Loop" ? Settings.queryValue(n.query, "postType")
    : n.kind === "Carousel" ? firstSlideTitle(n) ?? "Slider"
    : "content" in n.bind || "text" in n.bind ? `{${Settings.dataLabel(n.bind.content ?? n.bind.text ?? "", session.extraFields)}}`
    : n.text;

const flat = (n: El) => decode(rawText(n)).replace(/\s+/g, " ").trim();

/** What the Navigator shows after the name (Labels.preview): the text, cut at 28 characters. */
export const preview = (n: El) => flat(n).slice(0, 28);

/** A few words and "…" for a narrow row (the Navigator), where the whole text does not fit. */
export const previewBrief = (n: El, words = 4) => {
  const all = flat(n).split(" ").filter((w) => w !== "");
  const head = all.slice(0, words).join(" ");
  return all.length > words ? `${head}…` : head;
};

export const iconOf = (k: Kind): IconName => ({
  Section: "box", Heading: "heading", Text: "text", Button: "button", Image: "image", Icon: "star", Divider: "minus",
  Video: "play", Path: "penTool", Accordion: "chevronDown", Loop: "rows", Carousel: "image", Nav: "menu", Raw: "component", Snippet: "code",
} as Record<Kind, IconName>)[k];
