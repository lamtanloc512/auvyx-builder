/**
 * Edits of a menu tree, addressed by path (indexes from the top), as the Scala `MenuTree`. Nodes are the menu
 * builder's REST shape (auvyx/v1/menus). Pure.
 */
export interface MenuNode { label: string; url: string; kind: string; type: string; id: number; mega: boolean; description: string; children: MenuNode[]; panel: number }
export interface EditableMenu { id: number; title: string; items: MenuNode[] }
export interface LinkTarget { label: string; url: string; kind: string; type: string; id: number; group: string }
export type Path = number[];
export const MAX_DEPTH = 3;

export const node = (label: string, url: string, rest: Partial<MenuNode> = {}): MenuNode =>
  ({ label, url, kind: "custom", type: "", id: 0, mega: false, description: "", children: [], panel: 0, ...rest });
export const fromTarget = (t: LinkTarget): MenuNode => node(t.label, t.url, { kind: t.kind, type: t.type, id: t.id });

export function get(items: MenuNode[], path: Path): MenuNode | undefined {
  if (!path.length) return undefined;
  const n = items[path[0]!];
  return path.length === 1 ? n : n && get(n.children, path.slice(1));
}

export function update(items: MenuNode[], path: Path, f: (n: MenuNode) => MenuNode): MenuNode[] {
  if (!path.length) return items;
  const [i, ...rest] = path;
  if (i! < 0 || i! >= items.length) return items;
  const copy = [...items];
  copy[i!] = rest.length ? { ...items[i!]!, children: update(items[i!]!.children, rest, f) } : f(items[i!]!);
  return copy;
}

const within = (items: MenuNode[], parent: Path, f: (l: MenuNode[]) => MenuNode[]) =>
  parent.length ? update(items, parent, (n) => ({ ...n, children: f(n.children) })) : f(items);

export const remove = (items: MenuNode[], path: Path) =>
  path.length ? within(items, path.slice(0, -1), (l) => l.filter((_, j) => j !== path.at(-1))) : items;

/** Deeper levels than allowed are dropped. */
export const cut = (n: MenuNode, level: number): MenuNode =>
  ({ ...n, mega: n.mega && level === 1, panel: level === 1 ? n.panel : 0, children: level >= MAX_DEPTH ? [] : n.children.map((c) => cut(c, level + 1)) });

export function insert(items: MenuNode[], parent: Path, index: number, n: MenuNode): MenuNode[] {
  if (parent.length >= MAX_DEPTH) return items;
  return within(items, parent, (l) => { const c = [...l]; c.splice(Math.max(0, Math.min(index, l.length)), 0, cut(n, parent.length + 1)); return c; });
}

/** Swaps with the previous (-1) or next (+1) sibling; the new path. */
export function shift(items: MenuNode[], path: Path, by: number): [MenuNode[], Path] {
  const siblings = path.length === 1 ? items : get(items, path.slice(0, -1))?.children ?? [];
  const from = path.at(-1)!, to = from + by;
  if (!path.length || to < 0 || to >= siblings.length) return [items, path];
  return [within(items, path.slice(0, -1), (l) => { const c = [...l]; [c[from], c[to]] = [c[to]!, c[from]!]; return c; }), [...path.slice(0, -1), to]];
}

export const depth = (n: MenuNode): number => 1 + Math.max(0, ...n.children.map(depth));

/** Becomes the last child of its previous sibling (when the depth allows it). */
export function indent(items: MenuNode[], path: Path): [MenuNode[], Path] {
  const n = get(items, path), i = path.at(-1);
  if (!n || !i || path.length + depth(n) > MAX_DEPTH) return [items, path];
  const prev = [...path.slice(0, -1), i - 1];
  const count = get(items, prev)?.children.length ?? 0;
  return [insert(remove(items, path), prev, count, n), [...prev, count]];
}

/** Moves out of its parent, right after it. */
export function outdent(items: MenuNode[], path: Path): [MenuNode[], Path] {
  const n = get(items, path);
  if (!n || path.length <= 1) return [items, path];
  const parent = path.slice(0, -1), at = parent.at(-1)! + 1;
  return [insert(remove(items, path), parent.slice(0, -1), at, n), [...parent.slice(0, -1), at]];
}

export const flatten = (items: MenuNode[], prefix: Path = []): [Path, MenuNode][] =>
  items.flatMap((n, i) => [[[...prefix, i], n] as [Path, MenuNode], ...flatten(n.children, [...prefix, i])]);

/** Links pointing at a known target take its kind and id (so WordPress follows renames). */
export const resolve = (n: MenuNode, targets: LinkTarget[]): MenuNode => {
  const t = targets.find((x) => x.url === n.url);
  const linked = t && (n.kind === "custom" || n.id === 0) ? { ...n, kind: t.kind, type: t.type, id: t.id } : n;
  return { ...linked, children: n.children.map((c) => resolve(c, targets)) };
};
