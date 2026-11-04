/**
 * A section or a page as a `<auvyx-section>` custom element (S/WebExport.scala): what the Studio's "Export section" and
 * "Export page" copy. Declarative shadow DOM keeps the HTML in the response and themes the tree with the same CSS variables
 * the sandboxed custom-code frame copies in. Follow theme leaves inheritance alone; Isolated and Shadow add a reset layer.
 * Byte for byte the Scala core's output (test/webExport.test.ts).
 */
import { renderCss, renderHtml, isSlider, themeVars, type Result } from "./htmlRenderer";
import { subtreeIds, type Doc, type El } from "./model";

export { utilityClasses, utilityClassesOf } from "./htmlRenderer";

export const FOLLOW = "follow";
export const ISOLATED = "isolated";
export const SHADOW = "shadow";

/** ThemeMode: the class names the section mode toggle writes. */
export const THEME_MODE = { isolated: "auvyx-isolated", shadow: "auvyx-shadow", classes: ["auvyx-isolated", "auvyx-shadow", "auvyx-follow"] } as const;

/** ThemeMode.runtime: kept in step with `ThemeTokens::runtime` in PHP. */
export const THEME_RUNTIME: string =
  "(function(){var root=document.currentScript&&document.currentScript.getRootNode();if(!root||!root.querySelectorAll)return;root.querySelectorAll(\"nav button\").forEach(function(btn){btn.addEventListener(\"click\",function(){var nav=btn.closest(\"nav\");if(nav)nav.classList.toggle(\"is-open\");});});root.querySelectorAll(\".auvyx-slider\").forEach(function(slider){var slides=slider.querySelectorAll(\".auvyx-slide\");var i=0;var show=function(){for(var n=0;n<slides.length;n++)slides[n].hidden=n!==i;};if(slides.length)show();slider.querySelectorAll(\"[data-auvyx-next]\").forEach(function(b){b.addEventListener(\"click\",function(){if(!slides.length)return;i=(i+1)%slides.length;show();});});slider.querySelectorAll(\"[data-auvyx-prev]\").forEach(function(b){b.addEventListener(\"click\",function(){if(!slides.length)return;i=(i-1+slides.length)%slides.length;show();});});});})();";

const RESET = "@layer auvyx-reset, auvyx-blocks;@layer auvyx-reset{:host,:host :where(*){font-family:var(--wp--preset--font-family--auvyx-body);color:var(--wp--preset--color--auvyx-text);font-size:var(--wp--preset--font-size--auvyx-md);font-weight:400;line-height:1.5;letter-spacing:normal}}@layer auvyx-blocks{";

const tokens = (className: string) => className.split(/[ \t\n\x0B\f\r]+/);

export function mode(className: string): string {
  const parts = tokens(className);
  return parts.includes(THEME_MODE.shadow) ? SHADOW : parts.includes(THEME_MODE.isolated) ? ISOLATED : FOLLOW;
}

/** Drops a previous mode class and adds the one the panel chose. Other classes stay. */
export function withMode(className: string, next: string): string {
  const kept = tokens(className).filter((c) => c !== "" && !(THEME_MODE.classes as readonly string[]).includes(c));
  return [...kept, ...(next === ISOLATED ? [THEME_MODE.isolated] : next === SHADOW ? [THEME_MODE.shadow] : [])].join(" ");
}

const seal = (text: string) => text.replace(/<\/(style|script)/gi, "<\\/$1");

const interactive = (doc: Doc) =>
  Object.values(doc.nodes).some((n: El) => n.kind === "Carousel" || n.kind === "Nav" || isSlider(n) || tokens(n.className).includes("auvyx-tabs"));

export function element(modeName: string, html: string, css: string, isInteractive: boolean): string {
  const m = modeName === ISOLATED || modeName === SHADOW || modeName === FOLLOW ? modeName : FOLLOW;
  const reset = m === FOLLOW ? "" : RESET;
  const close = m === FOLLOW ? "" : "}";
  const style = seal(`:host{display:block;${themeVars()}}${reset}${css}${close}`);
  const script = isInteractive ? `<script>${seal(THEME_RUNTIME)}</script>` : "";
  return `<auvyx-section data-auvyx-mode="${m}"><template shadowrootmode="open"><style>${style}</style>${html}${script}</template></auvyx-section>`;
}

/** One section (and what is inside it) as a web component. */
export function section(doc: Doc, id: string): Result {
  const ids = subtreeIds(doc, id);
  if (ids.length === 0) return { ok: false, error: `Unknown element '${id}'` };
  const slice: Doc = { roots: [id], nodes: Object.fromEntries(ids.map((i) => [i, doc.nodes[i]!])), defs: doc.defs ?? [], presets: doc.presets ?? [] };
  const html = renderHtml(slice);
  if (!html.ok) return html;
  const css = renderCss(slice);
  if (!css.ok) return css;
  return { ok: true, value: element(mode(doc.nodes[id]!.className), html.value, css.value, interactive(slice)) };
}

/** Every root section, one web component each, on its own line. */
export function page(doc: Doc): Result {
  const done: string[] = [];
  for (const id of doc.roots) {
    const r = section(doc, id);
    if (!r.ok) return r;
    done.push(r.value);
  }
  return { ok: true, value: done.join("\n") };
}
