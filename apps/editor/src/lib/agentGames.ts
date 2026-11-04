/**
 * The games the page's game elements name (U/PlayGames.scala): their source, loaded from the site once and kept on the
 * site a moment after each change (by key: the first save creates the game). What the agent's game edits go through.
 */
import { saved } from "./games.svelte";
import { type StoredGame, gameJson, newKey, parseGame } from "./agentCore";
import { games as site, gamesAvailable } from "./agentSite";

const sources = new Map<string, StoredGame>();
const asked = new Map<string, Promise<StoredGame | undefined>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** What each game printed (its console and errors), latest last. */
export const gameLogs = new Map<string, string[]>();
const SAVE_MS = 1200;

export const available = gamesAvailable;
export const source = (key: string) => sources.get(key);

export function log(key: string, level: string, text: string) {
  const line = (level === "log" ? "" : `[${level}] `) + text.slice(0, 500);
  gameLogs.set(key, [...(gameLogs.get(key) ?? []), line].slice(-60));
}

/** The site's copy of a game, unless it is here already. */
export function load(key: string): Promise<StoredGame | undefined> {
  if (sources.has(key)) return Promise.resolve(sources.get(key));
  let p = asked.get(key);
  if (!p) {
    p = site.get(key).then((r) => {
      if (!r) return undefined;
      const g = parseGame(r);
      if (g.ok && !sources.has(key)) sources.set(key, g.value);
      return sources.get(key);
    }, (e: Error) => { log(key, "error", `The site did not give this game: ${e.message}`); return undefined; });
    asked.set(key, p);
  }
  return p;
}

function save(key: string) {
  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.delete(key);
  const g = sources.get(key);
  if (g) void site.put(key, gameJson(g)).then(() => saved(key), (e: Error) => { saved(key, e.message); log(key, "error", `The game could not be saved: ${e.message}`); });
}

/** A changed source: here at once, on the site a moment later. */
export function set(key: string, game: StoredGame) {
  sources.set(key, game);
  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.set(key, setTimeout(() => save(key), SAVE_MS));
}

/** A new game: its key now (the element names it), the site's copy shortly. */
export function create(game: StoredGame): string | undefined {
  if (!available()) return undefined;
  const key = newKey();
  set(key, game);
  return key;
}
