/**
 * Libraries a game names (shared/code-libraries.json): the page hands over their source text, the game imports it from a
 * blob: URL. The sandbox has an opaque origin, so importing the site's files directly would need CORS; this needs none.
 */
import { none, object, string } from "../args";
import { type Capability, method } from "../capability";
import { PlayError } from "../protocol";
import type { Remote } from "../session";

export interface LibraryCode {
  readonly source: string;
  /** What of the module the game gets: "*" (the module), "default", or a named export. */
  readonly exports: string;
}

export interface LibrarySource {
  readonly names: () => readonly string[];
  readonly load: (name: string) => Promise<LibraryCode>;
}

export const librariesCapability = ({ source }: { readonly source: LibrarySource }): Capability => ({
  name: "libraries",
  version: 1,
  methods: {
    list: method(none, () => source.names()),
    load: method(object({ name: string({ max: 60 }) }), ({ name }) => {
      if (!source.names().includes(name)) throw new PlayError({ code: "not-found", message: `No library ${name}` });
      return source.load(name);
    }),
  },
});

/** How the game turns source text into a module (the runtime passes URL.createObjectURL and import()). */
export interface ModuleLoader {
  readonly load: (source: string) => Promise<Record<string, unknown>>;
}

export interface LibrariesApi {
  readonly list: () => Promise<readonly string[]>;
  /** The library as the game uses it (what its `exports` says), loaded once. */
  readonly get: (name: string) => Promise<unknown>;
}

const isCode = (v: unknown): v is LibraryCode =>
  typeof v === "object" && v !== null && "source" in v && typeof v.source === "string" && "exports" in v && typeof v.exports === "string";

export const librariesApi = (remote: Remote, loader: ModuleLoader): LibrariesApi => {
  const loaded = new Map<string, Promise<unknown>>();
  return {
    list: async () => {
      const v = await remote.call("libraries", "list");
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    },
    get: (name) => {
      const known = loaded.get(name);
      if (known) return known;
      const promise = remote.call("libraries", "load", { name }).then(async (code) => {
        if (!isCode(code)) throw new PlayError({ code: "bad-answer", message: `Library ${name} came back malformed` });
        const mod = await loader.load(code.source);
        return code.exports === "*" ? mod : (mod[code.exports] ?? mod["default"] ?? mod);
      });
      loaded.set(name, promise);
      return promise;
    },
  };
};
