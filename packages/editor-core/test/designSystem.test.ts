/** The design system for one idea: ui-craft's `system` tests (test/cli.test.mjs), case for case where they fit a DESIGN.md. */
import { describe, expect, test } from "bun:test";
import { contrast, designMdProblems, designSystem, groundDark, hexLch, readDesignMd, systemToDesignMd, type System } from "../src/designSystem";
import { setTokens } from "../src/actions/themeImport";

const CONCEPT = {
  idea: "A ferry ledger for one river crossing, kept by hand since the bridge fell",
  signature: "The crossing drawn as a hand-ruled tide line",
  palette: "River silt and tarred hull planks from the crossing",
  voice: "A stamped ledger face like the fare board",
};
const make = (color: Record<string, string>, more: Record<string, unknown> = {}): System => {
  const r = designSystem({ name: "test", concept: CONCEPT, color, ...more });
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
};
const lum = (h: string) => contrast(h, "#000000") * 0.05 - 0.05;

const GROUNDS = [["near-white", "#fdfdfd"], ["cream", "#f3e9d2"], ["saturated-red", "#d0021b"], ["mid-grey", "#777777"], ["near-black", "#050505"], ["charcoal", "#1c1c1c"], ["dark-navy", "#10203f"], ["yellow", "#ffee00"], ["black", "#000"]];

describe("contrast by construction", () => {
  for (const [name, ground] of GROUNDS)
    for (const primary of ["#fdfdfd", "#050505", "#ff00ff", "#777777"])
      test(`holds in both modes on a hostile ground (${name}, primary ${primary})`, () => {
        const s = make({ ground: ground!, primary });
        expect(s.light.ground).toBe(ground!.length === 4 ? "#000000" : ground!);
        expect(Math.abs(Math.cbrt(lum(s.dark.ground)) - Math.cbrt(lum(s.light.ground)))).toBeGreaterThanOrEqual(0.05);
        for (const m of [s.light, s.dark]) {
          expect(m.muted).not.toBe(m.ground);
          for (const fg of [m.fg, m.textSecondary, m.mutedFg, m.highlight]) for (const bg of [m.ground, m.card, m.muted, m.secondary]) expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(m.primaryFg, m.primary)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(m.highlightFg, m.highlight)).toBeGreaterThanOrEqual(4.5);
        }
      });
});

describe("the ground decides the page", () => {
  const hue = (h: string) => hexLch(h).h;
  test("surfaces and borders take the ground's hue; two grounds give two pages", () => {
    const cream = make({ ground: "#efe0c2", primary: "#7a2e12" }).light;
    const sage = make({ ground: "#b9cdb0", primary: "#7a2e12" }).light;
    for (const role of ["muted", "border", "sunk"] as const) {
      expect(cream[role]).not.toBe(sage[role]);
      expect(Math.abs(hue(cream[role]) - hue("#efe0c2"))).toBeLessThan(12);
      expect(Math.abs(hue(sage[role]) - hue("#b9cdb0"))).toBeLessThan(12);
    }
  });

  test("groundDark is used as given, and otherwise keeps the ground's hue and stays dark", () => {
    expect(make({ ground: "#c8102e", groundDark: "#123456", primary: "#ffffff" }).dark.ground).toBe("#123456");
    const derived = groundDark("#0f6b5c");
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(derived.slice(i, i + 2), 16)) as [number, number, number];
    expect(g > r + 10 && b > r + 5).toBe(true);
    expect(lum(derived)).toBeLessThan(0.05);
  });

  test("deterministic", () => {
    const a = systemToDesignMd(make({ ground: "#f3e9d2", primary: "#0b6e4f" }));
    expect(systemToDesignMd(make({ ground: "#f3e9d2", primary: "#0b6e4f" }))).toBe(a);
    expect(a).not.toMatch(/NaN|undefined|oklch/);
  });
});

describe("refusals", () => {
  test("bad specs, with actionable errors, all at once", () => {
    const r = designSystem({ name: "bad", concept: CONCEPT, colour: "red", color: { ground: "red", primary: "#12", neutral: "warm" }, space: { density: "tight" }, depth: 3, type: { display: { weight: 2000 } } });
    expect(r.ok).toBe(false);
    const text = r.ok ? "" : r.errors.join("\n");
    for (const re of [/unknown key "colour"/, /unknown key "color\.neutral"/, /color\.ground: "red" is invalid/, /color\.primary: "#12" is invalid, expected a hex colour/, /space\.density: "tight" is invalid, expected compact\|normal\|airy/, /depth: 3 is invalid/, /type\.display\.weight: 2000/]) expect(text).toMatch(re);
  });

  test("a missing ground, primary or concept; a thin or padded concept", () => {
    const errs = (raw: unknown) => { const r = designSystem(raw); return r.ok ? "" : r.errors.join("\n"); };
    expect(errs({ name: "x", concept: CONCEPT, color: { primary: "#0b6e4f" } })).toMatch(/missing required "color\.ground"/);
    expect(errs({ name: "x", concept: CONCEPT, color: { ground: "#ffffff" } })).toMatch(/missing required "color\.primary"/);
    const none = errs({ name: "x", color: { ground: "#ffffff", primary: "#0b6e4f" } });
    expect(none).toMatch(/missing required "concept\.idea"/);
    expect(none).toMatch(/missing required "concept\.signature"/);
    const thin = errs({ name: "x", concept: { ...CONCEPT, idea: "a modern clean site", signature: "hero" }, color: { ground: "#ffffff", primary: "#0b6e4f" } });
    expect(thin).toMatch(/concept\.idea: "a modern clean site" is invalid, expected one sentence of at least 8 different words/);
    expect(thin).toMatch(/concept\.signature: "hero" is invalid/);
    expect(errs({ name: "x", concept: { ...CONCEPT, idea: "site site site site site site site site site" }, color: { ground: "#ffffff", primary: "#0b6e4f" } })).toMatch(/concept\.idea/);
  });

  test("cream or near-white with a soft serif, unless the concept argues the habit", () => {
    const cream = designSystem({ name: "x", concept: CONCEPT, color: { ground: "#ebe5d8", primary: "#7a2e12" }, type: { display: { family: "Fraunces, Georgia, serif" } } });
    expect(cream.ok ? "" : cream.errors[0]).toMatch(/cream paper with a soft serif/);
    const white = designSystem({ name: "x", concept: CONCEPT, color: { ground: "#fbfbfb", primary: "#7a2e12" }, type: { display: { family: "Georgia, serif" } } });
    expect(white.ok ? "" : white.errors[0]).toMatch(/with a soft serif/); // a grey has no hue: either habit names it
    expect(designSystem({ name: "x", concept: { ...CONCEPT, habit: "The almanac this press reprints was set in Fraunces on cream stock" }, color: { ground: "#ebe5d8", primary: "#7a2e12" }, type: { display: { family: "Fraunces, serif" } } }).ok).toBe(true);
    expect(designSystem({ name: "x", concept: CONCEPT, color: { ground: "#ebe5d8", primary: "#7a2e12" }, type: { display: { family: "Space Grotesk, sans-serif" } } }).ok).toBe(true);
  });
});

describe("as a DESIGN.md for the brief", () => {
  const s = make({ ground: "#e6f0ee", primary: "#0b6e4f", accent: "#d3481b" }, { type: { display: { family: "Bricolage Grotesque, sans-serif", weight: 800 }, base: 17, ratio: 1.2 }, space: { density: "airy" }, shape: { radius: "0" }, depth: "hard" });
  const md = systemToDesignMd(s);

  test("carries the roles the endpoint reads, a modular scale, corners, spacing and the concept", () => {
    expect(md).toContain('  background: "#e6f0ee"');
    expect(md).toContain(`  on-background: "${s.light.fg}"`);
    expect(md).toContain(`  secondary: "${s.dark.ground}"`);
    expect(md).toMatch(/ {2}display: \{ fontFamily: "Bricolage Grotesque, sans-serif", fontSize: 42.3px, fontWeight: 800/); // 17·1.2⁵
    expect(md).toMatch(/ {2}body-md: \{ fontFamily: "system-ui, sans-serif", fontSize: 17px, lineHeight: 1.5 \}/);
    expect(md).toContain("rounded: { sm: 0px, md: 0px, lg: 0px, full: 9999px }");
    expect(md).toContain("spacing: { xs: 5px, sm: 10px, md: 20px, lg: 40px, xl: 80px }");
    expect(md).toContain(`  idea: "${CONCEPT.idea}"`);
  });

  test("reads back: concept, ground and display face; and the token setter edits it", () => {
    const back = readDesignMd(md);
    expect(back.concept).toEqual(CONCEPT);
    expect(back.ground).toBe("#e6f0ee");
    expect(back.display).toBe("Bricolage Grotesque, sans-serif");
    expect(designMdProblems(md)).toEqual([]);
    const set = setTokens(md, [["colors.primary", "#123456"]]);
    expect(set.ok && set.value).toContain('primary: "#123456"');
  });

  test("a hand-written DESIGN.md needs the concept, and the habit rule applies to it too", () => {
    expect(designMdProblems('---\nname: x\ncolors:\n  background: "#ffffff"\n---\nA brand.')).toEqual(expect.arrayContaining([expect.stringMatching(/missing required "concept\.idea"/)]));
    const habit = `---\nname: x\nconcept: { idea: "${CONCEPT.idea}", signature: "${CONCEPT.signature}", palette: "${CONCEPT.palette}", voice: "${CONCEPT.voice}" }\ncolors:\n  background: "#f1e7cf"\ntypography:\n  headline-lg: { fontFamily: Fraunces, fontSize: 48px }\n---\n`;
    expect(designMdProblems(habit)).toEqual([expect.stringMatching(/cream paper with a soft serif/)]);
  });
});
