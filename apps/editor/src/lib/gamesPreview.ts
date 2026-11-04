/**
 * The running preview of a game element (U/GameView.scala, src/play/studio-play.ts), a lazy chunk of Auvyx Editor: the game
 * in its sandboxed frame inside the element on the canvas, through the same SDK a published page uses (@auvyx/play) with the
 * editor's adapters (storage in memory for the session, the log to the agent's console, the play-test calls), and a bar
 * over it that names the game, stops it and opens it alone on the site. Its document is the site's own (PlayDocument).
 */
import {
  type AssetEntry,
  type KeyValueStore,
  type Remote,
  assetsCapability,
  frameViewport,
  inputApi,
  inspectApi,
  librariesCapability,
  logCapability,
  manifestAssets,
  memoryStore,
  mountGame,
  storageCapability,
  tableLibraries,
  viewportCapability,
} from "../../../../packages/play/src/index";
import play from "../../../../shared/play.json";
import libraries from "../../../../shared/code-libraries.json";
import type { StoredGame } from "./agentCore";
import { Ico } from "../ui/icons";

// ---- PlayDocument (S/PlayDocument.scala; PHP Modules/Play/PlayDocument.php) -------------------------------------

const LANG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const SANDBOX_LIBS = new Set((libraries as { libraries: { name: string; sandbox?: boolean }[] }).libraries.filter((l) => l.sandbox).map((l) => l.name));
const escapeHtml = (t: string) => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const policy = play as unknown as { document: string; sandbox: string[]; csp: Record<string, string[]> };

/** The document a game runs in (PlayDocument.render). */
export function renderDocument(game: StoredGame["source"], runtime: string): string {
  const libs = [...new Set(game.libs.filter((l) => SANDBOX_LIBS.has(l)))];
  const values: Record<string, string> = {
    lang: LANG.test(game.lang) ? game.lang : "en",
    title: escapeHtml(game.title),
    css: game.css.replace(/<\/(style)/gi, "<\\/$1"),
    html: game.html,
    config: JSON.stringify({ libs }).replaceAll("<", "\\u003c"),
    js: game.js.replace(/<\/(script)/gi, "<\\/$1").replaceAll("<!--", "<\\!--"),
    runtime: escapeHtml(runtime),
  };
  return policy.document.replace(/\{(lang|title|css|html|config|js|runtime)\}/g, (_, k: string) => values[k]!);
}

/** The Content-Security-Policy a game is served with (PlayDocument.csp). */
export function csp(siteOrigin: string, runtimeOrigin: string): string {
  const fill = (s: string) => s.replace("{site-origin}", siteOrigin).replace("{runtime-origin}", runtimeOrigin);
  return [`sandbox ${policy.sandbox.join(" ")}`, ...Object.entries(policy.csp).map(([name, sources]) => `${name} ${sources.map(fill).join(" ")}`)].join("; ");
}

/**
 * The game's document for a preview (PlayGames.document): the site's own, with its policy as a meta tag (the parts a meta
 * tag may carry: not `sandbox` and `frame-ancestors`, which the frame's sandbox attribute and the editor take care of).
 */
export function previewDocument(game: StoredGame, scriptsBase: string): string {
  const runtime = new URL("play-game.js", scriptsBase).href;
  const meta = csp("'none'", new URL(runtime).origin).split("; ").filter((d) => !d.startsWith("sandbox") && !d.startsWith("frame-ancestors")).join("; ");
  return renderDocument(game.source, runtime).replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${escapeHtml(meta)}">`);
}

// ---- the frame and its bar -------------------------------------------------------------------------------

export interface GameRun {
  readonly dispose: () => void;
  /** Resolves once the game has connected (its module may still be starting). */
  readonly ready: Promise<boolean>;
  readonly state: () => Promise<unknown>;
  readonly snapshot: (maxWidth?: number) => Promise<string | null>;
  readonly press: (key: string, ms: number) => Promise<void>;
  readonly tap: (x: number, y: number) => Promise<void>;
}

const fetcher = (url: string, init: RequestInit) => fetch(url, init);
// Progress a game saves lasts for the editing session, per game: rerunning it after an edit keeps it.
const stores = new Map<string, KeyValueStore>();
const storeFor = (key: string) => stores.get(key) ?? (stores.set(key, memoryStore()), stores.get(key)!);

/** Same classes as GameView's bar (the editor's), with their look inline: the canvas is the site's page, without the editor's CSS. */
const CHIP = "flex h-6 items-center gap-1 rounded-full bg-black/70 px-2 text-[11px] font-medium text-white backdrop-blur-sm";
const CHIP_STYLE = "display:flex;height:24px;align-items:center;gap:4px;border-radius:9999px;background:rgba(0,0,0,.7);padding:0 8px;font:500 11px/1 system-ui,sans-serif;color:#fff;backdrop-filter:blur(4px);border:0;cursor:pointer;text-decoration:none";
const svg = (body: string, size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** The bar over a running game: its name, Stop, Open (alone on the site), "Not saved" when the site refused it. */
function bar(doc: Document, key: string, game: StoredGame, o: Options): HTMLElement {
  const b = doc.createElement("div");
  b.className = "pointer-events-auto absolute top-2 left-2 z-10 flex items-center gap-1";
  b.style.cssText = "position:absolute;top:8px;left:8px;z-index:10;display:flex;align-items:center;gap:4px;pointer-events:auto";
  b.setAttribute("data-game-bar", "1");
  const name = doc.createElement("span");
  name.className = CHIP;
  name.style.cssText = CHIP_STYLE + ";cursor:default";
  name.setAttribute("translate", "no");
  name.innerHTML = svg(Ico.play, 11);
  name.append(doc.createTextNode(game.source.title || "Game"));
  const stopper = doc.createElement("button");
  stopper.type = "button";
  stopper.className = `${CHIP} hover:bg-black/85`;
  stopper.style.cssText = CHIP_STYLE;
  stopper.textContent = "Stop";
  stopper.setAttribute("data-game-stop", "1");
  b.append(name, stopper);
  if (o.playUrl && key) {
    const open = doc.createElement("a");
    open.className = `${CHIP} hover:bg-black/85`;
    open.style.cssText = CHIP_STYLE;
    open.href = o.playUrl.replace("{key}", encodeURIComponent(key));
    open.target = "_blank";
    open.title = "Open the game alone, as the site serves it (save first)";
    open.setAttribute("data-game-open", "1");
    open.innerHTML = svg(Ico.external, 11);
    open.append(doc.createTextNode("Open"));
    b.append(open);
  }
  const err = o.saveError;
  if (err) {
    const e = doc.createElement("span");
    e.className = "rounded-full bg-red-600/90 px-2 py-0.5 text-[11px] text-white";
    e.style.cssText = "border-radius:9999px;background:rgba(220,38,38,.9);padding:2px 8px;font:11px/1.4 system-ui,sans-serif;color:#fff";
    e.title = err;
    e.textContent = "Not saved";
    b.append(e);
  }
  return b;
}

/** The bar's buttons take their own presses: the canvas would otherwise select or drag the element. */
const wired = new WeakSet<Window>();
function wire(win: Window, onStop: (id: string) => void) {
  if (wired.has(win)) return;
  wired.add(win);
  const inBar = (e: Event) => {
    const t = e.target as Element | null;
    return t && typeof t.closest === "function" ? t.closest("[data-game-bar]") : null;
  };
  for (const type of ["pointerdown", "mousedown"]) win.addEventListener(type, (e) => { if (inBar(e)) e.stopPropagation(); }, true);
  win.addEventListener("click", (e) => {
    const b = inBar(e);
    if (!b) return;
    e.stopPropagation();
    const t = e.target as Element;
    const id = b.closest("[data-auvyx-id]")?.getAttribute("data-auvyx-id") ?? "";
    if (t.closest("[data-game-stop]")) { e.preventDefault(); onStop(id); }
    else if (!t.closest("[data-game-open]")) e.preventDefault();
  }, true);
}

export interface Mounted { run: GameRun; cleanup: () => void }
export interface Options {
  /** Where play-game.js and the code libraries are. */
  scriptsBase: string;
  /** The site's address of a game alone (`{key}`), when it serves games. */
  playUrl?: string;
  /** Why the site refused the game's last save, if it did. */
  saveError?: string;
  log: (level: string, text: string) => void;
  /** The bar's Stop. */
  onStop: (id: string) => void;
}

/** Mounts the game in its element on the canvas (GameView.start), from the editor's copy of its source. */
export function mount(id: string, host: HTMLElement, key: string, game: StoredGame, o: Options): Mounted {
  const doc = host.ownerDocument;
  if (doc.defaultView) wire(doc.defaultView, o.onStop);
  // the site's embed (poster and Play) holds the frame while it runs; a game the site has not drawn yet gets its own area
  let area = host.querySelector<HTMLElement>(":scope > .auvyx-play, :scope .auvyx-play");
  const made = !area;
  if (!area) {
    area = doc.createElement("div");
    area.className = "auvyx-play";
    host.append(area);
  }
  area.classList.add("is-playing");
  area.setAttribute("data-game-area", "1");
  host.setAttribute("data-auvyx-game", key);
  const theBar = bar(doc, key, game, o);
  host.append(theBar);
  const assets = game.assets as readonly AssetEntry[];
  const mounted = mountGame({
    container: area,
    game: { id: key, title: game.source.title, src: "", assets },
    mode: "studio",
    srcdoc: previewDocument(game, o.scriptsBase),
    capabilities: (frame) => [
      storageCapability({ store: storeFor(key) }),
      assetsCapability({ source: manifestAssets({ assets, fetcher }) }),
      librariesCapability({ source: tableLibraries({ base: o.scriptsBase, fetcher }) }),
      viewportCapability({ source: frameViewport(frame) }),
      logCapability({ sink: { write: ({ level, text }) => o.log(level, text) } }),
    ],
  });
  let remote: Remote | undefined;
  const ready = Promise.race([
    mounted.connection.ready.then((r) => { remote = r; return true; }),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8000)),
  ]);
  const need = async (): Promise<Remote> => {
    if (remote) return remote;
    if ((await ready) && remote) return remote;
    throw new Error("The game did not start (see its console)");
  };
  const area0 = area;
  return {
    run: {
      dispose: mounted.dispose,
      ready,
      state: async () => inspectApi(await need()).state(),
      snapshot: async (maxWidth) => inspectApi(await need()).snapshot(maxWidth),
      press: async (k, ms) => inputApi(await need()).press(k, ms),
      tap: async (x, y) => inputApi(await need()).tap(x, y),
    },
    cleanup: () => {
      theBar.remove();
      if (made) area0.remove();
      else { area0.classList.remove("is-playing"); area0.removeAttribute("data-game-area"); }
    },
  };
}

