/**
 * The page at the device width on a board (U/Viewport.scala, web canvas): drawn at the fit zoom, 100% or a zoom the
 * user chose; only the drawing scales, the layout never changes. The page scrolls in its own window (the frame).
 */
import { store } from "./store.svelte";
import { screens } from "./screens.svelte";

/** Frame widths of the web canvas (CanvasWeb.width: a custom screen its own) and the viewport height used for the frame, per screen. */
const WIDTHS: Record<string, number> = { base: 1440, tablet: 820, mobile: 390 };
const HEIGHTS: Record<string, number> = { base: 900, tablet: 1024, mobile: 844 };
export const frameWidth = (bp: string) => screens.width(bp) ?? WIDTHS[bp] ?? 1440;
export const viewportHeight = (bp: string) => HEIGHTS[bp] ?? 900;

/** Room between the page and the panel's edges at the start position: none, the page sits flush under the Edit | Live bar. */
export const GAP = 0;
const KEEP = 96;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

class Viewport {
  room = $state(0);
  roomHeight = $state(0);
  fitting = $state(true);
  chosenZoom = $state<number | null>(null);
  scroller: HTMLElement | null = null;
  card: HTMLElement | null = null;
  /** Scrolls the page inside its frame (set by the canvas). */
  scrollPageBy: (dy: number) => void = () => {};
  scrollPageTo: (y: number) => void = () => {};

  get width() { return frameWidth(store.breakpoint); }
  get fitZoom() {
    const r = this.room - 2 * GAP;
    const w = this.width;
    return !this.fitting || r <= 0 || w <= r ? 1 : Math.max(0.25, r / w);
  }
  get zoom() { return this.chosenZoom ?? this.fitZoom; }
  /** Room around the page on the board: all but 96 px of the panel, so the page is never lost. */
  get slack(): [number, number] { return [Math.max(0, this.room - KEEP), Math.max(0, this.roomHeight - KEEP)]; }
  /** The frame is a browser window: the device's height at least, and as tall as the panel shows at the fit zoom. */
  get pageHeight() { return Math.max(viewportHeight(store.breakpoint), Math.floor((this.roomHeight - 2 * GAP) / this.fitZoom)); }

  /** The start position: the page's top a gap under the panel's top, centred (or its left edge in view when wider). */
  home() {
    const el = this.scroller;
    if (!el) return;
    const [sx, sy] = [Math.max(0, el.clientWidth - KEEP), Math.max(0, el.clientHeight - KEEP)];
    const cardW = this.card?.getBoundingClientRect().width ?? 0;
    const inside = el.clientWidth - 2 * GAP;
    el.scrollLeft = sx - GAP + (cardW <= inside ? (cardW - inside) / 2 : 0);
    el.scrollTop = sy - GAP;
  }
  homeSoon() { requestAnimationFrame(() => this.home()); }

  resetView() {
    this.chosenZoom = null;
    this.fitting = true;
    this.home();
    this.homeSoon();
    this.scrollPageTo(0);
  }

  /** Zooms by `factor`, keeping the page point under (x, y) (editor coordinates) where it is. */
  zoomAt(x: number, y: number, factor: number) {
    const z = this.zoom;
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor));
    if (Math.abs(next - z) < 1e-4 || !this.scroller || !this.card) return;
    const before = this.card.getBoundingClientRect();
    const [px, py] = [(x - before.left) / z, (y - before.top) / z];
    this.chosenZoom = next;
    queueMicrotask(() => requestAnimationFrame(() => {
      if (!this.scroller || !this.card) return;
      const after = this.card.getBoundingClientRect();
      this.scroller.scrollLeft += after.left + px * next - x;
      this.scroller.scrollTop += after.top + py * next - y;
    }));
  }

  zoomBy(factor: number) {
    const r = this.scroller?.getBoundingClientRect();
    if (r) this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  }

  zoomTo(z: number) { if (this.zoom > 0) this.zoomBy(z / this.zoom); }

  /** Pans the board; what the panel cannot take scrolls the page inside its frame. */
  panBy(dx: number, dy: number) {
    const el = this.scroller;
    if (!el) return;
    const top = el.scrollTop;
    el.scrollLeft += dx;
    el.scrollTop += dy;
    const rest = dy - (el.scrollTop - top);
    if (Math.abs(rest) > 0.5) this.scrollPageBy(rest / this.zoom);
  }

  /** Ctrl/⌘ + wheel (and a pinch) zooms at the pointer; a plain wheel pans. */
  wheel(e: WheelEvent, x: number, y: number) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      this.zoomAt(x, y, Math.exp(-Math.max(-100, Math.min(100, e.deltaY * unit)) * 0.0025));
    } else this.panBy(e.deltaX, e.deltaY);
  }
}

export const viewport = new Viewport();
