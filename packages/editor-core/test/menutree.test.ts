import { expect, test } from "bun:test";
import { MenuTree } from "../src/index";
const { node, insert, indent, outdent, shift, remove, flatten, get } = MenuTree;

const menu = [node("Home", "/"), node("Shop", "/shop", { children: [node("Phones", "/p")] }), node("About", "/about")];

test("insert inside a path, never deeper than three levels", () => {
  const a = insert(menu, [1, 0], 0, node("New", ""));
  expect(get(a, [1, 0, 0])!.label).toBe("New");
  expect(insert(a, [1, 0, 0], 0, node("Too deep", ""))).toBe(a);
});

test("indent, outdent and shift keep the moved item's path", () => {
  const [a, p] = indent(menu, [2]);
  expect(p).toEqual([1, 1]);
  expect(get(a, p)!.label).toBe("About");
  const [b, q] = outdent(a, p);
  expect(q).toEqual([2]);
  expect(flatten(b).map(([, n]) => n.label)).toEqual(["Home", "Shop", "Phones", "About"]);
  const [c, r] = shift(menu, [0], 1);
  expect(r).toEqual([1]);
  expect(c.map((n) => n.label)).toEqual(["Shop", "Home", "About"]);
  expect(remove(menu, [1, 0])[1]!.children).toEqual([]);
});
