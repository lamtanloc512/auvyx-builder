/**
 * The agent's pure parts beyond the registry: forms (the Studio's Forms; their comment is checked against the Scala core,
 * which writes a form block's comment the same way), games kept from element trees, and site templates written,
 * captured and led to this host's routes.
 */
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { DocJson, decodeTree, type TreeNode } from "../src/index";
import * as Forms from "../src/actions/forms";
import { newKey, parseGame, withGames } from "../src/actions/games";
import { capture, localize, toJson } from "../src/actions/siteTemplateOps";
import { decode as decodeTemplate } from "../src/siteTemplate";
import { NEWSLETTER_FORM_HTML, NEWSLETTER_FORM_RAW } from "../src/footerBuilder";

const CORE = new URL("../../../apps/studio/packages/mcp/dist/core.js", import.meta.url).pathname;
const core = existsSync(CORE) ? await import(CORE) : null;

describe("forms = the Studio's", () => {
  const newsletter: Forms.Form = { ...Forms.starter("newsletter"), fields: [Forms.field("email", "Email", "email", true, [], "you@example.com")], submit: "Subscribe", success: "Thanks, you are on the list." };
  test("the newsletter form's comment and HTML", () => {
    expect(Forms.markup(newsletter)).toBe(NEWSLETTER_FORM_RAW);
    expect(Forms.html(newsletter)).toBe(NEWSLETTER_FORM_HTML);
  });
  test("names from labels", () => {
    expect(Forms.nameFor("Your e-mail", new Set())).toBe("your_e_mail");
    expect(Forms.nameFor("Your e-mail", new Set(["your_e_mail"]))).toBe("your_e_mail_2");
    expect(Forms.nameFor("123", new Set())).toBe("field_123");
  });
  (core ? test : test.skip)("the comment is what the Scala core writes for the same form", () => {
    const form: Forms.Form = { ...Forms.starter("contact-1"), fields: [Forms.field("topic", "Topic", "select", true, ["A", "B & C"]), Forms.field("ok", "OK?", "checkbox")],
      to: "a@b.co, nope", subject: "Hi", redirect: "/thanks", webhook: "javascript:x" };
    const attrs = JSON.parse(Forms.markup(form).replace(/^<!-- wp:auvyx\/form /, "").replace(/ \/-->$/, "").replace(/\\u002d\\u002d/g, "--"));
    core.openDocument("f", JSON.stringify({ blocks: [], canScript: true, blockNames: ["auvyx/form"] }));
    const r = JSON.parse(core.callAction("f", "insert_elements", JSON.stringify({ elements: [{ kind: "block", block: "auvyx/form", attrs }] })));
    expect(r.ok).toBe(true);
    const markup = JSON.parse(core.markup("f")).result as string;
    core.closeDocument("f");
    expect(markup).toContain(Forms.markup(form));
  });
});

describe("games from element trees", () => {
  test("written, named and fresh games", () => {
    const made: string[] = [];
    const create = (g: { source: { title: string } }) => { made.push(g.source.title); return newKey(() => 0.5); };
    const out = withGames({ kind: "box", children: [
      { kind: "game", title: "Pong", html: "<div></div>", js: "export default () => {}", libs: ["three", "lenis"], css: "x{}" },
      { kind: "game", game: "gabcdef1234" },
      { kind: "game", label: "Runner" },
    ] }, create as never) as { children: Record<string, unknown>[] };
    expect(made).toEqual(["Pong", "Runner"]);
    expect(out.children[0]).toEqual({ kind: "game", game: "gsssssssssss", css: "x{}", label: "Game" });
    expect(out.children[1]).toEqual({ kind: "game", game: "gabcdef1234", label: "Game" });
    const doc = decodeTree([], () => "x");
    expect(doc.roots).toEqual([]);
    const g = parseGame({ title: "T", libs: ["three", "lenis", "three"] });
    expect(g.ok && g.value.source.libs).toEqual(["three"]);
    expect(parseGame({ title: "" })).toEqual({ ok: false, error: "A game needs a title." });
  });
});

describe("site templates", () => {
  const tree = (blocks: TreeNode[]) => decodeTree(blocks, (() => { let n = 0; return () => `n${++n}`; })());
  test("captured, written and read back", () => {
    const home = tree([{ block: "auvyx/section", children: [{ block: "auvyx/heading", level: 1, text: "Hi" }, { block: "auvyx/nav", src: "nav:7" }] } as TreeNode]);
    const t = capture("my-site", "My site", "", "---\nname: x\n---\n", [{ title: "Home", slug: "", template: "", front: true, doc: home }, { title: "Home", slug: "", template: "", front: false, doc: home }],
      [["nav:7", { key: "", title: "Main Menu", items: [{ label: "Home", page: "", url: "https://x.test/home/", mega: false, children: [], from: "" }] }]], [["header", home]],
      (n) => [["markup", n.raw]], { home: "https://x.test/home" });
    expect(t.pages.map((p) => p.key)).toEqual(["home", "home-2"]);
    expect(t.menus[0]).toMatchObject({ key: "main-menu", items: [{ label: "Home", page: "home", url: "" }] });
    const json = toJson(t);
    expect(json.schema).toBe("auvyx-site/1");
    expect(JSON.stringify(json)).toContain('"menu":"main-menu"');
    const back = decodeTemplate(JSON.stringify(json));
    expect(back.ok).toBe(true);
    if (back.ok) expect(toJson(back.value)).toEqual(json);
  });
  test("the shop's routes lead to this host", () => {
    const back = decodeTemplate(JSON.stringify({ schema: "auvyx-site/1", id: "s", title: "S", menus: [{ key: "m", title: "M", items: [{ label: "Shop", url: "/shop?x=1" }, { label: "Cat", url: "/product-categories/bags" }] }],
      pages: [{ key: "home", title: "Home", elements: [{ kind: "button", text: "Go", href: "/account" }] }] }));
    if (!back.ok) throw new Error(back.error);
    const t = localize(back.value, { store: "https://x.test/", shop: "https://x.test/shop/", account: "https://x.test/my-account/", track: "", category: "https://x.test/product-category", brand: "" });
    expect(t.menus[0]!.items.map((i) => i.url)).toEqual(["https://x.test/shop/?x=1", "https://x.test/product-category/bags/"]);
    expect(JSON.stringify(t.pages[0]!.elements)).toContain("https://x.test/my-account/");
  });
});

void DocJson;
