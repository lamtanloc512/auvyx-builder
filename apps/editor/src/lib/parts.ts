/**
 * Template parts and Theme Builder headers / footers (U/PartEdit.scala, U/BackLink.scala, TopBar.kindLabel).
 *
 * On a page, the canvas shows the site's header and footer around the content; they are not the page's. Each carries a
 * small "Edit header" / "Edit footer" tag (stronger on hover) that opens that part in this window, with a way back to the
 * page. The site's components shown there (`data-auvyx-component` / `data-auvyx-components`) carry "Edit <name>" the same way.
 * Canvas chrome only: never saved.
 */
import { config } from "./config";
import { conditions } from "./conditions.svelte";
import { library } from "./library.svelte";
import { store } from "./store.svelte";

/** What kind of document is open, as the Studio names it (TopBar.kindLabel): a Theme Builder template is a header or footer. */
export const kindLabel = (): string =>
  config.isPart
    ? config.partArea === "header" ? "· Header" : config.partArea === "footer" ? "· Footer" : "· Template part"
    : config.isComponent
      ? conditions.current ? (conditions.current.kind === "footer" ? "· Footer" : "· Header") : "· Component"
      : "· Page";

const partLinks = (config as unknown as { partLinks?: { header?: string; footer?: string } }).partLinks ?? {};

/** Where the site's header or footer is edited (Studio::part_links), "" when this user may not. */
/** Where "Edit header/footer" goes: the part, opened in Auvyx Editor (`editor=1`, Admin::open_part). */
export const partLink = (area: string): string => {
  const url = area === "header" ? partLinks.header ?? "" : area === "footer" ? partLinks.footer ?? "" : "";
  return url ? `${url}${url.includes("?") ? "&" : "?"}editor=1` : "";
};

// ---- the way back (BackLink) ---------------------------------------------------------------------

const params = () => new URLSearchParams(location.search);

/** Where to go back to, when it is this site's editor: [url, name]. */
export function backTarget(): [string, string] | null {
  const url = params().get("auvyx-back");
  if (!url) return null;
  try {
    const u = new URL(url, location.href);
    if (u.origin !== location.origin || !u.pathname.includes("/wp-admin/")) return null;
  } catch { return null; }
  return [url, params().get("auvyx-back-title") || "the page"];
}

/** This document's address with a way back to it, for opening another one from here. */
export function backFrom(url: string): string {
  const here = new URL(location.href);
  here.searchParams.delete("auvyx-back");
  here.searchParams.delete("auvyx-back-title");
  here.searchParams.delete("auvyx-conditions");
  const to = new URL(url, location.href);
  to.searchParams.set("auvyx-back", here.toString());
  to.searchParams.set("auvyx-back-title", config.title);
  return to.toString();
}

// ---- the tags on the canvas (PartEdit) -----------------------------------------------------------

const CSS = `.auvyx-part-edit-host--rel{position:relative}
.auvyx-part-edit-host::after{content:"";position:absolute;inset:0;pointer-events:none;outline:2px dashed transparent;outline-offset:-2px;transition:outline-color .15s;z-index:999}
.auvyx-part-edit-host:hover::after{outline-color:#7c3aed}
.auvyx-part-edit-tags{position:absolute;top:0;right:12px;z-index:1000;display:flex;gap:4px;transform:translateY(-50%)}
.auvyx-part-edit-host--header>.auvyx-part-edit-tags{top:auto;bottom:0;right:auto;left:12px;transform:translateY(50%)}
.auvyx-part-edit{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border:1px solid #7c3aed;border-radius:999px;background:#fff;color:#6d28d9;font:600 11px/1 system-ui,sans-serif;letter-spacing:0;text-transform:none;white-space:nowrap;cursor:pointer;opacity:.7;box-shadow:0 2px 8px rgb(0 0 0/.15);transition:opacity .15s}
.auvyx-part-edit--primary{background:#7c3aed;color:#fff}
.auvyx-part-edit-host:hover>.auvyx-part-edit-tags>.auvyx-part-edit,.auvyx-part-edit:focus-visible{opacity:1}
html[data-auvyx-interact] .auvyx-part-edit-tags{display:none}
`;

const isPage = () => !config.isPart && !config.isComponent;

/** Tags the site's header and footer (and the components in the page's chrome) on the canvas page, once it loaded. */
export function decorateParts(idoc: Document) {
  if (!isPage()) return;
  for (const area of ["header", "footer"]) {
    const el = idoc.querySelector<HTMLElement>(`${area}.wp-block-template-part, [data-auvyx-fragment=${area}], .auvyx-layout-part--${area}`);
    if (!el) continue;
    el.classList.add(`auvyx-part-edit-host--${area}`);
    // A part the layout replaced with a component is that component (components() tags it), not the theme's part.
    const url = partLink(area);
    if (url && !el.hasAttribute("data-auvyx-component"))
      tag(idoc, el, `Edit ${area}`, `The site's ${area} is shared by every page: edit it here, then come back to this page.`, url);
  }
  components(idoc);
}

/** The site's components in the page's chrome, once the library says their names and where to edit them. */
function components(idoc: Document) {
  const hosts = idoc.querySelectorAll<HTMLElement>("[data-auvyx-component], [data-auvyx-components]");
  if (!hosts.length || !config.restRoot) return;
  void library.ensure().then(() => {
    const byId = new Map(library.items.filter((i) => i.synced && i.editUrl).map((i) => [String(i.id), i]));
    hosts.forEach((el) => {
      const ids = [el.getAttribute("data-auvyx-component") ?? "", ...(el.getAttribute("data-auvyx-components") ?? "").split(" ")].filter((x) => x);
      for (const id of ids) {
        const item = byId.get(id);
        if (item) tag(idoc, el, `Edit ${item.title}`, `“${item.title}” shows on other pages too: what you change there changes them all. Edit it here, then come back to this page.`, item.editUrl);
      }
    });
  });
}

function tags(idoc: Document, el: HTMLElement): Element {
  setup(idoc);
  el.classList.add("auvyx-part-edit-host");
  // A sticky header is already a containing block: making it relative would unstick it.
  if (idoc.defaultView?.getComputedStyle(el).position === "static") el.classList.add("auvyx-part-edit-host--rel");
  let box = el.querySelector(":scope > .auvyx-part-edit-tags");
  if (!box) {
    box = idoc.createElement("span");
    box.setAttribute("class", "auvyx-part-edit-tags");
    el.appendChild(box);
  }
  return box;
}

function tag(idoc: Document, el: HTMLElement, label: string, tip: string, url: string) {
  const box = tags(idoc, el);
  if ([...box.children].some((k) => k.getAttribute("data-part-url") === url)) return;
  const b = idoc.createElement("button");
  b.type = "button";
  b.className = "auvyx-part-edit";
  b.textContent = `✎ ${label}`;
  b.title = tip;
  b.setAttribute("data-part-edit", label.replace(/^Edit /, "").toLowerCase());
  b.setAttribute("data-part-url", url);
  box.appendChild(b);
}

/** Opens a header, a footer or a component in this window, with the way back here. */
function open(url: string) {
  const go = store.saveStatus === "saved" || store.saveStatus === "saving" ||
    confirm("This page has changes that are not saved. Open it anyway? They are kept here and offered back when you return.");
  if (go) location.href = backFrom(url);
}

/** The tags' style and click handling, once per canvas document. */
function setup(idoc: Document) {
  if (!idoc.getElementById("auvyx-part-edit-css")) {
    const style = idoc.createElement("style");
    style.id = "auvyx-part-edit-css";
    style.textContent = CSS;
    idoc.head.appendChild(style);
  }
  // Taken on the page's window, first of all (the canvas's own click and press handlers never see it).
  const win = idoc.defaultView as (Window & { auvyxPartEdit?: boolean }) | null;
  if (!win || win.auvyxPartEdit) return;
  win.auvyxPartEdit = true;
  // the page's nodes are of its own window: no `instanceof Element` of the editor's holds for them
  const tagOf = (e: Event): Element | null => {
    const t = e.target as { closest?: (s: string) => Element | null } | null;
    return t && typeof t.closest === "function" ? t.closest("[data-part-edit]") : null;
  };
  win.addEventListener("pointerdown", (e) => { if (tagOf(e)) e.stopImmediatePropagation(); }, true);
  win.addEventListener("mousedown", (e) => { if (tagOf(e)) e.stopImmediatePropagation(); }, true);
  win.addEventListener("click", (e) => {
    const t = tagOf(e);
    if (!t) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open(t.getAttribute("data-part-url") ?? "");
  }, true);
}
