/**
 * The loop around the agent's work (ADR 0039, on pi's hooks): it makes the agent look at what it made, fix what is wrong, and stop
 * for a stated reason.
 *
 *   edit → measured check + picture of the changed part → a reviewer judges the picture (PASS / FIX …) → the agent revises
 *   … until nothing is outstanding (PASS and a clean check), or a limit is reached, or two rounds find the same problems.
 *
 * pi's `finishTurn` decides at every answer without tool calls whether the run may end, `beforeToolCall` refuses edits once the
 * budget is spent, `transformContext` keeps old pictures out of the conversation. Nothing here knows the platform.
 */
import type { AgentMessage } from "@earendil-works/pi-agent-core";

export const LIMITS = {
  /** Rounds of fixes on one part of the page (an edit that changes what the last edit made, to answer its problems). Moving on to another part starts again. */
  revisions: 3,
  /** Tool calls in one request: a long page is many edits, each with its lookups and pictures. */
  toolCalls: 80,
  /** Dollars one request may cost (the agent and the reviewer together), when the provider reports prices. */
  costUsd: 1.5,
  /** Pictures kept in the conversation sent to the model; older ones become a note. */
  imagesKept: 2,
  /** Pictures from a run that was never cleaned up (a tab closed mid-run) are removed after this many minutes. */
  orphanMinutes: 30,
  /** Answers cut off at the output limit before any action that the agent is asked to redo (with less thinking each time). */
  cutOffs: 2,
};

export interface Review {
  pass: boolean;
  problems: string[];
}

export type Reason =
  | "no-edits" // nothing was changed: an answer, not a job
  | "reviewed" // the reviewer passed the picture and the measured check is clean
  | "checked" // no pictures (the model cannot see, or none could be taken) and the measured check is clean
  | "revision-limit"
  | "budget"
  | "stalled" // the same problems came back unchanged
  | "cut-off" // the model's answers kept hitting the output limit before it acted
  | "aborted";

export interface Outcome {
  reason: Reason;
  revisions: number;
  remaining: string[];
}

const NEAR_MISS = /: text contrast ([\d.]+):1 \(needs ([\d.]+):1\)/;
/** A craft finding of check.ts: `<element>: craft <rule>: <what to change>`. */
const CRAFT = /: craft ([a-z0-9-]+)[: ]/;

/**
 * The craft rules that are clear defects, not taste: they hold a request back like a contrast failure. Each names the
 * words that make it the user's own choice ("use emoji as icons"): then it is only advisory, since the user's explicit
 * request wins over every default.
 */
export const HARD_CRAFT: Record<string, RegExp> = {
  "pure-black": /\bblack\b|#000\b/i,
  "emoji-icon": /emoji/i,
};

/**
 * Splits the measured findings into what holds a request back and what is only worth knowing. Style hygiene (a fixed color
 * instead of a theme token), a placeholder picture (the site may have no real one), a contrast a hair under the standard
 * (4.4:1 for 4.5:1) and craft findings (taste: they guide, never block or loop) are advisory: spending a round of fixes on
 * them, or refusing to finish because of them, helps nobody. Only the craft rules in HARD_CRAFT are hard, unless the
 * request asks for exactly that.
 */
export function triage(lines: string[], request = ""): { hard: string[]; soft: string[] } {
  const hard: string[] = [];
  const soft: string[] = [];
  for (const line of lines) {
    const near = NEAR_MISS.exec(line);
    const craft = CRAFT.exec(line)?.[1];
    const advisory = craft
      ? !(craft in HARD_CRAFT) || HARD_CRAFT[craft].test(request)
      : /: fixed color /.test(line) || /: placeholder picture/.test(line) || Boolean(near && Number(near[1]) >= Number(near[2]) * 0.85);
    (advisory ? soft : hard).push(line);
  }
  return { hard, soft };
}

/** What one request has done so far. */
export class Run {
  edits = 0;
  looks = 0;
  /** rounds of fixes on the part being worked on */
  revisions = 0;
  toolCalls = 0;
  /** answers cut off at the output limit without an action */
  cutOffs = 0;
  /** ids of the part the last edits made or fixed: an edit that touches one of them is a fix of it, any other starts a new part */
  private unit = new Set<string>();
  /** measured problems after the last edit */
  issues: string[] = [];
  /** the reviewer's verdict on the last picture */
  review?: Review;
  /** media ids of this run's pictures, removed when it ends */
  shotIds: string[] = [];
  outcome?: Outcome;
  private lastKey = "";
  private repeats = 0;
  /** every element an edit of this request made or changed: what the value audit at the end measures */
  readonly edited = new Set<string>();
  /** the value audit at the end: how many times it ran (at most twice: once, a fix, once more), and the last result */
  audits = 0;
  audit?: ValueAudit;
  private editsAtAudit = 0;
  /** the document had no sections when the request started: a new page, built signature first */
  newPage = false;
  /** page-level sections this request added */
  sections = 0;
  /** what the gates already asked once (each asks once, then trusts the agent: no loop) */
  private asked = new Set<string>();

  /** This request's limits (the panel's effort setting); LIMITS when the host gives none. */
  readonly limits: { toolCalls: number; costUsd: number };

  constructor(
    readonly request: string,
    limits?: { toolCalls: number; costUsd: number },
  ) {
    this.limits = limits ?? { toolCalls: LIMITS.toolCalls, costUsd: LIMITS.costUsd };
  }

  /** Whether an edit touching `ids` changes the part the last edits made. */
  touchesUnit(ids: string[]): boolean {
    return ids.some((id) => this.unit.has(id));
  }

  /** Called as an edit starts: a fix of a part with problems left is another round on it; anything else is a new part, from zero. */
  startEdit(touched: string[]): void {
    if (this.outstanding().length > 0 && this.touchesUnit(touched)) this.revisions++;
    else {
      this.revisions = 0;
      this.unit = new Set();
    }
  }

  /** Called when an edit has been applied: its elements belong to the part being worked on. */
  finishEdit(ids: string[]): void {
    for (const id of ids) {
      this.unit.add(id);
      this.edited.add(id);
    }
  }

  /**
   * The gates of a new page (ui-craft's build order), asked before an edit runs; a reason to refuse it once, or undefined.
   * Signature first and alone: the first edit of a new page builds one section, which gets its picture and verdict before
   * the rest exists. First section: a ready kit, pattern or library section may open a page only when the agent says why.
   * Each gate asks once; a repeat is the agent's considered choice and goes through.
   */
  gate(tool: string, args: unknown): string | undefined {
    if (!this.newPage || this.sections > 0) return undefined;
    const { count, firstReady } = pageSections(tool, args);
    if (count === 0) return undefined;
    if (count > 1 && !this.asked.has("signature")) {
      this.asked.add("signature");
      return `This is a new page: build its signature first and alone (the one section a visitor will remember, specific to this subject), in one edit with only that section. Look at its picture and verdict, then build the rest around it.`;
    }
    if (firstReady && !this.asked.has("first")) {
      this.asked.add("first");
      return `A ready ${firstReady} would open this page, and ready layouts are generic. Open on a section drawn for this subject instead, or say in one sentence why this ${firstReady} is what you would have drawn anyway, then make the same call again.`;
    }
    return undefined;
  }

  /** Called after an edit is applied with what it was: counts the page-level sections a new page has. */
  countSections(tool: string, args: unknown): void {
    this.sections += pageSections(tool, args).count;
  }

  /** Whether the value audit should run as the agent wants to finish: once, and once more only after edits that answer it. */
  auditDue(): boolean {
    if (this.edits === 0 || this.edited.size === 0) return false;
    if (this.audits === 0) return true;
    return this.audits === 1 && this.edits > this.editsAtAudit;
  }

  /**
   * Records an audit run at the end; answers the reminder to send when it found values off the system on the first run
   * (fix them once), undefined when the run may end. Off-system values never hold the run back beyond that one round.
   */
  recordAudit(a: ValueAudit): string | undefined {
    this.audits++;
    this.audit = a;
    this.editsAtAudit = this.edits;
    if (this.audits > 1 || a.off.length === 0) return undefined;
    return `${NUDGE} The value audit of what you built: ${auditSummary(a)}. Values off the site's system:\n- ${a.off.slice(0, 10).join("\n- ")}\nUse the token each line names (one edit for all of them); a value the design really needs and the system lacks belongs in the design brief (design or tokens), not in a section. Then answer.`;
  }

  /** Everything still wrong: what the check measured and what the reviewer said. */
  outstanding(): string[] {
    return [...this.issues, ...(this.review && !this.review.pass ? this.review.problems : [])];
  }

  /** True when the same outstanding problems come back a second time: more rounds will not help. */
  stalled(): boolean {
    const key = this.outstanding().join("|");
    this.repeats = key === this.lastKey ? this.repeats + 1 : 0;
    this.lastKey = key;
    return this.repeats >= 1;
  }

  spent(cost: number): "revision-limit" | "budget" | "" {
    if (this.toolCalls >= this.limits.toolCalls || cost >= this.limits.costUsd) return "budget";
    if (this.revisions >= LIMITS.revisions) return "revision-limit";
    return "";
  }
}

const WHY: Record<Exclude<Reason, "no-edits" | "reviewed" | "checked">, string> = {
  "revision-limit": "I stopped after the allowed rounds of fixes",
  budget: "I stopped at the limit for one request",
  stalled: "I stopped because the same problems came back",
  "cut-off": "I stopped because my answers kept running out of room before I could act (the model's output limit); ask for a smaller first step",
  aborted: "Stopped",
};

/** The sentence that closes a run that did not end clean, for the user. */
export function stopNote(o: Outcome): string {
  if (o.reason === "no-edits" || o.reason === "reviewed" || o.reason === "checked") return "";
  const left = o.remaining.slice(0, 4).join("; ");
  return `${WHY[o.reason]}${left ? `. Still open: ${left}` : ""}.`;
}

// ---- the reviewer ----

/**
 * The acceptance bar the reviewer holds the picture to: ui-craft's blind review (idea fit, distinctiveness, craft,
 * consistency), adapted to what a picture of one part can show. Values (tokens, sizes) are the measured audit's, not the reviewer's.
 */
export const ACCEPTANCE_BAR: readonly string[] = [
  "Idea fit: a NEW section belongs to this subject and request and could not sit unchanged on any other site (small edits are not judged on this).",
  "Signature: the first section of a new page has one thing a visitor would remember; clean but generic fails here.",
  "Craft: one clear focal point, aligned edges, an even rhythm of gaps, readable line lengths.",
  "Consistency: elements of one kind (cards, buttons, corners, gaps, headings) look the same.",
];

export const REVIEWER_PROMPT = `You review a section of a web page that a design agent has just built. You get the user's request, a picture of the result and what a program measured (contrast, overflow, placeholders).

Judge the picture the way a careful art director would, only for real problems the visitor would notice:
- text that is hard to read (contrast, size, over a busy picture), cut off or overlapping;
- elements out of line, uneven gaps or card heights, content that does not sit in its box, crowded or empty areas;
- broken, grey or placeholder pictures;
- a design that does not look like what the user asked for, or content that is missing from what the picture should show;
- clumsy hierarchy: nothing stands out, or everything shouts.
The agent builds a page in steps. Judge what the picture shows; do not fail it for parts of the request that belong to other sections.
The picture is the element alone, as the site renders it: judge only what is in it.
Text contrast on plain backgrounds is measured by a program from the real colours (the picture's compression shifts them): trust "Measured". Report contrast yourself only for text over a picture, a gradient or a video.
A game, a quiz or a widget may show its start screen, an overlay or an empty board before anyone plays: that is a state, not a fault.

Reply with JSON only: {"pass": true|false, "problems": ["..."]}. Each problem is one sentence naming the element or area and what to change (max 5, the most important first). pass is true when nothing important is wrong; then problems is empty. Never invent problems to be thorough, and do not ask for polish that was not requested.${
  ACCEPTANCE_BAR.length
    ? `\n\nThe bar (passing the measured check is the floor, not the goal; fail only for an item the picture clearly misses; what the user asked for explicitly wins):\n${ACCEPTANCE_BAR.map((b, i) => `${i + 1}. ${b}`).join("\n")}`
    : ""
}`;

/** The reviewer's reply as a verdict; undefined when it did not follow the format (then the agent is not held back). */
export function parseReview(text: string): Review | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as { pass?: unknown; problems?: unknown };
    if (typeof v.pass !== "boolean") return undefined;
    const problems = Array.isArray(v.problems) ? v.problems.filter((p): p is string => typeof p === "string" && p.trim() !== "").slice(0, 5) : [];
    if (v.pass) return { pass: true, problems: [] };
    return problems.length ? { pass: false, problems } : undefined; // "fail" with nothing to fix is no verdict
  } catch {
    return undefined;
  }
}

// ---- pictures in the conversation ----

type Block = { type: string; [k: string]: unknown };
type Message = { role: string; content?: unknown };

const hasImage = (m: Message) => m.role === "toolResult" && Array.isArray(m.content) && (m.content as Block[]).some((c) => c.type === "image");

function withoutImages(m: Message, note: string): Message {
  return { ...m, content: (m.content as Block[]).map((c) => (c.type === "image" ? { type: "text", text: note } : c)) };
}

/** The conversation for the model: only the last few pictures stay, earlier ones become a note. */
export function pruneImages(messages: AgentMessage[], keep = LIMITS.imagesKept): AgentMessage[] {
  let seen = 0;
  const out = [...messages] as Message[];
  for (let i = out.length - 1; i >= 0; i--) {
    if (!hasImage(out[i])) continue;
    if (++seen > keep) out[i] = withoutImages(out[i], "[an earlier picture, no longer shown]");
  }
  return out as AgentMessage[];
}

/** The conversation for storage and display: no picture data at all (a thumbnail in the tool result's details is enough). */
export function forStorage(messages: AgentMessage[]): AgentMessage[] {
  const maxThumbChars = 64_000;
  return (messages as Message[]).map((m) => {
    if (!hasImage(m)) return m;
    const safe = withoutImages(m, "[picture]") as Message & { details?: Record<string, unknown> };
    const thumb = safe.details?.thumb;
    if (typeof thumb === "string" && thumb.length > maxThumbChars) {
      const { thumb: _thumb, ...details } = { ...safe.details! };
      safe.details = details;
    }
    return safe;
  }) as AgentMessage[];
}

// ---- the edit tool's arguments ----

/** A flat list's items written as ops of their own (no "op", but a "kind"; models do this) join the "elements" of the op before them. */
export function adopt(ops: unknown[]): unknown[] {
  const out: Record<string, unknown>[] = [];
  for (const op of ops) {
    const o = op as Record<string, unknown>;
    const prev = out[out.length - 1];
    if (o && typeof o === "object" && !("op" in o) && "kind" in o && prev && Array.isArray(prev.elements)) (prev.elements as unknown[]).push(o);
    else out.push(o);
  }
  return out;
}

/** A flat insert (`elements`: [{ref, in?, kind, …}]) becomes the nested `element` tree the applier takes; a new page keeps its roots. */
export function unflatten(op: unknown): unknown {
  const o = op as { elements?: unknown };
  if (!o || typeof o !== "object" || !Array.isArray(o.elements)) return op;
  const items = (o.elements as Record<string, unknown>[]).map((e) => ({ ...e }));
  const byRef = new Map(items.filter((e) => typeof e.ref === "string").map((e) => [e.ref as string, e]));
  const roots: Record<string, unknown>[] = [];
  for (const e of items) {
    const parent = typeof e.in === "string" ? byRef.get(e.in) : undefined;
    if (parent) ((parent.children ??= []) as unknown[]).push(e);
    else roots.push(e);
  }
  for (const e of items) {
    delete e.ref;
    delete e.in;
  }
  const { elements: _, ...rest } = o as Record<string, unknown>;
  // A new page takes its page-level elements as they are (each a section); an insert takes one element.
  if ((o as { op?: unknown }).op === "page") return { ...rest, elements: roots };
  return { ...rest, element: roots.length === 1 ? roots[0] : { kind: "box", children: roots } };
}

// ---- answers cut off at the output limit ----

/**
 * The thinking level for the next request after `cutOffs` answers ran out of room before acting: thinking is what fills
 * the output limit, so the first redo thinks little and the second not at all. Undefined: keep the configured level.
 */
export function thinkingAfterCutOffs(level: string, cutOffs: number): string | undefined {
  if (cutOffs <= 0) return undefined;
  if (cutOffs >= 2 || level === "off" || level === "minimal" || level === "low") return "off";
  return "low";
}

// ---- models the catalog does not know ----

/** Families that all read pictures; a model of theirs the catalog does not list (a new one, a router's id) still does. */
const READS_PICTURES = /claude|gpt-4o|gpt-4\.1|gpt-5|(^|\/)o[34]\b|gemini|grok-4|pixtral|llama-4|qwen[\w.-]*vl|vision/i;

/** What a model the catalog does not know takes in, guessed from its id (the AI settings' Vision overrides it). */
export function guessInput(modelId: string): ("text" | "image")[] {
  return READS_PICTURES.test(modelId) ? ["text", "image"] : ["text"];
}

/** What the reminders to the model start with (AgentPanel hides messages that do). */
export const NUDGE = "(Automatic check)";

/** A message as the model gets it: the user's words, then what the user is looking at (AgentTools.view: a `<view>` block). */
export function withView(text: string, view: string | undefined): string {
  return view ? `${withoutView(text)}\n\n${view}` : text;
}

/** The user's words without the view (or the selection note older Studios added): shared AgentView.strip, here for the runtime. */
export function withoutView(text: string): string {
  return text.replace(/\n\n<view>\n[\s\S]*<\/view>$/, "").replace(/\n\n\(Selected: [^)]*\)$/, "");
}

/** Only the latest user message carries context. Refresh it at request time, without mutating stored chat history. */
export function liveView(messages: AgentMessage[], view?: string): AgentMessage[] {
  const last = messages.findLastIndex((m) => m.role === "user");
  return messages.map((m, i) => {
    if (m.role !== "user") return m;
    const transform = (s: string) => i === last && view ? withView(s, view) : withoutView(s);
    if (typeof m.content === "string") return { ...m, content: transform(m.content) } as AgentMessage;
    const text = m.content.findLastIndex((p) => p.type === "text");
    const content = m.content.map((p, j) => p.type === "text" ? { ...p, text: j === text ? transform(p.text) : withoutView(p.text) } : p);
    if (text < 0 && i === last && view) content.push({ type: "text", text: view });
    return { ...m, content } as AgentMessage;
  });
}

// ---- ui-craft: the value audit, the build order and the run notes ----

/** What check.audit measured over everything a request built: rendered values against the tokens the canvas loaded. */
export interface ValueAudit {
  /** comparisons made (the denominator) */
  checks: number;
  /** values off the system, as lines naming the token to use */
  off: string[];
  /** art regions left out (vectors, code and game elements, pictures, `data-art`) */
  art: number;
}

/** `96% on-system (231 checks, 2 art regions exempt)` */
export function auditSummary(a: ValueAudit): string {
  const pct = a.checks ? Math.round(((a.checks - a.off.length) / a.checks) * 1000) / 10 : 100;
  return `${pct}% on-system (${a.checks} checks${a.art ? `, ${a.art} art region${a.art === 1 ? "" : "s"} exempt` : ""})`;
}

const READY_OPS: Record<string, string> = { kit: "kit section", pattern: "pattern", library: "library section" };

/** The page-level sections an edit or an insert adds, and whether the first is a ready one (kit, pattern, library). */
export function pageSections(tool: string, args: unknown): { count: number; firstReady?: string } {
  const a = (args ?? {}) as Record<string, unknown>;
  if (tool === "insert_elements") {
    if (typeof a.parent === "string") return { count: 0 };
    const items = Array.isArray(a.elements) ? (a.elements as Record<string, unknown>[]) : [];
    return { count: items.filter((e) => e && typeof e === "object" && e.in === undefined).length };
  }
  if (tool !== "edit") return { count: 0 };
  const ops = Array.isArray(a.ops) ? (adopt(a.ops) as Record<string, unknown>[]) : [];
  let count = 0;
  let firstReady: string | undefined;
  for (const op of ops) {
    if (!op || typeof op !== "object" || typeof op.parent === "string") continue;
    const kind = String(op.op ?? "");
    if (kind !== "insert" && !(kind in READY_OPS)) continue;
    if (count === 0 && kind in READY_OPS) firstReady = READY_OPS[kind];
    count++;
  }
  return { count, firstReady };
}

/**
 * The run's notes for the panel (ui-craft's report), not the answer: what was verified (the audit's numbers, the
 * reviewer, the measured check), the guessed values (rendered values the system does not give: ideally none) and what
 * was not verified.
 */
export function runNotes(run: Run, sees: boolean): string[] {
  const verified = [
    run.audit ? `values ${auditSummary(run.audit)}` : "",
    run.review ? `reviewer ${run.review.pass ? "PASS" : `FIX (${run.review.problems.length})`}` : "",
    run.edits ? `measured check ${run.issues.length ? `${run.issues.length} open` : "clean"}` : "",
  ].filter(Boolean);
  const notes = verified.length ? [`Verified: ${verified.join(", ")}.`] : [];
  if (run.audit) notes.push(`Guessed values: ${run.audit.off.length ? run.audit.off.slice(0, 5).join("; ") : "none"}.`);
  const not = [!sees ? "no pictures (the model cannot see)" : "", run.edits && !run.audit ? "no value audit" : "", "hover, focus and other states", "other widths than the one edited"].filter(Boolean);
  if (run.edits) notes.push(`Not verified: ${not.join(", ")}.`);
  return notes;
}

// ---- the craft block of the system prompt ----

/**
 * ui-craft in the Auvyx world, kept small (the always-sent part): the agent decides intent, the site's system decides values;
 * a concept before a new look, the signature first, the audit at the end. The long guidance is the craft skills.
 */
export function craftPrompt({ routes = "" }: { routes?: string } = {}): string {
  return [
    "Craft (you decide intent, the site's system decides values; the user's explicit request always wins over these defaults):",
    "- Close the values, open the shapes: any shape the idea needs, every value from the tokens above (motion only inside prefers-reduced-motion); a value they lack goes into the design brief. Art (vectors, code, pictures) is free.",
    "- A new look starts with a concept: what only this subject has, the signature a visitor remembers, the real thing the colors come from, why the face fits; not cream or near-white with a soft serif by habit.",
    "- A new page: its signature section first and alone, look at it, then the rest; a ready kit section opens a page only for a stated reason.",
    routes ? `- Skills to load: ${routes}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
