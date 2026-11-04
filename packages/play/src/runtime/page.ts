/**
 * On the page: a game's frame and the capabilities the page grants it. `pageCapabilities` is the published page's
 * choice; the Studio passes its own (in-memory storage, its log) through `capabilities`.
 */
import { type AssetEntry, type Fetch, manifestAssets, tableLibraries } from "../adapters/fetching";
import { consoleSink, frameViewport } from "../adapters/dom";
import { webStorageStore } from "../adapters/stores";
import { assetsCapability } from "../capabilities/assets";
import { librariesCapability } from "../capabilities/libraries";
import { logCapability } from "../capabilities/log";
import { storageCapability } from "../capabilities/storage";
import { viewportCapability } from "../capabilities/viewport";
import { type Capability, createRegistry } from "../capability";
import { frameChannel } from "../channel";
import { ALLOW, SANDBOX } from "../policy";
import type { GameInfo } from "../protocol";
import { type HostConnection, mountHost } from "../session";

export interface PageGame {
  readonly id: string;
  readonly title: string;
  /** The game's document, served by the site with the sandbox CSP (/auvyx-play/<id>). */
  readonly src: string;
  readonly assets: readonly AssetEntry[];
}

export const pageCapabilities = ({
  game,
  frame,
  libraryBase,
  fetcher,
}: {
  readonly game: PageGame;
  readonly frame: HTMLIFrameElement;
  readonly libraryBase: string;
  readonly fetcher: Fetch;
}): readonly Capability[] => [
  storageCapability({ store: webStorageStore({ storage: localStorage, prefix: `auvyx-play:${game.id}:` }) }),
  assetsCapability({ source: manifestAssets({ assets: game.assets, fetcher }) }),
  librariesCapability({ source: tableLibraries({ base: libraryBase, fetcher }) }),
  viewportCapability({ source: frameViewport(frame) }),
  logCapability({ sink: consoleSink(game.title) }),
];

export interface MountedGame {
  readonly frame: HTMLIFrameElement;
  readonly connection: HostConnection;
  readonly dispose: () => void;
}

/** Puts the game's sandboxed frame in `container` and serves it what `capabilities` grants. */
export const mountGame = ({
  container,
  game,
  mode,
  capabilities,
  srcdoc,
}: {
  readonly container: HTMLElement;
  readonly game: PageGame;
  readonly mode: GameInfo["mode"];
  readonly capabilities: (frame: HTMLIFrameElement) => readonly Capability[];
  /** The Studio previews unsaved work from a document it builds itself. */
  readonly srcdoc?: string;
}): MountedGame => {
  // The frame belongs to the container's document, and its messages reach that document's window (in the Studio, the
  // canvas is a frame of its own).
  const doc = container.ownerDocument;
  const frame = doc.createElement("iframe");
  frame.setAttribute("sandbox", SANDBOX);
  frame.setAttribute("allow", ALLOW);
  frame.setAttribute("title", game.title);
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.className = "auvyx-play__frame";
  const connection = mountHost({
    channel: frameChannel(frame, doc.defaultView ?? window),
    registry: createRegistry(capabilities(frame)),
    game: { id: game.id, title: game.title, mode },
  });
  if (srcdoc !== undefined) frame.srcdoc = srcdoc;
  else frame.src = game.src;
  container.append(frame);
  return {
    frame,
    connection,
    dispose: () => {
      connection.dispose();
      frame.remove();
    },
  };
};

const isAsset = (v: unknown): v is AssetEntry =>
  typeof v === "object" && v !== null && "name" in v && typeof v.name === "string" && "type" in v && typeof v.type === "string" && "url" in v && typeof v.url === "string";

/** The game a container describes (`data-auvyx-play`, written by the site), or undefined when it is malformed. */
export const gameOf = (text: string | null): PageGame | undefined => {
  try {
    const v: unknown = JSON.parse(text ?? "");
    if (typeof v !== "object" || v === null) return undefined;
    const id = "id" in v && typeof v.id === "string" ? v.id : undefined;
    const title = "title" in v && typeof v.title === "string" ? v.title : "";
    const src = "src" in v && typeof v.src === "string" ? v.src : undefined;
    const assets = "assets" in v && Array.isArray(v.assets) ? v.assets.filter(isAsset) : [];
    return id && src ? { id, title, src, assets } : undefined;
  } catch {
    return undefined;
  }
};
