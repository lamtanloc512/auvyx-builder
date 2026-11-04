/**
 * What the agent sees: a picture of the canvas (the page as the site's theme shows it), small enough to send with a tool
 * result. The canvas is an iframe of the same origin, so its elements can be painted into an image in the browser; nothing
 * leaves the page. Pictures served from another origin without CORS headers cannot be read, and are drawn as grey boxes.
 */
import { getFontEmbedCSS, toJpeg } from "html-to-image";

export interface Shot {
  /** base64 JPEG */
  data: string;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  /** what the picture shows, for the model */
  label: string;
  /** a small copy as a data URL, for the panel (the picture itself is not kept in the conversation) */
  thumb: string;
}

/** The longest side sent to the model, in pixels: enough to judge layout and contrast, cheap in tokens. */
const MAX_SIDE = 1400;
const MAX_WIDTH = 1024;
const MAX_IMAGE_PIXELS = 16_000_000;
let fontEmbedCss: Promise<string> | undefined;

function canvasDoc(): Document | null {
  for (const f of document.querySelectorAll("iframe")) {
    const d = (f as HTMLIFrameElement).contentDocument;
    if (d?.querySelector("[data-auvyx-id]")) return d;
  }
  return null;
}

/** The element that holds the page: the parent of the first root element. */
function pageRoot(doc: Document): HTMLElement | null {
  const first = doc.querySelector("[data-auvyx-id]");
  return (first?.parentElement as HTMLElement | null) ?? null;
}

/** The page's own background (what shows through a transparent section), white when the page sets none. */
function pageBackground(doc: Document): string {
  for (const el of [doc.body, doc.documentElement]) {
    const c = el ? doc.defaultView?.getComputedStyle(el).backgroundColor : "";
    if (c && c !== "transparent" && !/rgba\(.*,\s*0\)$/.test(c)) return c;
  }
  return "#ffffff";
}

/** A grey 1×1 picture for images that cannot be read (another origin without CORS). */
const GREY = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#d4d4d8"/></svg>');

/** The top-level element (a section of the page) that holds all of `ids`, or "" when they are in several or none. */
export function sectionOf(ids: string[]): string {
  const doc = canvasDoc();
  const root = doc ? pageRoot(doc) : null;
  if (!doc || !root) return "";
  const tops = new Set<string>();
  for (const id of ids) {
    let n: Element | null = doc.querySelector(`[data-auvyx-id="${CSS.escape(id)}"]`);
    while (n && n.parentElement !== root) n = n.parentElement;
    const top = n?.getAttribute("data-auvyx-id");
    if (top) tops.add(top);
  }
  return tops.size === 1 ? [...tops][0] : "";
}

/** A 240px-wide copy of a JPEG, small enough to live in the conversation. */
async function thumbnail(data: string): Promise<string> {
  try {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${data}`;
    await img.decode();
    const w = Math.min(240, img.width);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = Math.max(1, Math.round((img.height * w) / img.width));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.6);
  } catch {
    return "";
  }
}

interface GameRun {
  snapshot(maxWidth?: number): Promise<string | null>;
}

/** Games run in sandboxed frames a picture of the page cannot see into: while the picture is taken, each shows the
 *  picture its game gives of itself (Auvyx Play's inspect.snapshot, GameView). Returns how to put the frames back. */
async function stillGames(root: HTMLElement): Promise<() => void> {
  const runOf = (window as unknown as { auvyxPlayRun?: (id: string) => GameRun | undefined }).auvyxPlayRun;
  const frames = [...root.querySelectorAll<HTMLIFrameElement>("iframe.auvyx-play__frame")];
  const undo: (() => void)[] = [];
  for (const frame of frames) {
    const id = frame.closest("[data-auvyx-id]")?.getAttribute("data-auvyx-id") ?? "";
    const shot = await runOf?.(id)?.snapshot(1024).catch(() => null);
    if (!shot || !frame.parentElement) continue;
    const img = frame.ownerDocument.createElement("img");
    img.src = shot;
    img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover";
    await img.decode().catch(() => undefined);
    frame.parentElement.append(img);
    frame.style.visibility = "hidden";
    undo.push(() => {
      img.remove();
      frame.style.visibility = "";
    });
  }
  return () => {
    for (const u of undo) u();
  };
}

/** A picture of the element `id`, or of the whole page when `id` is empty. */
export async function look(id: string): Promise<Shot | { error: string }> {
  const doc = canvasDoc();
  if (!doc) return { error: "The canvas is not showing a page yet." };
  const target = id ? (doc.querySelector(`[data-auvyx-id="${CSS.escape(id)}"]`) as HTMLElement | null) : pageRoot(doc);
  if (!target) return { error: id ? `There is no element ${id} on the canvas.` : "The page is empty." };
  const rect = target.getBoundingClientRect();
  const width = Math.ceil(Math.max(rect.width, 1));
  const height = Math.ceil(Math.max(target.scrollHeight, rect.height, 1));
  if (rect.width === 0 || rect.height === 0) return { error: "That element has no size on the canvas (hidden or empty)." };
  const scale = Math.min(1, MAX_WIDTH / width, MAX_SIDE / height);
  const putBack = await stillGames(target);
  try {
    fontEmbedCss ??= getFontEmbedCSS(target);
    let fontCSS: string | undefined;
    try {
      fontCSS = await fontEmbedCss;
    } catch {
      fontEmbedCss = undefined;
    }
    const url = await toJpeg(target, {
      quality: 0.72,
      pixelRatio: Math.min(1, scale),
      backgroundColor: pageBackground(doc),
      width,
      height,
      // The picture is the element alone: its margins (a theme's block gap, a full-width block's negative margins) would
      // otherwise shift it inside the picture and show bands of nothing that a reviewer reads as part of the design.
      style: { margin: "0", transform: "none" },
      cacheBust: false,
      imagePlaceholder: GREY,
      // Studio's own overlays (selection boxes, hover marks) are not part of the page.
      fontEmbedCSS: fontCSS,
      skipFonts: !fontCSS,
      filter: (node) => {
        if (node.nodeType !== 1) return true;
        if (node.closest("[data-auvyx-overlay], .auvyx-selection, .auvyx-hover")) return false;
        return !(node.tagName === "IMG" && (node as HTMLImageElement).naturalWidth * (node as HTMLImageElement).naturalHeight > MAX_IMAGE_PIXELS);
      },
    });
    const data = url.slice(url.indexOf(",") + 1);
    return {
      data,
      mimeType: "image/jpeg",
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      label: id ? `element ${id}` : "the whole page",
      thumb: await thumbnail(data),
    };
  } catch (err) {
    return { error: `The picture could not be taken: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    putBack();
  }
}

/** `count` pictures of `id`, `every` ms apart, side by side in one picture: how a moving element (a code element's animation,
 *  a slider, a countdown) changes over time. A WebGL canvas may come out blank (it keeps no drawing to copy). */
export async function frames(id: string, count: number, every: number): Promise<Shot | { error: string }> {
  const shots: Shot[] = [];
  for (let i = 0; i < count; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, every));
    const s = await look(id);
    if ("error" in s) return s;
    shots.push(s);
  }
  // Wide elements stack top to bottom, tall ones side by side, so each frame stays large enough to read.
  const across = shots[0].height > shots[0].width;
  const gap = 8;
  const fit = across ? Math.min(1, (MAX_WIDTH * 1.4 - gap * (count - 1)) / count / shots[0].width) : Math.min(1, (MAX_SIDE - gap * (count - 1)) / count / shots[0].height);
  const w = Math.round(shots[0].width * fit);
  const h = Math.round(shots[0].height * fit);
  const canvas = document.createElement("canvas");
  canvas.width = across ? w * count + gap * (count - 1) : w;
  canvas.height = across ? h : h * count + gap * (count - 1);
  const g = canvas.getContext("2d");
  if (!g) return shots[0];
  g.fillStyle = "#ef4444";
  g.fillRect(0, 0, canvas.width, canvas.height);
  for (const [i, s] of shots.entries()) {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${s.data}`;
    await img.decode();
    g.drawImage(img, across ? i * (w + gap) : 0, across ? 0 : i * (h + gap), w, h);
  }
  const data = canvas.toDataURL("image/jpeg", 0.72);
  const b64 = data.slice(data.indexOf(",") + 1);
  return {
    data: b64,
    mimeType: "image/jpeg",
    width: canvas.width,
    height: canvas.height,
    label: `${shots[0].label}, ${count} frames ${every} ms apart (${across ? "left to right" : "top to bottom"}, split by red bars)`,
    thumb: await thumbnail(b64),
  };
}

Object.assign(window, { auvyxAgentLook: look, auvyxAgentFrames: frames }); // for tests and debugging
