/**
 * Auvyx Play runtimes (packages/play/src/runtime) → products/builder/assets/play-game.js (the script a game's document loads)
 * and play-page.js (a page that shows games). Beside code.js, so play-page.js finds lib/ the way code.js does.
 * EzyPlatform copies the same files (products/ezyplatform/prepare-assets.mjs).
 */
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const out = join(root, "products/builder/assets");

for (const entry of ["game", "page"]) {
  const result = await Bun.build({
    entrypoints: [join(root, `packages/play/src/runtime/${entry}-entry.ts`)],
    target: "browser",
    format: "iife",
    minify: true,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  const [artifact] = result.outputs;
  if (!artifact) throw new Error(`No output for ${entry}`);
  await Bun.write(join(out, `play-${entry}.js`), `/* Auvyx Play ${entry} runtime: generated from packages/play by tools/build-play.ts. */\n${await artifact.text()}`);
}
console.log(`play → ${out}/play-{game,page}.js`);
