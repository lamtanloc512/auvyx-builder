/** Pure document operations (the Scala `Ops`): each answers a new document. */
import type { Styles } from "@auvyx/style-engine";
import { type Doc, type El, KINDS, childrenOf, parentOf, indexIn, ancestors, subtreeIds } from "./model";

export const getStyle = (styles: Styles, breakpoint: string, state: string, property: string): string | undefined =>
  (styles[breakpoint] as Record<string, Record<string, string>> | undefined)?.[state]?.[property];

/** Sets (a value) or removes (undefined / blank) one declaration; prunes empty states and breakpoints. */
export const setStyle = (styles: Styles, breakpoint: string, state: string, property: string, value: string | undefined): Styles => {
  const states = { ...((styles[breakpoint] ?? {}) as Record<string, Record<string, string>>) };
  const decls = { ...states[state] };
  const v = value?.trim();
  if (v) decls[property] = v;
  else delete decls[property];
  if (Object.keys(decls).length) states[state] = decls;
  else delete states[state];
  const next = { ...styles } as Record<string, unknown>;
  if (Object.keys(states).length) next[breakpoint] = states;
  else delete next[breakpoint];
  return next as Styles;
};

export const update = (doc: Doc, id: string, f: (n: El) => El): Doc =>
  doc.nodes[id] ? { ...doc, nodes: { ...doc.nodes, [id]: f(doc.nodes[id]) } } : doc;

const withChildren = (doc: Doc, parent: string | null, children: string[]): Doc =>
  parent === null ? { ...doc, roots: children } : update(doc, parent, (n) => ({ ...n, children }));

const clamp = (i: number, max: number) => Math.max(0, Math.min(i, max));

/** Inserts a node (and any descendants in `extra`) under `parent` at `index` (clamped). */
export const insert = (doc: Doc, node: El, parent: string | null, index: number, extra: Record<string, El> = {}): Doc => {
  const siblings = [...childrenOf(doc, parent)];
  siblings.splice(clamp(index, siblings.length), 0, node.id);
  return withChildren({ ...doc, nodes: { ...doc.nodes, ...extra, [node.id]: node } }, parent, siblings);
};

export const remove = (doc: Doc, id: string): Doc => {
  const parent = parentOf(doc, id);
  const detached = withChildren(doc, parent, childrenOf(doc, parent).filter((c) => c !== id));
  const nodes = { ...detached.nodes };
  for (const gone of subtreeIds(doc, id)) delete nodes[gone];
  return { ...detached, nodes };
};

/** Moves `id` under `parent` at `index` (in the list after removal). No-op into itself or its descendants. */
export const move = (doc: Doc, id: string, parent: string | null, index: number): Doc => {
  if (!doc.nodes[id] || (parent !== null && (parent === id || ancestors(doc, parent).includes(id)))) return doc;
  const from = parentOf(doc, id);
  const removed = withChildren(doc, from, childrenOf(doc, from).filter((c) => c !== id));
  const siblings = [...childrenOf(removed, parent)];
  siblings.splice(clamp(index, siblings.length), 0, id);
  return withChildren(removed, parent, siblings);
};

/** One step earlier (negative) or later among its siblings. No-op at either end. */
export const reorder = (doc: Doc, id: string, by: number): Doc => {
  const parent = parentOf(doc, id);
  const siblings = childrenOf(doc, parent);
  const i = siblings.indexOf(id);
  const j = i + by;
  return i < 0 || j < 0 || j >= siblings.length ? doc : move(doc, id, parent, j);
};

/** Deep copy with fresh ids, right after the original: the new document and the copy's id. */
export const duplicate = (doc: Doc, id: string, newId: () => string): [Doc, string | null] => {
  if (!doc.nodes[id]) return [doc, null];
  const mapping = new Map(subtreeIds(doc, id).map((old) => [old, newId()] as const));
  const copies: Record<string, El> = {};
  for (const [old, fresh] of mapping) {
    const n = doc.nodes[old]!;
    copies[fresh] = { ...n, id: fresh, children: n.children.map((c) => mapping.get(c)!) };
  }
  const root = copies[mapping.get(id)!]!;
  const { [root.id]: _, ...rest } = copies;
  return [insert(doc, root, parentOf(doc, id), indexIn(doc, id) + 1, rest), root.id];
};

/** Click-to-insert target: inside a selected container (at its end), else after the selection, else at the end. */
export const insertionPoint = (doc: Doc, selected: string | null): [string | null, number] => {
  const n = selected ? doc.nodes[selected] : undefined;
  if (n && KINDS[n.kind].container) return [n.id, n.children.length];
  if (n) return [parentOf(doc, n.id), indexIn(doc, n.id) + 1];
  return [null, doc.roots.length];
};

export type Where = "before" | "after" | "inside";

/**
 * Where a drop lands: `[parent, index]` for `move` (index in the list without `moving`) or `insert` (moving = null).
 * Null when the drop is impossible: inside a leaf, or into the moving element itself or its descendants.
 */
export const dropPlace = (doc: Doc, target: string, where: Where, moving: string | null = null): [string | null, number] | null => {
  const t = doc.nodes[target];
  if (!t || target === moving) return null;
  if (moving && ancestors(doc, target).includes(moving)) return null;
  if (where === "inside") {
    if (!KINDS[t.kind].container) return null;
    return [target, t.children.filter((c) => c !== moving).length];
  }
  const parent = parentOf(doc, target);
  const siblings = childrenOf(doc, parent).filter((c) => c !== moving);
  return [parent, siblings.indexOf(target) + (where === "after" ? 1 : 0)];
};
