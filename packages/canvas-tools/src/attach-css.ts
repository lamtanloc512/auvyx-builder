/**
 * Injects block CSS into the document that actually renders the block (the
 * editor canvas iframe, or the main document when the editor is not iframed).
 * Reference-counted per class: N identical blocks share one <style>.
 */
type Entry = { element: HTMLStyleElement; count: number };

const registries = new WeakMap<Document, Map<string, Entry>>();

export const attachCss = (doc: Document, key: string, css: string): (() => void) => {
  let registry = registries.get(doc);
  if (registry === undefined) {
    registry = new Map();
    registries.set(doc, registry);
  }
  let entry = registry.get(key);
  if (entry === undefined) {
    const element = doc.createElement("style");
    element.dataset.auvyx = key;
    doc.head.appendChild(element);
    entry = { element, count: 0 };
    registry.set(key, entry);
  }
  if (entry.element.textContent !== css) {
    entry.element.textContent = css;
  }
  entry.count++;
  const current = entry;
  const owner = registry;
  return () => {
    current.count--;
    if (current.count === 0) {
      current.element.remove();
      owner.delete(key);
    }
  };
};
