/**
 * The registry's actions as the agent's tools (docs/actions.md): one tool per action, its name, description and JSON Schema
 * exactly as shared `AgentCall.specs` makes them, run through the Studio's bridge (`AgentTools.callAction`), which calls the
 * action with the context the Studio's own panels use and commits its document once. Nothing here is hand-written per action.
 */

/** An action as the bridge lists it (shared AgentCall.specs). */
export interface ActionSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  readOnly: boolean;
  /** Host/local staging actions do not change the canvas document. */
  surface?: string;
}

/** What a call answers (AgentTools.callAction): the model's text (the call's JSON, or its error) and what it touched. */
export interface ActionAnswer {
  ok: boolean;
  text: string;
  edit: boolean;
  added: string[];
  changed: string[];
  removed: string[];
}

export type Call = (name: string, json: string) => Promise<ActionAnswer>;

type Content = ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
export type ToolResult = { content: Content; details: Record<string, unknown> };

/**
 * How an edit is reported (runtime.ts applyChange: the Stop check, the run's revision rounds, the measured check and a picture
 * of the part it changed). `touched` are the ids the call names, `apply` runs it and answers what it made.
 */
export type Change = (touched: string[], apply: () => Promise<{ ok: boolean; text: string; added: string[]; canvas?: boolean }>) => Promise<ToolResult>;

/** The element ids a call names (id, item, ids, also): what an edit touches before it runs. */
export function touchedIds(args: unknown): string[] {
  if (!args || typeof args !== "object") return [];
  const a = args as Record<string, unknown>;
  const one = (v: unknown) => (typeof v === "string" && v ? [v] : []);
  const many = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : []);
  return [...new Set([...one(a.id), ...one(a.item), ...many(a.ids), ...many(a.also)])];
}

/** The names of the tools that change the document: the agent's own edit tools and every action that edits. */
export function editTools(specs: ActionSpec[]): Set<string> {
  return new Set(["edit", "write_code", ...specs.filter((s) => !s.readOnly).map((s) => s.name)]);
}

const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }], details: {} });

/** Optional compatibility filter. Ezy deliberately leaves this off: slot tools are additive to its legacy tools. */
export function filterLegacy<T extends { name: string }>(tools: T[], registryOnly: boolean): T[] {
  return registryOnly ? tools.filter((t) => !["edit", "write_code", "site_template"].includes(t.name)) : tools;
}

/** The tools, one per action. `decode` repairs arguments some models send as JSON strings (runtime.ts's). */
export function actionTools(specs: ActionSpec[], call: Call, change: Change, decode: (v: unknown) => unknown = (v) => v) {
  return specs.map((spec) => ({
    name: spec.name,
    label: spec.name.replace(/_/g, " "),
    description: spec.description,
    parameters: spec.parameters,
    prepareArguments: (args: unknown) => decode(args ?? {}) as never,
    execute: async (_: string, p: unknown): Promise<ToolResult> => {
      const json = JSON.stringify(p ?? {});
      if (spec.readOnly || (spec.surface && spec.surface !== "Doc")) {
        const r = await call(spec.name, json);
        if (!r.ok) throw new Error(r.text);
        return text(r.text);
      }
      return change(touchedIds(p), async () => {
        const r = await call(spec.name, json);
        // a refused call applied nothing: its error is the answer, there is nothing to check or look at
        if (!r.ok) throw new Error(r.text);
        return { ok: true, text: r.text, added: [...r.added, ...r.changed.filter((id) => !r.added.includes(id))], canvas: r.edit };
      });
    },
  }));
}
