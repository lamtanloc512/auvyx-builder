/**
 * Interaction recipes (InteractionRecipes.scala, docs/plans/interaction-recipes.md): the CSS in assets/blocks.css must
 * give every recipe and variant the catalog advertises a look, keep its defaults weaker than an element's own styles,
 * and keep the accessibility contract (focus ring never removed, hover only for hover pointers, reduced motion, forced
 * colours). The catalog is the generated shared/block-catalog.json, so a recipe added in Scala without CSS fails here.
 */
import { describe, expect, test } from "bun:test";

const root = `${import.meta.dir}/../../..`;
const css = await Bun.file(`${import.meta.dir}/../assets/blocks.css`).text();
const catalog = await Bun.file(`${root}/shared/block-catalog.json`).json();

/** A selector list split at its top-level commas (not the ones inside :is(), :where(), :not()). */
const topLevel = (selector: string): string[] => {
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < selector.length; i++) {
    if (selector[i] === "(") depth++;
    else if (selector[i] === ")") depth--;
    else if (selector[i] === "," && depth === 0) { parts.push(selector.slice(start, i).trim()); start = i + 1; }
  }
  return [...parts, selector.slice(start).trim()];
};

/** The recipe looks in blocks.css: from their heading to the reduced-motion block (which must win, so is not :where()). */
const recipes = css.slice(css.indexOf("/* ---- Interaction recipes"), css.indexOf("/* Less motion asked for"));

describe("interaction recipes in blocks.css", () => {
  test("every advertised recipe and variant has CSS", () => {
    const ids: string[] = catalog.interactions.recipes.map((r: { id: string }) => r.id);
    expect(ids).toEqual(["auto", "button", "link", "card", "control", "disclosure", "none"]);
    // a kind's automatic recipe is styled through that kind's own class (a button's "button" is .wp-block-auvyx-button);
    // any other recipe needs its marker in the CSS
    const automatic = new Set(catalog.blocks.map((b: { interaction: { automatic: string } }) => b.interaction.automatic));
    for (const id of ids.filter((i) => i !== "auto" && !automatic.has(i))) expect(css).toContain(`.auvyx-ix-${id}`);
    for (const id of ["button", "link", "disclosure"]) expect(automatic.has(id)).toBe(true);
    for (const v of catalog.interactions.variants.map((v: { id: string }) => v.id).filter((v: string) => v !== "default")) {
      expect(css).toContain(`.auvyx-ix-v-${v}`);
    }
  });

  test("every block's automatic recipe is one it offers", () => {
    for (const block of catalog.blocks) {
      const own = block.interaction.recipes as string[];
      expect(own[0]).toBe("auto");
      expect(own).toContain("none");
      expect(own.includes(block.interaction.automatic) || block.interaction.automatic === "none").toBe(true);
    }
  });

  test("defaults stay weaker than an element's own styles: every recipe rule is wrapped in :where()", () => {
    // every rule's selector: the text before its "{" (after an enclosing @media's "{")
    const rules = recipes
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .map((chunk) => chunk.split("{"))
      .filter((parts) => parts.length >= 2)
      .map((parts) => (parts[parts.length - 2] ?? "").trim())
      .filter((s) => s && s !== ":root");
    expect(rules.length).toBeGreaterThan(30);
    for (const selector of rules) {
      for (const part of topLevel(selector)) expect({ part, where: part.startsWith(":where(") }).toEqual({ part, where: true });
    }
  });

  test("hover looks only for hover-capable pointers; the focus ring is never removed", () => {
    const hoverRules = recipes.replace(/@media \(hover: hover\) \{[\s\S]*?\n\}/g, "");
    expect(hoverRules).not.toMatch(/:hover\s*[{,]/);
    expect(css).not.toMatch(/auvyx-ix-none[^{]*:focus-visible[^}]*outline:\s*(none|0)/);
    expect(recipes).toContain(":where(.wp-block-auvyx-button):focus-visible");
  });

  test("reduced motion and forced colours are handled", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain("transition-duration: 0.01ms");
    expect(reduced).toContain("transform: none");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toMatch(/forced-colors: active\)[\s\S]*outline: 2px solid Highlight/);
  });
});
