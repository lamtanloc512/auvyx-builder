/**
 * Runs products/builder/tests/php inside WordPress Playground (php-wasm) on the
 * oldest and newest supported PHP. No local PHP or Docker required.
 *   bun run test:php              → PHP 7.4 + WP 6.7 (minimums), PHP 8.4 + latest WP, and latest as multisite
 *   bun run test:php 8.3@6.8      → one PHP@WP combination ("8.3" alone = latest WP; "+ms" suffix = multisite)
 *   bun run test:php --update     → rewrite snapshots (tests/fixtures)
 */
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const update = process.argv.includes("--update");
const args = process.argv.slice(2).filter((a) => a !== "--update");
const targets = args.length > 0 ? args : ["7.4@6.7", "8.4@latest", "8.4@latest+ms"];
const cli = join(root, "node_modules/.bin/wp-playground-cli");
let failed = false;

for (const target of targets) {
  const multisite = target.endsWith("+ms");
  const [php = "8.4", wp = "latest"] = target.replace(/\+ms$/, "").split("@");
  console.log(`\n▶ PHP ${php}, WP ${wp}${multisite ? ", multisite" : ""}`);
  // A blueprint without preferredVersions resets PHP to the default, so pin it here.
  const blueprint = join(tmpdir(), `auvyx-test-blueprint-${php}-${wp}${multisite ? "-ms" : ""}.json`);
  await Bun.write(
    blueprint,
    JSON.stringify({
      preferredVersions: { php, wp },
      steps: [
        ...(multisite ? [{ step: "enableMultisite" }] : []),
        { step: "activatePlugin", pluginPath: "auvyx-builder/auvyx-builder.php" },
      ],
    })
  );
  const proc = Bun.spawn(
    [
      cli,
      "php",
      `--php=${php}`,
      `--wp=${wp}`,
      // Multisite refuses hosts with a port; the php command never serves HTTP, so any port-less URL works.
      ...(multisite ? ["--site-url=http://localhost"] : []),
      "--verbosity=quiet",
      `--mount=${join(root, "products/builder")}:/wordpress/wp-content/plugins/auvyx-builder`,
      `--mount=${join(root, "shared")}:/auvyx-shared`,
      `--blueprint=${blueprint}`,
      "--define",
      "AUVYX_SHARED_DIR",
      "/auvyx-shared",
      ...(update ? ["--define", "AUVYX_UPDATE_SNAPSHOTS", "1"] : []),
      "--",
      "/wordpress/wp-content/plugins/auvyx-builder/tests/php/run.php",
    ],
    { stdout: "pipe", stderr: "inherit" }
  );
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  process.stdout.write(output);
  if (!output.includes("AUVYX_TESTS_PASSED") || !output.includes(`PHP ${php}.`)) {
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
