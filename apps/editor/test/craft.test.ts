import { describe, expect, test } from "bun:test";
import { NUDGE, REVIEWER_PROMPT, Run, auditSummary, craftPrompt, pageSections, runNotes, triage } from "../src/agent/harness";
import { type Skill, builtInSkills, routes } from "../src/agent/skills";
import { BUILT_IN_SKILLS } from "../src/agent/skills.generated";

describe("craft findings in the triage", () => {
  const lines = [
    'b1 "Hello": craft off-system text-size 19px → var(--wp--preset--font-size--auvyx-lg) (20px)',
    'b2 "Card": craft off-system radius 7px → var(--wp--custom--radius--md) (8px)',
    'b3 "Price": craft pure-black: text is pure black (#000) on a theme with color tokens',
    'b4 "🚀 Fast": craft emoji-icon: an emoji used as an icon',
    'b5 "Body": text contrast 2.1:1 (needs 4.5:1), rgb(…) on rgb(…)',
  ];

  test("off-system values are advisory; the clear defects and real failures hold the request back", () => {
    const { hard, soft } = triage(lines);
    expect(soft).toEqual([lines[0], lines[1]]);
    expect(hard).toEqual([lines[2], lines[3], lines[4]]);
  });

  test("a hard craft rule the user asked for is the user's choice: advisory", () => {
    expect(triage(lines, "Add emoji to each feature title").hard).toEqual([lines[2], lines[4]]);
    expect(triage(lines, "make the text black").hard).toEqual([lines[3], lines[4]]);
    expect(triage([lines[4]], "use emoji").hard).toEqual([lines[4]]); // the request never softens what is not craft
  });

  test("the existing advisories stay advisory", () => {
    const { hard, soft } = triage(['x "a": fixed color color: #333, use a theme token', 'y "b": placeholder picture, use a real one', 'z "c": text contrast 4.2:1 (needs 4.5:1), …']);
    expect(hard).toEqual([]);
    expect(soft).toHaveLength(3);
  });
});

describe("the value audit at the end", () => {
  const edit = (run: Run, ids: string[]) => {
    run.startEdit(ids);
    run.edits++;
    run.finishEdit(ids);
  };

  test("runs once when the agent wants to finish, asks for one fix round, then once more only after edits", () => {
    const run = new Run("a hero");
    expect(run.auditDue()).toBe(false); // nothing built
    edit(run, ["a"]);
    edit(run, ["b"]);
    expect(run.auditDue()).toBe(true);
    const nudge = run.recordAudit({ checks: 40, off: ['a "Hi": craft off-system text-size 19px → var(--wp--preset--font-size--auvyx-lg) (20px)'], art: 1 });
    expect(nudge).toStartWith(NUDGE);
    expect(nudge).toContain("97.5% on-system (40 checks, 1 art region exempt)");
    expect(nudge).toContain("auvyx-lg");
    expect(run.auditDue()).toBe(false); // no edit since: it may end
    edit(run, ["a"]);
    expect(run.auditDue()).toBe(true);
    expect(run.recordAudit({ checks: 40, off: ["still one"], art: 1 })).toBeUndefined(); // the second run never loops
    edit(run, ["a"]);
    expect(run.auditDue()).toBe(false);
  });

  test("a clean audit ends the run; the audit covers every element the request touched", () => {
    const run = new Run("x");
    edit(run, ["a", "b"]);
    edit(run, ["c"]);
    expect([...run.edited]).toEqual(["a", "b", "c"]);
    expect(run.recordAudit({ checks: 12, off: [], art: 0 })).toBeUndefined();
    expect(auditSummary({ checks: 0, off: [], art: 0 })).toBe("100% on-system (0 checks)");
  });

  test("run notes follow ui-craft's report: verified, guessed values, not verified", () => {
    const run = new Run("x");
    edit(run, ["a"]);
    run.review = { pass: true, problems: [] };
    run.recordAudit({ checks: 20, off: ['a "Hi": craft off-system radius 7px → var(--wp--custom--radius--md) (8px)'], art: 0 });
    const notes = runNotes(run, true);
    expect(notes[0]).toBe("Verified: values 95% on-system (20 checks), reviewer PASS, measured check clean.");
    expect(notes[1]).toContain("Guessed values: a \"Hi\": craft off-system radius 7px");
    expect(notes[2]).toStartWith("Not verified: hover, focus");
    expect(runNotes(new Run("a question"), true)).toEqual([]);
  });
});

describe("a new page's build order", () => {
  const kit = { ops: [{ op: "kit", id: "hero-centered" }, { op: "insert", element: { kind: "section" } }] };

  test("counts the page-level sections an edit or an insert adds", () => {
    expect(pageSections("edit", kit)).toEqual({ count: 2, firstReady: "kit section" });
    expect(pageSections("edit", { ops: [{ op: "insert", parent: "s1", element: {} }] })).toEqual({ count: 0, firstReady: undefined });
    expect(pageSections("insert_elements", { elements: [{ ref: "s", kind: "section" }, { in: "s", kind: "heading" }, { kind: "section" }] })).toEqual({ count: 2 });
    expect(pageSections("insert_elements", { parent: "s1", elements: [{ kind: "heading" }] })).toEqual({ count: 0 });
    expect(pageSections("set_style", { id: "a" })).toEqual({ count: 0 });
  });

  test("signature first and alone, then a ready section first needs a reason; each gate asks once", () => {
    const run = new Run("a page for a ferry cooperative");
    run.newPage = true;
    expect(run.gate("edit", kit)).toContain("signature first and alone");
    expect(run.gate("edit", { ops: [kit.ops[0]] })).toContain("say in one sentence why");
    expect(run.gate("edit", { ops: [kit.ops[0]] })).toBeUndefined(); // asked once: the agent's choice now
    run.countSections("edit", { ops: [kit.ops[0]] });
    expect(run.gate("edit", kit)).toBeUndefined(); // the page has its first section
  });

  test("an existing page and a single drawn section pass untouched", () => {
    const old = new Run("add a section");
    expect(old.gate("edit", kit)).toBeUndefined();
    const fresh = new Run("a page");
    fresh.newPage = true;
    expect(fresh.gate("insert_elements", { elements: [{ ref: "s", kind: "section" }, { in: "s", kind: "heading" }] })).toBeUndefined();
  });
});

describe("routed skills", () => {
  const craft: Skill[] = [
    { name: "game-core", description: "games", body: "…" },
    { name: "craft-build", description: "build", body: "…", pass: ["build", "landing"], listed: false },
    { name: "craft-audit", description: "audit", body: "…", pass: ["audit"], listed: false },
  ];

  test("stay out of the skill tool's list (nothing per call) but load by name", async () => {
    const source = builtInSkills(craft);
    expect(source.list().map((s) => s.name)).toEqual(["game-core"]);
    expect((await source.load("craft-build"))?.description).toBe("build");
  });

  test("are named by pass in one line", () => {
    expect(routes(craft)).toBe("build: craft-build; landing: craft-build; audit: craft-audit");
    expect(routes([craft[0]])).toBe("");
  });

  test("every built-in routed skill has a pass, and the craft skills are built in", () => {
    for (const s of BUILT_IN_SKILLS.filter((s) => s.listed === false)) expect(s.pass?.length).toBeGreaterThan(0);
    expect(BUILT_IN_SKILLS.filter((s) => s.listed === false).map((s) => s.name)).toEqual(expect.arrayContaining(["craft-build", "craft-system", "craft-audit"]));
  });
});

describe("the craft block of the system prompt", () => {
  test("carries rule zero, the safeguard, the concept, the build order and the routes", () => {
    const text = craftPrompt({ routes: "build: craft-build" });
    expect(text).toContain("you decide intent, the site's system decides values");
    expect(text).toContain("the user's explicit request always wins");
    expect(text).toContain("concept");
    expect(text).toContain("signature section first and alone");
    expect(text).toContain("Skills to load: build: craft-build.");
    expect(craftPrompt()).not.toContain("Skills to load");
  });

  test("the reviewer holds the bar and keeps its JSON contract", () => {
    expect(REVIEWER_PROMPT).toContain("Idea fit");
    expect(REVIEWER_PROMPT).toContain("Signature");
    expect(REVIEWER_PROMPT).toContain('{"pass": true|false, "problems": ["..."]}');
  });
});
