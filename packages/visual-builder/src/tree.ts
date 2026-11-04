/**
 * Block-tree helpers addressed by clientId (the builder's selection model),
 * built on @auvyx/block-ops path operations. Pure; unit-tested.
 */
import { getBlockAt, insertBlock, removeBlock, updateAttributes } from "@auvyx/block-ops";

/** Same shape as @wordpress/blocks block objects (the fields the builder uses). */
export interface BuilderBlock {
  clientId: string;
  name: string;
  attributes: Record<string, unknown>;
  innerBlocks: BuilderBlock[];
}

export type Placement = "before" | "after" | "inside";

/** Blocks that can hold children in the builder. */
const CONTAINERS = new Set(["auvyx/section", "core/group", "core/column", "core/columns", "core/cover"]);

export const isContainer = (name: string): boolean => CONTAINERS.has(name);

export const findPath = (blocks: readonly BuilderBlock[], clientId: string): number[] | undefined => {
  for (const [index, block] of blocks.entries()) {
    if (block.clientId === clientId) return [index];
    const inner = findPath(block.innerBlocks, clientId);
    if (inner) return [index, ...inner];
  }
  return undefined;
};

export const getBlock = (blocks: readonly BuilderBlock[], clientId: string): BuilderBlock | undefined => {
  const path = findPath(blocks, clientId);
  return path === undefined ? undefined : getBlockAt(blocks, path);
};

export const getParentId = (blocks: readonly BuilderBlock[], clientId: string): string | undefined => {
  const path = findPath(blocks, clientId);
  return path === undefined || path.length < 2 ? undefined : getBlockAt(blocks, path.slice(0, -1))?.clientId;
};

export type FlatBlock = { block: BuilderBlock; depth: number };

/** Pre-order (document order), the same order block comments appear in serialized HTML. */
export const flatten = (blocks: readonly BuilderBlock[], depth = 0): FlatBlock[] =>
  blocks.flatMap((block) => [{ block, depth }, ...flatten(block.innerBlocks, depth + 1)]);

const contains = (block: BuilderBlock, clientId: string): boolean =>
  block.clientId === clientId || block.innerBlocks.some((child) => contains(child, clientId));

/** Insert relative to a target; no target → append at the root. */
export const insertRelative = (
  blocks: readonly BuilderBlock[],
  block: BuilderBlock,
  targetId: string | undefined,
  placement: Placement
): BuilderBlock[] => {
  const path = targetId === undefined ? undefined : findPath(blocks, targetId);
  if (path === undefined) {
    return insertBlock(blocks, [blocks.length], block);
  }
  if (placement === "inside") {
    const target = getBlockAt(blocks, path);
    return insertBlock(blocks, [...path, target?.innerBlocks.length ?? 0], block);
  }
  const last = path.at(-1) ?? 0;
  return insertBlock(blocks, [...path.slice(0, -1), placement === "after" ? last + 1 : last], block);
};

export const removeById = (blocks: readonly BuilderBlock[], clientId: string): BuilderBlock[] => {
  const path = findPath(blocks, clientId);
  return path === undefined ? [...blocks] : removeBlock(blocks, path);
};

/** Move; a no-op when dropping a block onto itself or into its own descendants. */
export const moveRelative = (
  blocks: readonly BuilderBlock[],
  clientId: string,
  targetId: string,
  placement: Placement
): BuilderBlock[] => {
  const block = getBlock(blocks, clientId);
  if (block === undefined || contains(block, targetId)) {
    return [...blocks];
  }
  return insertRelative(removeById(blocks, clientId), block, targetId, placement);
};

export const updateById = (
  blocks: readonly BuilderBlock[],
  clientId: string,
  patch: Record<string, unknown>
): BuilderBlock[] => {
  const path = findPath(blocks, clientId);
  return path === undefined ? [...blocks] : updateAttributes(blocks, path, patch);
};

/** Where a click-to-insert goes: inside a selected container, else after the selection, else at the end. */
export const insertionPoint = (
  blocks: readonly BuilderBlock[],
  selectedId: string | undefined
): { targetId: string | undefined; placement: Placement } => {
  const selected = selectedId === undefined ? undefined : getBlock(blocks, selectedId);
  if (selected === undefined) return { targetId: undefined, placement: "after" };
  return { targetId: selected.clientId, placement: isContainer(selected.name) ? "inside" : "after" };
};
