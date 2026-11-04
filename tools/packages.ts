/**
 * The WordPress package (Auvyx Builder): which files of each product ship. `bun run zip` zips them; the site
 * factory (tools/factory.ts) stages them into a site of its own, so both install exactly what a buyer gets.
 */
import { minifyCss } from "./minify-css";
import { cp, mkdir, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const root = join(import.meta.dir, "..");

export type Package = { slug: string; source: string; include: (path: string) => boolean };

export const packages: Package[] = [
  {
    slug: "auvyx-builder",
    source: join(root, "products/builder"),
    include: (path) =>
      /^(auvyx-builder\.php|uninstall\.php|readme\.txt|src\/.*\.php|build\/.*|generated\/.*\.php|auvyx-editor\/editor[^/]*\.(js|css)|assets\/.*|patterns\/.*\.php|patterns\/generated\/.*\.(html|json)|languages\/.*|blocks\/[^/]+\/block.json|blocks\/[^/]+\/render\.php)$/.test(
        path
      ),
  },
];

export const walk = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : Promise.resolve([join(dir, entry.name)])
    )
  );
  return files.flat();
};

/** Copies the runtime files of `pkg` into `target` (CSS minified, as in the zip); answers how many files. */
export async function stagePackage({ slug, source, include }: Package, target: string): Promise<number> {
  const files = (await walk(source)).map((file) => relative(source, file)).filter(include);
  for (const file of files) {
    await mkdir(join(target, file, ".."), { recursive: true });
    // Hand-written stylesheets ship minified (sources keep their comments).
    if (file.endsWith(".css") && !file.endsWith("style.css") && !file.includes("/build/") && !file.startsWith("auvyx-editor/")) {
      await Bun.write(join(target, file), minifyCss(await Bun.file(join(source, file)).text()));
    } else if (file.endsWith(".php") && /^(build|generated)\//.test(file)) {
      // Generated PHP (wp-scripts' asset files and block manifest, tools/build-shared.ts data) gets the direct-access guard
      // every PHP file of a plugin needs (WordPress.org Plugin Check).
      const php = await Bun.file(join(source, file)).text();
      await Bun.write(join(target, file), /defined\(\s*'ABSPATH'\s*\)/.test(php) ? php : php.replace(/^<\?php\s*/, "<?php\ndefined( 'ABSPATH' ) || exit;\n"));
    } else {
      await cp(join(source, file), join(target, file));
    }
  }
  // Every file a block.json points to (render, style, scripts) must ship, or the block breaks only in the zip.
  for (const meta of files.filter((f) => f.endsWith("block.json"))) {
    const json = await Bun.file(join(source, meta)).text();
    for (const [, ref] of json.matchAll(/"file:\.\/([^"]+)"/g)) {
      const path = join(meta, "..", ref ?? "");
      if (!files.includes(path)) throw new Error(`${slug}: ${meta} needs ${path}, which the zip leaves out`);
    }
  }
  return files.length;
}
