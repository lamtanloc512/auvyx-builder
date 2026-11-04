/**
 * bun run plugin-check → the PHPCS-based checks of WordPress Plugin Check (the wp.org review tool) on
 * dist/auvyx-builder.zip. Run `bun run zip` first.
 *
 * Plugin Check itself crashes in Playground (wasm `unreachable` in array_walk), so this runs the same sniffs
 * with the phpcs Plugin Check ships with. CI additionally runs the full tool (WordPress/plugin-check-action).
 */
import { $ } from "bun";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const pc = join(homedir(), ".cache/auvyx-plugin-check/plugin-check");
if (!(await Bun.file(join(pc, "plugin.php")).exists())) {
  const cache = join(pc, "..");
  await $`mkdir -p ${cache} && curl -sL -o ${join(cache, "pc.zip")} https://downloads.wordpress.org/plugin/plugin-check.latest-stable.zip && unzip -q -o ${join(cache, "pc.zip")} -d ${cache}`;
}
const work = join(tmpdir(), "auvyx-plugin-check");
await $`rm -rf ${work} && mkdir -p ${work} && unzip -q ${join(root, "dist/auvyx-builder.zip")} -d ${work}`;

// Sniffs used by Plugin Check's PHPCS checks (includes/Checker/Checks/*), standard → sniffs.
const checksFor = (domain: string, prefixes: string): [standard: string, sniffs: string, extra?: string[]][] => [
  ["/pc/phpcs-rulesets/plugin-review.xml", ""],
  ["WordPress", "WordPress.WP.I18n", ["--runtime-set", "text_domain", domain]],
  ["WordPress", "WordPress.NamingConventions.PrefixAllGlobals", ["--runtime-set", "prefixes", prefixes]],
  [
    "WordPress",
    "WordPress.WP.EnqueuedResources,WordPress.WP.EnqueuedResourceParameters,WordPress.DB.SlowDBQuery,WordPress.DB.DirectDatabaseQuery,WordPress.Security.EscapeOutput,WordPress.Security.SafeRedirect",
  ],
  [
    "PluginCheck",
    "PluginCheck.CodeAnalysis.PHPErrorReporting,PluginCheck.CodeAnalysis.Localhost,PluginCheck.CodeAnalysis.EnqueuedResourceOffloading,PluginCheck.CodeAnalysis.Offloading,PluginCheck.CodeAnalysis.SettingSanitization,PluginCheck.CodeAnalysis.WriteFile,PluginCheck.Security.DirectDB,PluginCheck.Security.VerifyNonce",
  ],
];

let errors = 0;
for (const [slug, prefixes] of [["auvyx-builder", "auvyx,auvyx_builder,Auvyx\\Builder"]] as const) {
for (const [standard, sniffs, extra = []] of checksFor(slug, prefixes)) {
  const args = [`--standard=${standard}`, ...(sniffs ? [`--sniffs=${sniffs}`] : []), ...extra];
  const report = (
    await $`${join(root, "node_modules/.bin/wp-playground-cli")} php --verbosity=quiet --mount=${pc}:/pc --mount=${join(work, slug)}:/src -- /pc/vendor/bin/phpcs ${args} --extensions=php --ignore=*/vendor/* --no-colors -s /src`
      .nothrow()
      .text()
  )
    .split("\n")
    .filter((l) => !/Deprecated/.test(l))
    .join("\n")
    .trim();
  if (report) console.log(report);
  errors += [...report.matchAll(/FOUND (\d+) ERRORS?/g)].reduce((sum, m) => sum + Number(m[1]), 0);
}
}
// Plugin Check's readme and header checks (plugin_readme, plugin_header_fields), for Auvyx Builder's readme.txt.
const readme = await Bun.file(join(work, "auvyx-builder/readme.txt")).text();
const main = await Bun.file(join(work, "auvyx-builder/auvyx-builder.php")).text();
const field = (text: string, name: string) => text.match(new RegExp(`^[ \\t*]*${name}:\\s*(.+)$`, "mi"))?.[1]?.trim() ?? "";
const readmeProblems: string[] = [];
for (const name of ["Contributors", "Tags", "Requires at least", "Tested up to", "Requires PHP", "Stable tag", "License", "License URI"]) {
  if (!field(readme, name)) readmeProblems.push(`readme.txt: no "${name}"`);
}
if (field(readme, "Tags").split(",").length > 5) readmeProblems.push("readme.txt: more than 5 tags");
if (field(readme, "Stable tag") !== field(main, "Version")) readmeProblems.push("readme.txt: Stable tag is not the plugin's Version");
if (field(readme, "Requires PHP") !== field(main, "Requires PHP")) readmeProblems.push("readme.txt: Requires PHP differs from the plugin header");
if (field(readme, "Requires at least") !== field(main, "Requires at least")) readmeProblems.push("readme.txt: Requires at least differs from the plugin header");
const short = readme.split("\n").map((l) => l.trim()).filter(Boolean).find((l, i, all) => i > 0 && !/^[A-Za-z ]+:/.test(l) && !l.startsWith("===") && all.indexOf(l) > 0) ?? "";
if (short.length > 150) readmeProblems.push(`readme.txt: the short description is ${short.length} characters (150 at most)`);
for (const section of ["Description", "Installation", "Frequently Asked Questions", "Changelog"]) {
  if (!readme.includes(`== ${section} ==`)) readmeProblems.push(`readme.txt: no "${section}" section`);
}
if (!/= External services =/.test(readme)) readmeProblems.push('readme.txt: no "External services" section');
if (/^\s*\*?\s*Update URI:/mi.test(main)) readmeProblems.push("auvyx-builder.php: an Update URI header (WordPress.org plugins have none)");
for (const p of readmeProblems) console.log(`ERROR ${p}`);
errors += readmeProblems.length;
console.log(errors === 0 ? "Plugin Check (PHPCS checks, readme and header): no errors" : `Plugin Check (PHPCS checks, readme and header): ${errors} errors`);
process.exit(errors === 0 ? 0 : 1);
