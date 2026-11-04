/**
 * What code elements' modules printed and threw on the canvas (U/CodeView.scala `logs`, `errors`, `hooks`, `bridge`).
 * Code never runs in the editor's own window: it runs in the canvas page after "Run custom code"; code.js there gives
 * each module a console that also calls `auvyxCodePrint`, asks `auvyxCodeSource(name)` for a data source's items, and
 * reports a failure as a `auvyx-code-error` event. The code panel and the agent's console tool read this.
 */
import { DataSources } from "@auvyx/editor-core";
import { connected, rest } from "./host";
import { session } from "./session.svelte";

/** The last error of each code element's module (by element id), and what each printed, latest last, 40 lines each. */
export const codeConsole = $state<{ logs: Record<string, string[]>; errors: Record<string, string> }>({ logs: {}, errors: {} });

const text = (a: unknown) => {
  if (typeof a === "string") return a;
  try { const j = JSON.stringify(a); return j == null ? String(a) : j; } catch { return String(a); }
};

/** One line a module printed (`level`: log, info, warn, error…). */
export function print(id: string, level: string, args: unknown[]) {
  const line = ((level === "log" ? "" : `[${level}] `) + [...args].map(text).join(" ")).slice(0, 500);
  codeConsole.logs = { ...codeConsole.logs, [id]: [...(codeConsole.logs[id] ?? []), line].slice(-40) };
}

export function setError(id: string, message: string) { codeConsole.errors = { ...codeConsole.errors, [id]: message }; }
/** The element's code was drawn again: its last error no longer stands (CodeView.apply). */
export function clearError(id: string) {
  if (!(id in codeConsole.errors)) return;
  const { [id]: _, ...rest } = codeConsole.errors;
  codeConsole.errors = rest;
}

/** `source(name)` from the site's data sources: a source that is not public fails here as it would on the page. */
function source(name: string): Promise<Record<string, string>[]> {
  const spec = session.dataSourceList.find((s) => s.name === name);
  if (!spec) return Promise.reject(new Error(`No data source named ${name}`));
  if (!spec.public) return Promise.reject(new Error(`The data source ${name} is not public: tick "Scripts may load it again" in Data sources`));
  if (!connected) return Promise.reject(new Error("No data sources here"));
  return rest<{ items?: Record<string, unknown>[] }>(`auvyx/v1/data-sources/${encodeURIComponent(name)}?limit=${DataSources.MAX_ITEMS}`)
    .then((r) => (r.data.items ?? []).map((i) => Object.fromEntries(Object.entries(i).map(([k, v]) => [k, typeof v === "string" ? v : v == null ? "" : String(v)]))));
}

type CodeWin = Window & { auvyxCodePrint?: unknown; auvyxCodeSource?: unknown };
/** The canvas frame's window prints and asks through the editor (CodeView.bridge). */
export function bridge(win: Window) {
  session.ensure();
  const w = win as CodeWin;
  w.auvyxCodePrint = (id: string, level: string, args: unknown[]) => print(String(id), String(level), Array.from(args ?? []));
  w.auvyxCodeSource = (name: string) => source(String(name));
}

/** What code elements printed and their errors, for the agent's console tool (AgentTools.consoleText); games add their own lines. */
export function consoleText(id: string, gameLines: Map<string, string[]> = new Map()): string {
  const { logs, errors } = codeConsole;
  const ids = id ? [id] : [...new Set([...Object.keys(logs), ...Object.keys(errors), ...gameLines.keys()])].sort();
  const parts = ids.flatMap((i) => {
    const lines = [...(logs[i] ?? []), ...(i in errors ? [`[uncaught] ${errors[i]}`] : []), ...(gameLines.get(i) ?? [])];
    return lines.length ? [`${i}:\n${lines.map((l) => `  ${l}`).join("\n")}`] : [];
  });
  return parts.length ? parts.join("\n") : id ? `${id} printed nothing and has no error.` : "No code element or game printed anything or failed.";
}

/** The canvas diagnostics of edited elements: `id: message` for each that failed (AgentTools.canvasNotes). */
export const codeErrorsOf = (ids: string[]) => [...new Set(ids)].flatMap((i) => (i in codeConsole.errors ? [`${i}: ${codeConsole.errors[i]}`] : []));
