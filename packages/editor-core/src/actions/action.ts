/**
 * One operation of the app (the Scala `actions.Action`), called the same way by the editor's panels, the in-app agent
 * and an MCP endpoint (docs/actions.md): a name, a description, an input schema; decode, check where it runs, run,
 * check the document it answers, encode.
 */
import type { Doc, El } from "../model";
import type { Platform } from "../builderParts";
import type { Json, JsonObj, Schema } from "./schema";
import type { StoredGame } from "./games";

/** Where an action can run. */
export type Where = "doc" | "canvas" | "host";
export const WHERES: readonly Where[] = ["doc", "canvas", "host"];

/** Why an action did not run: an action either does what it says or answers one of these. */
export interface ActionError { code: string; message: string }

export const errorJson = (e: ActionError) => ({ ok: false, error: { code: e.code, message: e.message } });

export const ActionErrors = {
  unknownAction: (name: string, known: readonly string[]): ActionError => ({ code: "unknown_action", message: `No action "${name}". Actions: ${known.join(", ")}.` }),
  badInput: (message: string): ActionError => ({ code: "bad_input", message }),
  notFound: (id: string): ActionError => ({ code: "not_found", message: `No element "${id}" in the document.` }),
  canvasOnly: (id: string): ActionError => ({ code: "canvas_only_id", message: `"${id}" exists only on the canvas (a component's content): edit the component itself.` }),
  invalid: (message: string): ActionError => ({ code: "invalid", message }),
  notHere: (name: string, where: Where): ActionError => ({ code: "unsupported_here", message: `${name} needs the ${where} and cannot run here.` }),
};

/** What the user is looking at when the action is called: it fills what the caller leaves out and tells the agent what "this" is. */
export interface View {
  selected: string[];
  breakpoint: string;
  state: string;
  breakpoints: string[];
  document: string;
  kind: string;
  title: string;
}

export const defaultView = (): View => ({ selected: [], breakpoint: "base", state: "default", breakpoints: ["base", "tablet", "mobile"], document: "", kind: "page", title: "" });

/** Everything an action may read: the document, the view, and what the site allows. */
export interface ActionContext {
  doc: Doc;
  newId: () => string;
  view: View;
  surfaces: ReadonlySet<Where>;
  canScript: boolean;
  /** A block the site offers, answered with its registered name. */
  block: (name: string) => string | undefined;
  field: (key: string) => boolean;
  /** What only the host knows about a block (its attributes, a summary), added when an element is read in full. */
  raw: (n: El) => [string, Json][];
  platform: Platform;
  /** Keeps a new game's source (Auvyx Play) and answers its key; absent where games cannot be kept (ElementJson.Context.game). */
  game?: (g: StoredGame) => string | undefined;
}

export const context = (doc: Doc, newId: () => string, more: Partial<ActionContext> = {}): ActionContext => ({
  doc, newId, view: defaultView(), surfaces: new Set<Where>(["doc"]), canScript: false, block: () => undefined, field: () => false, raw: () => [],
  platform: "wordpress", ...more,
});

/** An element of the document, or the error that says why there is none. */
export function element(ctx: ActionContext, id: string): { ok: true; value: El } | { ok: false; error: ActionError } {
  if (id.includes("~")) return { ok: false, error: ActionErrors.canvasOnly(id) };
  const n = ctx.doc.nodes[id];
  return n ? { ok: true, value: n } : { ok: false, error: ActionErrors.notFound(id) };
}

/** What a call changed, for the UI (select what was added) and for the agent's report. */
export interface Report { changed: string[]; added: string[]; removed: string[]; steps: string[] }
export const report = (r: Partial<Report> = {}): Report => ({ changed: [], added: [], removed: [], steps: [], ...r });

/** An action's answer: its value (as JSON) and, for an action that edits, the whole next document (one commit, one Undo). */
export interface Outcome { value: JsonObj; doc?: Doc; report: Report }

export type Result<A> = { ok: true; value: A } | { ok: false; error: ActionError };
export const ok = <A>(value: A): Result<A> => ({ ok: true, value });
export const err = (error: ActionError): Result<never> => ({ ok: false, error });

/** A call through the registry: the value as JSON, the next document, the report. */
export interface Called { name: string; value: JsonObj; doc?: Doc; report: Report }

export function calledJson(c: Called): JsonObj {
  const o: JsonObj = { ok: true, result: c.value };
  for (const k of ["changed", "added", "removed", "steps"] as const) if (c.report[k].length) o[k] = c.report[k];
  return o;
}

export interface Action {
  name: string;
  description: string;
  where: Where;
  /** Reads only: never returns a document. */
  readOnly: boolean;
  input: Schema<Record<string, unknown>>;
  run: (input: Record<string, unknown>, ctx: ActionContext) => Result<Outcome>;
}

export function action(name: string, description: string, input: Schema<Record<string, unknown>>,
  run: Action["run"], opts: { where?: Where; readOnly?: boolean } = {}): Action {
  if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name)) throw new Error(`action names are snake_case: ${name}`);
  return { name, description, where: opts.where ?? "doc", readOnly: opts.readOnly ?? false, input, run };
}

/** OpenAI's function format. */
export const toolSpec = (a: Action) => ({ type: "function", function: { name: a.name, description: a.description, parameters: a.input.json() } });

const isStoreSection = (n: El) => n.kind === "Raw" && n.blockName.startsWith("auvyx-store/");

/**
 * A document an action returns: never a canvas-only id (invariant 10), never preview markup a shop section did not
 * already have, every child present, no element twice.
 */
export function check(name: string, before: Doc, after: Doc): Result<void> {
  const canvasOnly = Object.keys(after.nodes).filter((k) => k.includes("~") && !before.nodes[k]);
  const drawn = new Set(Object.values(before.nodes).filter(isStoreSection).map((n) => n.html));
  const previews = Object.values(after.nodes).filter((n) => isStoreSection(n) && n.html !== "" && !drawn.has(n.html)).map((n) => n.id);
  const listed = [...after.roots, ...Object.values(after.nodes).flatMap((n) => n.children)];
  const missing = listed.filter((id) => !after.nodes[id]);
  const seen = new Set<string>();
  const twice: string[] = [];
  for (const id of listed) { if (seen.has(id) && !twice.includes(id)) twice.push(id); seen.add(id); }
  if (canvasOnly.length) return err(ActionErrors.invalid(`${name} would save canvas-only ids: ${canvasOnly.sort().join(", ")}`));
  if (previews.length) return err(ActionErrors.invalid(`${name} would save canvas-only markup in shop sections: ${previews.sort().join(", ")}`));
  if (missing.length) return err(ActionErrors.invalid(`${name} would leave missing children: ${[...new Set(missing)].join(", ")}`));
  if (twice.length) return err(ActionErrors.invalid(`${name} would place elements twice: ${twice.join(", ")}`));
  return ok(undefined);
}

/** Decode, check where it runs, run, check. */
export function callAction(a: Action, json: Json, ctx: ActionContext): Result<Called> {
  if (!ctx.surfaces.has(a.where)) return err(ActionErrors.notHere(a.name, a.where));
  const input = a.input.read(json, "");
  if (!input.ok) return err(ActionErrors.badInput(`${a.name}: ${input.error}`));
  const out = a.run(input.value, ctx);
  if (!out.ok) return out;
  if (a.readOnly && out.value.doc) return err(ActionErrors.invalid(`${a.name} reads only but returned a document`));
  if (out.value.doc) { const c = check(a.name, ctx.doc, out.value.doc); if (!c.ok) return c; }
  return ok({ name: a.name, value: out.value.value, doc: out.value.doc, report: out.value.report });
}
