/**
 * Readable names for token values in the Style panel (the Studio's shared TokenLabels.scala):
 * `var(--wp--preset--font-size--auvyx-xl)` reads "XL", `color-mix(in srgb, var(--wp--preset--color--auvyx-text) 35%, transparent)`
 * reads "Text 35%". The stored value is unchanged.
 */
const VAR = /var\(--wp--preset--([a-z-]+?)--([a-z0-9-]+)\)/;
const VAR_FULL = /^var\(--wp--preset--([a-z-]+?)--([a-z0-9-]+)\)$/;
const MIX = /^color-mix\(in srgb, var\(--wp--preset--color--([a-z0-9-]+)\) (\d{1,3})%, transparent\)$/;

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** `names` maps a slug to its token name (from the design system); unknown slugs are tidied up instead. */
export function prettyToken(value: string, names: (slug: string) => string | undefined = () => undefined): string {
  const name = (slug: string) => {
    const known = names(slug);
    const n = known ?? (() => {
      const s = slug.startsWith("auvyx-") ? slug.slice(6) : slug;
      return s.length <= 3 ? s.toUpperCase() : s.split("-").map(capitalize).join(" ");
    })();
    return n.startsWith("Auvyx ") ? n.slice(6) : n;
  };
  const v = value.trim();
  const mix = MIX.exec(v);
  if (mix) return `${name(mix[1]!)} ${mix[2]}%`;
  if (VAR_FULL.test(v)) return name(VAR.exec(v)![2]!);
  return v;
}
