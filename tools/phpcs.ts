/**
 * bun run phpcs [--fix] → WordPress Coding Standards on products/builder, run with PHP_CodeSniffer inside
 * Playground (no local PHP needed). Tools are downloaded once to ~/.cache/auvyx-phpcs.
 */
import { $ } from "bun";
import { homedir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const cache = join(homedir(), ".cache/auvyx-phpcs");
const fix = process.argv.includes("--fix");
const repos = ["WordPress/WordPress-Coding-Standards", "PHPCSStandards/PHPCSUtils", "PHPCSStandards/PHPCSExtra"];

if (!(await Bun.file(join(cache, "phpcs.phar")).exists())) {
  await $`mkdir -p ${cache}`;
  for (const tool of ["phpcs", "phpcbf"]) {
    await $`curl -sL -o ${join(cache, `${tool}.phar`)} https://github.com/PHPCSStandards/PHP_CodeSniffer/releases/latest/download/${tool}.phar`;
  }
  for (const repo of repos) {
    await $`curl -sL -o ${join(cache, "src.zip")} https://github.com/${repo}/archive/refs/heads/develop.zip && unzip -q -o ${join(cache, "src.zip")} -d ${cache}`;
  }
}
const paths = repos.map((r) => `/phpcs/${r.split("/")[1]}-develop`).join(",");
let report = "";
for (const product of ["products/builder"]) {
  const result = await $`${join(root, "node_modules/.bin/wp-playground-cli")} php --verbosity=quiet --mount=${cache}:/phpcs --mount=${join(root, product)}:/src -- /phpcs/${fix ? "phpcbf" : "phpcs"}.phar --standard=/src/phpcs.xml.dist --runtime-set installed_paths ${paths} --no-colors /src`
    .nothrow()
    .text();
  report += result
    .split("\n")
    .filter((l) => !/Deprecated|^PHP Deprecated/.test(l))
    .join("\n");
}
console.log(report.trim());
// Fail on errors only (warnings are reported).
const errors = [...report.matchAll(/FOUND (\d+) ERRORS?/g)].reduce((sum, m) => sum + Number(m[1]), 0);
console.log(errors === 0 ? "WPCS: no errors" : `WPCS: ${errors} errors`);
process.exit(fix || errors === 0 ? 0 : 1);
