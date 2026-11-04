/**
 * bun run pot → languages/*.pot for Auvyx Builder (wp i18n make-pot in Playground: PHP, block.json and patterns). Our products are sold outside WordPress.org, so the translation templates ship with them.
 */
import { $ } from "bun";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const out = join(tmpdir(), "auvyx-pot");
await $`rm -rf ${out} && mkdir -p ${out}`;
const products = [
  { slug: "auvyx-builder", dir: "products/builder", mount: "/wordpress/wp-content/plugins/auvyx-builder", exclude: "tests,node_modules,auvyx-editor,studio,studio-v2,build,visual-builder,editor,generated,assets" },
];
const blueprint = join(out, "blueprint.json");
await Bun.write(
  blueprint,
  JSON.stringify({
    steps: products.map((p) => ({
      step: "wp-cli",
      command: `wp i18n make-pot ${p.mount} /out/${p.slug}.pot --slug=${p.slug} --domain=${p.slug} --exclude=${p.exclude} --headers='{"Report-Msgid-Bugs-To":"https://auvyx.org/support"}'`,
    })),
  })
);
const mounts = products.map((p) => `--mount=${join(root, p.dir)}:${p.mount}`);
// wp-cli fetches core's block-i18n.json over HTTPS: give php-wasm the system's CA bundle (macOS or Linux path, or SSL_CERT_FILE).
const caBundle = [process.env.SSL_CERT_FILE, "/etc/ssl/cert.pem", "/etc/ssl/certs/ca-certificates.crt"].find((f) => f && existsSync(f));
const ca = caBundle ? [`--mount=${caBundle}:/etc/ssl/certs/ca-certificates.crt`] : [];
await $`${join(root, "node_modules/.bin/wp-playground-cli")} run-blueprint --blueprint=${blueprint} ${mounts} --mount=${out}:/out ${ca}`.quiet().nothrow();
let missing = 0;
for (const p of products) {
  const file = Bun.file(join(out, `${p.slug}.pot`));
  if (!(await file.exists())) {
    console.log(`✗ ${p.slug}.pot was not written`);
    missing++;
    continue;
  }
  // The creation date changes on every run; keep the committed file stable when nothing else changed.
  const text = (await file.text()).replace(/^"POT-Creation-Date: .*\\n"\n/m, "");
  await $`mkdir -p ${join(root, p.dir, "languages")}`;
  await Bun.write(join(root, p.dir, "languages", `${p.slug}.pot`), text);
  console.log(`${p.dir}/languages/${p.slug}.pot  (${(text.match(/^msgid "/gm)?.length ?? 1) - 1} strings)`);
}
process.exit(missing === 0 ? 0 : 1);
