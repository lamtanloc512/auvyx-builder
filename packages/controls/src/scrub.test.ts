import { expect, test } from "bun:test";
import { scrubValue } from "./scrub";

test.each([
  ["16px", undefined, 4, {}, "20px"],
  ["1.5rem", undefined, 2, { step: 0.1 }, "1.7rem"],
  [undefined, "24px", -4, {}, "20px"],
  [undefined, undefined, 3, {}, "3px"],
  [undefined, undefined, 3, { unit: "" }, "3"],
  ["0", undefined, 5, {}, "5px"],
  ["0.8", undefined, 1, { step: 0.05, unit: "" }, "0.85"],
  ["2px", undefined, -10, { min: 0 }, "0px"],
  ["var(--x)", "auto", 2, {}, "2px"],
  ["600", undefined, 1, { step: 100, unit: "" }, "700"],
] as const)("scrubValue(%p, %p, %p, %p) → %p", (current, fallback, steps, options, expected) => {
  expect(scrubValue(current, fallback, steps, options)).toBe(expected);
});
