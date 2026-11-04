import { expect, test } from "bun:test";
import { annotate } from "./annotate";
import type { BuilderBlock } from "./tree";

const b = (clientId: string, name: string, innerBlocks: BuilderBlock[] = []): BuilderBlock => ({
  clientId,
  name,
  attributes: {},
  innerBlocks,
});

test("maps opening comments to the following element in pre-order", () => {
  const root = document.createElement("div");
  root.innerHTML = `<!-- wp:auvyx/section {"align":"full"} -->
<section class="s"><!-- wp:auvyx/heading -->
<h2>Hi</h2>
<!-- /wp:auvyx/heading --><!-- wp:latest-posts /--><!-- wp:auvyx/text --><p>T</p><!-- /wp:auvyx/text --></section>
<!-- /wp:auvyx/section -->
<!-- wp:auvyx/button --><a href="#">Go</a><!-- /wp:auvyx/button -->`;
  const blocks = [
    b("s", "auvyx/section", [b("h", "auvyx/heading"), b("lp", "core/latest-posts"), b("t", "auvyx/text")]),
    b("btn", "auvyx/button"),
  ];
  const map = annotate(root, blocks);
  expect([...map.keys()]).toEqual(["s", "h", "t", "btn"]);
  expect(map.get("h")?.tagName).toBe("H2");
  expect(root.querySelector("a")?.dataset.auvyxId).toBe("btn");
});
