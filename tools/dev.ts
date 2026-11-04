/**
 * bun run dev → watch-build the plugin + WordPress Playground on :9400 with
 * the plugin mounted, a demo landing page, and admin auto-login.
 * No Docker, no local PHP. Options: --port=9500 --php=7.4 --wp=6.7 --no-watch
 */
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const port = arg("port", "9400");
const watch = !process.argv.includes("--no-watch");

const builder = join(root, "products/builder");
if (!(await Bun.file(join(builder, "build/editor.asset.php")).exists())) {
  await Bun.spawn(["bun", "run", "build"], { cwd: builder, stdout: "inherit", stderr: "inherit" }).exited;
}

// The blueprint decides PHP/WP versions (CLI flags are ignored once a blueprint is given), so pin them here.
const php = arg("php", "8.3");
const wp = arg("wp", "latest");
const blueprint = join(tmpdir(), `auvyx-dev-blueprint-${php}-${wp}.json`);
const base = await Bun.file(join(root, "blueprints/dev.json")).json();
await Bun.write(blueprint, JSON.stringify({ ...base, preferredVersions: { php, wp } }));

// Auvyx Editor (Svelte, apps/editor) → products/builder/auvyx-editor, built once here and rebuilt on change below.
const editorApp = join(root, "apps/editor");
if (!(await Bun.file(join(editorApp, "node_modules/.bin/vite")).exists())) {
  await Bun.spawn(["npm", "install", "--no-audit", "--no-fund"], { cwd: editorApp, stdout: "inherit", stderr: "inherit" }).exited;
}
if (!(await Bun.file(join(builder, "auvyx-editor/editor.js")).exists())) {
  await Bun.spawn(["npx", "vite", "build"], { cwd: editorApp, stdout: "inherit", stderr: "inherit" }).exited;
}

const processes = [
  Bun.spawn(
    [
      join(root, "node_modules/.bin/wp-playground-cli"),
      "server",
      `--port=${port}`,
      `--php=${php}`,
      `--wp=${wp}`,
      `--mount=${builder}:/wordpress/wp-content/plugins/auvyx-builder`,
      `--mount=${join(root, "blueprints/mu")}:/wordpress/wp-content/auvyx-dev`,
      `--blueprint=${blueprint}`,
      "--login",
    ],
    { stdout: "inherit", stderr: "inherit" }
  ),
];
if (watch) {
  processes.push(Bun.spawn(["bun", "run", "start"], { cwd: builder, stdout: "inherit", stderr: "inherit" }));
  processes.push(Bun.spawn(["npx", "vite", "build", "--watch"], { cwd: editorApp, stdout: "inherit", stderr: "inherit" }));
}
console.log(`\nAuvyx Editor:  http://127.0.0.1:${port}/wp-admin/post.php?post=4&action=auvyx-editor\n`);

const stop = () => processes.forEach((p) => p.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await Promise.race(processes.map((p) => p.exited));
stop();
