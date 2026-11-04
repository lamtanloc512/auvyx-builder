/**
 * A form's definition as the Settings panel edits it (U/FormSettings.scala over the Scala `Forms`): read from the
 * element's `auvyx/form` comment (Forms.parse), written back with the agent port's Forms.markup / Forms.html.
 */
import { javaTrim, isRecord } from "./json";
import { KINDS, MAX_FIELDS, MAX_OPTIONS, MAX_TEXT, html, markup, nameFor, recipients, safeUrl, type Field, type Form } from "./actions/forms";

export { KINDS, MAX_FIELDS, MAX_OPTIONS, html, markup, nameFor, recipients, safeUrl, type Field, type Form };
export const CHOICE_KINDS = new Set(["select", "radio"]);
const KIND_IDS = KINDS.map(([k]) => k);
const MARKUP = /^[ \t\n\x0B\f\r]*<!--[ \t\n\x0B\f\r]+wp:auvyx\/form(?:[ \t\n\x0B\f\r]+(\{[\s\S]*\}))?[ \t\n\x0B\f\r]+\/-->[ \t\n\x0B\f\r]*$/;

/** Forms.parse: the definition in an element's comment; undefined for anything that is not a well-formed one. */
export function parseForm(raw: string): Form | undefined {
  const m = MARKUP.exec(raw);
  if (!m || m[1] === undefined) return undefined;
  let o: unknown;
  try { o = JSON.parse(m[1]); } catch { return undefined; }
  if (!isRecord(o)) return undefined;
  const s = (v: unknown, max: number) => (typeof v === "string" ? javaTrim(v).slice(0, max) : "");
  const id = s(o.id, 60);
  if (!/^[a-z0-9][a-z0-9_-]{2,40}$/.test(id)) return undefined;
  const seen = new Set<string>();
  const fields: Field[] = (Array.isArray(o.fields) ? o.fields : []).flatMap((f): Field[] => {
    if (!isRecord(f)) return [];
    const name = s(f.name, 40), kind = s(f.kind, 20);
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(name) || !KIND_IDS.includes(kind) || seen.has(name)) return [];
    seen.add(name);
    const options = [...new Set((Array.isArray(f.options) ? f.options : []).flatMap((x) => (typeof x === "string" ? [javaTrim(x).slice(0, MAX_TEXT)] : [])).filter((x) => x !== ""))].slice(0, MAX_OPTIONS);
    return [{ name, label: s(f.label, 120) || name, kind, required: f.required === true, options, placeholder: s(f.placeholder, 120) }];
  }).slice(0, MAX_FIELDS);
  return {
    id, fields, submit: s(o.submit, 60) || "Send", success: s(o.success, 300) || "Thank you. We received your message.",
    mail: o.mail !== false, to: recipients(s(o.to, 2000)), subject: s(o.subject, 150),
    redirect: safeUrl(s(o.redirect, 400), true), webhook: safeUrl(s(o.webhook, 400), false),
  };
}
