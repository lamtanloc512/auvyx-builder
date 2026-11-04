/**
 * Pure, immutable operations. No WordPress imports: the same functions run in
 * the editor (style panel, Visual Mode), in the AI agent and in tests.
 */
import type { StateId, Styles } from "@auvyx/style-engine";

export const AUVYX_SCHEMA_VERSION = 1;

/** Shape of the `auvyx` block attribute. */
/** `css`: the element's own CSS, scoped to it (compileScopedCss); Studio writes it, the block editor previews it. */
export type AuvyxAttribute = { v: typeof AUVYX_SCHEMA_VERSION; styles: Styles; css?: string };

export type StyleTarget = { breakpoint: string; state: StateId };

export const getStyle = (
  auvyx: AuvyxAttribute | undefined,
  { breakpoint, state }: StyleTarget,
  property: string
): string | undefined => auvyx?.styles[breakpoint]?.[state]?.[property];

/**
 * Sets (or with `value` undefined/blank, removes) one declaration.
 * Empty states/breakpoints are pruned; returns undefined when nothing is left
 * so the attribute disappears from the block comment.
 */
export const setStyle = (
  auvyx: AuvyxAttribute | undefined,
  { breakpoint, state }: StyleTarget,
  property: string,
  value: string | undefined
): AuvyxAttribute | undefined => {
  const styles: Styles = { ...auvyx?.styles };
  const breakpointStyles = { ...styles[breakpoint] };
  const declarations = { ...breakpointStyles[state] };
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") {
    delete declarations[property];
  } else {
    declarations[property] = trimmed;
  }
  if (Object.keys(declarations).length > 0) {
    breakpointStyles[state] = declarations;
  } else {
    delete breakpointStyles[state];
  }
  if (Object.keys(breakpointStyles).length > 0) {
    styles[breakpoint] = breakpointStyles;
  } else {
    delete styles[breakpoint];
  }
  return Object.keys(styles).length > 0 ? { v: AUVYX_SCHEMA_VERSION, styles } : undefined;
};

/** Applies several declarations at once (one undo step in the editor). */
export const setStyles = (
  auvyx: AuvyxAttribute | undefined,
  target: StyleTarget,
  values: Record<string, string | undefined>
): AuvyxAttribute | undefined =>
  Object.entries(values).reduce<AuvyxAttribute | undefined>(
    (current, [property, value]) => setStyle(current, target, property, value),
    auvyx
  );

export const countStyles = (
  auvyx: AuvyxAttribute | undefined,
  target: StyleTarget,
  properties: readonly string[]
): number => properties.filter((property) => getStyle(auvyx, target, property) !== undefined).length;

// ---------------------------------------------------------------------------
// Block tree operations (parse_blocks / @wordpress/blocks shape).
// Paths are index lists: [2, 0] = first inner block of the third root block.
// ---------------------------------------------------------------------------

export type BlockNode = {
  name: string;
  attributes: Record<string, unknown>;
  innerBlocks: BlockNode[];
};

/** Any tree node shape (e.g. @wordpress/blocks blocks with clientId); extra fields are preserved. */
export type TreeNode<T> = {
  name: string;
  attributes: Record<string, unknown>;
  innerBlocks: T[];
};

export type BlockPath = readonly number[];

export const getBlockAt = <T extends TreeNode<T>>(tree: readonly T[], path: BlockPath): T | undefined => {
  let level: readonly T[] = tree;
  let node: T | undefined;
  for (const index of path) {
    node = level[index];
    if (node === undefined) {
      return undefined;
    }
    level = node.innerBlocks;
  }
  return node;
};

const updateChildren = <T extends TreeNode<T>>(
  tree: readonly T[],
  parentPath: BlockPath,
  update: (children: T[]) => T[]
): T[] => {
  const [head, ...rest] = parentPath;
  if (head === undefined) {
    return update([...tree]);
  }
  const node = tree[head];
  if (node === undefined) {
    throw new RangeError(`No block at index ${head}`);
  }
  const next = [...tree];
  next[head] = { ...node, innerBlocks: updateChildren(node.innerBlocks, rest, update) };
  return next;
};

const splitPath = (path: BlockPath): [BlockPath, number] => {
  const index = path.at(-1);
  if (index === undefined) {
    throw new RangeError("Path must not be empty");
  }
  return [path.slice(0, -1), index];
};

export const insertBlock = <T extends TreeNode<T>>(tree: readonly T[], path: BlockPath, block: T): T[] => {
  const [parent, index] = splitPath(path);
  return updateChildren(tree, parent, (children) => {
    if (index < 0 || index > children.length) {
      throw new RangeError(`Cannot insert at index ${index}`);
    }
    children.splice(index, 0, block);
    return children;
  });
};

export const removeBlock = <T extends TreeNode<T>>(tree: readonly T[], path: BlockPath): T[] => {
  const [parent, index] = splitPath(path);
  return updateChildren(tree, parent, (children) => {
    if (children[index] === undefined) {
      throw new RangeError(`No block at index ${index}`);
    }
    children.splice(index, 1);
    return children;
  });
};

/** `to` is interpreted in the tree after removal of `from`. */
export const moveBlock = <T extends TreeNode<T>>(tree: readonly T[], from: BlockPath, to: BlockPath): T[] => {
  const block = getBlockAt(tree, from);
  if (block === undefined) {
    throw new RangeError(`No block at [${from.join(", ")}]`);
  }
  return insertBlock(removeBlock(tree, from), to, block);
};

export const updateAttributes = <T extends TreeNode<T>>(
  tree: readonly T[],
  path: BlockPath,
  patch: Record<string, unknown>
): T[] => {
  const [parent, index] = splitPath(path);
  return updateChildren(tree, parent, (children) => {
    const node = children[index];
    if (node === undefined) {
      throw new RangeError(`No block at index ${index}`);
    }
    children[index] = { ...node, attributes: { ...node.attributes, ...patch } };
    return children;
  });
};

export const setBlockStyle = <T extends TreeNode<T>>(
  tree: readonly T[],
  path: BlockPath,
  target: StyleTarget,
  property: string,
  value: string | undefined
): T[] => {
  const block = getBlockAt(tree, path);
  if (block === undefined) {
    throw new RangeError(`No block at [${path.join(", ")}]`);
  }
  const auvyx = setStyle(block.attributes.auvyx as AuvyxAttribute | undefined, target, property, value);
  return updateAttributes(tree, path, { auvyx });
};
