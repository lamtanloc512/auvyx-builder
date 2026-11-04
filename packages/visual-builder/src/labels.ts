import { getBlockType } from "@wordpress/blocks";
import type { ComponentData } from "./config";
import type { BuilderBlock } from "./tree";

export const blockLabel = (block: BuilderBlock, components: readonly ComponentData[]): string => {
  if (block.name === "core/block") {
    return components.find((c) => c.id === Number(block.attributes.ref))?.title ?? "Component";
  }
  if (block.name === "auvyx/section") {
    const tag = String(block.attributes.tagName ?? "section");
    return tag === "section" ? "Section" : `Section <${tag}>`;
  }
  return (getBlockType(block.name)?.title ?? block.name).replace(/^Auvyx /, "");
};

const decoder = typeof document === "undefined" ? undefined : document.createElement("textarea");

/** Decodes entities without executing anything (textarea content is never parsed as markup). */
const decode = (text: string): string => {
  if (!decoder) return text;
  decoder.innerHTML = text;
  return decoder.value;
};

/** Short text preview for the layers panel. */
export const blockPreview = (block: BuilderBlock): string => {
  if (block.name === "core/block") return "";
  const raw = block.attributes.content ?? block.attributes.text;
  // Strings or RichTextData (has toHTMLString); anything else is not previewable text.
  if (raw === undefined || (typeof raw === "object" && raw !== null && !("toHTMLString" in raw))) return "";
  return decode(String(raw).replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
};
