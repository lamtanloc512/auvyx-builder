# Auvyx Builder

Auvyx Builder is a block-native visual page builder for WordPress: responsive styles, design tokens and layout blocks
for block themes, with a full-screen editor, **Auvyx Editor** (Svelte 5 + TypeScript). It saves ordinary WordPress
blocks, so pages stay readable without the plugin.

This repository is the source of the free plugin as published on WordPress.org. **Auvyx Builder Pro and Auvyx Theme are
separate products and are not part of this repository.**

Support: https://auvyx.org/support

## What is here

| Path | What |
| --- | --- |
| `products/builder` | The WordPress plugin (PHP, blocks, patterns, PHP tests) |
| `apps/editor` | Auvyx Editor (Svelte 5 + TypeScript), built into `products/builder/auvyx-editor` |
| `packages/*` | TypeScript packages the editor and the block editor bundles use (`editor-core`, `style-engine`, `block-kit`, …) |
| `shared` | Language-neutral data shared by TypeScript and PHP (CSS properties, icons, design-system defaults, fixtures) |
| `tools` | Build, packaging and test scripts |

The template library in `products/builder/patterns/generated` is committed as generated files.

## Requirements

- [Bun](https://bun.sh) 1.4 or later
- Node.js 20 or later (with npm)
- `zip`

No local PHP, Docker or WordPress is needed: WordPress runs in [WordPress Playground](https://wordpress.github.io/wordpress-playground/).

## Build the plugin zip

```bash
bun install
bun run zip
```

This builds Auvyx Editor (`editor:build`), the block editor bundles and generated PHP (`build`), then writes
`dist/auvyx-builder.zip`: the plugin, ready for Plugins → Add New → Upload.

## Run the tests

```bash
bun run test          # TypeScript unit tests (packages, plugin, Auvyx Editor)
bun run test:php      # the plugin's PHP tests in WordPress Playground (PHP 7.4 + WP 6.7, PHP 8.4 + latest, multisite)
bun run typecheck
bun run lint
bun run phpcs         # WordPress Coding Standards
bun run plugin-check  # WordPress.org Plugin Check sniffs on dist/auvyx-builder.zip
bun run check         # all of the above, plus the zip and a smoke install
```

`bun run dev` starts WordPress Playground on http://127.0.0.1:9400 with the plugin mounted and rebuilt on change.

## License

Auvyx Builder is free software, licensed under the GNU General Public License, version 2 or (at your option) any later
version. See [LICENSE](LICENSE). Bundled third-party libraries and fonts keep their own licences (listed in
`products/builder/readme.txt`).
