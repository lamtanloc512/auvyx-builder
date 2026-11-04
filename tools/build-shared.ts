/**
 * shared/*.json → products/builder/generated/*.php (PHP array literals:
 * opcache-friendly, no json_decode per request). Kept out of build/, which
 * wp-scripts wipes on every build/start.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const outDir = join(root, "products/builder/generated");

const sources: Record<string, string> = {
  "css-properties": "shared/css-properties.json",
  "design-system": "shared/defaults/design-system.json",
  icons: "shared/icons.json",
  play: "shared/play.json",
  live: "shared/live.json",
  "code-libraries": "shared/code-libraries.json",
  editions: "shared/editions.json",
};

// Lines a generated file opens with, for checks that read its data as code.
const notes: Record<string, string> = {
  // The game page is a standalone document in a sandboxed iframe (srcdoc), not a WordPress page: its runtime script
  // cannot be enqueued.
  play: "// phpcs:disable WordPress.WP.EnqueuedResources.NonEnqueuedScript -- a sandboxed iframe's own document, not a WordPress page.\n",
};

const phpString = (value: string) => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;

const toPhp = (value: unknown, indent = ""): string => {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return phpString(value);
  const next = `${indent}\t`;
  if (Array.isArray(value)) {
    return `array(\n${value.map((item) => `${next}${toPhp(item, next)},\n`).join("")}${indent})`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([key]) => key !== "$comment");
  return `array(\n${entries.map(([key, item]) => `${next}${phpString(key)} => ${toPhp(item, next)},\n`).join("")}${indent})`;
};

await mkdir(outDir, { recursive: true });
for (const [name, source] of Object.entries(sources)) {
  const data = await Bun.file(join(root, source)).json();
  await Bun.write(
    join(outDir, `${name}.php`),
    `<?php\n// Generated from ${source} by tools/build-shared.ts. Do not edit.\n${notes[name] ?? ""}defined( 'ABSPATH' ) || exit;\nreturn ${toPhp(data)};\n`
  );
}
// The header / footer builders' serialization markers (docs/header-builder.md): PHP drops them from visitor HTML.
const anatomy = await Bun.file(join(root, "shared/storefront/anatomy.json")).json();
const markers = ["header", "footer"].flatMap((part) => (anatomy.entries?.[part]?.markers ?? []) as string[]).sort();
await Bun.write(
  join(outDir, "anatomy-markers.php"),
  `<?php\n// Generated from shared/storefront/anatomy.json by tools/build-shared.ts. Do not edit.\ndefined( 'ABSPATH' ) || exit;\nreturn ${toPhp(markers)};\n`
);
console.log(`shared → ${outDir}`);
