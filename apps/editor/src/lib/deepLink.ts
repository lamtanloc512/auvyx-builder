/**
 * URL parameters for sharing a view and for automated screenshots (U/DeepLink.scala), on the editor's own address:
 *   ?select=0.1 select by tree path   ?bp=mobile screen   ?state=hover   ?panel=add|assets|navigator|content|ai
 *   ?click=[data-preset="Box:Card"]|canvas:… click elements (canvas: inside the page)   ?menu=x,y context menu
 *   ?handle=se,40,30 press a transform handle and drag it by (dx, dy), no release
 *   ?dnd=Heading,700,400[,hold] drag a new element from the Add panel to editor point (x, y)
 *   ?saveAfter=3000 save after N ms (end-to-end checks)
 * The Studio's ?insert, ?only, ?kit, ?generate, ?pace, ?bench, ?stress and ?space are not taken here.
 */
import { childrenOf } from "@auvyx/editor-core";
import { canvasWeb } from "./canvasWeb.svelte";
import { screens } from "./screens.svelte";
import { store } from "./store.svelte";
import { ui } from "./ui.svelte";
import { config } from "./config";

const STATES = ["default", "hover", "focus", "active"];
const pointer = (kind: string, x: number, y: number) =>
  new PointerEvent(kind, { bubbles: true, clientX: x, clientY: y, button: 0, buttons: kind === "pointerup" ? 0 : 1, pointerId: 1, isPrimary: true });

export function applyDeepLink(search = location.search) {
  const params = new URLSearchParams(search);
  const get = (k: string) => params.get(k);
  const panel = get("panel");
  if (panel === "ai") store.aiOpen = true;
  else if (panel === "add" || panel === "assets" || panel === "navigator" || panel === "content") store.leftPanel = panel;
  const bp = get("bp");
  if (bp && screens.all.some((b) => b.id === bp)) store.breakpoint = bp;
  const st = get("state");
  if (st && STATES.includes(st)) store.styleState = st;
  const select = get("select");
  if (select !== null) {
    let id: string | null = null;
    for (const i of select.split(".").map(Number).filter((n) => Number.isInteger(n))) id = childrenOf(store.doc, id)[i] ?? null;
    store.selected = id;
  }
  // Below, the address acts (clicks, drags, saves): only where the site allows it (Editor::config, dev and checks).
  if (!(config as unknown as { deepLinkActions?: boolean }).deepLinkActions) return;
  const saveAfter = Number(get("saveAfter"));
  if (Number.isInteger(saveAfter) && saveAfter > 0) setTimeout(() => store.save(), saveAfter);
  const dnd = get("dnd");
  if (dnd) {
    const parts = dnd.split(",");
    store.leftPanel = "add";
    setTimeout(() => {
      const tile = document.querySelector<HTMLElement>(`[data-add="${parts[0]}"]`);
      if (!tile) return;
      const r = tile.getBoundingClientRect();
      const [tx, ty] = [Number(parts[1]), Number(parts[2])];
      tile.dispatchEvent(pointer("pointerdown", r.left + 5, r.top + 5));
      for (let i = 1; i <= 6; i++) setTimeout(() => tile.dispatchEvent(pointer("pointermove", r.left + ((tx - r.left) * i) / 6, r.top + ((ty - r.top) * i) / 6)), 80 * i);
      if (parts[3] !== "hold") {
        setTimeout(() => tile.dispatchEvent(pointer("pointerup", tx, ty)), 600);
        setTimeout(() => (store.leftPanel = "navigator"), 800);
      }
    }, 1200);
  }
  const handle = get("handle");
  if (handle) {
    const parts = handle.split(",");
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-handle="${parts[0]}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
      const [dx, dy] = [Number(parts[1]) || 0, Number(parts[2]) || 0];
      el.dispatchEvent(pointer("pointerdown", x, y));
      for (let i = 1; i <= 4; i++) setTimeout(() => document.dispatchEvent(pointer("pointermove", x + (dx * i) / 4, y + (dy * i) / 4)), 100 * i);
    }, 1400);
  }
  const menu = get("menu");
  if (menu) {
    const p = menu.split(",").map(Number);
    setTimeout(() => { if (store.selected) ui.menu = { id: store.selected, x: p[0] || 600, y: p[1] || 300 }; }, 1300);
  }
  const click = get("click");
  if (click)
    click.split("|").forEach((sel, i) => setTimeout(() => {
      const target = sel.startsWith("canvas:") ? canvasWeb.doc?.querySelector<HTMLElement>(sel.slice(7)) : document.querySelector<HTMLElement>(sel);
      target?.click();
    }, 1200 + 400 * i));
}
