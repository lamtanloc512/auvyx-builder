import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { chromium } from "playwright";

// The cascade table comes from the PHP style engine. A checkout without the PHP CLI skips this test.
const hasPhp = (() => {
  try {
    execFileSync("php", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const css = hasPhp
  ? (JSON.parse(
      execFileSync("php", [join(import.meta.dir, "php/isolated-cascade-css.php")], { encoding: "utf8" }),
    ) as { reset: string; block: string; boost: string; shadow: string })
  : { reset: "", block: "", boost: "", shadow: "" };

const testPhp = hasPhp ? test : test.skip;

testPhp("an isolated heading keeps the font-size and weight of the same heading in a shadow tree", async () => {
  expect(css.boost).toContain(".auvyx-isolated.auvyx-isolated .auvyx-hero{font-size:64px;font-weight:600}");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><style>
      :root { --wp--preset--color--auvyx-text:#111111; --wp--preset--font-family--auvyx-body:Manrope, sans-serif; --wp--preset--font-size--auvyx-md:1.05rem; }
      .theme h1, .theme p { color:#c026d3; font-family:"Comic Sans MS", cursive; font-size:12px; font-weight:200; }
      .theme.heavy h1 { color:#c026d3 !important; font-family:"Comic Sans MS", cursive !important; font-size:12px !important; font-weight:200 !important; }
      ${css.reset}
      ${css.block}
      ${css.boost}
    </style>
    <section class="theme" id="follow"><h1 class="auvyx-hero">Ship the query.</h1><p>Body copy.</p></section>
    <section class="theme auvyx-isolated" id="isolated"><h1 class="auvyx-hero">Ship the query.</h1><p>Body copy.</p></section>
    <section class="theme heavy" id="shadow">${css.shadow}</section>`);
    const read = (sel: string) =>
      page.locator(sel).evaluate((el) => {
        const style = getComputedStyle(el);
        return { size: style.fontSize, weight: style.fontWeight, color: style.color };
      });
    const isolated = await read("#isolated h1");
    const shadow = await read("#shadow h1");
    const follow = await read("#follow h1");
    expect(isolated.size).toBe(shadow.size);
    expect(isolated.weight).toBe(shadow.weight);
    expect(isolated.size).toBe("64px");
    expect(isolated.weight).toBe("600");
    expect(isolated.color).toBe(shadow.color);
    expect(isolated.color).toBe("rgb(17, 17, 17)");
    expect(follow.color).toBe("rgb(192, 38, 211)");
    const isolatedBody = await read("#isolated p");
    const shadowBody = await read("#shadow p");
    expect(isolatedBody.size).toBe(shadowBody.size);
    expect(isolatedBody.weight).toBe(shadowBody.weight);
    expect(isolatedBody.weight).toBe("400");
    expect(isolatedBody.size).not.toBe("12px");
  } finally {
    await browser.close();
  }
});
