import defaults from "@auvyx/shared/design-system.json";
import type { Breakpoint } from "@auvyx/style-engine";

export type Preset = { slug: string; name: string; color?: string; size?: string };

export type DesignSystem = {
  version: number;
  breakpoints: Breakpoint[];
  tokens: { color: Preset[]; spacing: Preset[]; fontSize: Preset[] };
};

declare global {
  interface Window {
    /** Printed by the Blocks module (PHP) before the editor script. */
    auvyxBuilder?: { designSystem?: DesignSystem };
  }
}

/** Server-resolved design system (saved option over defaults), or the shared defaults. */
export const getDesignSystem = (): DesignSystem =>
  (typeof window === "undefined" ? undefined : window.auvyxBuilder?.designSystem) ??
  (defaults as DesignSystem);
