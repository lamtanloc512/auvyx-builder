import { expect, test } from "bun:test";
import { commit, createHistory, redo, undo } from "./history";

test("commit, undo, redo", () => {
  let h = createHistory(0);
  h = commit(h, 1, undefined, 0);
  h = commit(h, 2, undefined, 10);
  expect(h.past).toEqual([0, 1]);
  h = undo(h);
  expect(h.present).toBe(1);
  h = redo(h);
  expect(h.present).toBe(2);
  expect(redo(h)).toBe(h);
});

test("same key within the window coalesces into one step", () => {
  let h = createHistory("a");
  h = commit(h, "b", "drag:pt", 1000);
  h = commit(h, "c", "drag:pt", 1500);
  h = commit(h, "d", "drag:pt", 2400);
  expect(h.past).toEqual(["a"]);
  expect(h.present).toBe("d");
  h = commit(h, "e", "drag:pt", 4000); // window expired
  expect(h.past).toEqual(["a", "d"]);
});

test("a new commit clears redo; undo breaks coalescing", () => {
  let h = commit(createHistory(0), 1, "k", 0);
  h = undo(h);
  h = commit(h, 5, "k", 10);
  expect(h.past).toEqual([0]);
  expect(h.future).toEqual([]);
});
