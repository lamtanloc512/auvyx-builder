/**
 * WordPress blocks on the page (U/RawBlocks.scala): turning them into Auvyx elements through the site (auvyx/v1/convert,
 * one undo step however slow the server), and editing a block's attributes in its comment (the canvas is drawn by
 * the site, so a changed comment is the change).
 */
import { decodeTree, flatten, insert, indexIn, parentOf, remove, type Doc } from "@auvyx/editor-core";
import { config } from "./config";
import { rest } from "./host";
import { nextId } from "./ids";
import { convertible } from "./session.svelte";
import { store } from "./store.svelte";
import { toast } from "./toast.svelte";

/** RawBlocks.convertibleIds: Raw elements of the page that can become Auvyx elements. */
export const convertibleIds = () => flatten(store.doc).map((x) => x.el).filter((n) => n.kind === "Raw" && convertible.has(n.blockName)).map((n) => n.id);

/** RawBlocks.convert: replaces WordPress blocks by Auvyx elements (one commit); each keeps its place. */
export async function convert(ids: string[]) {
  const asked = ids.filter((id) => store.doc.nodes[id]);
  const results = new Map<string, Doc>();
  const failed: string[] = [];
  await Promise.all(asked.map(async (id) => {
    try {
      const { data } = await rest<{ blocks: import("@auvyx/editor-core").TreeNode[] }>("auvyx/v1/convert", { method: "POST", body: JSON.stringify({ markup: store.doc.nodes[id]!.raw, post: config.postId }) });
      results.set(id, decodeTree(data.blocks, nextId));
    } catch (e) { failed.push((e as Error).message); }
  }));
  let d = store.doc;
  let firstNew: string | null = null;
  for (const [id, doc] of results) {
    if (!d.nodes[id]) continue;
    const parent = parentOf(d, id), at = indexIn(d, id);
    const rest2 = Object.fromEntries(Object.entries(doc.nodes).filter(([k]) => !doc.roots.includes(k)));
    d = remove(d, id);
    doc.roots.forEach((r, i) => { d = insert(d, doc.nodes[r]!, parent, at + i, rest2); });
    if (store.selected === id) firstNew = doc.roots[0] ?? null;
  }
  if (results.size) store.commit(d);
  if (firstNew) store.selected = firstNew;
  toast(failed.length === 0 ? `Converted ${results.size} block${results.size === 1 ? "" : "s"} to Auvyx elements` : `Converted ${results.size}, ${failed.length} failed: ${failed[0]}`);
}
