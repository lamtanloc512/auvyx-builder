/**
 * The canvas renders a transformed copy of the tree: every component instance
 * (`core/block` with a ref) becomes a client-only `auvyx/component-instance`
 * block holding the component's parsed content, so instances are visible and
 * styled like on the frontend. Inner ids are synthetic ("<instance>~<path>")
 * and never selectable on their own.
 */
import type { BuilderBlock } from "./tree";

export const INSTANCE_BLOCK = "auvyx/component-instance";
const MAX_DEPTH = 5;

export type ParseContent = (content: string) => BuilderBlock[];

const withIds = (blocks: readonly BuilderBlock[], prefix: string): BuilderBlock[] =>
  blocks.map((block, index) => ({
    ...block,
    clientId: `${prefix}~${index}`,
    innerBlocks: withIds(block.innerBlocks, `${prefix}~${index}`),
  }));

export const isSyntheticId = (clientId: string): boolean => clientId.includes("~");

export const toCanvasTree = (
  blocks: readonly BuilderBlock[],
  contentOf: (ref: number) => string | undefined,
  parse: ParseContent,
  depth = 0,
  chain: readonly number[] = []
): BuilderBlock[] =>
  blocks.map((block) => {
    const ref = block.name === "core/block" ? Number(block.attributes.ref) : NaN;
    if (Number.isNaN(ref)) {
      return { ...block, innerBlocks: toCanvasTree(block.innerBlocks, contentOf, parse, depth, chain) };
    }
    const content = contentOf(ref);
    const inner =
      content === undefined || depth >= MAX_DEPTH || chain.includes(ref)
        ? []
        : toCanvasTree(withIds(parse(content), block.clientId), contentOf, parse, depth + 1, [...chain, ref]);
    return { clientId: block.clientId, name: INSTANCE_BLOCK, attributes: { ref }, innerBlocks: inner };
  });
