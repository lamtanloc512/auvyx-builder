/** Saving progress: a small JSON key-value store per game. The page decides where it lives (KeyValueStore). */
import { json, none, object, string } from "../args";
import { type Capability, method } from "../capability";
import { LIMITS, PlayError } from "../protocol";
import type { Remote } from "../session";

export interface KeyValueStore {
  readonly get: (key: string) => Promise<string | null>;
  readonly set: (key: string, value: string) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
  readonly keys: () => Promise<readonly string[]>;
}

const keyName = string({ max: 100, pattern: /^[\w.:-]+$/ });
const key = object({ key: keyName });
const bytes = (text: string) => new TextEncoder().encode(text).length;

export const storageCapability = ({
  store,
  maxKeys = LIMITS.storageKeys,
  maxBytes = LIMITS.storageBytes,
}: {
  readonly store: KeyValueStore;
  readonly maxKeys?: number;
  readonly maxBytes?: number;
}): Capability => ({
  name: "storage",
  version: 1,
  methods: {
    get: method(key, async ({ key }) => {
      const text = await store.get(key);
      return text === null ? null : JSON.parse(text);
    }),
    set: method(object({ key: keyName, value: json({ maxBytes }) }), async ({ key: k, value }) => {
      const text = JSON.stringify(value);
      const keys = await store.keys();
      if (!keys.includes(k) && keys.length >= maxKeys) throw new PlayError({ code: "quota", message: `At most ${maxKeys} keys` });
      let total = bytes(text);
      for (const other of keys) if (other !== k) total += bytes((await store.get(other)) ?? "");
      if (total > maxBytes) throw new PlayError({ code: "quota", message: `At most ${maxBytes} bytes in all` });
      await store.set(k, text);
      return null;
    }),
    remove: method(key, async ({ key }) => {
      await store.remove(key);
      return null;
    }),
    keys: method(none, () => store.keys()),
  },
});

export interface StorageApi {
  readonly get: (key: string) => Promise<unknown>;
  readonly set: (key: string, value: unknown) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
  readonly keys: () => Promise<readonly string[]>;
}

const strings = (v: unknown): readonly string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export const storageApi = (remote: Remote): StorageApi => ({
  get: (k) => remote.call("storage", "get", { key: k }),
  set: async (k, value) => {
    await remote.call("storage", "set", { key: k, value });
  },
  remove: async (k) => {
    await remote.call("storage", "remove", { key: k });
  },
  keys: async () => strings(await remote.call("storage", "keys")),
});
