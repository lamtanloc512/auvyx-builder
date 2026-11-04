/** The theme-file importer and token setter are the Studio's (ThemeImportSuite, case for case). */
import { describe, expect, test } from "bun:test";
import { importTheme, isDark, setTokens, toHex } from "../src/actions/themeImport";

const md = (name: string, text: string) => { const r = importTheme(name, text); if (!r.ok) throw new Error(r.error); return r.value.markdown; };

describe("ThemeImport = the Studio's", () => {
  test("shadcn globals.css: light variables, oklch to hex, dark block ignored", () => {
    const out = md("globals.css", `@import "tailwindcss";
@theme inline { --color-primary: var(--primary); --font-sans: "Inter", ui-sans-serif, sans-serif; }
:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --border: oklch(0.922 0 0);
  --destructive: oklch(0.577 0.245 27.325);
}
.dark { --background: oklch(0.145 0 0); --primary: oklch(0.922 0 0); }`);
    for (const s of ['  background: "#ffffff"', '  primary: "#171717"', '  on-primary: "#fafafa"', '  outline-variant: "#e5e5e5"', '  error: "#e7000b"',
      '    fontFamily: "Inter, ui-sans-serif, sans-serif"', '  md: "0.625rem"', '  on-background: "#0a0a0a"']) expect(out).toContain(s);
  });
  test("shadcn v3 bare hsl triples", () => {
    const out = md("app.css", ":root { --primary: 221.2 83.2% 53.3%; --background: 0 0% 100%; }");
    expect(out).toContain('  primary: "#2563eb"');
    expect(out).not.toContain("on-secondary");
  });
  test("tailwind v3 config: brand palette, font stack with a spread, radius", () => {
    const out = md("tailwind.config.js", `const defaultTheme = require('tailwindcss/defaultTheme')
module.exports = {
  content: ['./src/**/*.html'],
  theme: { extend: {
    colors: { brand: { 50: '#eff6ff', 600: '#2563eb', 900: '#1e3a8a' }, ink: '#111827' },
    fontFamily: { sans: ['Inter', ...defaultTheme.fontFamily.sans], display: ['"Playfair Display"', 'serif'] },
    borderRadius: { lg: '12px' },
  } },
  plugins: [require('@tailwindcss/forms')],
}`);
    for (const s of ['  primary: "#2563eb"', '  on-background: "#111827"', '  secondary: "#111827"', `    fontFamily: "'Playfair Display', serif"`, '    fontFamily: "Inter"', '  lg: "12px"'])
      expect(out).toContain(s);
  });
  test("W3C design tokens JSON", () => {
    const out = md("tokens.json", `{ "color": { "primary": { "$value": "#0F766E", "$type": "color" }, "background": { "$value": "#FFFBF5" } },
  "font": { "body": { "$value": "Lora" } } }`);
    for (const s of ['  primary: "#0f766e"', '  background: "#fffbf5"', '    fontFamily: "Lora"']) expect(out).toContain(s);
  });
  test("a DESIGN.md is kept; nothing usable is an error", () => {
    expect(md("DESIGN.md", "---\nname: x\n---\nBrand")).toBe("---\nname: x\n---\nBrand\n");
    expect(importTheme("notes.txt", "hello world").ok).toBe(false);
  });
  test("set changes one token and keeps the rest", () => {
    const brief = '---\nname: Shop\ncolors:\n  primary: "#111111"\n  background: "#ffffff"\nrounded: { sm: 4px, md: 8px }\n---\n\nA calm shop.\n';
    const r = setTokens(brief, [["colors.primary", "oklch(0.6 0.15 160)"], ["rounded.md", "12px"], ["typography.body-md.fontFamily", "Inter"]]);
    if (!r.ok) throw new Error(r.error);
    const out = r.value;
    expect(out).toContain('  primary: "#');
    expect(out).not.toContain("#111111");
    expect(out).toContain('  background: "#ffffff"');
    expect(out).toContain('rounded:\n  sm: 4px\n  md: "12px"');
    expect(out).toContain('typography:\n  body-md:\n    fontFamily: "Inter"');
    expect(out.endsWith("A calm shop.\n")).toBe(true);
  });
  test("set refuses a color that is not one and starts a front matter when there is none", () => {
    expect(setTokens("---\ncolors:\n---\n", [["colors.primary", "banana"]]).ok).toBe(false);
    expect(setTokens("Just prose", [["colors.primary", "#abc"]])).toEqual({ ok: true, value: '---\ncolors:\n  primary: "#aabbcc"\n---\n\nJust prose' });
  });
  test("colors", () => {
    expect(toHex("rgb(255 0 0)")).toBe("#ff0000");
    expect(toHex("hsl(210, 40%, 96%)")).toBe("#f1f5f9");
    expect(toHex("#ABCDEF80")).toBe("#abcdef");
    expect(toHex("tomato")).toBeUndefined();
    expect(isDark("#111827")).toBe(true);
    expect(isDark("#f8fafc")).toBe(false);
  });
});
