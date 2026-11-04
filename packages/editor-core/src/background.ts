/** Flatsome's Banner background as one `background-image` value: an optional flat overlay above an optional photo (Background.scala). */
export interface BackgroundLayers { overlay: string; image: string }

const URL_RE = /url\(\s*(['"]?)([^'")]*)\1\s*\)/i;
const OVERLAY = /^\s*linear-gradient\(\s*(.+?)\s*,\s*\1\s*\)/i;
const SAFE_IMAGE = /^(https?:\/\/|\/)[^\s"'()]+$/i;
const SAFE_COLOR = /^[#a-zA-Z0-9(),.%\s-]{1,120}$/;

export function parseBackground(value: string): BackgroundLayers {
  const o = OVERLAY.exec(value);
  const u = URL_RE.exec(value);
  return { overlay: o ? o[1]! : "", image: u ? u[2]!.trim() : "" };
}

/** undefined clears the property. Unsafe or half-typed parts are dropped rather than written. */
export function composeBackground(layers: BackgroundLayers): string | undefined {
  const image = layers.image.trim();
  const overlay = layers.overlay.trim();
  const parts: string[] = [];
  if (overlay && SAFE_COLOR.test(overlay) && !overlay.toLowerCase().includes("url")) parts.push(`linear-gradient(${overlay}, ${overlay})`);
  if (image && SAFE_IMAGE.test(image)) parts.push(`url("${image}")`);
  return parts.length ? parts.join(", ") : undefined;
}
