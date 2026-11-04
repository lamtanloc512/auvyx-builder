/**
 * The game's files (models, sprites, sounds), named in its manifest. The page fetches them and hands over the bytes;
 * the game cannot fetch anything itself (connect-src), and can only ask for names the manifest lists.
 */
import { none, object, string } from "../args";
import { type Capability, method } from "../capability";
import { PlayError } from "../protocol";
import type { Remote } from "../session";

export interface AssetInfo {
  readonly name: string;
  readonly type: string;
}

export interface AssetData {
  readonly type: string;
  readonly bytes: ArrayBuffer;
}

export interface AssetSource {
  readonly list: () => readonly AssetInfo[];
  readonly load: (name: string) => Promise<AssetData>;
}

export const assetsCapability = ({ source }: { readonly source: AssetSource }): Capability => ({
  name: "assets",
  version: 1,
  methods: {
    list: method(none, () => source.list()),
    load: method(object({ name: string({ max: 200 }) }), ({ name }) => {
      if (!source.list().some((a) => a.name === name)) throw new PlayError({ code: "not-found", message: `No asset ${name}` });
      return source.load(name);
    }),
  },
});

export interface AssetsApi {
  readonly list: () => Promise<readonly AssetInfo[]>;
  readonly bytes: (name: string) => Promise<AssetData>;
  /** A URL the game can hand to loaders (Three's GLTFLoader, Image, Audio), made once per asset. */
  readonly url: (name: string) => Promise<string>;
}

const isData = (v: unknown): v is AssetData =>
  typeof v === "object" && v !== null && "type" in v && typeof v.type === "string" && "bytes" in v && v.bytes instanceof ArrayBuffer;

const isInfo = (v: unknown): v is AssetInfo =>
  typeof v === "object" && v !== null && "name" in v && typeof v.name === "string" && "type" in v && typeof v.type === "string";

export const assetsApi = (remote: Remote, urls: { readonly make: (data: AssetData) => string }): AssetsApi => {
  const made = new Map<string, Promise<string>>();
  const bytes = async (name: string) => {
    const v = await remote.call("assets", "load", { name });
    if (!isData(v)) throw new PlayError({ code: "bad-answer", message: `Asset ${name} came back malformed` });
    return v;
  };
  return {
    list: async () => {
      const v = await remote.call("assets", "list");
      return Array.isArray(v) ? v.filter(isInfo) : [];
    },
    bytes,
    url: (name) => {
      const known = made.get(name);
      if (known) return known;
      const promise = bytes(name).then(urls.make);
      made.set(name, promise);
      return promise;
    },
  };
};
