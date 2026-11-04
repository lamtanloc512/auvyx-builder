/** Minimal CSS minifier for our hand-written stylesheets (no strings containing comment markers): drops comments and
 * collapses whitespace. Used by the zip (shipped CSS) and the theme's size budget. */
export const minifyCss = (css: string): string =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};,>])\s*/g, "$1")
    .replace(/:\s+/g, ":") // only after a property name: selectors never have a space after ":"
    .replace(/;}/g, "}")
    .trim();
