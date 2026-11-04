/**
 * The document Auvyx edits: a flat map of elements plus the ordered roots (as the Studio's Scala `Doc`, ADR 0003). Every
 * element kind maps 1:1 to an Auvyx block. Immutable: operations (ops.ts) answer a new document.
 */
import type { Styles } from "@auvyx/style-engine";
import type { Preset, RuntimeBlock } from "./runtime";

export type Kind =
  | "Section" | "Heading" | "Text" | "Snippet" | "Button" | "Image" | "Icon" | "Divider" | "Video" | "Path"
  | "Accordion" | "Loop" | "Carousel" | "Nav" | "Raw";

/** Each kind's block, editor label and whether it holds children. */
export const KINDS: Record<Kind, { block: string; label: string; container: boolean }> = {
  Section: { block: "auvyx/section", label: "Section", container: true },
  Heading: { block: "auvyx/heading", label: "Heading", container: false },
  Text: { block: "auvyx/text", label: "Text", container: false },
  Snippet: { block: "auvyx/snippet", label: "Code", container: false },
  Button: { block: "auvyx/button", label: "Button", container: false },
  Image: { block: "auvyx/image", label: "Image", container: false },
  Icon: { block: "auvyx/icon", label: "Icon", container: false },
  Divider: { block: "auvyx/divider", label: "Divider", container: false },
  Video: { block: "auvyx/video", label: "Video", container: false },
  Path: { block: "auvyx/vector", label: "Vector", container: false },
  Accordion: { block: "auvyx/accordion", label: "Accordion", container: true },
  Loop: { block: "auvyx/loop", label: "Posts loop", container: true },
  Carousel: { block: "auvyx/carousel", label: "Carousel", container: false },
  Nav: { block: "auvyx/nav", label: "Navigation", container: false },
  Raw: { block: "", label: "Block", container: false },
};

/** HTML elements a Section may use (auvyx/section's `tagName` enum). */
export const SECTION_TAGS = ["section", "div", "header", "footer", "main", "article", "aside", "nav"] as const;

export const kindOfBlock = (name: string): Kind | undefined =>
  (Object.keys(KINDS) as Kind[]).find((k) => k !== "Raw" && KINDS[k].block === name);

/** One element. Every field the Scala `El` has, with the same defaults, so documents travel between the two cores. */
export interface El {
  id: string;
  kind: Kind;
  text: string;
  tag: string;
  level: number;
  href: string;
  styles: Styles;
  children: string[];
  src: string;
  alt: string;
  icon: string;
  mediaId: number;
  align: string;
  className: string;
  anchor: string;
  blockName: string;
  raw: string;
  html: string;
  bind: Record<string, string>;
  query: Record<string, string>;
  locked: boolean;
  label: string;
  target: string;
  css: string;
  markup: string;
  script: string;
  libs: string[];
  uses: string[];
  game: string;
  runtime: string;
  fields: Record<string, string>;
}

export const el = (id: string, kind: Kind, fields: Partial<El> = {}): El => ({
  id, kind, text: "", tag: "section", level: 2, href: "", styles: {}, children: [], src: "", alt: "", icon: "",
  mediaId: 0, align: "", className: "", anchor: "", blockName: "", raw: "", html: "", bind: {}, query: {},
  locked: false, label: "", target: "", css: "", markup: "", script: "", libs: [], uses: [], game: "", runtime: "",
  fields: {}, ...fields,
});

/**
 * `defs` and `presets` are the blocks and presets declared for this document (RuntimeBlocks). Optional, so a document
 * built as `{ roots, nodes }` means "none declared"; operations keep them (they spread the document).
 */
export interface Doc {
  readonly roots: readonly string[];
  readonly nodes: Readonly<Record<string, El>>;
  readonly defs?: readonly RuntimeBlock[];
  readonly presets?: readonly Preset[];
}

export const emptyDoc: Doc = { roots: [], nodes: {}, defs: [], presets: [] };

export const childrenOf = (doc: Doc, parent: string | null): readonly string[] =>
  parent === null ? doc.roots : doc.nodes[parent]?.children ?? [];

export const parentOf = (doc: Doc, id: string): string | null => {
  for (const n of Object.values(doc.nodes)) if (n.children.includes(id)) return n.id;
  return null;
};

export const indexIn = (doc: Doc, id: string): number => childrenOf(doc, parentOf(doc, id)).indexOf(id);

/** Ancestors, nearest first. */
export const ancestors = (doc: Doc, id: string): string[] => {
  const out: string[] = [];
  for (let p = parentOf(doc, id); p !== null; p = parentOf(doc, p)) out.push(p);
  return out;
};

/** Pre-order (document order) with depth. */
export const flatten = (doc: Doc): { el: El; depth: number }[] => {
  const out: { el: El; depth: number }[] = [];
  const walk = (ids: readonly string[], depth: number) => {
    for (const id of ids) {
      const n = doc.nodes[id];
      if (!n) continue;
      out.push({ el: n, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(doc.roots, 0);
  return out;
};

export const subtreeIds = (doc: Doc, id: string): string[] => {
  const n = doc.nodes[id];
  return n ? [id, ...n.children.flatMap((c) => subtreeIds(doc, c))] : [];
};
