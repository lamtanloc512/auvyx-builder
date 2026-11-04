=== Auvyx Builder ===
Contributors: auvyx
Tags: page builder, visual editor, blocks, block theme, design system
Requires at least: 6.7
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A visual page builder for block themes: edit the real page, per breakpoint and state, with design tokens. Content stays standard blocks.

== Description ==

Auvyx Builder is a full-screen visual page builder for WordPress block themes. The page you edit is the real page: select
anything on it, drag it, type on it, and change its spacing, size and corners with handles on the canvas. Every value can
differ per breakpoint (desktop, tablet, phone) and per state (default, hover, focus, active).

What you build is saved as standard WordPress blocks. Deactivate the plugin and your content stays.

= The editor =

* Canvas, layers, an Add panel, an inspector, undo and redo, autosave, inline text editing and keyboard shortcuts.
* Elements: section, heading, text, button, image, icon, video, divider, accordion, code snippet, navigation, posts loop
  and form.
* Blocks: icon box, icon list, price card, testimonial, stat, counter, progress bars, star rating, notice, buttons, follow
  icons, search, tabs, gallery, map, breadcrumbs (with structured data), title with divider and FAQ.
* Sections and page layouts: hero, logos, features, pricing, testimonials, FAQ, call to action and footer, plus complete
  starter kits.
* Components: build a section once and reuse it anywhere. Components are standard synced patterns, with the shortcode
  `[auvyx_component id="123"]` for widgets and other builders.

= The site =

* Headers and footers with display conditions: entire site, front page, chosen pages, every page of a kind, and exclusions.
* Site templates: apply one, save your site as one, or import one from a file.
* Design tokens (colors, spacing, font sizes) are written to theme.json, so core blocks and other plugins can use them.
* Forms with entries in the admin, CSV export and an email for each message.
* Coming soon and maintenance mode.
* Only the CSS a page uses is printed. No JavaScript on the front end unless an element on the page needs its small script.

= AI, with your own provider =

The AI agent builds and edits pages with the AI provider you choose and your own API key (Settings → AI): OpenAI,
Anthropic, Google Gemini, OpenRouter, xAI, DeepSeek, Groq, Mistral, a local Ollama or LM Studio, or any OpenAI-compatible
API. Nothing is sent until you set a provider and use the agent. Your own AI tools can also build pages through the
plugin's MCP endpoint, with tokens you create and revoke.

= Auvyx Builder Pro =

Auvyx Builder is complete on its own. Auvyx Builder Pro is a separate plugin, sold on auvyx.org, that adds more blocks
(popups, sliders, countdowns and more), every section kit, more display conditions, form actions and more kinds of data.

= External services =

Auvyx Builder talks to no server when you install it, activate it or open the admin. It connects to the services below
only when you use the feature that needs them, and sends only what that feature needs.

**Auvyx demo catalog** (https://yb-cloud.auvyx.org), run by Auvyx.

* When: an administrator applies a site template that comes with demo products, or imports or refreshes those demo
  products.
* What is sent: a request for that demo's catalog (`/v1/demo/catalogs/<id>`) and for its product pictures. Like every
  WordPress request, it carries the site's address in the user agent, and the server sees the site's IP address. Nothing
  else about the site or its users is sent.
* Terms: https://yb-cloud.auvyx.org/terms
* Privacy policy: https://yb-cloud.auvyx.org/privacy

**Fontsource** (https://fontsource.org) and **jsDelivr** (https://www.jsdelivr.com), which serves Fontsource's files.

* When: an administrator applies a design preset that names a font the site does not have yet.
* What is sent: the font's name to the Fontsource API (api.fontsource.org), then requests for its font files
  (cdn.jsdelivr.net). The files are stored in the site's fonts folder once; visitors load them from the site itself, never
  from these services.
* Fontsource: https://fontsource.org (fonts under open licences, mostly the SIL Open Font License)
* jsDelivr terms: https://www.jsdelivr.com/terms
* jsDelivr privacy policy: https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net

**The AI provider you configure** (Settings → AI).

* When: only after an administrator has chosen a provider and entered its API key, and only while an editor uses the AI
  agent, generates a design preset from a brief, or presses "Test" in the AI settings.
* What is sent: the request typed, the open page's elements (text, styles, image addresses), pictures of the page and of
  the selected element when the agent looks at its work, the site's design tokens, and the text of a web page the user
  asks the agent to read. Requests go from the site to the provider with your key; the key never reaches the browser.
* OpenAI: terms https://openai.com/policies/terms-of-use, privacy policy https://openai.com/policies/privacy-policy
* Anthropic: terms https://www.anthropic.com/legal/commercial-terms, privacy policy https://www.anthropic.com/legal/privacy
* Google Gemini: terms https://ai.google.dev/gemini-api/terms, privacy policy https://policies.google.com/privacy
* OpenRouter: terms https://openrouter.ai/terms, privacy policy https://openrouter.ai/privacy
* xAI: terms https://x.ai/legal/terms-of-service, privacy policy https://x.ai/legal/privacy-policy
* Mistral: terms https://mistral.ai/terms, privacy policy https://mistral.ai/terms#privacy-policy
* Groq: terms https://groq.com/terms-of-use, privacy policy https://groq.com/privacy-policy
* DeepSeek: terms https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html, privacy policy
  https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html
* Any other OpenAI-compatible address you enter (a local Ollama or LM Studio sends nothing off your network): that
  provider's own terms and privacy policy apply.

**Addresses you give it.** These are not services of Auvyx; the site connects to them because you asked it to:

* Web pages you ask the AI agent to read, and pictures you import from another site or file into the Media Library.
* Data sources you add (Auvyx Builder → Data sources): the site fetches the address you enter when a page shows that
  data, and caches the answer.

**Embeds you place on a page.** A video element with a YouTube or Vimeo address and the map block load the player or map
from YouTube (youtube-nocookie.com), Vimeo or Google Maps in the visitor's browser, on pages where you placed one:

* YouTube and Google Maps: terms https://policies.google.com/terms, privacy policy https://policies.google.com/privacy
* Vimeo: terms https://vimeo.com/terms, privacy policy https://vimeo.com/privacy

= Source code =

The scripts in this plugin are compiled: Auvyx Editor (`auvyx-editor/`, Svelte 5 and TypeScript, built with Vite) and the
block editor scripts (`build/`, built with @wordpress/scripts). Their human-readable source, with everything needed to
build them, is in the public repository:

https://github.com/lamtanloc512/auvyx-builder

* Auvyx Editor: `apps/editor` and `packages/editor-core`
* Blocks and block editor scripts: `products/builder/blocks`, `products/builder/editor` and `packages/*`

To build the plugin from source: install Bun and Node.js 22, then run `bun run setup` and
`bun run zip` at the root of the repository. The plugin is written to `dist/auvyx-builder.zip`.

The effect libraries in `assets/lib` (Motion, Lenis, Three.js, Lottie, Splitting) are the unmodified builds of their npm
packages, all under the MIT licence (see `assets/lib/README.md`).

== Installation ==

1. In the admin, go to Plugins → Add New, search for "Auvyx Builder", then install and activate it. Or upload the zip in
   Plugins → Add New → Upload Plugin.
2. Optional: install a block theme. The companion Auvyx Theme is made for it, but any block theme works.
3. Go to Auvyx Builder → Pages and choose "Create page", or hover a page in the pages list and choose "Edit with Auvyx".

== Frequently Asked Questions ==

= Does it work with my theme? =

It is made for block themes (Full Site Editing). Pages built with it also show in classic themes, but headers, footers and
design tokens need a block theme.

= What happens to my pages if I deactivate the plugin? =

They stay. Auvyx Builder saves standard WordPress blocks with their HTML, so your content is still there; only the
responsive styles that the plugin prints are gone.

= Is the AI agent required? Does it cost anything? =

No. Everything works without it. If you want it, you use your own provider's API key, and you pay that provider directly.
Auvyx Builder sends nothing to any AI service until you set one up.

= Does the plugin send data anywhere? =

Only when you use a feature that needs it. See "External services" above for each service, what is sent and when.

= What does Auvyx Builder Pro add? =

More blocks (popups, sliders, countdowns, flip boxes, before/after, marquees, hotspots and more), every section kit, more
header and footer conditions (archives, search, 404 and more), form redirects and webhooks, more kinds of data, site code
and a role manager. Pages made with Pro keep showing as long as Pro is active.

= Where do I get help? =

At https://auvyx.org/support.

== Screenshots ==

1. The editor: the real page as the canvas, with layers, the Add panel and the inspector.
2. Responsive editing: the same page on a phone, with values per breakpoint.
3. The section library with live previews.
4. Headers and footers with display conditions.
5. The AI agent building a page with your own provider.

== Changelog ==

= 1.0.0 =
* First public release on WordPress.org.
* Auvyx Editor, elements and blocks, components, site templates, headers and footers with conditions,
  forms, posts loops, data sources and design tokens.
* The AI agent runs with your own provider's key; nothing is sent until you set one up.
* Auvyx Builder Pro's templates, blocks and licence now live only in the Pro plugin. Auvyx Builder has no licence and no
  updater of its own, and calls no server unless you use a feature that needs it.
