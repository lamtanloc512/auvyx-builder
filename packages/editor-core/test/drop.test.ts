import { expect, test } from "bun:test";
import { decodeTree, dropPlace, move, type Doc } from "../src/index";

// s1 [ h(e2) t(e3) s4 [ b(e5) ] ]  t(e6)
const doc: Doc = decodeTree([
  { block: "auvyx/section", children: [{ block: "auvyx/heading" }, { block: "auvyx/text" }, { block: "auvyx/section", children: [{ block: "auvyx/button" }] }] },
  { block: "auvyx/text" },
]);
const order = (d: Doc, p: string | null) => (p ? d.nodes[p]!.children : d.roots);

test("before and after a sibling, counted without the moving element", () => {
  expect(dropPlace(doc, "e3", "after", "e2")).toEqual(["e1", 1]);
  const [p, i] = dropPlace(doc, "e4", "after", "e2")!;
  expect(order(move(doc, "e2", p, i), "e1")).toEqual(["e3", "e4", "e2"]);
  expect(dropPlace(doc, "e1", "before", "e6")).toEqual([null, 0]);
});

test("inside a container goes last; a leaf takes nothing", () => {
  expect(dropPlace(doc, "e4", "inside", "e2")).toEqual(["e4", 1]);
  expect(dropPlace(doc, "e3", "inside", "e2")).toBeNull();
});

test("never into itself or its own descendants", () => {
  expect(dropPlace(doc, "e1", "inside", "e1")).toBeNull();
  expect(dropPlace(doc, "e5", "after", "e1")).toBeNull();
  expect(dropPlace(doc, "e4", "inside", "e1")).toBeNull();
});

test("a new element (nothing moving) counts every sibling", () => {
  expect(dropPlace(doc, "e3", "before")).toEqual(["e1", 1]);
  expect(dropPlace(doc, "e6", "after")).toEqual([null, 2]);
});
