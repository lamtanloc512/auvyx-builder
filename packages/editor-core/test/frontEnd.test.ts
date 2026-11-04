import { expect, test } from "bun:test";
import { FrontEnd, el, type Doc, type El } from "../src/index";

// shared/FrontEndSuite.scala, NavDrawerSuite, CodeModeSuite, SlotCodeSuite (profiles, limits, scripts), EmbedSuite,
// StoreSlotsFormSuite (codeIssue words): the parts the editor's canvas and code panel use.
const doc = (...nodes: El[]): Doc => ({ roots: [nodes[0]!.id], nodes: Object.fromEntries(nodes.map((n) => [n.id, n])) });
const track = el("t", "Section", { styles: { base: { default: { "scroll-snap-type": "x mandatory" } } }, children: ["s1", "s2"] });
const code = (marker: string = FrontEnd.TEMPLATE_MARKER, markup = "<p>{{category.title}}</p>", script = "", extra: Partial<El> = {}) =>
  el("c", "Section", { tag: "div", className: `auvyx-code ${marker}`.trim(), markup, script, ...extra });
const codes = (n: El) => { const p = FrontEnd.profile(n); return "issues" in p ? p.issues.map((i) => i.code) : []; };

test("a scroll-snap track is a slider and asks for its script", () => {
  expect(FrontEnd.isSlider(track)).toBe(true);
  expect(FrontEnd.isSlider(el("x", "Section", { styles: { base: { default: { "scroll-snap-type": "none" } } } }))).toBe(false);
  expect(FrontEnd.scripts(doc(track, el("s1", "Section"), el("s2", "Section")))).toEqual(["slider"]);
});

test("each moving element asks only for its own script; a plain page asks for none", () => {
  expect(FrontEnd.scripts(doc(el("a", "Section")))).toEqual([]);
  const d = doc(
    el("a", "Section", { className: "auvyx-tabs auvyx-gallery", children: ["b", "c"] }),
    el("b", "Section", { className: "auvyx-timer" }),
    el("c", "Heading", { className: "auvyx-animate-fade-up auvyx-header-sticky" }),
  );
  expect(FrontEnd.scripts(d)).toEqual(["tabs", "gallery", "countdown", "animate", "header"]);
});

test("a navigation that opens as a drawer asks for drawer.js", () => {
  const nav = el("n", "Nav", { className: "auvyx-drawer-full" });
  expect(FrontEnd.scripts(doc(nav))).toEqual(["drawer"]);
  expect(FrontEnd.scripts(doc({ ...nav, className: "" }))).toEqual([]);
  expect(FrontEnd.scripts(doc({ ...nav, className: "auvyx-nav-dept" }))).toEqual(["drawer"]);
});

test("a video that plays by itself (or a background with sound) asks for video.js", () => {
  expect(FrontEnd.scripts(doc(el("v", "Video", { className: "auvyx-bg-video auvyx-video-autoplay" })))).toEqual(["video"]);
  expect(FrontEnd.scripts(doc(el("v", "Video", { className: "auvyx-video-autoplay" })))).toEqual(["video"]);
  expect(FrontEnd.scripts(doc(el("v", "Video", { className: "auvyx-bg-video" })))).toEqual([]);
});

test("code.js only while authored code runs (CodeMode.Enabled), and only for code that has something to run", () => {
  const legacy = el("old", "Section", { tag: "div", className: "auvyx-code", markup: "<b>x</b>", script: "export default ({ el }) => {};" });
  expect(FrontEnd.scripts(doc(legacy))).toEqual([]);
  expect(FrontEnd.scripts(doc(legacy), true)).toEqual(["code"]);
  expect(FrontEnd.scripts(doc(code(FrontEnd.MODULE_MARKER, "<p></p>", "export default (el, ctx) => {};")), true)).toEqual(["code"]);
  expect(FrontEnd.scripts(doc(code(FrontEnd.MODULE_MARKER)), true)).toEqual([]); // a module with no script
  expect(FrontEnd.scripts(doc(code()), true)).toEqual([]); // a template
});

test("markers are the two finite versioned classes from the shared policy", () => {
  expect(FrontEnd.TEMPLATE_MARKER).toBe("auvyx-code-template-v1");
  expect(FrontEnd.MODULE_MARKER).toBe("auvyx-code-module-v1");
  for (const m of ["auvyx-code-template-v1", "auvyx-code-module-v9", "auvyx-code-x-v10"]) expect(FrontEnd.isMarker(m)).toBe(true);
  for (const m of ["auvyx-code", "auvyx-code-error", "auvyx-codec-template-v1", "auvyx-code-template-v"]) expect(FrontEnd.isMarker(m)).toBe(false);
});

test("profile: unmarked is legacy, one known marker is its profile, anything else is an error", () => {
  expect(FrontEnd.profile(code(""))).toEqual({ ok: "legacy" });
  expect(FrontEnd.profile(el("s", "Section", { className: "hero" }))).toEqual({ ok: "legacy" });
  expect(FrontEnd.profile(code())).toEqual({ ok: "template" });
  expect(FrontEnd.profile(code(FrontEnd.MODULE_MARKER, undefined, "export default () => {}"))).toEqual({ ok: "module" });
  expect(codes(code("auvyx-code-template-v1 auvyx-code-module-v1"))).toEqual(["conflicting_markers"]);
  expect(codes(code("auvyx-code-template-v2"))).toEqual(["unknown_marker"]);
  expect(codes(code("auvyx-code-module-v0"))).toEqual(["unknown_marker"]);
  expect(codes(el("s", "Section", { className: FrontEnd.TEMPLATE_MARKER, markup: "<p></p>" }))).toEqual(["marker_requires_code"]);
  expect(FrontEnd.profile(el("h", "Heading", { className: `auvyx-code ${FrontEnd.TEMPLATE_MARKER}` }))).toEqual({ ok: "legacy" });
  expect(FrontEnd.profile(code("auvyx-code-template-v1 auvyx-code-template-v1"))).toEqual({ ok: "template" });
});

test("profile rules: a template has no script; neither profile has libs, uses or children", () => {
  expect(codes(code(undefined, undefined, "x"))).toEqual(["script_not_allowed_in_template"]);
  expect(codes(code(undefined, undefined, "", { libs: ["motion"] }))).toEqual(["libs_not_allowed"]);
  expect(codes(code(FrontEnd.MODULE_MARKER, undefined, "", { uses: ["shop"] }))).toEqual(["uses_not_allowed"]);
  expect(codes(code(undefined, undefined, "", { children: ["k"] }))).toEqual(["code_has_children"]);
  expect(codes(code(undefined, "<p>\uD800</p>"))).toEqual(["invalid_character"]);
});

test("source limits are bytes: 60,000 markup, 60,000 script, 16 KiB css, 128 KiB all", () => {
  const m = FrontEnd.MODULE_MARKER;
  expect("ok" in FrontEnd.profile(code(m, "a".repeat(60000), "b".repeat(60000), { css: "c".repeat(11072) }))).toBe(true);
  expect(codes(code(m, "a".repeat(60001)))).toEqual(["markup_limit"]);
  expect(codes(code(m, undefined, "b".repeat(60001)))).toEqual(["script_limit"]);
  expect(codes(code(m, undefined, "", { css: "c".repeat(16385) }))).toEqual(["css_limit"]);
  expect(codes(code(m, "a".repeat(60000), "b".repeat(60000), { css: "c".repeat(11073) }))).toEqual(["source_limit"]);
  expect(codes(code(m, "🛒".repeat(15001)))).toEqual(["markup_limit"]);
});

test("codeIssue: words, with where it is; unknown codes read as a sentence", () => {
  expect(FrontEnd.codeIssue({ code: "markup_limit", detail: "" })).toBe("The HTML is over the size limit (60,000 bytes).");
  expect(FrontEnd.codeIssue({ code: "root_sibling", detail: "css L1:C3" })).toBe("A selector may not reach the siblings of the block (+ or ~ after &). [css L1:C3]");
  expect(FrontEnd.codeIssue({ code: "some_new_rule", detail: "" })).toBe("Some new rule.");
  for (const c of ["markup_limit", "script_limit", "css_limit", "source_limit", "script_not_allowed_in_template", "at_rule_global", "root_sibling", "css_url", "unexpected_end", "scoped_too_large"])
    expect(FrontEnd.codeIssue({ code: c, detail: "" })).not.toContain("_");
  // legacy (unmarked) code is not judged by these rules
  expect(FrontEnd.codeIssues(el("l", "Section", { tag: "div", className: "auvyx-code", markup: "<p>{{x</p>" }))).toEqual([]);
});

test("code sources: a change to any code's source is seen, other edits are not", () => {
  const a = doc(el("old", "Section", { className: "auvyx-code", script: "x" }));
  const b = doc({ ...a.nodes.old!, script: "y" });
  const c = doc({ ...a.nodes.old!, styles: { base: { default: { color: "red" } } } });
  expect(FrontEnd.codeSources(a)).not.toEqual(FrontEnd.codeSources(b));
  expect(FrontEnd.codeSources(a)).toEqual(FrontEnd.codeSources(c));
});
