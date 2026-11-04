/** Data sources (src/dataSources.ts) against the fixtures the Scala DataSources and DataSources.php run. */
import { describe, expect, test } from "bun:test";
import cases from "../../../shared/fixtures/data-sources/cases.json";
import { DataSources as D } from "../src/index";

const specOf = (o: Record<string, unknown>) => D.fromJson(o)!;

describe("data sources: shared fixtures", () => {
  for (const c of cases.items as { name: string; spec: Record<string, unknown>; answer: string; limit?: number; expected: { items?: unknown; error?: boolean } }[])
    test(c.name, () => {
      const out = D.parse(c.answer, specOf(c.spec), c.limit ?? D.MAX_ITEMS);
      if (c.expected.error) expect("error" in out).toBe(true);
      else expect(out).toEqual({ items: c.expected.items as Record<string, string>[] });
    });
  for (const c of cases.validate as { name: string; spec: Record<string, unknown>; valid: boolean }[])
    test(`validate: ${c.name}`, () => expect("ok" in D.validate(specOf(c.spec))).toBe(c.valid));
  test("fields: named by the source, shapes guessed from the name", () => {
    const s = D.spec({ name: "shop", label: "Shop", url: "https://x.test", fields: [["product_image", "img"], ["link_url", "u"], ["title", "t"]] });
    expect(D.fields([s])).toEqual([
      { key: "data/product_image", label: "Product image", group: "Data: Shop", shape: "Image" },
      { key: "data/link_url", label: "Link url", group: "Data: Shop", shape: "Url" },
      { key: "data/title", label: "Title", group: "Data: Shop", shape: "Text" },
    ]);
    expect(D.fromJson(D.toJson(s, true))).toEqual(s);
  });
});
