import { describe, expect, test } from "bun:test";
import {
  findPath,
  flatten,
  getParentId,
  insertRelative,
  insertionPoint,
  moveRelative,
  removeById,
  updateById,
  type BuilderBlock,
} from "./tree";

const b = (clientId: string, name = "auvyx/text", innerBlocks: BuilderBlock[] = []): BuilderBlock => ({
  clientId,
  name,
  attributes: {},
  innerBlocks,
});

const tree = [b("s1", "auvyx/section", [b("h1", "auvyx/heading"), b("t1")]), b("btn", "auvyx/button")];
const ids = (blocks: BuilderBlock[]) => flatten(blocks).map(({ block, depth }) => `${"-".repeat(depth)}${block.clientId}`);

describe("lookup", () => {
  test("findPath / getParentId / flatten order", () => {
    expect(findPath(tree, "t1")).toEqual([0, 1]);
    expect(findPath(tree, "nope")).toBeUndefined();
    expect(getParentId(tree, "t1")).toBe("s1");
    expect(getParentId(tree, "s1")).toBeUndefined();
    expect(ids(tree)).toEqual(["s1", "-h1", "-t1", "btn"]);
  });
});

describe("insert / remove / update", () => {
  test("insertRelative before, after, inside, root", () => {
    expect(ids(insertRelative(tree, b("x"), "h1", "before"))).toEqual(["s1", "-x", "-h1", "-t1", "btn"]);
    expect(ids(insertRelative(tree, b("x"), "h1", "after"))).toEqual(["s1", "-h1", "-x", "-t1", "btn"]);
    expect(ids(insertRelative(tree, b("x"), "s1", "inside"))).toEqual(["s1", "-h1", "-t1", "-x", "btn"]);
    expect(ids(insertRelative(tree, b("x"), undefined, "after"))).toEqual(["s1", "-h1", "-t1", "btn", "x"]);
  });

  test("removeById and updateById keep clientIds and do not mutate", () => {
    expect(ids(removeById(tree, "h1"))).toEqual(["s1", "-t1", "btn"]);
    const updated = updateById(tree, "t1", { content: "Hi" });
    expect(updated[0]?.innerBlocks[1]).toEqual({ ...b("t1"), attributes: { content: "Hi" } });
    expect(tree[0]?.innerBlocks[1]?.attributes).toEqual({});
  });
});

describe("moveRelative", () => {
  test("moves across levels", () => {
    expect(ids(moveRelative(tree, "btn", "h1", "after"))).toEqual(["s1", "-h1", "-btn", "-t1"]);
    expect(ids(moveRelative(tree, "h1", "btn", "after"))).toEqual(["s1", "-t1", "btn", "h1"]);
  });

  test("refuses to move a block into itself or its descendants", () => {
    expect(ids(moveRelative(tree, "s1", "t1", "inside"))).toEqual(ids(tree));
    expect(ids(moveRelative(tree, "s1", "s1", "after"))).toEqual(ids(tree));
  });
});

test("insertionPoint: inside a selected container, after other blocks, else root", () => {
  expect(insertionPoint(tree, "s1")).toEqual({ targetId: "s1", placement: "inside" });
  expect(insertionPoint(tree, "t1")).toEqual({ targetId: "t1", placement: "after" });
  expect(insertionPoint(tree, undefined)).toEqual({ targetId: undefined, placement: "after" });
});
