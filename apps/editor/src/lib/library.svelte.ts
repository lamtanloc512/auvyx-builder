/**
 * The site's patterns and components (auvyx/v1/library) and the theme's patterns (U/LibraryState.scala). A pattern
 * arrives as editable elements (the site converts it, auvyx/v1/convert); a component stays one shared block.
 */
import { decodeTree, el, insert, subtreeIds, serialize, type Doc, type El, type TreeNode } from "@auvyx/editor-core";
import { config } from "./config";
import { rest } from "./host";
import { nextId } from "./ids";
import { nameOf, preview } from "./labels";
import { store } from "./store.svelte";
import { toast } from "./toast.svelte";

export interface LibraryItem { id: number; title: string; synced: boolean; category: string; editUrl: string }

class Library {
  items = $state.raw<LibraryItem[]>([]);
  loaded = $state(false);
  #inflight: Promise<void> | null = null;

  ensure(force = false) {
    if (force) { this.#inflight = null; this.loaded = false; }
    if (this.loaded) return Promise.resolve();
    this.#inflight ??= rest<LibraryItem[]>("auvyx/v1/library").then(
      ({ data }) => { this.items = data; this.loaded = true; },
      (e: Error) => { this.#inflight = null; toast(`Patterns could not be loaded: ${e.message}`); },
    );
    return this.#inflight;
  }

  /** Inserts platform markup where the selection is: a component as itself, anything else converted to Auvyx elements. */
  async insertMarkup(blockName: string, markup: string, expand: boolean) {
    if (!expand) {
      store.insertTree(el(nextId(), "Raw", { blockName, raw: markup, html: "" }), {});
      return;
    }
    try {
      const { data } = await rest<{ blocks: TreeNode[] }>("auvyx/v1/convert", { method: "POST", body: JSON.stringify({ markup, post: config.postId }) });
      const doc = decodeTree(data.blocks, nextId);
      insertDoc(doc);
    } catch (e) { toast(`Could not insert it: ${(e as Error).message}`); }
  }

  insert(item: LibraryItem) { return this.insertMarkup("core/block", `<!-- wp:block {"ref":${item.id}} /-->`, !item.synced); }
  insertThemePattern(slug: string) { return this.insertMarkup("core/pattern", `<!-- wp:pattern {"slug":"${slug}"} /-->`, true); }

  /** Saves the selected element (and what it holds) as a pattern or a component. */
  async saveSelection(synced: boolean) {
    const id = store.selected, root = id ? store.doc.nodes[id] : null;
    if (!id || !root) return;
    const kind = synced ? "component" : "pattern";
    const title = prompt(`Name of the ${kind}`, preview(root).slice(0, 40) || nameOf(root))?.trim();
    if (!title) return;
    const ids = subtreeIds(store.doc, id);
    const sub: Doc = { roots: [id], nodes: Object.fromEntries(ids.map((i) => [i, store.doc.nodes[i]!])) };
    try {
      const { data: item } = await rest<LibraryItem>("auvyx/v1/library", { method: "POST", body: JSON.stringify({ title, markup: serialize(sub), synced, category: "" }) });
      this.items = [...this.items, item].sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
      toast(`Saved the ${kind} “${item.title}”. It is in Assets.`);
    } catch (e) { toast(`Not saved: ${(e as Error).message}`); }
  }
}

/** Puts a whole document where the selection is (one undo step): the first root takes the insert spot, the rest follow. */
export function insertDoc(doc: Doc, atEnd = false) {
  if (!doc.roots.length) return;
  if (atEnd) {
    const start = store.doc.roots.length;
    let d = store.doc;
    doc.roots.forEach((r, i) => { d = insert(d, doc.nodes[r]!, null, start + i, doc.nodes); });
    store.commit(d);
    store.selected = doc.roots[0]!;
    return;
  }
  const [first, ...rest] = doc.roots;
  const nodes: Record<string, El> = { ...doc.nodes };
  const root = nodes[first!]!;
  delete nodes[first!];
  store.insertTree(root, nodes);
  // the other roots after the first one
  for (const r of rest) {
    const n = doc.nodes[r]!;
    store.insertTree(n, nodes);
  }
}

export const library = new Library();
