// bun test preload: a spec-compliant DOM (jsdom) for tests that import
// @wordpress/* editor packages. happy-dom breaks hpq attribute sourcing.
import "global-jsdom/register";
import createDOM from "global-jsdom";

/**
 * A DOM of a file's own (its HTML and URL) for as long as the file runs. Every test file shares one process and this
 * preload's DOM; global-jsdom's own cleanup deletes document, window, localStorage and the rest for every file that
 * runs after it, so the cleanup returned here puts back the globals as they were instead.
 */
export function testDom(html?: string, options?: Record<string, unknown>): () => void {
  const before = new Map(Object.getOwnPropertyNames(globalThis).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)!]));
  createDOM(html, options);
  return () => {
    for (const k of Object.getOwnPropertyNames(globalThis)) {
      if (!before.has(k)) delete (globalThis as Record<string, unknown>)[k];
    }
    for (const [k, d] of before) {
      try {
        Object.defineProperty(globalThis, k, d);
      } catch {
        // a property the runtime will not let go of keeps its value
      }
    }
  };
}
