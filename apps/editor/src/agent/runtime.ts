/**
 * The Studio agent's runtime (ADR 0039): pi's Agent with Studio's tools, talking to the model through the host's
 * gateway. Nothing here knows the platform: the host gives an endpoint (a URL that forwards the provider's own API,
 * plus the headers that authenticate the Studio to it) and the bridge gives the tools (Auvyx Editor: lib/agentBridge.svelte.ts;
 * Auvyx Studio: AgentTools.scala). Copied from apps/studio/packages/ui/src/agent: keep the two in step.
 *
 *   const run = window.auvyxAgent.create(bridge, savedMessages)
 *   run.subscribe(event => …); await run.prompt("Add a FAQ"); run.messages()
 */
import { Agent } from "@earendil-works/pi-agent-core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { streamSimple as anthropicMessages } from "@earendil-works/pi-ai/api/anthropic-messages";
import { streamSimple as openaiCompletions } from "@earendil-works/pi-ai/api/openai-completions";
import { createModels } from "@earendil-works/pi-ai/models";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { jsonrepair } from "jsonrepair";
import { Type } from "typebox";
import { builtInSkills, type SkillSource, skillText } from "./skills";
import { audit, check } from "./check";
import { actionTools, editTools, touchedIds, filterLegacy } from "./actions";
import type { ActionAnswer, ActionSpec, Change } from "./actions";
import { LIMITS, NUDGE, Run, REVIEWER_PROMPT, adopt, forStorage, parseReview, pruneImages, stopNote, thinkingAfterCutOffs, triage, runNotes, unflatten, guessInput, withView, withoutView, liveView } from "./harness";
import type { Review } from "./harness";
import { frames, look, sectionOf } from "./look";
import type { Shot } from "./look";

/** What the host and Studio give the runtime (AgentTools.scala). */
export interface Bridge {
  /** Page-level sections in the open document (0: a new page, built signature first). */
  sections?(): number;
  /** Optional compatibility filter. Ezy keeps false so its existing daily-use tools remain available. */
  registryOnly?(): boolean;
  endpoint: { api: string; provider: string; model: string; baseUrl: string; headers: Record<string, string>; reasoning: string; vision?: string };
  /** Where the platform keeps the pictures of this run (and takes them away); absent when it has no such place. */
  shots?: {
    keep(data: string, label: string): Promise<{ id: string; url: string } | null>;
    discard(ids: string[]): Promise<void>;
    sweep(minutes: number): Promise<number>;
  };
  /** This request's limits (the panel's effort): tool calls and dollars. */
  limits?(): { toolCalls: number; costUsd: number };
  systemPrompt(): string;
  editSpec(): string;
  readPage(id: string): string;
  /** The registry's actions as tools (shared AgentCall.specs): document edits, the header and footer builders. */
  actionSpecs(): ActionSpec[];
  /** Runs one action with the Studio's context and commits its document once (one Undo). */
  callAction(name: string, json: string, cancelled?: () => boolean): Promise<ActionAnswer>;
  /** What the user is looking at, as a `<view>` block sent with every message (shared AgentView). */
  view?(): string;
  /** What code elements printed on the canvas (console.log/warn/error) and their uncaught errors; one element or all. */
  console?(id: string): string;
  catalog(kind: string, query: string): Promise<string> | string;
  /** A public page as text (title, description, headings, links, body) for the `read_url` tool; absent where the platform cannot. */
  readUrl?(url: string): Promise<string>;
  /** Copies a picture into this site's Media Library and gives its local address; absent where the platform cannot. */
  importImage?(url: string, alt?: string): Promise<string>;
  edit(json: string): Promise<{ ok: boolean; text: string; added: string[] }>;
  /** The site's look as a DESIGN.md, applied to every page and the theme; absent where the platform cannot. */
  design?(markdown: string): Promise<{ ok: boolean; text: string }>;
  /** Changes single tokens of the site's DESIGN.md ({"colors.primary": "#hex"}); absent where `design` is. */
  tokens?(json: string): Promise<{ ok: boolean; text: string }>;
  /** The site's own content types and entries (get, set, entries, entry, save_entry, delete_entry); absent where the platform cannot. */
  content?(action: string, json: string): Promise<{ ok: boolean; text: string }>;
  /** Site templates (whole sites as auvyx-site/2 JSON): list, get, save, capture, delete, apply; absent where the platform or user cannot. */
  siteTemplate?(action: string, json: string): Promise<{ ok: boolean; text: string }>;
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- the model, reached through the gateway ----

// biome-ignore lint/suspicious/noExplicitAny: pi's Model is generic over its API.
function resolveModel(e: Bridge["endpoint"]): any {
  const models = createModels();
  models.setProvider(openrouterProvider());
  models.setProvider(openaiProvider());
  models.setProvider(anthropicProvider());
  // The catalog knows the model's limits, reasoning levels and quirks; the gateway decides where requests go.
  const known = models.getModel(e.provider as never, e.model as never) as Record<string, unknown> | undefined;
  const base = known ?? {
    id: e.model,
    name: e.model,
    provider: e.provider,
    reasoning: e.reasoning !== "off",
    input: guessInput(e.model), // otherwise a new Claude or GPT through a router would build blind (no pictures, no reviewer)
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    // The gateways cap answers at 32k; a model the catalog does not know gets all of it (thinking shares this room).
    maxTokens: 32000,
  };
  // The setting decides for a model the catalog does not know (or knows wrongly): pi-ai drops pictures a model is not listed as reading.
  const input = e.vision === "on" ? ["text", "image"] : e.vision === "off" ? ["text"] : base.input;
  return { ...base, input, api: e.api, baseUrl: e.baseUrl.replace(/\/$/, ""), headers: { ...((base.headers as Record<string, string>) ?? {}), ...e.headers } };
}

/** pi's stream function for the gateway: the provider API module itself, without provider auth (the gateway has the key). */
// biome-ignore lint/suspicious/noExplicitAny: forwarded as pi gives them.
const streamFn = (model: any, context: any, options: any) =>
  (model.api === "anthropic-messages" ? anthropicMessages : openaiCompletions)(model, context, { ...options, apiKey: "gateway" });

// ---- tool arguments ----

/** Some models send ops (or each op, or an element) as JSON strings, even twice encoded, with miscounted brackets. */
function decode(v: unknown, depth = 0): unknown {
  if (typeof v === "string" && depth < 3 && /^\s*[[{]/.test(v)) {
    try {
      return decode(JSON.parse(v), depth + 1);
    } catch {}
    try {
      return decode(JSON.parse(jsonrepair(v)), depth + 1);
    } catch (e) {
      const at = Number(String(e).match(/position (\d+)/)?.[1] ?? -1);
      const near = at >= 0 ? ` near …${v.slice(Math.max(0, at - 80), at)}⟨here⟩${v.slice(at, at + 20)}…` : "";
      throw new Error(`The ops are not valid JSON${near}. Send "ops" as a JSON array, not a string, and keep one edit call to one section.`);
    }
  }
  if (Array.isArray(v)) return v.map((x) => decode(x, depth));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "text" || k === "css" ? x : decode(x, depth)]));
  return v;
}

// ---- tools ----

/** What the tools need from the run they belong to. */
interface Ctx {
  run: Run;
  /** the model reads pictures, and the host can keep them */
  sees: boolean;
  /** the reviewer's verdict on a picture */
  review(shot: Shot, issues: string[]): Promise<Review | undefined>;
  /** true once the user pressed Stop: no new picture, review or extra work is started */
  stopped(): boolean;
}

type Content = ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];

/** A picture of `id` (or the page) for the model: kept for the run, judged by the reviewer, with a note on the verdict. */
async function picture(b: Bridge, c: Ctx, id: string, issues: string[], over?: { count: number; every: number }): Promise<{ content: Content; details: Record<string, unknown> } | { error: string }> {
  // Stop ends the work: no new picture, no reviewer call that would keep the panel busy.
  if (c.stopped()) return { error: "the request was stopped" };
  // a picture never holds the tool up: a game still starting (or broken mid-write) can keep its frame from answering
  const timeout = new Promise<{ error: string }>((r) => setTimeout(() => r({ error: "the picture took too long (a game or script still starting?)" }), 20000));
  const shot = await Promise.race([over ? frames(id, over.count, over.every) : look(id), timeout]);
  if ("error" in shot) return { error: shot.error };
  if (c.stopped()) return { error: "the request was stopped" };
  c.run.looks++;
  const stored = await b.shots?.keep(shot.data, shot.label).catch(() => null);
  if (stored) c.run.shotIds.push(stored.id);
  const review = await c.review(shot, issues);
  c.run.review = review;
  const verdict = review ? (review.pass ? "Review of the picture: PASS." : `Review of the picture: FIX\n- ${review.problems.join("\n- ")}`) : "";
  return {
    content: [
      { type: "text", text: `Picture of ${shot.label} (${shot.width}×${shot.height}).${verdict ? `\n${verdict}` : ""}` },
      { type: "image", data: shot.data, mimeType: shot.mimeType },
    ],
    details: { thumb: shot.thumb, picture: stored?.url ?? "", pass: review?.pass ?? null },
  };
}

/** Where the agent's skills come from: Auvyx's own (shared/skills, built in). */
const skills: SkillSource = builtInSkills();

function tools(b: Bridge, c: Ctx) {
  const run = c.run;
  /** Applies a change (edit and write_code ops, or an action) and answers with the report: what was applied, the check, a picture when the model sees. */
  const applyChange: Change = async (touched, apply) => {
        // Stop is checked between edits: the edit already running is waited for (the page and the agent never disagree), the next one is not started.
        if (c.stopped()) return text("Stopped by the user: no more edits.");
        const result = await apply();
        if (result.canvas === false) {
          if (!result.ok) throw new Error(result.text);
          run.edits++;
          return text(result.text); // native component target: the page canvas did not change; never measure/picture it as evidence
        }
        run.startEdit(touched); // a fix of the last part is another round on it; anything else starts a new part
        await sleep(1200); // server-rendered blocks and fonts settle before the check
        const ids = [...result.added, ...touched];
        const issues = check(ids);
        const { hard, soft } = triage(issues, c.run.request);
        const report =
          `${result.text}\nCheck: ${hard.length ? `\n- ${hard.slice(0, 15).join("\n- ")}` : "no problems found."}` +
          (soft.length ? `\nAdvisory (small things; fix them only if you are changing this part anyway):\n- ${soft.slice(0, 8).join("\n- ")}` : "");
        if (!result.ok) throw new Error(report);
        run.edits++;
        run.finishEdit(ids);
        run.issues = hard;
        run.review = undefined;
        if (!c.sees) return text(report);
        const seen = await picture(b, c, sectionOf(ids), issues);
        if ("error" in seen) return text(`${report}\n(No picture: ${seen.error})`);
        const [note, image] = seen.content;
        return { content: [{ type: "text" as const, text: `${report}\n${note.type === "text" ? note.text : ""}` }, image], details: seen.details };
  };
  const applyOps = (ops: { id?: unknown }[]) =>
    applyChange(ops.map((o) => (typeof o.id === "string" ? o.id : "")).filter(Boolean), () => b.edit(JSON.stringify({ message: "", ops: ops })));
  // The registry's actions (read_page, set_style, …, header_*, footer_*): the tools the Studio's own panels call.
  const specs = b.actionSpecs();
  // A link the user points at (read_url), when the platform can fetch one.
  const readLink = b.readUrl;
  const importPicture = b.importImage;
  const actions = actionTools(specs, async (name, json) => {
    if (c.stopped()) throw new Error("Stopped before the action");
    return b.callAction(name, json, c.stopped);
  }, applyChange, decode);
  return filterLegacy([
    ...actions,
    ...(readLink
      ? [
          {
            name: "read_url",
            label: "Read a link",
            description:
              "Read a public web page: its title, description, headings, links, pictures and text. Call it whenever the user gives an address or asks for a site's content — the page is the source, never its name. If it cannot be read, say so and build only from what you have.",
            parameters: Type.Object({ url: Type.String({ description: "The page's address (http or https)" }) }),
            execute: async (_: string, p: { url: string }) => text(await readLink(p.url)),
          },
        ]
      : []),
    ...(importPicture
      ? [
          {
            name: "import_image",
            label: "Import a picture",
            description:
              "Copy a picture from a web page into this site's Media Library and get its address here. Use it for the pictures read_url lists (hero, gallery, product, cover) instead of hotlinking or a placeholder; then set that address as the element's src.",
            parameters: Type.Object({
              url: Type.String({ description: "The picture's absolute http(s) address" }),
              alt: Type.Optional(Type.String({ description: "What it shows (the page's alt text)" })),
            }),
            execute: async (_: string, p: { url: string; alt?: string }) => text(await importPicture(p.url, p.alt ?? "")),
          },
        ]
      : []),
    {
      name: "catalog",
      label: "Look up",
      description: "Look up what the site offers. One kind per call, optional words to filter.",
      parameters: Type.Object({
        kind: Type.String({ description: "site (read first for headers, footers, menus, components, forms, links) | interactions (ready hover/focus/press recipes) | theme | products | data (REST/GraphQL sources for loops) | blocks | kits | patterns | library | forms | fields | content | links | menus | templates" }),
        query: Type.Optional(Type.String()),
      }),
      execute: async (_: string, p: { kind: string; query?: string }) => text(await b.catalog(p.kind, p.query ?? "")),
    },
    {
      name: "edit",
      label: "Edit",
      description: `Apply operations to the document, for what the action tools (set_style, update_element, insert_elements, move_element, remove_elements, duplicate_element, header_*, footer_*) do not cover. Never use it on a builder header's or footer's children. "ops" is a JSON array (never a string). Keep one call to one section; build a page in several calls. Returns what was applied, the new element ids and a check of the result (contrast, overflow, placeholder pictures, fixed colors): fix what it lists.
For "insert", prefer a FLAT list instead of a nested "element": "elements": [{"ref": "s", "kind": "box", "tag": "section", "align": "full", "styles": {…}}, {"ref": "t", "in": "s", "kind": "heading", "level": 2, "text": "…"}, {"in": "s", "kind": "text", "text": "…"}] — "in" is the ref of the parent in the same list, the first element without "in" is the inserted one.

${b.editSpec()}`,
      parameters: Type.Object({ ops: Type.Array(Type.Object({ op: Type.String() }, { additionalProperties: true })) }),
      prepareArguments: (args: unknown) => {
        const a = decode(args ?? {}) as { ops?: unknown };
        const ops = a.ops && !Array.isArray(a.ops) && typeof a.ops === "object" ? [a.ops] : a.ops;
        return { ...a, ops: Array.isArray(ops) ? adopt(ops).map(unflatten) : ops } as never;
      },
      execute: async (_: string, p: { ops: { id?: unknown }[] }) => applyOps(p.ops),
    },
    {
      name: "write_code",
      label: "Write code",
      description:
        "Write the source of a game or code element as plain text (nothing to escape): its js, html or css. Code goes here, never inside edit's JSON: make the element with edit (kind, title, libs, styles, no html/css/js), then write each part here. mode replace (default) sets the whole part; append adds to its end (write a long js in pieces of up to ~150 lines, each call one piece, in order); patch replaces the exact text in find (copied from the current source, unique) with code. Returns the same report as edit.",
      parameters: Type.Object({
        id: Type.String({ description: "The game or code element's id" }),
        part: Type.Union([Type.Literal("js"), Type.Literal("html"), Type.Literal("css")]),
        mode: Type.Optional(Type.Union([Type.Literal("replace"), Type.Literal("append"), Type.Literal("patch")])),
        find: Type.Optional(Type.String({ description: "patch: the exact current text to replace" })),
        code: Type.String({ description: "The code, as plain text" }),
      }),
      execute: async (_: string, p: { id: string; part: "js" | "html" | "css"; mode?: string; find?: string; code: string }) => {
        // the code's element: a game or code element, or the only one inside the section named
        type El = { id?: string; kind?: string; children?: El[] };
        let el: El | undefined;
        try {
          el = JSON.parse(b.readPage(p.id)) as El;
        } catch {
          throw new Error(`${p.id} is not an element on the page (read_page for the ids).`);
        }
        const isCode = (e: El) => e.kind === "game" || e.kind === "code";
        const inside = (e: El): El[] => (e.children ?? []).flatMap((c) => (isCode(c) ? [c] : inside(c)));
        const found = el && isCode(el) ? [el] : el ? inside(el) : [];
        if (found.length !== 1 || !found[0]?.id)
          throw new Error(
            found.length
              ? `${p.id} holds several game or code elements (${found.map((f) => f.id).join(", ")}): name one.`
              : `${p.id} is a ${el?.kind ?? "element"}, not a game or code element. Make one first with edit (insert {"kind": "game", "title": "…", "libs": […]} without html/css/js), then write its code here with the new element's id.`,
          );
        const id = found[0].id;
        const note = id === p.id ? "" : `(Written to ${id}, the ${found[0].kind} element inside ${p.id}: use ${id} next time.)\n`;
        const mode = p.mode ?? "replace";
        const op =
          mode === "append"
            ? { op: "patch", id, part: p.part, append: p.code }
            : mode === "patch"
              ? { op: "patch", id, part: p.part, edits: [{ find: p.find ?? "", replace: p.code }] }
              : { op: "update", id, [p.part]: p.code };
        const out = await applyOps([op]);
        if (note && "content" in out && out.content[0]?.type === "text") out.content[0] = { type: "text", text: note + out.content[0].text };
        return out;
      },
    },
    ...(b.design
      ? [
          {
            name: "design",
            label: "Change the site's look",
            description: `Give the WHOLE site a new look (every page, the header, footer, buttons and store screens) for a different style, brand, mood, colors, fonts or corners, not for one section. Load the skill craft-system first. Send a system as JSON, {"name", "concept": {"idea", "signature", "palette", "voice", "habit"?}, "color": {"ground", "primary", "accent"?, "groundDark"?}, "type": {"display": {"family", "weight", "tracking"}, "body": {"family"}, "base", "ratio"}, "space": {"density"}, "shape": {"radius"}, "depth"}, from which every value is derived with contrast by construction; or a DESIGN.md whose front matter carries the same concept block (then name, colors, typography, rounded). A thin concept, or cream or near-white with a soft serif without concept.habit, is refused. Afterwards, describe the new look in one sentence; the canvas reloads to show it.`,
            parameters: Type.Object({ markdown: Type.String({ description: "The system as JSON, or a DESIGN.md (front matter with concept, then a little prose)" }) }),
            execute: async (_: string, p: { markdown: string }) => {
              const result = await b.design!(p.markdown);
              if (!result.ok) throw new Error(result.text);
              return text(result.text);
            },
          },
        ]
      : []),
    ...(b.tokens
      ? [
          {
            name: "tokens",
            label: "Change site tokens",
            description: `Change single design tokens of the WHOLE site's DESIGN.md (catalog theme shows it), keeping everything else: a brand color, the corners, a font. Prefer it to the design tool when only a few values change. Paths: colors.primary, colors.on-primary, colors.background, colors.surface, colors.on-background, colors.on-surface-variant, colors.outline-variant, colors.secondary (dark bands), colors.on-secondary, colors.tertiary (accents, sale), colors.error, rounded.sm|md|lg|xl, typography.headline-lg.fontFamily, typography.body-md.fontFamily (also fontSize, fontWeight, lineHeight). Colors may be hex, rgb(), hsl() or oklch(); they are stored as hex.`,
            parameters: Type.Object({
              set: Type.Record(Type.String(), Type.String(), { description: 'Token path → value, e.g. {"colors.primary": "#0f766e", "rounded.md": "12px"}' }),
            }),
            execute: async (_: string, p: { set: Record<string, string> }) => {
              const result = await b.tokens!(JSON.stringify(p.set ?? {}));
              if (!result.ok) throw new Error(result.text);
              return text(result.text);
            },
          },
        ]
      : []),
    ...(b.content
      ? [
          {
            name: "content",
            label: "Content types",
            description: `The site's own kinds of content (Properties, Courses, Rooms, Team members…) with typed fields, and their entries. Use it when the site needs structured data that pages list and show: add a type, then build pages whose loops list it and whose elements bind its fields (<type>/<field>, see catalog fields). Never fake structured data as static text.
Actions (json in brackets):
- get {}: the definition and how to bind it.
- set {"types":[…],"taxonomies":[…],"remove":["key"]}: types and taxonomies are added or replaced by key; the rest stays. A type: {"key":"property","label":"Properties","singular":"Property","slug":"properties","fields":[…]}. A field: {"key":"price","label":"Price","type":"money","required":true}; types: text, textarea, number, money, date, time, datetime, select (options, multiple), checkbox, url, email, phone, color, image, gallery, file, relation (to: a type key, multiple), repeater (fields: sub-fields). A taxonomy: {"key":"district","label":"Districts","types":["property"]}. Every error is listed; fix them all and send again.
- entries {"type","search","page"}, entry {"type","id"}, save_entry {"type","entry":{"id"?:…, "title","status":"publish|draft","excerpt","values":{field: value},"terms":{tax:["name"]}}}, delete_entry {"type","id"}.
Values: numbers as numbers, yes/no as true/false, dates YYYY-MM-DD, times HH:MM, choices as one of the options, pictures/files/links to entries as ids.`,
            parameters: Type.Object({
              action: Type.String({ description: "get | set | entries | entry | save_entry | delete_entry" }),
              json: Type.Optional(Type.String({ description: "The action's JSON (see the description)" })),
            }),
            execute: async (_: string, p: { action: string; json?: string }) => {
              const result = await b.content!(p.action, p.json ?? "");
              if (!result.ok) throw new Error(result.text);
              return text(result.text);
            },
          },
        ]
      : []),
    ...(b.siteTemplate
      ? [
          {
            name: "site_template",
            label: "Site templates",
            description: `Site templates: a WHOLE site (design brief, header, footer, menus, pages, front page) in one JSON file that installs on any Auvyx site. Use it when the user asks to list, look at, create, change, delete or apply a site template / demo / starter site, or to save this site as one.
actions:
- list: the site's and the built-in templates.
- get {"id"}: one template's JSON (read it before changing it).
- save {template}: creates or replaces a template; send the WHOLE template (to change one, get it, edit, save). Problems are listed; fix them all and save again.
- capture {"id", "title", "description"}: saves THIS site (its pages, menus, header, footer, design brief) as a template.
- delete {"id"}: the site's own templates only.
- apply {"id"}: builds the template on this site (new pages and menus, replaces the header, footer and front page, applies the brief). Only when the user asks for it.
Template shape (auvyx-site/2; auvyx-site/1 is the same without content and entries):
{"schema": "auvyx-site/2", "id": "my-shop", "title": "...", "description": "...", "design": {"brief": "<DESIGN.md, like the design tool's>"},
 "parts": {"header": [<element trees>], "footer": [<element trees>]},
 "menus": [{"key": "main", "title": "Main menu", "items": [{"label": "Home", "page": "home"}, {"label": "Blog", "url": "/blog/", "children": [...]}]}],
 "pages": [{"key": "home", "title": "Home", "template": "<catalog templates slug, optional>", "front": true, "elements": [<element trees>]}],
 "content": {"types": [...], "taxonomies": [...]}  (the content tool's definition, optional),
 "entries": [{"type": "property", "key": "loft", "title": "...", "excerpt": "...", "image": "<url>", "values": {"price": 320000, "photos": ["<url>"], "agent": "ann"}, "terms": {"district": ["Ba Đình"]}}]}
In entries, pictures and files are addresses and links to other entries are their keys; they are resolved when applied.
Element trees are exactly the edit tool's elements (no ids). A navigation's "menu" may name a template menu by key ("main"); a menu item's "page" names a page key. Keys: lowercase letters, digits, - and _.`,
            parameters: Type.Object({
              action: Type.String({ description: "list | get | save | capture | delete | apply" }),
              template: Type.Optional(Type.Object({}, { additionalProperties: true, description: "save: the whole auvyx-site/2 template" })),
              id: Type.Optional(Type.String()),
              title: Type.Optional(Type.String()),
              description: Type.Optional(Type.String()),
            }),
            prepareArguments: (args: unknown) => decode(args ?? {}) as never,
            execute: async (_: string, p: { action: string; template?: unknown; id?: string; title?: string; description?: string }) => {
              const payload = p.action === "save" ? (p.template ?? {}) : { id: p.id ?? "", title: p.title ?? "", description: p.description ?? "" };
              const result = await b.siteTemplate!(p.action, JSON.stringify(payload));
              if (!result.ok) throw new Error(result.text);
              return text(result.text);
            },
          },
        ]
      : []),
    ...(b.console
      ? [
          {
            name: "console",
            label: "Read the console",
            description:
              "What code elements printed on the canvas (their console.log / warn / error, latest last) and their uncaught errors. Use it to debug a script: print what you need to know, edit, then read the console.",
            parameters: Type.Object({ id: Type.Optional(Type.String({ description: "A code element's id; omit for all" })) }),
            execute: async (_: string, p: { id?: string }) => text(b.console ? b.console(p.id ?? "") : ""),
          },
        ]
      : []),
    {
      name: "skill",
      label: "Load a skill",
      description: `Expert instructions (and sometimes a starter) for one kind of work. Before you start such work, load the skill that fits (and the ones it says to load too), then follow it. Skills:\n${skills
        .list()
        .map((k) => `- ${k.name}: ${k.description}`)
        .join("\n")}`,
      parameters: Type.Object({ name: Type.String({ description: "A skill's name from the list" }) }),
      execute: async (_: string, p: { name: string }) => {
        const found = await skills.load(p.name.trim());
        if (!found) throw new Error(`No skill named ${p.name}. Skills: ${skills.list().map((k) => k.name).join(", ")}`);
        return text(skillText(found));
      },
    },
    {
      name: "play",
      label: "Play-test a game",
      description:
        "Play a game element the way a player would and read what the game exposed (auvyx.expose) after each step, plus a picture at the end when you can see pictures. Use it after you build or change a game, before you answer: start it, move, jump, shoot, and check that the state changes as it should (the player moves, the score rises, lives drop on a hit, the game ends and restarts). Fix what does not, with the console's errors. Steps run in order: {\"key\": \"ArrowRight\", \"ms\": 600} holds a key (KeyboardEvent.key: ArrowLeft, \" \" for Space, Enter, w, a…), {\"tap\": [0.5, 0.8]} taps a point (0..1 across the game), {\"wait\": 500} lets time pass.",
      parameters: Type.Object({
        id: Type.String({ description: "The game element's id" }),
        steps: Type.Array(
          Type.Object(
            {
              key: Type.Optional(Type.String()),
              ms: Type.Optional(Type.Integer({ minimum: 16, maximum: 3000 })),
              tap: Type.Optional(Type.Array(Type.Number(), { minItems: 2, maxItems: 2 })),
              wait: Type.Optional(Type.Integer({ minimum: 16, maximum: 3000 })),
            },
            { additionalProperties: false }
          ),
          { maxItems: 16 }
        ),
      }),
      execute: async (_: string, p: { id: string; steps: { key?: string; ms?: number; tap?: number[]; wait?: number }[] }) => {
        const result = await playTest(p.id, p.steps);
        const errors = b.console ? b.console(p.id) : "";
        const report = `${result.lines.join("\n")}${errors && !/printed nothing/.test(errors) ? `\nConsole:\n${errors.slice(-2500)}` : ""}`;
        if (!result.ok) throw new Error(report);
        if (!c.sees || !result.picture) return text(report);
        const data = result.picture.slice(result.picture.indexOf(",") + 1);
        return {
          content: [{ type: "text" as const, text: `${report}\nThe picture is the game at the end of the steps.` }, { type: "image" as const, data, mimeType: "image/jpeg" }],
          details: {},
        };
      },
    },
    ...(c.sees
      ? [
          {
            name: "look",
            label: "Look at the result",
            description:
              "A picture of the page, or of one element when id is given, as the site shows it, with a reviewer's verdict. edit already returns a picture of the part it changed; use this to see another part or the whole page. With frames (2-4), several pictures of the element over time side by side: to check that an animation moves as meant.",
            parameters: Type.Object({
              id: Type.Optional(Type.String({ description: "Element id; omit for the whole page" })),
              frames: Type.Optional(Type.Integer({ minimum: 2, maximum: 4, description: "Pictures over time (needs id)" })),
              every: Type.Optional(Type.Integer({ minimum: 100, maximum: 3000, description: "Milliseconds between frames (default 500)" })),
            }),
            execute: async (_: string, p: { id?: string; frames?: number; every?: number }) => {
              const over = p.id && p.frames ? { count: Math.min(4, Math.max(2, p.frames)), every: Math.min(3000, Math.max(100, p.every ?? 500)) } : undefined;
              const seen = await picture(b, c, p.id ?? "", check(p.id ? [p.id] : []), over);
              return "error" in seen ? text(seen.error) : seen;
            },
          },
        ]
      : []),
  ], b.registryOnly?.() ?? false);
}

// ---- play-testing (Auvyx Play, GameView) ----

interface GameRun {
  ready: Promise<boolean>;
  state(): Promise<unknown>;
  snapshot(maxWidth?: number): Promise<string | null>;
  press(key: string, ms: number): Promise<void>;
  tap(x: number, y: number): Promise<void>;
}

const stateText = (v: unknown) => {
  const t = JSON.stringify(v);
  return t === undefined ? "nothing exposed" : t.length > 600 ? `${t.slice(0, 600)}…` : t;
};

/** Runs the steps on a game's preview and says what its exposed state was before and after each; at most ~20 s in all. */
export async function playTest(id: string, steps: { key?: string; ms?: number; tap?: number[]; wait?: number }[]): Promise<{ ok: boolean; lines: string[]; picture?: string }> {
  const runOf = (window as unknown as { auvyxPlayRun?: (id: string) => GameRun | undefined }).auvyxPlayRun;
  const run = runOf?.(id);
  if (!run) return { ok: false, lines: [`${id} is not a game running on the canvas (is it a game element? is it stopped?).`] };
  if (!(await run.ready))
    return {
      ok: false,
      lines: [
        "The game's frame did not connect within 8 s. If the console below shows an error, fix that in the game's code. If it shows none, the preview could not load the game's runtime: that is not the game's fault, so do not rewrite the game for it; tell the user the editor could not run the game and that it plays on the published page.",
      ],
    };
  const lines: string[] = [];
  const started = Date.now();
  const state = () => run.state().then(stateText, (e: unknown) => `state failed: ${e instanceof Error ? e.message : String(e)}`);
  lines.push(`start: ${await state()}`);
  if (/nothing exposed|^null$/.test(lines[0] ?? "")) lines.push("(The game exposes no state: call auvyx.expose(() => ({ … })) so play-tests can check it.)");
  for (const [i, step] of steps.slice(0, 16).entries()) {
    if (Date.now() - started > 20000) {
      lines.push("(stopped: the steps took over 20 s)");
      break;
    }
    let what: string;
    if (step.key !== undefined) {
      const ms = Math.min(3000, Math.max(16, step.ms ?? 120));
      await run.press(step.key, ms);
      what = `hold ${step.key === " " ? "Space" : step.key} ${ms} ms`;
    } else if (step.tap && step.tap.length === 2) {
      const [x = 0.5, y = 0.5] = step.tap.map((n) => Math.min(1, Math.max(0, n)));
      await run.tap(x, y);
      what = `tap ${x.toFixed(2)}, ${y.toFixed(2)}`;
    } else {
      const ms = Math.min(3000, Math.max(16, step.wait ?? step.ms ?? 300));
      await new Promise((r) => setTimeout(r, ms));
      what = `wait ${ms} ms`;
    }
    lines.push(`${i + 1}. ${what} → ${await state()}`);
  }
  const picture = (await run.snapshot(800).catch(() => null)) ?? undefined;
  return { ok: true, lines, ...(picture ? { picture } : {}) };
}

// ---- runs ----

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number };


/** Whether the agent looks at pictures: the setting wins; "auto" asks the model's catalog entry. */
function canSee(model: { input?: string[] }, setting: string | undefined): boolean {
  if (setting === "on") return true;
  if (setting === "off") return false;
  return Array.isArray(model.input) && model.input.includes("image");
}

/** A conversation: messages kept between requests, one Agent per request (fresh prompt and tools, same history). */
function create(bridge: Bridge, saved: AgentMessage[] = []) {
  /** The tools that change the document: edit, write_code and every action that edits. */
  const editing = editTools(bridge.actionSpecs?.() ?? []);
  /** A message as the model gets it: the user's words and what the user is looking at. */
  const said = (input: string) => withView(input, bridge.view?.());
  let messages: AgentMessage[] = forStorage(saved.filter((m) => m.role !== "system"));
  let agent: Agent | undefined;
  /** The reviewer talking right now: Stop must end it too, or the panel stays busy on a review nobody wants. */
  let reviewer: Agent | undefined;
  /** The user pressed Stop: every check below ends the request instead of starting more work. */
  let stopped = false;
  const listeners = new Set<(e: unknown) => void>();
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  let lastError = "";
  let lastRun: Run | undefined;
  let lastSees = true;

  const addUsage = (u: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: { total: number } }) => {
    usage.input += u.input;
    usage.output += u.output;
    usage.cacheRead += u.cacheRead;
    usage.cacheWrite += u.cacheWrite;
    usage.cost += u.cost.total;
  };

  /** The reviewer: a fresh conversation (it has not seen the agent's reasoning) that sees the request and the picture. */
  async function review(model: unknown, run: Run, shot: Shot, issues: string[]): Promise<Review | undefined> {
    // Stop was pressed while the picture was being taken: no reviewer call.
    if (stopped) return undefined;
    const judge = new Agent({
      initialState: { systemPrompt: REVIEWER_PROMPT, model: model as never, tools: [], thinkingLevel: "off", messages: [] },
      streamFn,
      getApiKey: () => "gateway",
      sessionId: `auvyx-review-${Date.now()}`,
    });
    reviewer = judge;
    judge.subscribe((ev) => {
      if (ev.type === "message_end" && ev.message.role === "assistant") {
        const u = ev.message.usage;
        addUsage(u);
      }
    });
    try {
      await judge.prompt(
        `The user's request: ${run.request}\nThe picture shows ${shot.label} (${shot.width}×${shot.height}).\nMeasured: ${issues.length ? issues.slice(0, 8).join("; ") : "nothing wrong."}`,
        [{ type: "image", data: shot.data, mimeType: shot.mimeType }],
      );
    } catch {
      reviewer = undefined;
      return undefined;
    }
    reviewer = undefined;
    // Stop during the review: its verdict is about a request that is over.
    if (stopped) return undefined;
    const last = [...judge.state.messages].reverse().find((m) => m.role === "assistant") as { content: { type: string; text?: string }[] } | undefined;
    const reply = last?.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
    return parseReview(reply);
  }

  async function prompt(input: string): Promise<void> {
    const e = bridge.endpoint;
    const model = resolveModel(e);
    stopped = false; // a new request clears the last Stop
    const run = new Run(withoutView(input), bridge.limits?.());
    run.newPage = bridge.sections?.() === 0;
    lastRun = run;
    const sees = canSee(model, e.vision);
    // Pictures of earlier runs that were never cleaned up (a tab closed mid-run).
    void bridge.shots?.sweep(LIMITS.orphanMinutes).catch(() => 0);
    lastSees = sees;
    const ctx: Ctx = { run, sees, review: (shot, issues) => review(model, run, shot, issues), stopped: () => stopped };
    const systemPrompt = bridge.systemPrompt();
    const toolList = tools(bridge, ctx);
    const self = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools: toolList as never,
        thinkingLevel: (e.reasoning || "medium") as never,
        messages,
      },
      streamFn,
      getApiKey: () => "gateway",
      sessionId: `auvyx-${Date.now()}`,
      toolExecution: "sequential", // an edit is looked at before the next one is made
      // Only the last pictures are sent to the model again.
      transformContext: async (ms) => pruneImages(liveView(ms, bridge.view?.())),
      // After an answer ran out of room while thinking, the next ones think less.
      prepareRequest: async () => {
        const level = thinkingAfterCutOffs(e.reasoning || "medium", run.cutOffs);
        return level ? { thinkingLevel: level as never } : undefined;
      },
      beforeToolCall: async ({ toolCall }) => {
        run.toolCalls++;
        if (!editing.has(toolCall.name) || toolCall.name === "write_code") return undefined;
        const left = run.outstanding();
        const ids =
          toolCall.name === "edit"
            ? ((toolCall.arguments as { ops?: { id?: unknown }[] }).ops ?? []).map((o) => (typeof o?.id === "string" ? o.id : "")).filter(Boolean)
            : touchedIds(toolCall.arguments);
        // The request's limits (cost, tool calls) end it for good; the limit on fixes only closes the part that would not come right.
        if (run.spent(usage.cost) === "budget" && left.length > 0) {
          return { block: true, reason: `Fix limit reached for this request. Stop editing and tell the user briefly what is still wrong: ${left.slice(0, 4).join("; ")}.`, terminate: true };
        }
        if (run.revisions >= LIMITS.revisions && left.length > 0 && run.touchesUnit(ids)) {
          return { block: true, reason: `Fix limit reached for this part: leave it as it is and say in one sentence what is still wrong (${left.slice(0, 3).join("; ")}). Carry on with the rest of the request if there is more.` };
        }
        // ui-craft: on a new page the signature comes first and alone; a ready section opens a page only with a reason
        const gate = run.gate(toolCall.name, toolCall.arguments);
        if (gate) return { block: true, reason: gate };
        run.countSections(toolCall.name, toolCall.arguments);
        return undefined;
      },
      // The run may end only on a stated reason: nothing changed, nothing outstanding, or a limit.
      finishTurn: (turn) => {
        if (turn.message.content.some((c) => c.type === "toolCall")) return undefined; // still working
        // An answer cut off at the output limit before any action is not an answer: ask again, thinking less.
        if ((turn.message as { stopReason?: string }).stopReason === "length") {
          run.cutOffs++;
          if (run.cutOffs <= LIMITS.cutOffs) {
            self.followUp({
              role: "user",
              content: `${NUDGE} Your answer ran out of room (the output limit) before you did anything. Do not plan the whole thing first: make the first edit now (one section, or a small working version of the code element), then improve it with further edits.`,
              timestamp: Date.now(),
            } as AgentMessage);
            return undefined;
          }
          run.outcome = { reason: "cut-off", revisions: run.revisions, remaining: [] };
          (turn.message as unknown as { auvyxOutcome: unknown }).auvyxOutcome = run.outcome;
          return { action: "end" } as const;
        }
        const left = run.outstanding();
        const done = (reason: "no-edits" | "reviewed" | "checked" | "revision-limit" | "budget" | "stalled") => {
          run.outcome = { reason, revisions: run.revisions, remaining: left };
          (turn.message as unknown as { auvyxOutcome: unknown }).auvyxOutcome = run.outcome;
          return reason === "no-edits" || reason === "reviewed" || reason === "checked" ? undefined : ({ action: "end" } as const);
        };
        if (run.edits === 0) return done("no-edits");
        // ui-craft: the value audit runs once at the end (one round of fixes, then once more), never per edit
        if (left.length === 0 && run.auditDue()) {
          const nudge = run.recordAudit(audit([...run.edited]));
          if (nudge) {
            self.followUp({ role: "user", content: nudge, timestamp: Date.now() } as AgentMessage);
            return undefined;
          }
        }
        if (left.length === 0) return done(run.review ? "reviewed" : "checked");
        const over = run.spent(usage.cost);
        if (over) return done(over);
        if (run.stalled()) return done("stalled");
        self.followUp({
          role: "user",
          content: `${NUDGE} Not finished yet: ${left.slice(0, 6).join("; ")}. Fix these with edit${ctx.sees ? " (you will get a new picture and verdict)" : ""}, then answer.`,
          timestamp: Date.now(),
        } as AgentMessage);
        return undefined;
      },
    });
    agent = self;
    const off = self.subscribe((ev) => {
      if (ev.type === "message_end" && ev.message.role === "assistant") {
        if (ev.message.stopReason === "error") lastError = ev.message.errorMessage ?? "error";
        addUsage(ev.message.usage);
      }
      for (const l of listeners) l(ev);
    });
    lastError = "";
    try {
      await self.prompt(said(input));
    } catch (err) {
      lastError = String(err);
      throw err;
    } finally {
      const last = self.state.messages.filter((m) => m.role !== "system");
      // Stop, however it arrived (the button or the model's own abort), is recorded as such.
      const aborted = stopped || (last.at(-1) && (last.at(-1) as { stopReason?: string }).stopReason === "aborted");
      if (aborted && !run.outcome) run.outcome = { reason: "aborted", revisions: run.revisions, remaining: run.outstanding() };
      messages = forStorage(last);
      off();
      agent = undefined;
      reviewer = undefined;
      // The pictures served the run; they go with it.
      const ids = run.shotIds.splice(0);
      if (ids.length) await bridge.shots?.discard(ids).catch(() => undefined);
    }
  }

  const handle = {
    prompt,
    /** A message typed while the agent works: delivered after the current tool calls. */
    steer: (input: string) => {
      return agent?.steer({ role: "user", content: said(input), timestamp: Date.now() } as AgentMessage);
    },
    abort: () => {
      // Stop ends the whole request: the model call, the reviewer talking right now, and any tool about to start.
      stopped = true;
      reviewer?.abort();
      return agent?.abort();
    },
    busy: () => !!agent,
    subscribe(l: (e: unknown) => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** The conversation so far (during a run, with the answer being written), without picture data. */
    messages: () => forStorage(agent ? agent.state.messages.filter((m) => m.role !== "system") : messages),
    /** The assistant message being written, while it streams. */
    streaming: () => agent?.state.streamingMessage,
    usage: () => ({ ...usage }),
    /** The last run's error, if the model or the gateway failed. */
    error: () => lastError,
    /** Why the last run ended and what it left open (for tools/agent-bench and the panel). */
    outcome: () => (lastRun?.outcome ? { ...lastRun.outcome, note: stopNote(lastRun.outcome), notes: runNotes(lastRun, lastSees) } : undefined),
  };
  (window as unknown as { __auvyxAgentRun: unknown }).__auvyxAgentRun = handle; // for tools/agent-bench and debugging
  return handle;
}

(window as unknown as { auvyxAgent: unknown }).auvyxAgent = { create };

/** Auvyx Editor loads this module on first use (lib/agent.svelte.ts) and calls create directly. */
export { create };
