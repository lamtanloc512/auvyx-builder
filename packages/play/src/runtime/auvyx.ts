/**
 * What a game gets as `auvyx`: the session (has, call, on) plus a typed facade for each capability the page granted.
 * Facades are a table: a new capability adds a row here, nothing else changes.
 */
import { type AssetsApi, assetsApi } from "../capabilities/assets";
import { type LibrariesApi, type ModuleLoader, librariesApi } from "../capabilities/libraries";
import { type LogApi, logApi } from "../capabilities/log";
import { type StorageApi, storageApi } from "../capabilities/storage";
import { type ViewportApi, viewportApi } from "../capabilities/viewport";
import type { AssetData } from "../capabilities/assets";
import type { GameInfo } from "../protocol";
import type { ClientSession } from "../session";

export interface GameDeps {
  readonly modules: ModuleLoader;
  readonly urls: { readonly make: (data: AssetData) => string };
}

const facades = {
  storage: (s: ClientSession, _d: GameDeps): StorageApi => storageApi(s),
  assets: (s: ClientSession, d: GameDeps): AssetsApi => assetsApi(s, d.urls),
  libraries: (s: ClientSession, d: GameDeps): LibrariesApi => librariesApi(s, d.modules),
  viewport: (s: ClientSession, _d: GameDeps): ViewportApi => viewportApi(s),
  log: (s: ClientSession, _d: GameDeps): LogApi => logApi(s),
};

type Facades = { readonly [K in keyof typeof facades]?: ReturnType<(typeof facades)[K]> };

export type Yb = Facades & {
  readonly game: GameInfo;
  readonly has: ClientSession["has"];
  readonly call: ClientSession["call"];
  readonly on: ClientSession["on"];
  /** Tells the Studio's play tool what state the game is in (score, lives, level…). */
  readonly expose: (state: () => unknown) => void;
};

export const buildYb = (session: ClientSession, deps: GameDeps, expose: (state: () => unknown) => void): Yb => {
  const granted = Object.fromEntries(
    Object.entries(facades).flatMap(([name, make]) => (session.has(name) ? [[name, make(session, deps)]] : []))
  ) satisfies Facades;
  return { ...granted, game: session.game, has: session.has, call: session.call, on: session.on, expose };
};
