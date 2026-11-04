import { expect, test } from "bun:test";
import { INSTANCE_BLOCK, isSyntheticId, toCanvasTree } from "./canvas-tree";
import type { BuilderBlock } from "./tree";

const b = (clientId: string, name: string, attributes: Record<string, unknown> = {}, innerBlocks: BuilderBlock[] = []): BuilderBlock => ({
  clientId,
  name,
  attributes,
  innerBlocks,
});

// Fake parser: a component's "content" is the name of a single block, or "ref:N" for a nested instance.
const parse = (content: string): BuilderBlock[] =>
  content.startsWith("ref:")
    ? [b("x", "core/block", { ref: Number(content.slice(4)) })]
    : [b("x", content)];

test("instances become component-instance blocks with synthetic inner ids", () => {
  const tree = toCanvasTree([b("i1", "core/block", { ref: 7 })], (ref) => (ref === 7 ? "auvyx/text" : undefined), parse);
  expect(tree[0]?.name).toBe(INSTANCE_BLOCK);
  expect(tree[0]?.clientId).toBe("i1");
  expect(tree[0]?.innerBlocks[0]).toMatchObject({ name: "auvyx/text", clientId: "i1~0" });
  expect(isSyntheticId("i1~0")).toBe(true);
});

test("self-referencing components stop instead of recursing forever", () => {
  const tree = toCanvasTree([b("i1", "core/block", { ref: 1 })], () => "ref:1", parse);
  const nested = tree[0]?.innerBlocks[0];
  expect(nested?.name).toBe(INSTANCE_BLOCK);
  expect(nested?.innerBlocks).toEqual([]);
});

test("missing components render empty; other blocks pass through", () => {
  const tree = toCanvasTree([b("s", "auvyx/section", {}, [b("i", "core/block", { ref: 9 })])], () => undefined, parse);
  expect(tree[0]?.innerBlocks[0]).toMatchObject({ name: INSTANCE_BLOCK, innerBlocks: [] });
});
