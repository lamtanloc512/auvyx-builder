/**
 * The page's scripts on the canvas (U/CanvasWeb.scala islands, runCode, requestRun, bridgeCode, codeRunChanged,
 * stopOnEdit, teardown). The page's islands (FrontEnd.scripts: slider arrows and dots, tabs, galleries, countdowns,
 * drawers…) load once into the canvas page from the site and set up what a render drew again through their own
 * `auvyxIslands[name]()`; they read `data-auvyx-editing`, so nothing autoplays or navigates.
 *
 * "Run custom code": off on every canvas open, navigation and reload. Turning it on is an explicit, warned action of
 * someone who may author code, on a site that allows it (asked at `/auvyx/code-policy`, from the canvas page); editing any
 * code's source turns it off again; turning it off calls every cleanup and loads the canvas page afresh. Nothing here
 * is a sandbox: the code runs in the canvas page with the site's authority.
 */
import { FrontEnd, subtreeIds, type Doc } from "@auvyx/editor-core";
import { untrack } from "svelte";
import { canvasWeb } from "../lib/canvasWeb.svelte";
import { config } from "../lib/config";
import { canScript } from "../lib/session.svelte";
import { store } from "../lib/store.svelte";
import { toast } from "../lib/toast.svelte";
import * as Console from "../lib/console.svelte";

export const runCode = $state({ on: false, policyOn: true });

const site = config as unknown as { codeEnabled?: boolean; islandsUrl?: string; islandUrls?: Record<string, string> | unknown[] };
/** Session.codeEnabled: a host that does not say allows it (WordPress). */
const codeEnabled = site.codeEnabled !== false;
const WARNING = "Run custom code?\n\nThis page's code runs here with this site's own authority: it can read and change anything the page can, including what you are signed in to. It is not sandboxed. Run it only if you trust it.";

/** Session.islandUrl: the host's own address for an island (Auvyx Builder Pro's), else under the islands base. */
function islandUrl(name: string): string {
  const own = site.islandUrls && !Array.isArray(site.islandUrls) ? (site.islandUrls as Record<string, string>)[name] : undefined;
  return own ?? `${site.islandsUrl || "/auvyx/assets/"}${name}.js`;
}

/** What kind of frame the host gave (page, header, footer, store, standalone). */
const frameKind = /[?&](?:auvyx-)?as=([a-z]+)/.exec(config.webCanvasUrl ?? "")?.[1] ?? "page";

type Win = Window & {
  auvyxCodeCanvas?: boolean; auvyxCodePolicyUrl?: string; __auvyxCodeBridge?: boolean;
  auvyxCode?: { setRunning?: (on: boolean) => void; watch?: () => void } | null;
  auvyxIslands?: Record<string, unknown> | null;
};
interface Frame { d: Document; win: Win; scripts: Set<string>; seen: Map<string, HTMLElement>; observer: MutationObserver }
let frame: Frame | null = null;
/** What each code block's source is now: a change to any source (or a new block) stops Run. */
let codeSeen: Record<string, string> = {};
/** Run asked the whole page to be drawn again: its roots as drawn before. A redraw asked while another render is in
 * flight can be dropped by the canvas, so it is asked again (a few times) until the roots are new. */
let redrawWant: { before: Map<string, HTMLElement | undefined>; tries: number } | null = null;

function redrawAll() {
  redrawWant = { before: new Map(store.doc.roots.map((r) => [r, store.elements.get(r)])), tries: redrawWant?.tries ?? 0 };
  canvasWeb.redraw([...store.doc.roots]);
}

const runs = () => runCode.on && canScript && codeEnabled;
const live = (f: Frame | null): f is Frame => !!f && f === frame && canvasWeb.doc === f.d;

/** The canvas page loaded (Canvas.svelte, after canvasWeb.mount): code is stopped, the islands load as it draws. */
export function mountFrame(d: Document) {
  frame?.observer.disconnect();
  const win = d.defaultView as Win | null;
  if (!win) { frame = null; return; }
  runCode.on = false;
  runCode.policyOn = codeEnabled;
  redrawWant = null;
  codeSeen = FrontEnd.codeSources(store.doc);
  const observer = new MutationObserver((records) => teardown(records));
  const f: Frame = { d, win, scripts: new Set(), seen: new Map(), observer };
  frame = f;
  if (d.body) observer.observe(d.body, { childList: true, subtree: true });
  // the page goes (Run turned off reloads it): its elements are no one's to measure any more
  win.addEventListener("pagehide", () => { if (frame === f) store.elements.clear(); });
  // the site's switch went off (code.js heard it on focus or before an import): stop, and the Run button says so
  d.addEventListener("auvyx-code-policy", (e) => {
    if (frame !== f) return;
    const enabled = (e as CustomEvent<{ enabled?: unknown }>).detail?.enabled === true;
    runCode.policyOn = enabled;
    if (!enabled && runCode.on) setOn(false);
  });
}

// ---- islands ------------------------------------------------------------------------------------------------------

/** The scripts that run user code: code elements only where the site lets this user run scripts. */
const allowed = (name: string) => name !== "code" || canScript;
const subdoc = (doc: Doc, id: string): Doc => ({ roots: [id], nodes: Object.fromEntries(subtreeIds(doc, id).flatMap((i) => (doc.nodes[i] ? [[i, doc.nodes[i]!]] : []))) });
/** Islands whose older copies (before `auvyxIslands`) skip what they set up, so loading one again is safe. */
const LEGACY = new Set(["slider", "tabs", "gallery", "countdown", "animate", "header", "drawer"]);

function addScript(f: Frame, name: string, src: string, onload?: () => void) {
  const s = f.d.createElement("script");
  s.src = src;
  s.setAttribute("data-auvyx-canvas-island", name);
  if (onload) s.onload = onload;
  f.d.body.appendChild(s);
}

/** Load what the document needs and is not there yet; set up again what a redrawn part needs (CanvasWeb.islands). */
function islands(f: Frame, doc: Doc, redrawn: string[]) {
  const on = runs();
  const needed = new Set(FrontEnd.scripts(doc, on).filter(allowed));
  const rerun = new Set(redrawn.flatMap((id) => FrontEnd.scripts(subdoc(doc, id), on)).filter((n) => needed.has(n)));
  if (needed.has("code")) bridgeCode(f);
  // code.js starts nothing until the editor says Run (it is also stopped by the frame's own address); it is told once it is there
  for (const name of [...needed].filter((n) => !f.scripts.has(n)).sort()) addScript(f, name, islandUrl(name), name === "code" ? () => codeRunning(f) : undefined);
  if (needed.has("code") && f.scripts.has("code")) codeRunning(f);
  for (const name of [...rerun].filter((n) => f.scripts.has(n)).sort()) rerunIsland(f, name);
  for (const n of needed) f.scripts.add(n);
  if (frameKind === "store") f.d.dispatchEvent(new (f.win as unknown as { Event: typeof Event }).Event("auvyx:render"));
}

function rerunIsland(f: Frame, name: string) {
  if (name === "code") { try { f.win.auvyxCode?.watch?.(); } catch { /* the page's own problem */ } return; }
  const run = f.win.auvyxIslands?.[name];
  if (typeof run === "function") { try { (run as () => void)(); } catch { /* the page's own problem */ } }
  // a site whose islands predate the registry: the script again (each of these skips what it set up)
  else if (LEGACY.has(name)) addScript(f, name, `/auvyx/assets/${name}.js?again=${Date.now()}`);
}

/** A render landed (store.drawn): the elements it drew anew are the ones whose node changed. Style-only patches draw none. */
function afterDraw() {
  const f = frame;
  if (!live(f)) return;
  if (redrawWant) {
    const want = redrawWant;
    if ([...want.before].every(([r, el]) => store.elements.get(r) !== el)) redrawWant = null;
    else if (want.tries < 3) { want.tries++; queueMicrotask(() => { if (redrawWant === want && live(f)) redrawAll(); }); }
    else redrawWant = null;
  }
  const doc = store.doc;
  const changed = new Set<string>();
  for (const [id, el] of store.elements) if (f.seen.get(id) !== el) changed.add(id);
  f.seen = new Map(store.elements);
  if (!changed.size) return;
  const parentOf = new Map<string, string>();
  for (const n of Object.values(doc.nodes)) for (const c of n.children) parentOf.set(c, n.id);
  const top = [...changed].filter((id) => { for (let p = parentOf.get(id); p; p = parentOf.get(p)) if (changed.has(p)) return false; return true; });
  islands(f, doc, top.filter((id) => doc.nodes[id]));
}

/** Before a drawn part is gone: what its islands hold outside it is let go (CanvasWeb.teardown). A code element's module
 * cleans up; with no menu drawer open any more, the page gets its scroll back. Heard after the fact (a MutationObserver). */
function teardown(records: MutationRecord[]) {
  const f = frame;
  if (!f) return;
  let any = false;
  for (const r of records) for (const node of r.removedNodes) {
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (!el.hasAttribute("data-auvyx-id") && !el.querySelector("[data-auvyx-id],[data-auvyx-code]")) continue;
    any = true;
    for (const c of [el, ...el.querySelectorAll("[data-auvyx-code]")] as (Element & { _auvyxCleanup?: unknown })[]) {
      if (typeof c._auvyxCleanup === "function") { try { (c._auvyxCleanup as () => void)(); } catch { /* the module's own problem */ } c._auvyxCleanup = null; }
    }
    el.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"));
  }
  if (any) released(f);
}

/** The drawer island locks the page while a drawer is open: with none open the lock and its lifts go. */
function released(f: Frame) {
  if (f.d.querySelector(".auvyx-nav__menu[open]")) return;
  f.d.documentElement.classList.remove("auvyx-drawer-lock");
  f.d.querySelectorAll(".auvyx-drawer-host,.auvyx-drawer-lift").forEach((e) => e.classList.remove("auvyx-drawer-host", "auvyx-drawer-lift"));
}

// ---- code ---------------------------------------------------------------------------------------------------------

/** code.js in the frame answers `source(name)` and prints through the editor, and its errors show in the code panel. */
function bridgeCode(f: Frame) {
  // set before code.js is loaded: the canvas never starts code by itself, and code.js asks the site (its own origin) whether it may
  f.win.auvyxCodeCanvas = true;
  f.win.auvyxCodePolicyUrl = "/auvyx/code-policy";
  if (f.win.__auvyxCodeBridge) return;
  f.win.__auvyxCodeBridge = true;
  Console.bridge(f.win);
  f.d.addEventListener("auvyx-code-error", (e) => {
    const t = e.target as Element | null;
    const id = t && t.nodeType === 1 ? t.getAttribute("data-auvyx-id") : null;
    if (id) Console.setError(id, String((e as CustomEvent<{ message?: unknown }>).detail?.message ?? ""));
  });
}

/** Tells code.js (once it is in the frame) whether the editor has pressed Run: code starts then and only then. */
function codeRunning(f: Frame) {
  try { f.win.auvyxCode?.setRunning?.(runs()); } catch { /* the page's own problem */ }
}

/** Run turned on: the page is drawn again with its code and code.js starts it. Off: every cleanup is called, and the
 * canvas page loads afresh, so nothing a script left behind stays; the document is not touched. */
function setOn(on: boolean) {
  if (runCode.on === on) return;
  runCode.on = on;
  const f = frame;
  if (!live(f)) return;
  if (on) {
    redrawWant = null;
    redrawAll();
    codeRunning(f);
  } else {
    try { f.win.auvyxCode?.setRunning?.(false); } catch { /* the page's own problem */ }
    try { f.win.location.reload(); } catch { /* gone already */ }
  }
}

/** Run was pressed: the site is asked right now (from the canvas page, its own origin), then the warning, then Run. */
function requestRun() {
  const f = frame;
  if (!live(f)) return;
  f.win.fetch("/auvyx/code-policy", { cache: "no-store", credentials: "same-origin" })
    .then((r) => r.json())
    .then((j: { enabled?: unknown }) => j?.enabled === true, () => false)
    .then((ok) => {
      runCode.policyOn = ok;
      if (!ok) toast("Custom code is switched off for this site (or the site could not be asked). Nothing authored runs until it is switched on.");
      else if (live(f) && !runCode.on && window.confirm(WARNING)) setOn(true);
    });
}

export function toggleRunCode() {
  if (!runCode.policyOn) toast("Custom code is switched off for this site (Disable custom code). Nothing authored runs until it is switched on.");
  else if (runCode.on) setOn(false);
  else requestRun();
}

$effect.root(() => {
  // a render landed: islands for what it drew
  $effect(() => { store.drawn; untrack(afterDraw); });
  // a code source changed: its last error goes (CodeView.apply), and Run stops (stopOnEdit)
  $effect(() => {
    const doc = store.doc;
    untrack(() => {
      const now = FrontEnd.codeSources(doc);
      const ids = new Set([...Object.keys(now), ...Object.keys(codeSeen)]);
      let edited = false;
      for (const id of ids) if (now[id] !== codeSeen[id]) { edited = true; Console.clearError(id); }
      codeSeen = now;
      if (edited && runCode.on) setOn(false);
    });
  });
});
