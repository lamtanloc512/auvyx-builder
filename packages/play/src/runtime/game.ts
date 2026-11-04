/**
 * Inside the sandbox: reads the document's config and module, connects to the page, loads the libraries, runs the game.
 * The module is `export default ({ el, lib, auvyx, reduced }) => cleanup?` like a code element's.
 */
import { canvasSnapshotter, domInput } from "../adapters/dom";
import { createRegistry } from "../capability";
import { inputCapability } from "../capabilities/input";
import { inspectCapability } from "../capabilities/inspect";
import { type Channel, memoryPair, parentChannel } from "../channel";
import { connect, mountHost } from "../session";
import { memoryStore } from "../adapters/stores";
import { storageCapability } from "../capabilities/storage";
import { viewportCapability } from "../capabilities/viewport";
import { logCapability } from "../capabilities/log";
import { type GameDeps, type Yb, buildYb } from "./auvyx";

export const SDK_VERSION = "1.0.0";

interface Config {
  readonly libs: readonly string[];
}

const configOf = (text: string | null | undefined): Config => {
  try {
    const v: unknown = JSON.parse(text ?? "{}");
    const libs = typeof v === "object" && v !== null && "libs" in v && Array.isArray(v.libs) ? v.libs.filter((x): x is string => typeof x === "string") : [];
    return { libs };
  } catch {
    return { libs: [] };
  }
};

const blobModules: GameDeps["modules"] = {
  load: async (source) => {
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    try {
      return await import(/* @vite-ignore */ url);
    } finally {
      URL.revokeObjectURL(url);
    }
  },
};

const blobUrls: GameDeps["urls"] = { make: ({ type, bytes }) => URL.createObjectURL(new Blob([bytes], { type })) };

/** In the Studio a picture of a WebGL canvas must not come out blank: keep its drawing buffer. */
const keepDrawings = () => {
  const original = HTMLCanvasElement.prototype.getContext;
  const patched = function (this: HTMLCanvasElement, kind: string, options?: Record<string, unknown>) {
    const webgl = kind === "webgl" || kind === "webgl2" || kind === "experimental-webgl";
    return Reflect.apply(original, this, [kind, webgl ? { ...options, preserveDrawingBuffer: true } : options]);
  };
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { value: patched, configurable: true, writable: true });
};

const forward = (auvyx: Yb) => {
  const text = (args: readonly unknown[]) => args.map((a) => (typeof a === "string" ? a : a instanceof Error ? (a.stack ?? a.message) : JSON.stringify(a))).join(" ");
  for (const level of ["log", "info", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      auvyx.log?.write(level, text(args));
    };
  }
  const describe = (e: unknown, fallback: string) => (e instanceof Error ? (e.stack ?? e.message) : fallback);
  window.addEventListener("error", (e: ErrorEvent) => auvyx.log?.write("error", describe(e.error, e.message)));
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => auvyx.log?.write("error", describe(e.reason, String(e.reason))));
};

/**
 * Opened on its own (the site's address of the game, not inside a page): no page answers, so the game hosts itself with
 * what needs no page: progress for this visit, the tab's visibility, the console. Libraries come from a page (there is no
 * fetch in the sandbox): a game that names some says so.
 */
const standalone = (doc: Document, title: string): Channel => {
  const [pageSide, gameSide] = memoryPair();
  mountHost({
    channel: pageSide,
    registry: createRegistry([
      storageCapability({ store: memoryStore() }),
      viewportCapability({
        source: {
          visible: () => !doc.hidden,
          watch: (listener) => {
            const changed = () => listener(!doc.hidden);
            doc.addEventListener("visibilitychange", changed);
            return () => doc.removeEventListener("visibilitychange", changed);
          },
          fullscreen: async () => {
            await doc.documentElement.requestFullscreen();
          },
        },
      }),
      logCapability({ sink: { write: ({ level, text }) => console[level](`[${title}]`, text) } }),
    ]),
    game: { id: "standalone", title, mode: "site" },
  });
  return gameSide;
};

export const startGame = async (doc: Document = document): Promise<() => void> => {
  const el = doc.getElementById("auvyx-game") ?? doc.body;
  // The game area takes focus (at start, and when the player touches it), so keys reach a game that listens on it as well
  // as one that listens on the window.
  el.tabIndex = 0;
  el.style.outline = "none";
  el.addEventListener("pointerdown", () => el.focus({ preventScroll: true }));
  const config = configOf(doc.getElementById("auvyx-play-config")?.textContent);
  const source = doc.getElementById("auvyx-play-module")?.textContent ?? "";
  const inspect = inspectCapability({ snapshotter: canvasSnapshotter(el) });
  const registry = createRegistry([inspect.capability, inputCapability({ target: domInput(el) })]);
  const alone = window.parent === window;
  const session = await connect({ channel: alone ? standalone(doc, doc.title) : parentChannel(), registry, sdk: SDK_VERSION });
  const deps: GameDeps = { modules: blobModules, urls: blobUrls };
  const auvyx = buildYb(session, deps, inspect.expose);
  // Alone, the log's sink is this console: forwarding it there again would loop.
  if (!alone) forward(auvyx);
  if (session.game.mode === "studio") keepDrawings();
  const lib: Record<string, unknown> = {};
  if (alone && config.libs.length > 0) {
    el.textContent = "Open this game on its page to play it.";
    throw new Error(`This game uses ${config.libs.join(", ")}, which a page provides: open it on its page.`);
  }
  for (const name of config.libs) if (auvyx.libraries) lib[name] = await auvyx.libraries.get(name);
  const mod = await blobModules.load(source);
  const main = mod["default"];
  if (typeof main !== "function") throw new Error("The game module has no default export");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cleanup: unknown = await main({ el, lib, auvyx, reduced });
  el.focus({ preventScroll: true });
  return () => {
    if (typeof cleanup === "function") cleanup();
    session.dispose();
  };
};
