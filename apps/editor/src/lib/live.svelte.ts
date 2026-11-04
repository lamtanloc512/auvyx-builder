/**
 * Studio Live (docs/studio-live-sandbox.md, U/LiveView.scala): the open document as a visitor sees it, its code running
 * without "Run custom code". The site keeps the document for a few minutes (auvyx/v1/live) and renders it signed out
 * with a `sandbox` policy; the frame carries the same flags (shared/live.json), so the page has an opaque origin: no
 * cookies, no storage, no reach into this window. What its code reports comes back by message into the code console.
 */
import live from "../../../../shared/live.json";
import { canvasMarks, connected, rest } from "./host";
import { config } from "./config";
import { store } from "./store.svelte";
import { print, setError } from "./console.svelte";
import { toast } from "./toast.svelte";

export const liveSandbox = live.sandbox.join(" ");

/** Live is offered where the site draws the canvas (the web canvas), as the Studio offers it. */
export const liveAvailable = connected && !!config.webCanvasUrl && !config.isPart;

/** The address the site answered for the document last sent, while Live is on; `opening` while it is asked. */
export const liveMode = $state<{ url: string | null; opening: boolean }>({ url: null, opening: false });

export function openLive() {
  liveMode.opening = true;
  const [markup, ids, paths] = canvasMarks(store.doc, null, config.canvasPrefix || "content");
  rest<{ url: string }>("auvyx/v1/live", { method: "POST", body: JSON.stringify({ post: config.postId, markup, ids, paths }) })
    .then((r) => { liveMode.url = r.data.url; })
    .catch((e: Error) => { liveMode.url = null; toast(`Live could not open: ${e.message}`); })
    .finally(() => { liveMode.opening = false; });
}

export function closeLive() { liveMode.url = null; }

/** code.js in the Live frame (`auvyxLive`), believed only from that frame's window and an opaque origin. */
export function listenLive(frame: HTMLIFrameElement, onGrab: (x: number, y: number, end: boolean) => void) {
  const onMessage = (e: MessageEvent) => {
    const d = e.data as { auvyxLive?: number; type?: string; id?: string; message?: string; level?: string; args?: unknown[]; x?: number; y?: number } | null;
    if (e.source !== frame.contentWindow || e.origin !== "null" || !d || d.auvyxLive !== 1) return;
    if (d.type === "grab") onGrab(Number(d.x), Number(d.y), false);
    else if (d.type === "grab-end") onGrab(0, 0, true);
    else if (d.type === "error" && d.id) setError(d.id, String(d.message ?? "").slice(0, 500));
    else if (d.type === "print" && d.id) print(d.id, String(d.level ?? "log"), Array.isArray(d.args) ? d.args : []);
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
