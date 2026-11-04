/**
 * Live thumbnails of templates (U/TemplatePreview.scala): the template drawn small in a scaled-down sandboxed iframe, laid
 * out at the Studio's frame widths (sections 1280, rows 900, blocks 520) and as tall as its content (capped).
 *
 * The Studio renders a template to static HTML itself (its CanvasDoc + compiled styles). This editor's canvas is the site's
 * own page drawn by PHP, so a thumbnail is drawn the same way: the template's markup through `auvyx/v1/canvas/render` (one
 * request per thumbnail, only when it scrolls into view, cached for the session), shown with the canvas page's own
 * stylesheets. No screenshots to maintain; they always match the templates and the site's theme.
 */
import { decodeTree, markupToTree } from "@auvyx/editor-core";
import type { Attachment } from "svelte/attachments";
import { config } from "./config";
import { canvasMarks, connected, pathOf, rest, type Rendered } from "./host";
import { canvasWeb } from "./canvasWeb.svelte";
import { nextId } from "./ids";
import { load } from "./templates";

export interface Thumb {
  /** Cache key (template or layout id). */
  key: string;
  /** Its markup once the library is loaded. */
  markup: () => string | null;
  /** Frame width the template is laid out at. */
  width: number;
  /** Blocks and rows sit in 24 px of air; sections fill the frame. */
  padded: boolean;
  maxHeight: number;
}

/** TemplatePreview.frameWidth. */
export const frameWidth = (group: "Section" | "Block" | "Layout") => (group === "Section" ? 1280 : group === "Layout" ? 900 : 520);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** The canvas page, once it is there (its sheets style the thumbnails). */
const canvasDoc = (): Promise<Document> =>
  new Promise((resolve) => {
    const tick = () => { const d = canvasWeb.doc; if (d?.body) resolve(d); else setTimeout(tick, 400); };
    tick();
  });

/** The canvas page's sheets, without the editor's own rules. */
const pageSheets = (d: Document) =>
  [...d.head.querySelectorAll("link[rel=stylesheet],style")].filter((s) => !(s.id || "").startsWith("auvyx-canvas-")).map((s) => s.outerHTML).join("");

// ---- one render at a time or two, cached ------------------------------------------------------

const cache = new Map<string, Promise<string>>();
const queue: (() => void)[] = [];
let running = 0;
const MAX_RUNNING = 2;

const pump = () => {
  while (running < MAX_RUNNING && queue.length) {
    running++;
    queue.shift()!();
  }
};

const render = (markup: string): Promise<Rendered> => {
  const doc = decodeTree(markupToTree(markup), nextId);
  const [m, ids, paths] = canvasMarks(doc, null, "tpl");
  return rest<Rendered>("auvyx/v1/canvas/render", { method: "POST", body: JSON.stringify({ post: config.postId, markup: m, ids, paths, at: pathOf(config.webCanvasUrl) }) }).then((r) => r.data);
};

/** The thumbnail's page (srcdoc). */
function page(t: Thumb): Promise<string> {
  let p = cache.get(t.key);
  if (!p) {
    p = new Promise<string>((resolve, reject) => {
      queue.push(() => {
        load()
          .then(async () => {
            const markup = t.markup();
            if (markup === null) throw new Error("not in the library");
            const [d, r] = await Promise.all([canvasDoc(), render(markup)]);
            const body = t.padded ? `<div style="padding:24px">${r.html}</div>` : r.html;
            resolve(`<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${esc(d.baseURI)}">${pageSheets(d)}${r.assets}` +
              `<style>html,body{overflow:hidden}${r.css}</style></head><body class="${esc(d.body.className)}">${body}</body></html>`);
          })
          .catch(reject)
          .finally(() => { running--; pump(); });
      });
      pump();
    });
    p.catch(() => cache.delete(t.key));
    cache.set(t.key, p);
  }
  return p;
}

/**
 * `{@attach thumbnail(t)}` on the preview box (`relative w-full overflow-hidden rounded-md bg-white ring-1 ring-black/5`):
 * fills its width, the height follows the rendered page (capped at `maxHeight`).
 */
export const thumbnail = (t: Thumb): Attachment<HTMLElement> => (box) => {
  let scale = 0.2;
  let pageHeight = 600;
  const size = () => {
    box.style.height = `${Math.min(t.maxHeight, pageHeight * scale)}px`;
    frame.style.height = `${pageHeight}px`;
    frame.style.transform = `scale(${scale})`;
  };
  const frame = document.createElement("iframe");
  frame.className = "pointer-events-none absolute top-0 left-0 origin-top-left border-0";
  frame.tabIndex = -1;
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.style.width = `${t.width}px`;
  box.appendChild(frame);
  const measure = () => { if (box.clientWidth > 0) { scale = box.clientWidth / t.width; size(); } };
  measure();
  const resize = new ResizeObserver(measure);
  resize.observe(box);
  let timer: ReturnType<typeof setTimeout> | undefined;
  frame.addEventListener("load", () => {
    const doc = frame.contentDocument;
    if (!doc?.body) return;
    // content height (not the viewport): bottom of the body's last child
    const contentHeight = () => { const last = doc.body.lastElementChild; return last ? Math.ceil(last.getBoundingClientRect().bottom) : 400; };
    pageHeight = contentHeight();
    size();
    // images load after the document: measure again
    timer = setTimeout(() => { pageHeight = contentHeight(); size(); }, 400);
  });
  let started = false;
  const start = () => {
    if (started || !connected) return;
    started = true;
    page(t).then((html) => { if (frame.isConnected) frame.srcdoc = html; }, () => { box.dataset.thumbFailed = "1"; });
  };
  const seen = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { start(); seen.disconnect(); } }, { rootMargin: "200px" });
  seen.observe(box);
  return () => { seen.disconnect(); resize.disconnect(); clearTimeout(timer); frame.remove(); };
};
