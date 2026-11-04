/**
 * bun run setup → checks the toolchain. Needed: Bun (install/scripts/tests),
 * Node ≥ 20 (wp-scripts, Playground CLI). Not needed: PHP, Composer, Docker.
 */
import { $ } from "bun";

const checks: [string, () => Promise<string>][] = [
  ["bun", async () => Bun.version],
  ["node ≥ 20", async () => {
    const version = (await $`node --version`.text()).trim();
    if (Number(version.slice(1).split(".")[0]) < 20) throw new Error(`${version} is too old`);
    return version;
  }],
  ["zip (for bun run zip)", async () => ((await $`which zip`.text()).trim())],
];

let ok = true;
for (const [name, check] of checks) {
  try {
    console.log(`✓ ${name}: ${await check()}`);
  } catch (error) {
    ok = false;
    console.log(`✗ ${name}: ${error instanceof Error ? error.message : "missing"}`);
  }
}
if (ok) {
  await $`bun install`;
  console.log("\nReady. Next: bun run dev  →  http://127.0.0.1:9400");
}
process.exit(ok ? 0 : 1);
