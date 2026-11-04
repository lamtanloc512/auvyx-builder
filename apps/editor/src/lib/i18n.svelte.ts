/**
 * The editor's interface in the editing person's language (U/I18n.scala, docs/i18n.md). The interface is written in
 * English; the dictionaries (apps/editor/src/i18n/<lang>.json, first copied from Auvyx Studio's) map each English text
 * to its translation, entries with {0}, {1}… being patterns for text that carries a value. They are lazy chunks of this
 * bundle (auvyx-editor/editor-*.js), loaded before the editor shows. A watcher translates the text and the placeholder,
 * title and aria-label of everything the editor puts on screen, as it appears, except where `translate="no"` marks
 * people's own words (page and layer names, the conversation) and inside the canvas, which is the page itself.
 */
import { config } from "./config";

/** The languages with a dictionary: EzyPlatform's (vi, ja, ko, zh) besides English. */
export const LANGUAGES = new Set(["vi", "ja", "ko", "zh"]);

type Dictionary = Record<string, string>;
const DICTIONARIES: Record<string, () => Promise<{ default: Dictionary }>> = {
  vi: () => import("../i18n/vi.json"),
  ja: () => import("../i18n/ja.json"),
  ko: () => import("../i18n/ko.json"),
  zh: () => import("../i18n/zh.json"),
};

let exact = new Map<string, string>();
let patterns: [RegExp, string][] = [];
let current = "en";

/** The dictionary is in (or none is needed): the editor may show. */
export const i18n = $state({ ready: false, language: "en" });

export const language = () => current;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function translate(text: string): string | undefined {
  if (current === "en") return undefined;
  const key = text.trim();
  if (!key || key.length > 600) return undefined;
  let found = exact.get(key);
  if (found === undefined) {
    for (const [re, to] of patterns) {
      const m = re.exec(key);
      if (!m) continue;
      let acc = to;
      for (let i = 1; i < m.length; i++) {
        const v = m[i] ?? "";
        acc = acc.replace(`{${i - 1}}`, exact.get(v.trim()) ?? v);
      }
      found = acc;
      break;
    }
  }
  if (found === undefined || found === key) return undefined;
  const lead = /^\s*/.exec(text)![0];
  const trail = /\s*$/.exec(text)![0];
  return lead + found + trail;
}

/** English text → this language's, or the text itself when the dictionary has no entry. */
export const t = (text: string): string => translate(text) ?? text;

/** The language to use: the platform's (the user's locale), else `?lang=`, else the browser's, when there is a dictionary for it. */
export function wanted(platform: string | undefined = (config as unknown as { language?: string } | undefined)?.language): string {
  const asked = new URLSearchParams(location.search).get("lang") || undefined;
  const browser = platform ? undefined : navigator.language || undefined;
  const pick = (asked ?? (platform || undefined) ?? browser)?.toLowerCase().slice(0, 2);
  return pick && LANGUAGES.has(pick) ? pick : "en";
}

/** Loads the dictionary of `lang` (English needs none). Never fails: without a dictionary the interface stays English. */
export async function load(lang: string): Promise<void> {
  const get = DICTIONARIES[lang];
  if (lang === "en" || !get) return;
  try {
    const json = (await get()).default;
    const entries = Object.entries(json).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== "");
    const withValues = entries.filter(([k]) => /\{\d+\}/.test(k));
    exact = new Map(entries.filter(([k]) => !/\{\d+\}/.test(k)));
    // The longest patterns first: "Edited {0} ago" before "Edited {0}".
    patterns = withValues
      .sort((a, b) => b[0].length - a[0].length)
      .map(([k, v]) => [new RegExp("^" + escapeRe(k).replace(/\\\{\d+\\\}/g, "(.+?)") + "$"), v]);
    current = lang;
    document.documentElement.setAttribute("lang", lang);
  } catch {
    /* the interface stays English */
  }
}

// ---- the watcher ----------------------------------------------------------------------------------

const ATTRIBUTES = ["placeholder", "title", "aria-label"];
const SKIPPED = "[translate=no], script, style, textarea, code, pre, [contenteditable=true], [contenteditable='']";

const skipped = (e: Element) => e.closest(SKIPPED) !== null;

function textNode(n: Node) {
  const parent = n.parentNode;
  if (parent && parent.nodeType === Node.ELEMENT_NODE && !skipped(parent as Element)) {
    const v = translate(n.nodeValue ?? "");
    if (v !== undefined) n.nodeValue = v;
  }
}

function element(e: Element) {
  // a field's hint is ours even where its text is the author's
  if (e.closest("[translate=no]") !== null) return;
  for (const a of ATTRIBUTES) {
    const v = e.getAttribute(a);
    if (v === null) continue;
    const tr = translate(v);
    if (tr !== undefined) e.setAttribute(a, tr);
  }
}

function visit(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) textNode(root);
  else if (root.nodeType === Node.ELEMENT_NODE) {
    const e = root as Element;
    if (e.closest("[translate=no]") !== null) return;
    element(e);
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) textNode(n);
      else element(n as Element);
    }
  }
}

let observer: MutationObserver | undefined;

/** Translates what is on screen and whatever appears or changes from now on. */
export function install() {
  if (current === "en" || observer) return;
  visit(document.body);
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "childList") r.addedNodes.forEach(visit);
      else if (r.type === "characterData") textNode(r.target);
      else if (r.type === "attributes" && r.target.nodeType === Node.ELEMENT_NODE) element(r.target as Element);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
}

/**
 * The language's dictionary first, then the editor (`i18n.ready`), translated as it appears (Main.begin). Called once,
 * before the editor shows.
 */
export function start(): Promise<void> {
  const lang = wanted();
  // English needs nothing: the editor shows at once
  if (!DICTIONARIES[lang]) { i18n.ready = true; return Promise.resolve(); }
  return load(lang).then(() => {
    i18n.language = current;
    i18n.ready = true;
    // the editor draws on the next tick: watch from now on, then translate what is already there
    queueMicrotask(install);
  });
}
