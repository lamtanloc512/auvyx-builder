/**
 * Maps serialized block HTML in the canvas back to blocks. serialize() emits
 * an opening comment per block in pre-order; the first element after an
 * opening comment is that block's root element. Self-closing (dynamic) blocks
 * and freeform content have no element to annotate.
 */
import { flatten, type BuilderBlock } from "./tree";

const SKIP = new Set(["core/freeform"]);

export const annotate = (root: Element, blocks: readonly BuilderBlock[]): Map<string, HTMLElement> => {
  const order = flatten(blocks)
    .filter(({ block }) => !SKIP.has(block.name))
    .map(({ block }) => block.clientId);
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 128 /* NodeFilter.SHOW_COMMENT */);
  const elements = new Map<string, HTMLElement>();
  let index = 0;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const data = (node as Comment).data.trim();
    if (!data.startsWith("wp:")) continue;
    const clientId = order[index++];
    if (clientId === undefined || data.endsWith("/")) continue;
    let sibling = node.nextSibling;
    while (sibling !== null && sibling.nodeType === 3 /* text */) sibling = sibling.nextSibling;
    if (sibling !== null && sibling.nodeType === 1 /* element */) {
      const element = sibling as HTMLElement;
      element.dataset.auvyxId = clientId;
      elements.set(clientId, element);
    }
  }
  return elements;
};
