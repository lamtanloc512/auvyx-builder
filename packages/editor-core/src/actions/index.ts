/**
 * Every action of the app, in one place (the Scala `Actions` and `AgentCall`): the editor's panels, the in-app agent and
 * an MCP endpoint list and call them from here (docs/actions.md). Store-slot and EzyPlatform actions are not here: they
 * are EzyPlatform's, and Auvyx Editor runs on WordPress.
 */
import {
  type Action, type ActionContext, type ActionError, type Called, type Result, type Where, ActionErrors, WHERES, callAction, calledJson, errorJson, toolSpec,
} from "./action";
import { DOC_ACTIONS } from "./docActions";
import { FOOTER_ACTIONS, HEADER_ACTIONS } from "./builderActions";
import type { Doc } from "../model";

export * from "./action";
export * as Schema from "./schema";
export * as AgentView from "./agentView";
export { labelOf, plain, preview, outline, named, styled, refused, updatable, placement, breakpoint, state } from "./docActions";
export { encode as encodeElements, isCode, isGame } from "./encode";
export { importTheme, setTokens, toHex, isDark, type ThemeResult } from "./themeImport";
export * as Forms from "./forms";
export { type StoredGame, type GameSource, gameJson, gameLibs, newKey, overLimit, parseGame, withGames, isKey as isGameKey } from "./games";
export { toJson as templateJson, encodeTemplate, capture, localize, type Local, type SitePage } from "./siteTemplateOps";

export const ALL: readonly Action[] = [...DOC_ACTIONS, ...HEADER_ACTIONS, ...FOOTER_ACTIONS];

if (new Set(ALL.map((a) => a.name)).size !== ALL.length) throw new Error("action names are unique");

const byName = new Map(ALL.map((a) => [a.name, a]));

export const get = (name: string) => byName.get(name);
export const names = () => ALL.map((a) => a.name);

/** The tools for a model (OpenAI function format); `where` keeps the ones a caller can run. */
export const toolSpecsFor = (where: ReadonlySet<Where>) => ALL.filter((a) => where.has(a.where)).map(toolSpec);
export const toolSpecs = () => toolSpecsFor(new Set(WHERES));

/** Look up, decode, check, run, encode. */
export function call(name: string, input: unknown, ctx: ActionContext): Result<Called> {
  const a = byName.get(name);
  return a ? callAction(a, input, ctx) : { ok: false, error: ActionErrors.unknownAction(name, names()) };
}

/** The same, from the JSON text a model sent. */
export function callText(name: string, input: string, ctx: ActionContext): Result<Called> {
  const a = byName.get(name);
  if (!a) return { ok: false, error: ActionErrors.unknownAction(name, names()) };
  const text = input.trim() === "" ? "{}" : input;
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (e) {
    return { ok: false, error: ActionErrors.badInput(`${name}: the input is not JSON (${String((e as Error).message).slice(0, 120)})`) };
  }
  return callAction(a, parsed, ctx);
}

// ---- the agent's side (AgentCall) -------------------------------------------------------------------

export interface ActionSpec { name: string; description: string; parameters: Record<string, unknown>; readOnly: boolean }

/** The tools for the agent: each action's name, description and input schema, and whether it only reads. */
export const agentSpecs = (where: ReadonlySet<Where> = new Set<Where>(["doc"])): ActionSpec[] =>
  ALL.filter((a) => where.has(a.where)).map((a) => ({ name: a.name, description: a.description, parameters: a.input.json(), readOnly: a.readOnly }));

/** Whether a tool of that name changes the document. */
export const edits = (name: string) => { const a = byName.get(name); return !!a && !a.readOnly; };

/** What the agent's tool answers: the text the model reads and, for an edit, the next document and what it touched. */
export interface Answer { ok: boolean; text: string; doc?: Doc; added: string[]; changed: string[]; removed: string[] }

export function agentCall(name: string, input: string, ctx: ActionContext): Answer {
  const r = callText(name, input, ctx);
  if (!r.ok) return { ok: false, text: JSON.stringify(errorJson(r.error)), added: [], changed: [], removed: [] };
  const c = r.value;
  return { ok: true, text: JSON.stringify(calledJson(c)), doc: c.doc, added: c.report.added, changed: c.report.changed, removed: c.report.removed };
}

export type { ActionError };
