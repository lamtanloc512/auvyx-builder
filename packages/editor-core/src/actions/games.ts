/**
 * Games (Auvyx Play, the Scala `GameJson`, `PlayDocument`, `PlayElement`): a game's source as the site keeps it, checked on
 * the way in, and the key a new game gets. The agent writes games through these; the site keeps and serves them.
 */
import play from "../../../../shared/play.json";
import libraries from "../../../../shared/code-libraries.json";

export interface GameSource { title: string; lang: string; html: string; css: string; js: string; libs: string[] }
export interface GameAsset { name: string; type: string; url: string }
export interface StoredGame { source: GameSource; assets: GameAsset[]; poster: string }

export const LIMITS = (play as { limits: Record<string, number> }).limits;
const KEY = new RegExp((play as { keyPattern: string }).keyPattern);
const SANDBOX = new Set((libraries as { libraries: { name: string; sandbox?: boolean }[] }).libraries.filter((l) => l.sandbox).map((l) => l.name));

export const isKey = (id: string) => KEY.test(id);

/** The libraries a game may use: known and allowed in the sandbox, once each, in order. */
export const gameLibs = (names: readonly string[]) => [...new Set(names.filter((n) => SANDBOX.has(n)))];

/** What a site refuses to keep: the first part over its limit, if any. */
export function overLimit(g: GameSource): string | undefined {
  for (const [part, t] of [["html", g.html], ["css", g.css], ["js", g.js]] as const)
    if (t.length > LIMITS[part]!) return `The game's ${part} is over ${LIMITS[part]} characters.`;
  return undefined;
}

/** A new game's key: made here, so an element names its game before the site has saved it. */
export function newKey(random: () => number = Math.random): string {
  const letters = "abcdefghijklmnopqrstuvwxyz0123456789";
  let k = "g";
  for (let i = 0; i < 11; i++) k += letters[Math.min(letters.length - 1, Math.trunc(random() * letters.length))];
  return k;
}

const txt = (o: Record<string, unknown>, k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
const safeHttp = (u: string) => /^https?:\/\/[^\s"'<>]+$/i.test(u.trim());

/** What a client sent, checked (GameJson.parse). */
export function parseGame(v: unknown): { ok: true; value: StoredGame } | { ok: false; error: string } {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "Expected a game" };
  const o = v as Record<string, unknown>;
  const title = txt(o, "title").trim().slice(0, 200);
  const libs = Array.isArray(o.libs) ? o.libs.filter((x): x is string => typeof x === "string") : [];
  const source: GameSource = { title, lang: txt(o, "lang") || "en", html: txt(o, "html"), css: txt(o, "css"), js: txt(o, "js"), libs: gameLibs(libs) };
  const assets = (Array.isArray(o.assets) ? o.assets : []).map((a) => (a && typeof a === "object" ? { name: txt(a as never, "name"), type: txt(a as never, "type"), url: txt(a as never, "url") } : { name: "", type: "", url: "" }));
  const poster = txt(o, "poster");
  if (!title) return { ok: false, error: "A game needs a title." };
  const over = overLimit(source);
  if (over) return { ok: false, error: over };
  if (assets.some((a) => !/^[\w][\w .()-]{0,99}$/.test(a.name) || !/^[a-z]+\/[\w.+-]+$/.test(a.type) || !safeHttp(a.url))) return { ok: false, error: "An asset needs a name, a type and an address." };
  if (assets.length > LIMITS.assets!) return { ok: false, error: `A game may have at most ${LIMITS.assets} assets.` };
  if (poster && !safeHttp(poster)) return { ok: false, error: "The poster needs an http(s) address." };
  return { ok: true, value: { source, assets, poster } };
}

export const gameJson = (g: StoredGame) => ({
  title: g.source.title, lang: g.source.lang, html: g.source.html, css: g.source.css, js: g.source.js, libs: [...g.source.libs], poster: g.poster,
  assets: g.assets.map((a) => ({ name: a.name, type: a.type, url: a.url })),
});

/**
 * Element trees with their games kept (ElementJson.decode's game branch): a game written in the tree (its source) is kept
 * through `create` and named by its new key; one naming a game the site has stays; one with neither is a new empty game.
 * A game that cannot be kept is left as it is (the decoder then drops it).
 */
export function withGames(tree: unknown, create: (g: StoredGame) => string | undefined): unknown {
  if (Array.isArray(tree)) return tree.map((t) => withGames(t, create));
  if (!tree || typeof tree !== "object") return tree;
  const o = tree as Record<string, unknown>;
  const out: Record<string, unknown> = { ...o };
  if (Array.isArray(o.children)) out.children = o.children.map((c) => withGames(c, create));
  if (o.kind !== "game") return out;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
  const written = ["html", "js"].some((k) => (s(k) ?? "").trim() !== "");
  const named = s("game") !== undefined && isKey(s("game")!) ? s("game") : undefined;
  const fresh = () => {
    const copy = { ...o };
    if ((s("title") ?? "").trim() === "") copy.title = (s("label") ?? "").trim() !== "" ? s("label") : "Game";
    const g = parseGame(copy);
    return g.ok ? create(g.value) : undefined;
  };
  const key = written ? (() => { const g = parseGame(o); return g.ok ? create(g.value) : undefined; })() : named ?? fresh();
  if (key === undefined) return out;
  const kept: Record<string, unknown> = { kind: "game", game: key };
  for (const k of ["css", "styles", "align", "label"]) if (o[k] !== undefined) kept[k] = o[k];
  if (kept.label === undefined) kept.label = "Game";
  return kept;
}
