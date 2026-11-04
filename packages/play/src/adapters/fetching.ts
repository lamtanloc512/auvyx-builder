/**
 * Sources that fetch on the page's side: the game's assets (only the URLs in its manifest) and the libraries of
 * shared/code-libraries.json that a game may use. Requests go without cookies: these are public files.
 */
import codeLibraries from "@auvyx/shared/code-libraries.json";
import type { AssetInfo, AssetSource } from "../capabilities/assets";
import type { LibrarySource } from "../capabilities/libraries";
import { LIMITS, PlayError } from "../protocol";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface AssetEntry extends AssetInfo {
  readonly url: string;
}

const get = async (fetcher: Fetch, url: string, what: string): Promise<Response> => {
  const res = await fetcher(url, { credentials: "omit", redirect: "error" });
  if (!res.ok) throw new PlayError({ code: "not-found", message: `${what} answered ${res.status}` });
  return res;
};

export const manifestAssets = ({
  assets,
  fetcher,
  maxBytes = LIMITS.assetBytes,
}: {
  readonly assets: readonly AssetEntry[];
  readonly fetcher: Fetch;
  readonly maxBytes?: number;
}): AssetSource => {
  const list = assets.slice(0, LIMITS.assets).map(({ name, type }) => ({ name, type }));
  return {
    list: () => list,
    load: async (name) => {
      const entry = assets.find((a) => a.name === name);
      if (!entry) throw new PlayError({ code: "not-found", message: `No asset ${name}` });
      const bytes = await (await get(fetcher, entry.url, `Asset ${name}`)).arrayBuffer();
      if (bytes.byteLength > maxBytes) throw new PlayError({ code: "too-big", message: `Asset ${name} is over ${maxBytes} bytes` });
      return { type: entry.type, bytes };
    },
  };
};

export interface LibraryEntry {
  readonly name: string;
  readonly export: string;
  readonly sandbox: boolean;
  readonly file?: string;
  readonly url?: string;
}

/** The libraries a game may use: those marked `sandbox` in shared/code-libraries.json, files resolved against `base`. */
export const SANDBOX_LIBRARIES: readonly LibraryEntry[] = codeLibraries.libraries.filter((l) => l.sandbox);

export const tableLibraries = ({
  base,
  fetcher,
  table = SANDBOX_LIBRARIES,
}: {
  readonly base: string;
  readonly fetcher: Fetch;
  readonly table?: readonly LibraryEntry[];
}): LibrarySource => {
  const cache = new Map<string, Promise<string>>();
  return {
    names: () => table.map((l) => l.name),
    load: async (name) => {
      const entry = table.find((l) => l.name === name);
      const address = entry?.file !== undefined ? new URL(entry.file, base).href : entry?.url;
      if (!entry || address === undefined) throw new PlayError({ code: "not-found", message: `No library ${name}` });
      const text = cache.get(name) ?? get(fetcher, address, `Library ${name}`).then((r) => r.text());
      cache.set(name, text);
      return { source: await text, exports: entry.export };
    },
  };
};
