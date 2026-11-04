/**
 * The AI panel's state (U/AgentPanel.scala): the agent runtime (src/agent/runtime.ts, loaded on first use) talking to
 * the host's gateway through the bridge, the conversation from its transcript, one Undo per request, and the
 * conversations kept by the platform (`auvyx/v1/ai/sessions`) or in this browser.
 */
import type { Doc } from "@auvyx/editor-core";
import { config } from "./config";
import { rest } from "./host";
import { store } from "./store.svelte";
import { toast } from "./toast.svelte";
import { type AgentConfig, bridge, gateway } from "./agentBridge.svelte";
import { AgentView, importTheme } from "./agentCore";

export interface Thread { id: string; title: string; at: number }
// biome-ignore lint/suspicious/noExplicitAny: pi's messages, read as the transcript renders them.
type Msg = any;
interface Run {
  prompt(t: string): Promise<void>;
  steer(t: string): unknown;
  abort(): unknown;
  busy?: () => boolean;
  subscribe(l: (e: unknown) => void): () => void;
  messages(): Msg[];
  streaming(): Msg | undefined;
}

// ---- conversations: the host's, or this browser's ----

const documentId = String(config.postId ?? "");
const local = `auvyx-studio:agent:${documentId}`;
const hostSessions = !!gateway?.sessions && /^\d+$/.test(documentId);

const sessions = {
  async list(): Promise<Thread[]> {
    if (hostSessions) {
      try {
        const { data } = await rest<{ id: string | number; title: string; updated: number | string }[]>(`auvyx/v1/ai/sessions?document=${documentId}`);
        return data.map((s) => ({ id: String(s.id), title: String(s.title ?? ""), at: Number(s.updated) || 0 }));
      } catch { return []; }
    }
    try { return (JSON.parse(localStorage.getItem(`${local}:index`) ?? "[]") as { id: string; title: string; updated: number }[]).map((t) => ({ id: t.id, title: t.title, at: t.updated })); }
    catch { return []; }
  },
  async load(id: string): Promise<string> {
    if (hostSessions) { try { return (await rest<{ transcript?: string }>(`auvyx/v1/ai/sessions/${id}`)).data.transcript ?? "[]"; } catch { return "[]"; } }
    try { return localStorage.getItem(`${local}:${id}`) ?? "[]"; } catch { return "[]"; }
  },
  async save(id: string, title: string, transcript: string): Promise<string> {
    if (hostSessions) {
      const body: Record<string, unknown> = { document: Number(documentId), title, transcript };
      if (id) body.id = Number(id);
      try { return String((await rest<{ id: string | number }>("auvyx/v1/ai/sessions", { method: "POST", body: JSON.stringify(body) })).data.id); } catch { return id; }
    }
    const key = id || String(Date.now());
    try {
      localStorage.setItem(`${local}:${key}`, transcript);
      const others = agent.threads.filter((t) => t.id !== key).slice(0, 19);
      localStorage.setItem(`${local}:index`, JSON.stringify([{ id: key, title, at: Date.now() }, ...others].map((t) => ({ id: t.id, title: t.title, updated: t.at }))));
    } catch { /* private window */ }
    return key;
  },
  remove(id: string) {
    if (hostSessions) void rest(`auvyx/v1/ai/sessions/${id}?_method=DELETE`, { method: "POST", body: "{}" }).catch(() => undefined);
    else try { localStorage.removeItem(`${local}:${id}`); } catch { /* private window */ }
  },
};

// ---- state ----

class AgentState {
  threads = $state.raw<Thread[]>([]);
  currentId = $state("");
  transcript = $state.raw<Msg[]>([]);
  live = $state.raw<Msg | null>(null);
  busy = $state(false);
  /** The user pressed Stop: shown at once, while the run winds down. */
  stopping = $state(false);
  draft = $state("");
  open = $state.raw<Set<number>>(new Set());
  copied = $state<number | null>(null);
  startedAt = $state(0);
  /** Per request (by its user message's index): the page before and after, so its Undo is one step. */
  turns = $state.raw<Map<number, [Doc, Doc]>>(new Map());
  /** The panel's scroller follows new content (set by the view). */
  follow: () => void = () => {};
  jump: () => void = () => {};
}

export const agent = new AgentState();

let run: Run | undefined;
let loaded = false;
let runtime: Promise<typeof import("../agent/runtime")> | undefined;
const loadRuntime = () => (runtime ??= import("../agent/runtime"));

async function fresh(saved: Msg[]) {
  agent.transcript = saved;
  agent.live = null;
  agent.turns = new Map();
  const g = gateway;
  if (!g?.configured) { run = undefined; return; }
  const rt = await loadRuntime();
  run = rt.create(bridge(g as AgentConfig), saved) as unknown as Run;
  run.subscribe(() => schedule());
}

let pending = false;
/** Bound transcript reconstruction and live Markdown parsing to ten updates per second while tokens stream. */
function schedule() {
  if (pending) return;
  pending = true;
  setTimeout(() => requestAnimationFrame(() => {
    pending = false;
    if (!run) return;
    agent.transcript = run.messages();
    agent.live = run.streaming() ?? null;
    followRun();
    persistWhileRunning();
    agent.follow();
  }), 100);
}

export function ensureLoaded() {
  if (loaded || !gateway) return;
  loaded = true;
  void fresh([]);
  void sessions.list().then((list) => {
    agent.threads = list;
    if (list[0]) openThread(list[0].id);
  });
}

export function openThread(id: string) {
  if (agent.busy) return;
  void sessions.load(id).then(async (text) => {
    agent.currentId = id;
    let saved: Msg[] = [];
    try { const v = JSON.parse(text); if (Array.isArray(v)) saved = v; } catch { /* a broken transcript starts empty */ }
    await fresh(saved);
    agent.jump();
  });
}

export function newChat() {
  if (agent.busy) return;
  agent.currentId = "";
  void fresh([]);
}

export function deleteThread(id: string) {
  if (agent.busy) return;
  sessions.remove(id);
  agent.threads = agent.threads.filter((t) => t.id !== id);
  if (id === agent.currentId) newChat();
}

let savedAt = 0;
let persistPending = false;
/** Saves one after another (the first one makes the thread and gives it its id). */
let saves: Promise<void> = Promise.resolve();
let saving = false;

function persist() {
  if (persistPending) return;
  persistPending = true;
  savedAt = Date.now();
  const go = () => { persistPending = false; persistNow(); };
  const w = window as unknown as { requestIdleCallback?: (f: () => void, o: { timeout: number }) => void };
  if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 1000 });
  else setTimeout(go, 100);
}

function persistNow() {
  saving = true;
  saves = saves.catch(() => undefined).then(async () => {
    const ms = agent.transcript;
    if (!ms.length) return;
    const first = ms.find((m: Msg) => m.role === "user");
    const title = first ? userText(first).slice(0, 40) : "New chat";
    const id = await sessions.save(agent.currentId, title, JSON.stringify(ms));
    agent.currentId = id;
    agent.threads = [{ id, title, at: Date.now() }, ...agent.threads.filter((t) => t.id !== id)];
  }).finally(() => { saving = false; });
}

/** A run the panel did not start itself: shown as working while it goes on, kept when it ends. */
let following = false;
function followRun() {
  const running = !!run?.busy?.();
  if (running && !agent.busy) {
    following = true;
    agent.stopping = false;
    agent.startedAt = Date.now();
    agent.busy = true;
  } else if (!running && following) {
    following = false;
    agent.stopping = false;
    agent.busy = false;
    persist();
  }
}

/** While a request runs, the thread is kept every few seconds (and as soon as it starts). */
function persistWhileRunning() {
  if (agent.busy && !saving && (agent.currentId === "" || Date.now() - savedAt > 5000)) persist();
}

// ---- asking ----

/** A request from elsewhere in the editor (the ✦ box beside a selection): run like one typed here, in this panel's thread. */
export function ask(text: string) {
  ensureLoaded();
  if (agent.busy) toast("The agent is still working on the last request");
  else void submit(text);
}

export async function submit(text: string) {
  const t = text.trim();
  if (!t) return;
  if (!run && gateway?.configured) await loadRuntime().then(() => (run ? undefined : fresh(agent.transcript)));
  if (!run) return;
  agent.draft = "";
  // the runtime adds what the user is looking at (the bridge's view) to each message
  if (agent.busy) { run.steer(t); return; }
  const mark = store.doc;
  const index = agent.transcript.length;
  agent.startedAt = Date.now();
  agent.stopping = false;
  agent.busy = true;
  const asked = run.prompt(t);
  asked.catch((e: unknown) => toast(`The agent stopped: ${e instanceof Error ? e.message : String(e)}`)).finally(() => {
    agent.busy = false;
    agent.stopping = false;
    schedule();
    // each tool keeps its own undo point; the transcript also offers an explicit undo of the whole request
    if (store.doc !== mark) agent.turns = new Map([...agent.turns, [index, [mark, store.doc]]]);
    persist();
  });
  schedule();
}

export function stop() {
  if (!run) return;
  agent.stopping = true;
  run.abort();
}

export function undoTurn(index: number) {
  const t = agent.turns.get(index);
  if (t && store.doc === t[1]) store.commit(t[0]);
}

export function copy(text: string, id: number) {
  void navigator.clipboard?.writeText(text);
  agent.copied = id;
  setTimeout(() => { if (agent.copied === id) agent.copied = null; }, 1500);
}

// ---- importing a theme ----

export const THEME_TYPES = ".css,.scss,.js,.cjs,.mjs,.ts,.json,.md";

/** Picks up a theme file (Tailwind or CSS variables, tailwind.config, tokens JSON, DESIGN.md) for the agent. */
export function themeFile(file: File) {
  if (file.size > 2_000_000) { toast("That file is too big for a theme (2 MB at most)"); return; }
  void file.text().then((text) => importThemeFile(file.name, text));
}

/** The file becomes a DESIGN.md here (ThemeImport); the agent reviews it and applies it with its design tool. */
export function importThemeFile(name: string, text: string) {
  const r = importTheme(name, text);
  if (!r.ok) { toast(r.error); return; }
  const left = r.value.unused.length ? `\n\nNot mapped: ${r.value.unused.slice(0, 20).join(", ")}.` : "";
  const how = "Apply it as the whole site's look with the design tool. Keep its colors and fonts; fill a role it lacks only when the site needs it, and add one or two lines about the brand under the front matter.";
  ask(`Import the theme file "${name}" as the site's look. Converted to a DESIGN.md:\n\n\`\`\`markdown\n${r.value.markdown}\`\`\`${left}\n\n${how}`);
}

// ---- reading the transcript ----

const contentText = (c: unknown): string =>
  typeof c === "string" ? c : Array.isArray(c) ? c.filter((x) => x?.type === "text").map((x) => String(x.text ?? "")).join("") : "";

/** The user's words, without the view the runtime adds. */
export const userText = (m: Msg): string => AgentView.strip(contentText(m.content));

export interface Step { label: string; detail: string; failed: boolean; thumb: string; pass: boolean | null }
export interface Turn { index: number; request: string; said: string; notes: string[]; steps: Step[]; error: string; stopped: string }

/** What the harness starts the reminders it sends the model with, so the panel does not show them as the user's. */
const AUTOMATIC_CHECK = "(Automatic check)";

function stoppedNote(o: { reason?: string; remaining?: string[] }): string {
  const left = (o.remaining ?? []).slice(0, 4);
  const still = left.length ? ` Still open: ${left.join("; ")}.` : "";
  switch (o.reason) {
    case "revision-limit": return `Stopped after the allowed rounds of fixes.${still}`;
    case "budget": return `Stopped at the limit for one request.${still}`;
    case "stalled": return `Stopped because the same problems came back.${still}`;
    case "cut-off": return "Stopped: the model's answers kept running out of room (its output limit) before it could act. Ask for a smaller first step, or lower the reasoning level in the AI settings.";
    default: return "";
  }
}

function stepLabel(name: string, args: Record<string, unknown> | undefined, result: string, failed: boolean, details?: Record<string, unknown>): Step {
  const thumb = typeof details?.thumb === "string" ? details.thumb : "";
  const lines = result.split("\n");
  const fixIdx = lines.findIndex((l) => l.startsWith("Review of the picture: FIX"));
  const fixes = fixIdx < 0 ? 0 : (() => { let n = 0; for (const l of lines.slice(fixIdx + 1)) { if (!l.startsWith("- ")) break; n++; } return n; })();
  const pass = result.includes("Review of the picture: PASS") ? true : fixes > 0 ? false : null;
  const verdict = pass === true ? " · looks right" : pass === false ? ` · reviewer found ${fixes} to fix` : "";
  const arg = (k: string) => (args && args[k] !== undefined && args[k] !== null ? String(args[k]) : "");
  const step = (label: string, detail = "", f = failed, th = "", p: boolean | null = null): Step => ({ label, detail, failed: f, thumb: th, pass: p });
  switch (name) {
    case "read_page": return step(arg("id") ? `Read ${arg("id")}` : "Read the page");
    case "catalog": return step(`Looked up ${arg("kind")}${arg("query") ? ` “${arg("query")}”` : ""}`);
    case "look": return step((arg("id") ? `Looked at ${arg("id")}` : "Looked at the page") + verdict, "", failed, thumb, pass);
    case "edit": {
      const stopAt = (l: string) => l.startsWith("New elements:") || l.startsWith("Check:") || l.startsWith("Advisory") || l.startsWith("Converted");
      const changes: string[] = [];
      for (const l of lines.slice(1)) { if (stopAt(l)) break; changes.push(l); }
      const checkIdx = lines.findIndex((l) => l.startsWith("Check:"));
      let problems = 0;
      if (checkIdx >= 0) for (const l of lines.slice(checkIdx + 1)) { if (!l.startsWith("- ")) break; problems++; }
      if (result.startsWith("Fix limit reached")) return step("Stopped fixing this part", (lines[0] ?? "").replace(/^Fix limit reached for this part: /, "").slice(0, 160), false);
      if (failed) return step("Edit refused", lines[0] ?? "", true);
      return step((changes.length ? changes.join(", ") : "Edited") + (problems > 0 ? ` · found ${problems} problem${problems === 1 ? "" : "s"} to fix` : "") + verdict, "", false, thumb, pass);
    }
    default: return step(name);
  }
}

export function turnsOf(ms: Msg[]): Turn[] {
  const out: Turn[] = [];
  let cur: Turn | null = null;
  const calls = new Map<string, [string, Record<string, unknown> | undefined]>();
  ms.forEach((m: Msg, i: number) => {
    if (m.role === "user") {
      if (userText(m).startsWith(AUTOMATIC_CHECK)) return;
      if (cur) out.push(cur);
      cur = { index: i, request: userText(m), said: "", notes: [], steps: [], error: "", stopped: "" };
    } else if (m.role === "assistant") {
      const parts: Msg[] = Array.isArray(m.content) ? m.content : [];
      const said = parts.filter((p) => p.type === "text").map((p) => String(p.text ?? "")).join("").trim();
      for (const c of parts.filter((p) => p.type === "toolCall")) calls.set(String(c.id), [String(c.name), c.arguments]);
      if (cur) {
        const t: Turn = cur;
        const notes = t.said && said ? [...t.notes, t.said] : t.notes;
        const stopped = (m.auvyxOutcome && stoppedNote(m.auvyxOutcome)) || t.stopped;
        const error = m.stopReason === "error" ? String(m.errorMessage ?? "The model failed.") : m.stopReason === "aborted" ? "Stopped." : t.error;
        cur = { ...t, said: said || t.said, notes, error, stopped };
      }
    } else if (m.role === "toolResult") {
      const [name, args] = calls.get(String(m.toolCallId)) ?? [String(m.toolName), undefined];
      if (cur) { const t: Turn = cur; cur = { ...t, steps: [...t.steps, stepLabel(name, args, userText(m), !!m.isError, m.details)] }; }
    }
  });
  if (cur) out.push(cur);
  return out;
}

/** The text being written while the answer streams. */
export const liveText = (m: Msg | null): string => {
  try { return m && Array.isArray(m.content) ? m.content.filter((c: Msg) => c.type === "text").map((c: Msg) => String(c.text)).join("").trim() : ""; }
  catch { return ""; }
};
export const liveEditing = (m: Msg | null): boolean => !!m && Array.isArray(m.content) && m.content.some((c: Msg) => c.type === "toolCall");
