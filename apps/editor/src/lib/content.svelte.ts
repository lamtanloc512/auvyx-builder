/**
 * The site's content types and entries (U/ContentOps.scala; WpHost.WpContentTypes: auvyx/v1/content-types,
 * Modules/ContentTypes), and the Content types panel's state (U/ContentPanel.scala), kept here so it outlives the panel
 * as the Studio's object-level Vars do. The platform checks everything again.
 */
import * as ContentModel from "../../../../packages/editor-core/src/contentModel";
import { slugify } from "../../../../packages/editor-core/src/siteTemplate";
import { config } from "./config";
import { rest } from "./host";
import { toast } from "./toast.svelte";

export type Definition = ContentModel.Definition;

/** An entry: its post fields and its own fields' values (host-api Entry). */
export interface Entry {
  id: string; title: string; status: string; content: string; excerpt: string; image: string;
  values: Record<string, unknown>; terms: Record<string, string[]>; url: string; editUrl: string;
}
export interface EntryPage { items: Entry[]; total: number; pages: number }

/** ContentOps.available: the site lets this user use content types. */
export const available = (): boolean => !!config.contentTypes && !!config.restRoot;

const enc = encodeURIComponent;
const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(Math.trunc(v)) : "");

/** Entry.fromJson. */
export function entryOf(v: unknown): Entry {
  const o = (v ?? {}) as Record<string, unknown>;
  const obj = (x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
  return {
    id: s(o.id), title: s(o.title), status: s(o.status) || "publish", content: s(o.content), excerpt: s(o.excerpt), image: s(o.image),
    values: obj(o.values),
    terms: Object.fromEntries(Object.entries(obj(o.terms)).map(([k, x]) => [k, Array.isArray(x) ? x.filter((t): t is string => typeof t === "string") : []])),
    url: s(o.url), editUrl: s(o.editUrl),
  };
}

/** Entry.toJson. */
export const entryJson = (e: Entry) => ({ id: e.id, title: e.title, status: e.status, content: e.content, excerpt: e.excerpt, image: e.image, values: e.values, terms: e.terms });

/** The site's answer as a definition, checked like WpContentTypes.definitionOf. */
function definitionOf(d: { definition?: unknown }): Definition {
  const r = ContentModel.validate(d.definition);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.value;
}

export const store = {
  definition: () => rest<{ definition?: unknown }>("auvyx/v1/content-types").then((r) => definitionOf(r.data)),
  save: (d: Definition) => rest<{ definition?: unknown }>("auvyx/v1/content-types", { method: "POST", body: JSON.stringify({ definition: ContentModel.toJson(d) }) }).then((r) => definitionOf(r.data)),
  entries: (typeKey: string, search = "", page = 1) =>
    rest<{ items?: unknown[]; total?: number; pages?: number }>(`auvyx/v1/content-types/${enc(typeKey)}/entries?search=${enc(search)}&page=${page}`)
      .then(({ data }): EntryPage => ({ items: (data.items ?? []).map(entryOf), total: Math.trunc(data.total ?? 0), pages: Math.trunc(data.pages ?? 1) })),
  entry: (typeKey: string, id: string) => rest(`auvyx/v1/content-types/${enc(typeKey)}/entries/${enc(id)}`).then((r) => entryOf(r.data)),
  saveEntry: (typeKey: string, e: Entry) =>
    rest(e.id ? `auvyx/v1/content-types/${enc(typeKey)}/entries/${enc(e.id)}` : `auvyx/v1/content-types/${enc(typeKey)}/entries`, { method: "POST", body: JSON.stringify(entryJson(e)) }).then((r) => entryOf(r.data)),
  removeEntry: (typeKey: string, id: string) => rest(`auvyx/v1/content-types/${enc(typeKey)}/entries/${enc(id)}?_method=DELETE`, { method: "POST", body: "{}" }).then(() => undefined),
};

/** ContentOps.definition: the site's definition as last read or saved in this tab (its fields bind at once). */
class Content { definition = $state.raw<Definition>(ContentModel.emptyDefinition); }
export const content = new Content();

let started = false;
/** ContentOps.init: reads the definition once the editor opens. */
export function init() {
  if (started || !available()) return;
  started = true;
  store.definition().then((d) => (content.definition = d), () => undefined);
}

/** Binding fields of the site's content types (`<type>/<field>`), besides those the platform listed at boot. */
export function fields(): ContentModel.DataField[] {
  const known = new Set(((config as unknown as { data?: { fields?: { key: string }[] } }).data?.fields ?? []).map((f) => f.key));
  return content.definition.types.flatMap(ContentModel.bindings).filter((f) => !known.has(f.key));
}

/** ContentOps.isField. */
export const isContentField = (key: string, extra?: Definition): boolean =>
  [...content.definition.types, ...(extra?.types ?? [])].some((t) => ContentModel.bindings(t).some((b) => b.key === key));

// ---- the panel (ContentPanel's Vars) ---------------------------------------------------------

class Panel {
  saved = $state.raw<Definition | null>(null);
  draft = $state.raw<Definition>(ContentModel.emptyDefinition);
  open = $state<string | null>(null);
  problems = $state.raw<string[]>([]);
  busy = $state(false);
  entries = $state.raw<Entry[]>([]);
  loadedOnce = false;
}
export const panel = new Panel();

/** Scala's structural equality of two definitions. */
export const same = (a: Definition | null, b: Definition) => !!a && JSON.stringify(ContentModel.toJson(a)) === JSON.stringify(ContentModel.toJson(b));

// ---- the panel's edits (ContentPanel's private functions) -------------------------------------



export function loadPanel() {
  if (!available()) return;
  panel.busy = true;
  store.definition().then(
    (d) => { panel.busy = false; panel.saved = d; panel.draft = d; },
    (e: Error) => { panel.busy = false; panel.problems = [e.message]; },
  );
}

export function loadEntries(key: string) {
  panel.entries = [];
  if (!available()) return;
  store.entries(key).then((p) => { if (panel.open === key) panel.entries = p.items; }, () => undefined);
}

export function updateType(key: string, f: (t: ContentModel.ContentType) => ContentModel.ContentType) {
  panel.draft = { ...panel.draft, types: panel.draft.types.map((t) => (t.key === key ? f(t) : t)) };
}

export function savePanel() {
  const checked = ContentModel.validate(ContentModel.toJson(panel.draft));
  if (!checked.ok) { panel.problems = checked.errors; return; }
  if (!available()) return;
  panel.busy = true;
  store.save(checked.value).then(
    (kept) => {
      panel.busy = false;
      panel.saved = kept; panel.draft = kept; panel.problems = [];
      content.definition = kept;
      toast("Content types saved");
    },
    (e: Error) => { panel.busy = false; panel.problems = e.message.split("; "); },
  );
}

/** A key from a label: `New field` → `new_field`, unique among `taken`. */
export function keyFrom(text: string, taken: Set<string>, max: number): string {
  const strip = (x: string) => (x.endsWith("_") ? x.slice(0, -1) : x);
  const base0 = strip(slugify(text).replace(/-/g, "_").slice(0, max));
  const base = base0 === "" || !/\p{L}/u.test(base0[0]!) ? strip(`item_${base0}`.slice(0, max)) : base0;
  for (let n = 1; ; n++) {
    const k = n === 1 ? base : `${base.slice(0, max - 3)}_${n}`;
    if (!taken.has(k)) return k;
  }
}

export function newType() {
  const d = panel.draft;
  const key = keyFrom("entries", new Set([...d.types.map((t) => t.key), ...ContentModel.RESERVED_TYPES]), 20);
  const t = ContentModel.contentType(key, "New type", "New entry", key.replace(/_/g, "-"), { fields: [ContentModel.field("summary", "Summary", "textarea")] });
  panel.draft = { ...d, types: [...d.types, t] };
  panel.open = key;
}
