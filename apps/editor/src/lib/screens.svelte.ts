/** Editing screens (U/Screens.scala). Laptop, iPad and Mobile are built in. A custom screen keeps its own style bucket. */
import { store, SCREENS } from "./store.svelte";

const KEY = "auvyx-studio:screens";
export interface Screen { id: string; label: string; width: number }
export interface ScreenBp { id: string; label: string; maxWidth?: number; minWidth?: number }

function load(): Screen[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as { id?: unknown; label?: unknown; width?: unknown }[];
    return arr.flatMap((item) => {
      const width = Number.parseInt(String(item.width), 10);
      const label = item.label == null ? "" : String(item.label);
      const id = item.id == null ? "" : String(item.id);
      return Number.isInteger(width) && label && /^[a-z][a-z0-9-]*$/.test(id) ? [{ id, label, width }] : [];
    });
  } catch { return []; }
}

class Screens {
  custom = $state.raw<Screen[]>(load());

  width(id: string): number | undefined { return this.custom.find((s) => s.id === id)?.width; }

  get all(): ScreenBp[] {
    return [...SCREENS, ...this.custom.map((s) => (s.width >= 1280 ? { id: s.id, label: s.label, minWidth: s.width } : { id: s.id, label: s.label, maxWidth: s.width }))];
  }

  prompt() {
    const label = (window.prompt("Screen name", "Watch") ?? "").trim();
    const raw = (window.prompt("Width in px", "1440") ?? "").trim();
    const width = /^[+-]?\d+$/.test(raw) ? Number(raw) : NaN;
    if (label && width >= 240 && width <= 3840) this.add(label, width);
  }

  add(label: string, width: number) {
    const id = `c${width}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12)}`.replace(/-$/, "");
    const screen = { id: id.length > 1 ? id : `c${width}`, label: label.trim(), width };
    if (this.custom.some((s) => s.id === screen.id)) return;
    this.custom = [...this.custom, screen];
    try { localStorage.setItem(KEY, JSON.stringify(this.custom.map(({ id, label, width }) => ({ id, label, width })))); } catch { /* private window */ }
    store.breakpoint = screen.id;
  }
}

export const screens = new Screens();
