import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * The template library, from the patterns the Scala catalog writes (products/builder/patterns/generated, AGENTS.md
 * "Adding a template"): `virtual:auvyx-templates` is the list (manifest + the platform blocks each one needs, as
 * Patterns::blocks_available reads them), `virtual:auvyx-templates-markup` the markup by id (imported lazily: ~2 MB).
 */
const MODELED = new Set(["auvyx/section", "auvyx/heading", "auvyx/text", "auvyx/snippet", "auvyx/button", "auvyx/image", "auvyx/icon", "auvyx/divider", "auvyx/video", "auvyx/vector", "auvyx/accordion", "auvyx/loop", "auvyx/carousel", "auvyx/nav"]);
function templates(): Plugin {
  const dir = at("../../products/builder/patterns/generated/");
  const ids = { list: "virtual:auvyx-templates", markup: "virtual:auvyx-templates-markup" };
  const read = () => {
    const manifest = JSON.parse(readFileSync(dir + "manifest.json", "utf8")) as { id: string }[];
    return manifest.map((t) => {
      const markup = readFileSync(`${dir}${t.id}.html`, "utf8").replace(/\n$/, "");
      const blocks = [...new Set([...markup.matchAll(/<!-- wp:([a-z0-9-]+\/[a-z0-9-]+)/g)].map((m) => m[1]!).filter((b) => !MODELED.has(b)))];
      return { meta: { ...t, blocks }, markup };
    });
  };
  return {
    name: "auvyx-templates",
    resolveId: (id) => (id === ids.list || id === ids.markup ? "\0" + id : null),
    load(id) {
      if (id !== "\0" + ids.list && id !== "\0" + ids.markup) return null;
      this.addWatchFile(dir + "manifest.json");
      const all = read();
      return id === "\0" + ids.list
        ? `export default ${JSON.stringify(all.map((t) => t.meta))};`
        : `export default ${JSON.stringify(Object.fromEntries(all.map((t) => [t.meta.id, t.markup])))};`;
    },
  };
}

export default defineConfig({
  // lazy chunks load (and preload) beside editor.js, not from the site root
  base: "./",
  plugins: [tailwindcss(), svelte(), templates()],
  resolve: {
    alias: {
      "@auvyx/editor-core/import": at("../../packages/editor-core/src/import/index.ts"),
      "@auvyx/editor-core": at("../../packages/editor-core/src/index.ts"),
      "@auvyx/style-engine": at("../../packages/style-engine/src/index.ts"),
      "@auvyx/shared": at("../../shared"),
    },
  },
  server: { port: 5176, fs: { allow: [at("../..")] } },
  build: {
    outDir: at("../../products/builder/auvyx-editor"),
    emptyOutDir: true,
    target: "es2020",
    cssCodeSplit: false,
    rollupOptions: {
      input: at("src/main.ts"),
      output: { entryFileNames: "editor.js", chunkFileNames: "editor-[hash].js", assetFileNames: "editor[extname]" },
    },
  },
});
