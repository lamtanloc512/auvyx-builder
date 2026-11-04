/**
 * Forms a visitor fills in (the Scala `Forms`): one `auvyx/form` element whose comment holds its definition, and the HTML
 * the canvas shows for it. What the agent's `form` op makes.
 */
import { el, type El } from "../model";
import { escapeAttr, escapeComment, escapeText } from "../markup";
import { writeJson } from "../elementJson";
import { javaTrim } from "../json";

export const BLOCK_NAME = "auvyx/form";
export const KINDS: readonly [string, string][] = [
  ["text", "Text"], ["email", "Email"], ["tel", "Phone"], ["number", "Number"], ["date", "Date"], ["textarea", "Long text"],
  ["select", "Choice"], ["radio", "Choice buttons"], ["checkbox", "Checkbox"], ["url", "Web address"],
];
export const MAX_FIELDS = 30, MAX_TEXT = 300, MAX_LONG = 5000, MAX_OPTIONS = 30;

export interface Field { name: string; label: string; kind: string; required: boolean; options: string[]; placeholder: string }
export interface Form { id: string; fields: Field[]; submit: string; success: string; mail: boolean; to: string; subject: string; redirect: string; webhook: string }

const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,253}\.[^\s@<>"']{2,}$/;

export const recipients = (to: string) =>
  [...new Set(to.split(/[,;\s]+/).map(javaTrim).filter((a) => a !== "" && a.length <= 320 && EMAIL.test(a)))].slice(0, 5).join(", ");

export function safeUrl(url: string, allowPath: boolean): string {
  const u = javaTrim(url);
  const ok = u.length <= 300 && ![...u].some((c) => /\s/.test(c) || c === '"' || c === "'" || c === "<" || c === ">" || c === "\\" || c < " ") &&
    (/^https?:\/\/[^/?#]+[\s\S]*$/i.test(u) || (allowPath && u.startsWith("/") && !u.startsWith("//")));
  return ok ? u : "";
}

/** A field name from its label: `Your e-mail` → `your_e_mail`, made unique among `taken`. */
export function nameFor(label: string, taken: Set<string>): string {
  const base0 = [...label.toLowerCase()].map((c) => ((c >= "a" && c <= "z") || (c >= "0" && c <= "9") ? c : "_")).join("")
    .replace(/_+/g, "_").replace(/^_/, "").replace(/_$/, "").slice(0, 30);
  const base = base0 === "" || !/^\p{L}/u.test(base0) ? `field_${base0}`.slice(0, 30).replace(/_$/, "") : base0;
  for (let n = 1; ; n++) { const k = n === 1 ? base : `${base}_${n}`; if (!taken.has(k)) return k; }
}

export const field = (name: string, label: string, kind = "text", required = false, options: string[] = [], placeholder = ""): Field =>
  ({ name, label, kind, required, options, placeholder });

/** A contact form to start from. */
export const starter = (id: string): Form => ({
  id, fields: [field("name", "Your name", "text", true), field("email", "Email", "email", true), field("message", "Message", "textarea", true)],
  submit: "Send", success: "Thank you. We received your message.", mail: true, to: "", subject: "", redirect: "", webhook: "",
});

/** The element's comment for a definition. */
export function markup(form: Form): string {
  const json: Record<string, unknown> = {
    id: form.id,
    fields: form.fields.map((f) => {
      const o: Record<string, unknown> = { name: f.name, label: f.label, kind: f.kind };
      if (f.required) o.required = true;
      if (f.options.length) o.options = [...f.options];
      if (f.placeholder) o.placeholder = f.placeholder;
      return o;
    }),
    submit: form.submit,
    success: form.success,
  };
  if (!form.mail) json.mail = false;
  for (const [k, v] of [["to", recipients(form.to)], ["subject", javaTrim(form.subject).slice(0, 150)], ["redirect", safeUrl(form.redirect, true)], ["webhook", safeUrl(form.webhook, false)]] as const)
    if (v) json[k] = v;
  return `<!-- wp:${BLOCK_NAME} ${escapeComment(writeJson(json))} /-->`;
}

const text = (t: string) => escapeText(t).replace(/\[/g, "&#91;").replace(/\$/g, "&#36;");
const attr = (t: string) => escapeAttr(t).replace(/\[/g, "&#91;").replace(/\$/g, "&#36;");

/** The form's HTML on the canvas (Forms.Preview: it goes nowhere, its button disabled). */
export function html(form: Form, action = "#", preview = true, hidden: [string, string][] = []): string {
  const id = attr(form.id);
  const fields = form.fields.map((f) => {
    const fid = `auvyx-${id}-${attr(f.name)}`;
    const req = f.required ? " required" : "";
    const star = f.required ? '<span class="auvyx-form__req" aria-hidden="true">*</span>' : "";
    const label = `<label class="auvyx-form__label" for="${fid}">${text(f.label)}${star}</label>`;
    const ph = f.placeholder ? ` placeholder="${attr(f.placeholder)}"` : "";
    let control: string;
    switch (f.kind) {
      case "textarea": control = `<textarea class="auvyx-form__control" id="${fid}" name="${attr(f.name)}" rows="5" maxlength="${MAX_LONG}"${ph}${req}></textarea>`; break;
      case "select": control = `<select class="auvyx-form__control" id="${fid}" name="${attr(f.name)}"${req}>${['<option value="">—</option>', ...f.options.map((o) => `<option value="${attr(o)}">${text(o)}</option>`)].join("")}</select>`; break;
      case "radio": control = f.options.map((o, i) => `<label class="auvyx-form__choice"><input class="auvyx-form__check" type="radio" id="${fid}-${i}" name="${attr(f.name)}" value="${attr(o)}"${req}> ${text(o)}</label>`).join(""); break;
      case "checkbox": control = `<input class="auvyx-form__check" type="checkbox" id="${fid}" name="${attr(f.name)}" value="yes"${req}>`; break;
      default: control = `<input class="auvyx-form__control" type="${f.kind}" id="${fid}" name="${attr(f.name)}" maxlength="${MAX_TEXT}"${ph}${req}>`;
    }
    if (f.kind === "checkbox") return `<div class="auvyx-form__field auvyx-form__field--check">${control}${label}</div>`;
    if (f.kind === "radio") return `<fieldset class="auvyx-form__field auvyx-form__field--choices"><legend class="auvyx-form__label">${text(f.label)}${star}</legend>${control}</fieldset>`;
    return `<div class="auvyx-form__field">${label}${control}</div>`;
  }).join("");
  const hid = [...hidden.filter(([k]) => k !== "_auvyx_form"), ["_auvyx_form", form.id]].map(([k, v]) => `<input type="hidden" name="${attr(k!)}" value="${attr(v!)}">`).join("");
  const trap = '<div class="auvyx-form__trap" aria-hidden="true"><label>Leave this empty<input type="text" name="_auvyx_hp" tabindex="-1" autocomplete="off"></label></div>';
  const disabled = preview ? " disabled" : "";
  return `<form class="auvyx-form" id="auvyx-form-${id}" action="${attr(action)}" method="post" accept-charset="UTF-8">` +
    `<p class="auvyx-form__sent" id="auvyx-form-${id}-sent" role="status">${text(form.success)}</p>` +
    `<p class="auvyx-form__error" id="auvyx-form-${id}-error" role="alert">Your message could not be sent. Check the fields and try again.</p>` +
    `${fields}${trap}${hid}<button class="auvyx-form__submit" type="submit"${disabled}>${text(form.submit)}</button></form>`;
}

export const element = (id: string, form: Form): El => el(id, "Raw", { blockName: BLOCK_NAME, raw: markup(form), html: html(form) });
