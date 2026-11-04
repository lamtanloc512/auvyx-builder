/**
 * What a page needs besides its HTML and CSS (S/FrontEnd.scala `scripts`): the small scripts for elements that move
 * (sliders, tabs, galleries, countdowns, animations, sticky headers, menu drawers, code). The canvas loads them like the
 * Studio's web canvas does (U/CanvasWeb.scala islands), in edit mode. And the code-element profile rules that decide
 * whether code needs its runtime and what the code panel says is wrong (S/SlotCode.scala `profile`, `needsRuntime`,
 * `sources`; S/StoreSlotsForm.scala `codeIssue`).
 */
import policy from "../../../shared/storefront/slot-code.json";
import type { Doc, El } from "./model";
import { isCode, isGame } from "./elements";
import { readDrawer } from "./elementJson";

const classes = (n: El) => new Set(n.className.split(/\s+/).filter(Boolean));

/** Whether these styles make a horizontal scroll-snap track on the default state of any breakpoint: a slider (Slider::is_slider). */
export const isSlider = (n: El) =>
  n.kind === "Section" && Object.values(n.styles).some((bp) => (bp?.default?.["scroll-snap-type"] ?? "").trim().startsWith("x"));

const WIDGETS = ["auvyx-counter", "auvyx-progress"];
const PRO_WIDGETS = ["auvyx-toc", "auvyx-share", "auvyx-flip", "auvyx-compare", "auvyx-marquee"];
const AUTOPLAY = "auvyx-video-autoplay";

// ---- SlotCode ---------------------------------------------------------------------------------------------------

export type Profile = "legacy" | "template" | "module";
export interface Issue { code: string; detail: string }
const issue = (code: string, detail = ""): Issue => ({ code, detail });

const marker = (name: string) => policy.profiles.find((p) => p.name === name)!.marker;
export const TEMPLATE_MARKER = marker("template");
export const MODULE_MARKER = marker("module");
const limit = (name: keyof typeof policy.limits) => policy.limits[name];

/** A class token with the shape of a serialization marker (`auvyx-code-<name>-v<digits>`), known or not. */
export const isMarker = (t: string) => /^auvyx-code-[a-z0-9]+-v[0-9]+$/.test(t);
const tokens = (n: El) => n.className.split(/\s+/).filter(Boolean);
/** A code element carrying marker-shaped class tokens (on any other element the same text is an ordinary class). */
export const hasMarker = (n: El) => n.kind === "Section" && n.className.includes("auvyx-code-") && isCode(n) && tokens(n).some(isMarker);

/** An unpaired surrogate (no UTF-8 form). */
const lonely = (s: string) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
/** UTF-8 bytes (SlotJson.bytes). */
export const bytes = (s: string) => new TextEncoder().encode(s).length;

/** The profile of an element, or why a marked one is invalid (SlotCode.profile). Legacy (unmarked) code is not judged. */
export function profile(n: El): { ok: Profile } | { issues: Issue[] } {
  const marks = hasMarker(n) ? [...new Set(tokens(n).filter(isMarker))] : [];
  if (!marks.length) return { ok: "legacy" };
  if (marks.length > 1) return { issues: [issue("conflicting_markers", marks.join(" "))] };
  const m = marks[0]!;
  if (m !== TEMPLATE_MARKER && m !== MODULE_MARKER) return { issues: [issue("unknown_marker", m)] };
  if (!tokens(n).includes("auvyx-code")) return { issues: [issue("marker_requires_code")] };
  const p: Profile = m === TEMPLATE_MARKER ? "template" : "module";
  const [mb, sb, cb] = [bytes(n.markup), bytes(n.script), bytes(n.css)];
  const problems = [
    n.children.length > 0 && issue("code_has_children"),
    (lonely(n.markup) || lonely(n.script) || lonely(n.css)) && issue("invalid_character"),
    n.libs.length > 0 && issue("libs_not_allowed"),
    n.uses.length > 0 && issue("uses_not_allowed"),
    p === "template" && n.script !== "" && issue("script_not_allowed_in_template"),
    mb > limit("markupBytes") && issue("markup_limit"),
    sb > limit("scriptBytes") && issue("script_limit"),
    cb > limit("cssBytes") && issue("css_limit"),
    mb + sb + cb > limit("sourceBytes") && issue("source_limit"),
  ].filter((x): x is Issue => !!x);
  return problems.length ? { issues: problems } : { ok: p };
}

/**
 * What SlotCode.validate says before source is saved: the profile rules and limits. The template compiler's and the
 * CSS scoper's findings (SlotTemplate.compile, CodeCssScope.scope) are not ported here; the site checks them on save.
 */
export const codeIssues = (n: El): Issue[] => { const p = profile(n); return "issues" in p ? p.issues : []; };

export const isSource = (n: El) => n.kind === "Section" && (isCode(n) || hasMarker(n));

/** Whether a page needs code.js for this element: legacy code and modules with a script. */
export function needsRuntime(n: El): boolean {
  if (!isSource(n)) return false;
  const p = profile(n);
  return "ok" in p && (p.ok === "legacy" || (p.ok === "module" && n.script.trim() !== ""));
}

/** Each code element's source as one key (SlotCode.sources, without the hash): a change to any is a source change. */
export function codeSources(doc: Doc): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of Object.values(doc.nodes)) {
    if (!isCode(n) && !hasMarker(n)) continue;
    const p = profile(n);
    out[n.id] = JSON.stringify(["ok" in p ? p.ok : "invalid", n.markup, n.script, n.css, n.libs, n.uses]);
  }
  return out;
}

/** What a code element's validation says, in words (StoreSlotsForm.codeIssue). */
export function codeIssue(i: Issue): string {
  const words: Record<string, string> = {
    markup_limit: "The HTML is over the size limit (60,000 bytes).",
    script_limit: "The script is over the size limit (60,000 bytes).",
    css_limit: "The CSS is over the size limit (16 KiB).",
    source_limit: "The HTML, script and CSS together are over the size limit (128 KiB).",
    script_not_allowed_in_template: "A template has no script: use the module profile to add one.",
    libs_not_allowed: "Libraries and data sources are not available to this kind of code.",
    uses_not_allowed: "Libraries and data sources are not available to this kind of code.",
    conflicting_markers: "The code profile of this element is not valid.",
    unknown_marker: "The code profile of this element is not valid.",
    marker_requires_code: "The code profile of this element is not valid.",
    code_has_children: "A code element cannot hold other elements.",
    invalid_character: "The source has a character that cannot be saved.",
    at_rule_global: "This CSS rule is global (@import, @font-face…) and cannot be scoped to the block.",
    at_rule_unsupported: "This CSS rule is not supported.",
    root_sibling: "A selector may not reach the siblings of the block (+ or ~ after &).",
    css_forbidden: "This CSS is not allowed in a block.",
    css_url: "This URL in the CSS is not allowed.",
    keyframes_name: "This @keyframes rule is not valid.",
    keyframes_selector: "This @keyframes rule is not valid.",
    nested_rule_in_keyframes: "This @keyframes rule is not valid.",
    nesting_too_deep: "The CSS is nested too deeply.",
    empty_selector: "A CSS rule has no selector.",
    declaration_outside_rule: "A CSS declaration is outside a rule.",
    unexpected_end: "The CSS is not complete or has a bad escape.",
    unterminated_comment: "The CSS is not complete or has a bad escape.",
    unterminated_string: "The CSS is not complete or has a bad escape.",
    bad_escape: "The CSS is not complete or has a bad escape.",
    scoped_too_large: "The scoped CSS would be too large.",
    output_limit: "The template prints too much.",
  };
  const other = i.code.replaceAll("_", " ");
  const what = words[i.code] ?? `${other.charAt(0).toUpperCase()}${other.slice(1)}.`;
  return i.detail === "" ? what : `${what} [${i.detail}]`;
}

// ---- FrontEnd.scripts -------------------------------------------------------------------------------------------

/** The scripts (file names under `/auvyx/assets/`, without `.js`) a document needs, in a stable order. `runs`: authored code runs
 * (CodeMode.Enabled), the only case that needs `code`. */
export function scripts(doc: Doc, runs = false): string[] {
  const nodes = Object.values(doc.nodes);
  const any = (p: (n: El) => boolean) => nodes.some(p);
  const has = (n: El, c: string) => classes(n).has(c);
  return ([
    ["slider", any(isSlider)],
    ["tabs", any((n) => has(n, "auvyx-tabs"))],
    ["gallery", any((n) => has(n, "auvyx-gallery"))],
    ["countdown", any((n) => has(n, "auvyx-timer"))],
    ["popup", any((n) => n.kind === "Section" && has(n, "auvyx-popup"))],
    ["widgets", any((n) => WIDGETS.some((c) => has(n, c)))],
    ["pro-widgets", any((n) => PRO_WIDGETS.some((c) => has(n, c)))],
    ["animate", any((n) => [...classes(n)].some((c) => c.startsWith("auvyx-animate-")))],
    ["header", any((n) => has(n, "auvyx-header-sticky") || has(n, "auvyx-header-overlay"))],
    ["drawer", any((n) => n.kind === "Nav" && (readDrawer(n.className).style !== "dropdown" || has(n, "auvyx-nav-dept")))],
    ["code", runs && any(needsRuntime)],
    ["video", any((n) => n.kind === "Video" && has(n, AUTOPLAY))],
    ["play-page", any(isGame)],
  ] as [string, boolean][]).filter(([, on]) => on).map(([name]) => name);
}
