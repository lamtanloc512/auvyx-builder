/**
 * Writes the design tool's DESIGN.md fixtures (packages/editor-core designSystem.ts → system-*.md), which brief-test.php
 * applies: shadows from `elevation`, the dark scheme from `dark`, the concept kept. Run after changing the generator:
 *   bun products/builder/tests/fixtures/designmd/generate-system.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { designSystem, systemToDesignMd } from "../../../../../packages/editor-core/src/designSystem";

const designs: Record<string, unknown> = {
  "system-tidewater": {
    name: "Tidewater Ferries",
    concept: {
      idea: "A small island ferry line whose timetable board is the whole brand",
      signature: "a split-flap departures board with the next crossing",
      palette: "sea fog over slate water and a signal orange buoy",
      voice: "a condensed grotesk like the painted hull numbers",
    },
    color: { ground: "#e6eef0", primary: "#d9480f" },
    type: { display: { family: "Archivo Narrow, system-ui, sans-serif", weight: 700 }, body: { family: "Inter, system-ui, sans-serif" } },
    shape: { radius: "0.5rem" },
    depth: "soft",
  },
  "system-ledger": {
    name: "Ledger Hard",
    concept: {
      idea: "A bookbinder's workshop selling ruled ledgers stitched by hand",
      signature: "a stitched spine running down the page edge",
      palette: "bone paper with oxblood ruling ink",
      voice: "a sturdy slab serif like old ledger headings",
    },
    color: { ground: "#f2efe8", primary: "#7a1f2b" },
    type: { display: { family: "Roboto Slab, Georgia, serif" } },
    shape: { radius: "0" },
    depth: "hard",
  },
};

for (const [file, design] of Object.entries(designs)) {
  const result = designSystem(design);
  if (!result.ok) throw new Error(`${file}: ${result.errors.join("; ")}`);
  writeFileSync(join(import.meta.dir, `${file}.md`), systemToDesignMd(result.value));
  console.log(`wrote ${file}.md`);
}
