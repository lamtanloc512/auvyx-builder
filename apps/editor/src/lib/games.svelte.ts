/**
 * Games on the canvas (U/PlayGames.scala, U/GameView.scala, the game hook of U/CanvasWeb.scala; docs/play-sandbox.md).
 *
 * - As on the site: the canvas is the site's page, so a game element shows the site's poster and Play button (PHP's
 *   PlayDocument::embed, drawn by `auvyx/v1/canvas/render`), as in Auvyx Studio on WordPress; with Preview interactions on,
 *   the site's play-page.js plays it on press. A game the editor made or changed is drawn again once the site keeps it.
 * - The running preview (GameView): the game in its sandboxed frame inside the element, through the same SDK a
 *   published page uses (@auvyx/play, as src/play/studio-play.ts) with the editor's adapters (storage in memory for the
 *   session, the log to the agent's console). It is started for the agent's `play` tool and `look` through
 *   `window.auvyxPlayRun(id)`, again whenever the game's source changed since; a bar over it names the game, stops it
 *   (back to the poster) and opens it alone on the site.
 */
import type { El } from "@auvyx/editor-core";
import { untrack } from "svelte";
import * as AgentGames from "./agentGames";
import type { StoredGame } from "./agentCore";
import { config } from "./config";
import { store } from "./store.svelte";
import { canvasWeb } from "./canvasWeb.svelte";
import type { GameRun, Mounted } from "./gamesPreview";

export type { GameRun };

const extra = config as unknown as { playUrl?: string; islandsUrl?: string; assetsUrl?: string };

/** Where the game runtime and the code libraries are, loaded by a sandboxed frame without cookies (Session.publicScriptsBase). */
export const scriptsBase = (): string =>
  new URL(extra.islandsUrl || (extra.assetsUrl ?? "").replace(/\/?placeholders\/?$/, "/") || "./", location.href).href.replace(/\/?$/, "/");

const isGame = (n: El | undefined): n is El => !!n && n.kind === "Section" && n.game !== "";

// ---- the running preview (GameView.runs) ------------------------------------------------------------------------

interface Running { run: GameRun; key: string; game: StoredGame | undefined; host: HTMLElement; mounted?: Mounted; gone: boolean }
/** The running preview of each game element, by element id: what the agent's play tool talks to. */
const runs = new Map<string, Running>();

function stop(id: string) {
  const r = runs.get(id);
  if (!r) return;
  runs.delete(id);
  r.gone = true;
  if (r.mounted) {
    try { r.mounted.run.dispose(); } catch { /* gone with the canvas */ }
    r.mounted.cleanup();
  }
}

/**
 * The running preview of a game element (`window.auvyxPlayRun`): the one already running while its source is the same, else
 * a fresh one, started once the preview's chunk and the game's source (the site's copy, unless the editor has it) are in.
 * Undefined when the element is not a game on the canvas.
 */
export function runOf(id: string): GameRun | undefined {
  const n = store.doc.nodes[id];
  const host = store.elements.get(id);
  if (!isGame(n) || !host?.isConnected) { stop(id); return undefined; }
  const key = n.game;
  const cur = runs.get(id);
  if (cur && cur.host === host && cur.key === key && (cur.game === undefined || cur.game === AgentGames.source(key))) return cur.run;
  stop(id);
  const entry: Running = { key, host, game: undefined, gone: false, run: undefined as unknown as GameRun };
  const started = Promise.all([import("./gamesPreview"), AgentGames.load(key)]).then(([P, g]) => {
    if (!g || entry.gone || !host.isConnected) return undefined;
    AgentGames.gameLogs.delete(key);
    entry.game = g;
    entry.mounted = P.mount(id, host, key, g, {
      scriptsBase: scriptsBase(), playUrl: extra.playUrl, saveError: saveErrors.get(key),
      log: (level, text) => AgentGames.log(key, level, text), onStop: stop,
    });
    return entry.mounted.run;
  });
  const need = async () => {
    const r = await started;
    if (!r) throw new Error("The game is not loaded (the site does not have it)");
    return r;
  };
  entry.run = {
    dispose: () => stop(id),
    ready: started.then((r) => (r ? r.ready : false), () => false),
    state: async () => (await need()).state(),
    snapshot: async (w) => (await need()).snapshot(w),
    press: async (k, ms) => (await need()).press(k, ms),
    tap: async (x, y) => (await need()).tap(x, y),
  };
  runs.set(id, entry);
  return entry.run;
}

// ---- the site's drawing of game elements -------------------------------------------------------------------------

/** Games whose save the site refused, with why (PlayGames.saveErrors). */
const saveErrors = new Map<string, string>();
const redrawn = new Map<string, number>();

/** The site's play-page.js in the canvas page, for Preview interactions (a page without a game when it loaded lacks it). */
function ensureRuntime(doc: Document) {
  if (doc.querySelector('script[src*="play-page.js"]')) return;
  const s = doc.createElement("script");
  s.src = new URL("play-page.js", scriptsBase()).href;
  s.setAttribute("data-auvyx-play-runtime", "1");
  doc.head.append(s);
}

/**
 * The site draws a game element from its own copy of the game (Play::render), as Auvyx Studio's canvas on WordPress does:
 * a game the site does not have shows nothing, as on the page. A game the editor has just made or changed is kept by
 * the site a moment later (agentGames, 1.2 s): its element is drawn again then (CanvasWeb redraws a game's elements when
 * its source changes), a few times at most.
 */
function drawGames() {
  for (const [id, n] of Object.entries(store.doc.nodes)) {
    if (!isGame(n)) continue;
    const host = store.elements.get(id);
    if (!host?.isConnected) continue;
    if (host.querySelector(".auvyx-play")) { redrawn.delete(id); ensureRuntime(host.ownerDocument); continue; }
    const tries = redrawn.get(id) ?? 0;
    if (tries >= 4 || !AgentGames.available() || !AgentGames.source(n.game)) continue;
    redrawn.set(id, tries + 1);
    setTimeout(() => canvasWeb.redraw([id]), 1800);
  }
}

/** Starts watching the canvas: game elements as the site draws them, the agent's handle on running games. */
export function startGames() {
  (window as unknown as { auvyxPlayRun?: (id: string) => GameRun | undefined }).auvyxPlayRun = runOf;
  $effect.root(() => {
    $effect(() => {
      void store.drawn;
      untrack(() => {
        for (const [id, r] of [...runs]) if (!r.host.isConnected) stop(id);
        drawGames();
      });
    });
  });
}

/**
 * What a game's save answered (agentGames' save calls it; PlayGames.save): the bar's "Not saved", and the site draws the
 * game's elements again from the copy it now keeps (its poster, its title).
 */
export function saved(key: string, error?: string) {
  if (error) { saveErrors.set(key, error); return; }
  saveErrors.delete(key);
  const ids = Object.values(store.doc.nodes).filter((n) => n.kind === "Section" && n.game === key && !runs.has(n.id)).map((n) => n.id);
  if (ids.length) canvasWeb.redraw(ids);
}
