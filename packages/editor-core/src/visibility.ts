/** Where an element shows: Always, Not on mobile… as `display: none` per screen (the Scala `Visibility`). Pure. */
import type { Styles } from "@auvyx/style-engine";
import { getStyle, setStyle } from "./ops";

export const LEVELS = [
  ["Always", "Always"], ["NotOnMobile", "Not on mobile"], ["DesktopOnly", "Desktop only"], ["Hidden", "Hidden"],
  ["NotOnDesktop", "Tablet & mobile"], ["MobileOnly", "Mobile only"],
] as const;
export type Level = (typeof LEVELS)[number][0];

const hides = (s: Styles, bp: string) => getStyle(s, bp, "default", "display") === "none";
const show = (s: Styles, bp: string) => (hides(s, bp) ? setStyle(s, bp, "default", "display", undefined) : s);
const hide = (s: Styles, bp: string) => setStyle(s, bp, "default", "display", "none");

/** `devices`: breakpoint ids from widest to narrowest. */
export function setVisibility(styles: Styles, devices: string[], level: Level): Styles {
  const again = devices.map((d) => getStyle(styles, d, "default", "display")).find((v) => v !== undefined && v !== "none") ?? "revert";
  const cleared = devices.slice(1).reduce((acc, bp) => { const v = getStyle(acc, bp, "default", "display"); return v === again || v === "revert" ? setStyle(acc, bp, "default", "display", undefined) : acc; }, styles);
  const first = devices[0];
  const restored = first && hides(cleared, first) && again !== "revert" ? setStyle(cleared, first, "default", "display", again) : cleared;
  const shown = devices.reduce(show, restored);
  const hideAt = (i: number) => (devices[i] ? hide(shown, devices[i]!) : shown);
  const showAgainAt = (i: number) => (devices[i] ? setStyle(hideAt(0), devices[i]!, "default", "display", again) : shown);
  switch (level) {
    case "Always": return shown;
    case "NotOnMobile": return hideAt(2);
    case "DesktopOnly": return hideAt(1);
    case "Hidden": return hideAt(0);
    case "NotOnDesktop": return showAgainAt(1);
    case "MobileOnly": return showAgainAt(2);
  }
}

export function visibilityOf(styles: Styles, devices: string[]): Level {
  const shownAt = (i: number) => { const v = devices[i] ? getStyle(styles, devices[i]!, "default", "display") : undefined; return v !== undefined && v !== "none"; };
  const h = devices.map((d) => hides(styles, d));
  if (h[0]) return shownAt(1) ? "NotOnDesktop" : shownAt(2) ? "MobileOnly" : "Hidden";
  if (h[1]) return "DesktopOnly";
  if (h[2]) return "NotOnMobile";
  return "Always";
}
