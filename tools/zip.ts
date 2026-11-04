/**
 * bun run zip → dist/auvyx-builder.zip, ready for
 * Plugins/Themes → Add New → Upload. Only runtime files are shipped (tools/packages.ts).
 */
import { $ } from "bun";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { packages, stagePackage, walk } from "./packages";

const root = join(import.meta.dir, "..");
const dist = join(root, "dist");
const stage = join(dist, ".stage");

await rm(dist, { recursive: true, force: true });
for (const pkg of packages) {
  const count = await stagePackage(pkg, join(stage, pkg.slug));
  if (pkg.slug === "auvyx-builder") await noProContent(join(stage, pkg.slug));
  await $`cd ${stage} && zip -qr ${join(dist, `${pkg.slug}.zip`)} ${pkg.slug}`;
  console.log(`dist/${pkg.slug}.zip  (${count} files)`);
}
await rm(stage, { recursive: true, force: true });

/**
 * The free plugin carries none of Auvyx Builder Pro's code (WordPress.org guideline 5): no licence, no countdown and no
 * updater. (The private repository also compares the zip against Pro's template text, which is not published.)
 */
async function noProContent(dir: string) {
  const problems: string[] = [];
  for (const file of await walk(dir)) {
    const rel = file.slice(dir.length + 1);
    if (/(^|\/)(License|Licence|Countdown)\.php$/.test(rel)) problems.push(`${rel}: Pro code`);
    if (!/\.(js|php|json|html)$/.test(rel)) continue;
    const text = await Bun.file(file).text();
    if (/pre_set_site_transient_update_(plugins|themes)/.test(text)) problems.push(`${rel}: an updater`);
  }
  if (problems.length) {
    console.error(`auvyx-builder.zip carries Auvyx Builder Pro's code:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
}
