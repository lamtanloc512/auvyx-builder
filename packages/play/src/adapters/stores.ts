/** KeyValueStores: in memory (tests, the Studio), and a Web Storage area under a prefix per game (a published page). */
import type { KeyValueStore } from "../capabilities/storage";

export const memoryStore = (initial: Readonly<Record<string, string>> = {}): KeyValueStore => {
  const data = new Map(Object.entries(initial));
  return {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    },
    keys: async () => [...data.keys()],
  };
};

/** `storage` is the page's localStorage (the sandbox has none of its own); every key is kept as `<prefix><key>`. */
export const webStorageStore = ({ storage, prefix }: { readonly storage: Storage; readonly prefix: string }): KeyValueStore => ({
  get: async (key) => storage.getItem(prefix + key),
  set: async (key, value) => storage.setItem(prefix + key, value),
  remove: async (key) => storage.removeItem(prefix + key),
  keys: async () => {
    const out: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(prefix)) out.push(k.slice(prefix.length));
    }
    return out;
  },
});
