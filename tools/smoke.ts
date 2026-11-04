/**
 * Installs dist/*.zip into a fresh WordPress (Playground), exactly like a buyer.
 *   bun run smoke                → check the rendered landing page, then exit (CI)
 *   bun run smoke 6.7 7.4        → same on WP 6.7 / PHP 7.4
 *   bun run try                  → keep it running on :9500, logged in, to click around
 * Run `bun run zip` first. Nothing is linked to the repo, so installing/deleting is safe.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const serve = process.argv.includes("--serve");
const [wp = "latest", php = "8.3"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const port = serve ? 9500 : 9481;

for (const zip of ["auvyx-builder.zip"]) {
  if (!(await Bun.file(join(root, "dist", zip)).exists())) {
    console.error(`dist/${zip} is missing — run \`bun run zip\` first.`);
    process.exit(1);
  }
}

const blueprint = join(tmpdir(), `auvyx-smoke-blueprint-${port}.json`);
const dev = await Bun.file(join(root, "blueprints/dev.json")).json();
await Bun.write(
  blueprint,
  JSON.stringify({
    preferredVersions: { php, wp },
    ...(serve ? { login: true } : {}),
    steps: [
      { step: "installPlugin", pluginData: { resource: "vfs", path: "/dist/auvyx-builder.zip" } },
      ...dev.steps.filter((s: { step: string }) => s.step === "runPHP"),
    ],
  })
);

// Copy the zips: the VFS mount must not point at dist/ if a user deletes/replaces files.
const mount = join(tmpdir(), `auvyx-smoke-dist-${port}`);
await Bun.$`rm -rf ${mount} && mkdir -p ${mount} && cp ${join(root, "dist")}/*.zip ${mount}/`;

const server = Bun.spawn(
  [
    join(root, "node_modules/.bin/wp-playground-cli"),
    "server",
    `--port=${port}`,
    `--mount=${mount}:/dist`,
    `--blueprint=${blueprint}`,
    ...(serve ? ["--login"] : []),
  ],
  { stdout: "pipe", stderr: "inherit" }
);

const fail = (message: string) => {
  console.error(`✗ ${message}`);
  server.kill();
  process.exit(1);
};

// The port answers before the blueprint finishes; wait for the CLI's "Ready!" line.
const decoder = new TextDecoder();
const ready = (async () => {
  let log = "";
  for await (const chunk of server.stdout) {
    log += decoder.decode(chunk);
    if (log.includes("Ready!")) return true;
  }
  return false;
})();
const timeout = Bun.sleep(240_000).then(() => false);
if (!(await Promise.race([ready, timeout]))) fail("server did not start");

if (serve) {
  console.log(`
Auvyx Builder installed from dist/*.zip (WP ${wp}, PHP ${php}) — logged in as admin.
  Site:          http://127.0.0.1:${port}/
  Auvyx Editor:     http://127.0.0.1:${port}/wp-admin/post.php?post=4&action=auvyx-editor
  Auvyx Builder:    http://127.0.0.1:${port}/wp-admin/admin.php?page=auvyx-builder
  Plugins:       http://127.0.0.1:${port}/wp-admin/plugins.php   (upload/replace zips freely here)
Ctrl+C to stop. Data is in memory and resets on restart.`);
  process.on("SIGINT", () => {
    server.kill();
    process.exit(0);
  });
  await server.exited;
  process.exit(0);
}

const html = await (await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(60_000) })).text();
server.kill();

const checks: [string, boolean][] = [
  ["block base CSS enqueued", html.includes("auvyx-builder-blocks-css")],
  ["per-block CSS printed in <head>", /<style id=["']auvyx-builder-styles-inline-css["']>[^<]*\.auvyx-[a-z0-9]+\{/.test(html.split("</head>")[0] ?? "")],
  ["content-hash classes on blocks", /class="wp-block-auvyx-section alignfull auvyx-[a-z0-9]+[ "]/.test(html)],
  // Auvyx colors nobody chose follow the theme's colors of the same role
  ["tokens available as CSS variables", /--wp--preset--color--auvyx-primary: (#[0-9a-f]{6}|var\(--wp--preset--color--[a-z0-9-]+\))/.test(html)],
  ["no PHP errors", !/(Fatal error|Warning|Notice|Deprecated):/.test(html)],
  ["no Auvyx JavaScript on the frontend", !html.includes("auvyx-builder/build/")],
];
for (const [name, ok] of checks) console.log(`${ok ? "✓" : "✗"} ${name}`);
if (checks.some(([, ok]) => !ok)) {
  await Bun.write(join(tmpdir(), "auvyx-smoke.html"), html);
  fail(`smoke test failed (WP ${wp}, PHP ${php}); page saved to ${join(tmpdir(), "auvyx-smoke.html")}`);
}
console.log(`smoke OK (WP ${wp}, PHP ${php})`);
// Exit explicitly: the pending timeout timer would otherwise keep the process alive.
process.exit(0);
