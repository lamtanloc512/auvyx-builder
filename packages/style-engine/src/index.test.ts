import { describe, expect, test } from "bun:test";
import designSystem from "@auvyx/shared/design-system.json";
import fixtures from "@auvyx/shared/fixtures/style-engine.json";
import {
  compileBlockStyles,
  compileScopedCss,
  compileStyles,
  isSafeValue,
  normalizeStyles,
  resolveValue,
  type Breakpoint,
} from "./index";

const defaultBreakpoints: Breakpoint[] = designSystem.breakpoints;

type Fixture = {
  name: string;
  styles: unknown;
  breakpoints?: Breakpoint[];
  expected: { className: string; css: string } | null;
};

describe("parity fixtures (shared with PHP)", () => {
  for (const fixture of fixtures.cases as Fixture[]) {
    test(fixture.name, () => {
      const result = compileBlockStyles(
        fixture.styles,
        fixture.breakpoints ?? defaultBreakpoints
      );
      if (fixture.expected === null) {
        expect(result).toBeNull();
        return;
      }
      expect(result).not.toBeNull();
      expect(result?.className).toBe(fixture.expected.className);
      expect(result?.css).toBe(
        fixture.expected.css.replaceAll("{{c}}", fixture.expected.className)
      );
    });
  }
});

describe("scoped CSS parity fixtures (shared with PHP and Scala)", () => {
  type Scoped = { name: string; css: unknown; expected: { className: string; css: string } | null };
  for (const fixture of (fixtures as unknown as { scoped: Scoped[] }).scoped) {
    test(fixture.name, () => {
      const result = compileScopedCss(fixture.css);
      if (fixture.expected === null) {
        expect(result).toBeNull();
        return;
      }
      expect(result?.className).toBe(fixture.expected.className);
      expect(result?.css).toBe(fixture.expected.css.replaceAll("{{c}}", fixture.expected.className));
    });
  }
});

describe("isSafeValue", () => {
  test.each([
    ["1rem", true],
    ["var(--wp--preset--color--auvyx-primary)", true],
    ["url(/wp-content/uploads/a.png)", true],
    ["url('https://a.test/a.png'), url(\"/b.png\")", true],
    ["url(data:image/png;base64,AAA)", false],
    ["url(a.png", false],
    ["red /* comment */", false],
    ["@import url(https://a.test)", false],
  ])("%p → %p", (value, expected) => {
    expect(isSafeValue(value)).toBe(expected);
  });
});

describe("editor simulation", () => {
  const styles = normalizeStyles({
    base: { default: { gap: "2rem" } },
    tablet: { default: { gap: "1.5rem" } },
    mobile: { default: { gap: "1rem" } },
  });

  test("desktop emits base only, without media queries", () => {
    expect(
      compileStyles(styles, ".x", defaultBreakpoints, { simulateBreakpoint: "base" })
    ).toBe(".x{gap:2rem}");
  });

  test("mobile emits the full cascade, without media queries", () => {
    expect(
      compileStyles(styles, ".x", defaultBreakpoints, { simulateBreakpoint: "mobile" })
    ).toBe(".x{gap:2rem}.x{gap:1.5rem}.x{gap:1rem}");
  });
});

describe("forced state (editor preview of hover/focus)", () => {
  test("repeats the state's declarations without the pseudo-class", () => {
    const styles = normalizeStyles({ base: { default: { color: "red" }, hover: { color: "blue" } } });
    expect(
      compileStyles(styles, ".x", defaultBreakpoints, { simulateBreakpoint: "base", forceState: "hover" })
    ).toBe(".x{color:red}.x:hover{color:blue}.x{color:blue}");
  });
});

describe("resolveValue", () => {
  const styles = normalizeStyles({
    base: { default: { color: "red", gap: "2rem" } },
    tablet: { default: { color: "blue" } },
  });

  test("inherits from the closest wider breakpoint", () => {
    expect(resolveValue(styles, defaultBreakpoints, "mobile", "default", "color")).toEqual({
      value: "blue",
      breakpointId: "tablet",
    });
    expect(resolveValue(styles, defaultBreakpoints, "mobile", "default", "gap")).toEqual({
      value: "2rem",
      breakpointId: "base",
    });
  });

  test("returns undefined when nothing is set", () => {
    expect(resolveValue(styles, defaultBreakpoints, "mobile", "hover", "color")).toBeUndefined();
  });
});
