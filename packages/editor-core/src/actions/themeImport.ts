/**
 * A theme file people already have → the site's DESIGN.md (the Scala `ThemeImport`, ADR 0031): Tailwind v4 `@theme` and
 * shadcn/CSS variables, a Tailwind v3 config or any tokens JSON (W3C DTCG, Figma, Style Dictionary), or a DESIGN.md as
 * is. Colors become hex. `set` changes single tokens of a DESIGN.md (the agent's tokens tool). Pure.
 */
export interface ThemeResult { markdown: string; mapped: string[]; unused: string[] }
type Raw = [string[], string][];

export function importTheme(fileName: string, text: string): { ok: true; value: ThemeResult } | { ok: false; error: string } {
  const src = text.replace(/\r\n/g, "\n").replace(/^﻿/, "");
  if (src.trim().startsWith("---")) return { ok: true, value: { markdown: src.trim() + "\n", mapped: ["DESIGN.md kept as it is"], unused: [] } };
  const trimmed = src.trim();
  const raw = trimmed.startsWith("{") || trimmed.startsWith("[") ? literalTokens(trimmed)
    : trimmed.includes("--") && (trimmed.includes("@theme") || trimmed.includes(":root") || /--[a-zA-Z0-9-]+\s*:/.test(trimmed)) ? cssTokens(trimmed)
    : literalTokens(trimmed);
  const tokens = classify(raw);
  if (!tokens.colors.length && !tokens.fonts.length && !tokens.radii.length)
    return { ok: false, error: `No colors, fonts or corners found in ${fileName}. Import a Tailwind or CSS theme (CSS variables), a tailwind.config, a tokens JSON or a DESIGN.md.` };
  return { ok: true, value: render(baseName(fileName), tokens) };
}

// ---- reading ----

export function cssTokens(css: string): Raw {
  const light = dropDarkBlocks(css.replace(/\/\*[\s\S]*?\*\//g, ""));
  const all = [...light.matchAll(/--([a-zA-Z0-9_-]+)\s*:\s*([^;}]+)/g)].map((m) => [m[1]!.toLowerCase(), m[2]!.trim()] as const);
  const first = new Map<string, string>();
  for (const [k, v] of all) if (!first.has(k)) first.set(k, v);
  const resolve = (v: string, depth: number): string =>
    depth > 6 ? v : v.replace(/var\(\s*--([a-zA-Z0-9_-]+)\s*(?:,\s*([^)]+))?\)/g, (m, name: string, dflt: string | undefined) => {
      const f = first.get(name.toLowerCase());
      return f !== undefined ? resolve(f, depth + 1) : dflt ?? m;
    });
  return [...new Set(all.map(([k]) => k))].map((k) => [cssPath(k), resolve(first.get(k)!, 0)]);
}

function cssPath(name: string): string[] {
  const parts = name.split("-").filter((p) => p !== "");
  const [h, ...rest] = parts;
  if (h === "color") return ["color", rest.join("-")];
  if (h === "font" || h === "family") return ["font", rest.join("-")];
  if (h === "radius" || h === "rounded") return ["radius", rest.join("-")];
  return [name];
}

function dropDarkBlocks(css: string): string {
  let out = "";
  let i = 0, selectorStart = 0;
  while (i < css.length) {
    const c = css[i]!;
    if (c === "{") {
      const selector = css.slice(selectorStart, i);
      if (selector.toLowerCase().includes("dark")) {
        out = out.slice(0, out.length - (i - selectorStart));
        let depth = 1;
        i++;
        while (i < css.length && depth > 0) { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; i++; }
        selectorStart = i;
      } else { out += c; i++; selectorStart = i; }
    } else {
      out += c;
      i++;
      if (c === "}" || c === ";") selectorStart = i;
    }
  }
  return out;
}

type Tok = { t: "S" | "W"; s: string } | { t: "P"; c: string };
const isP = (t: Tok | undefined, c: string) => !!t && t.t === "P" && t.c === c;
const javaWs = (c: string) => /[\t\n\x0B\f\r\x1C-\x1F \u{1680}\u{2000}-\u{2006}\u{2008}-\u{200A}\u{2028}\u{2029}\u{205F}\u{3000}]/u.test(c);

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; }
    else if (c === "/" && src[i + 1] === "*") { const end = src.indexOf("*/", i + 2); i = end < 0 ? src.length : end + 2; }
    else if (c === '"' || c === "'" || c === "`") {
      let sb = "";
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\" && i + 1 < src.length) { sb += src[i + 1]; i += 2; } else { sb += src[i]; i++; }
      }
      out.push({ t: "S", s: sb });
      i++;
    } else if ("{}[]:,()".includes(c)) { out.push({ t: "P", c }); i++; }
    else if (javaWs(c) || c === ";") i++;
    else {
      const start = i;
      while (i < src.length && !javaWs(c) && !"{}[]:,()\"'`;".includes(src[i]!) && !javaWs(src[i]!)) i++;
      if (i === start) i++; else out.push({ t: "W", s: src.slice(start, i) });
    }
  }
  return out;
}

export function literalTokens(src: string): Raw {
  const toks = lex(src);
  const out: Raw = [];
  let i = 0;
  let path: string[] = [];
  let key: string | undefined;
  const frames: boolean[] = [];
  const arrayIndex: number[] = [];
  const emit = (v: string) => out.push([[...path, key ?? (arrayIndex.length ? String(arrayIndex[arrayIndex.length - 1]) : "")], v]);
  const skipValue = () => {
    let depth = 0;
    while (i < toks.length && !(depth === 0 && (isP(toks[i], ",") || isP(toks[i], "}") || isP(toks[i], "]")))) {
      const t = toks[i]!;
      if (t.t === "P" && "{[(".includes(t.c)) depth++;
      else if (t.t === "P" && "}])".includes(t.c)) depth--;
      i++;
    }
  };
  while (i < toks.length) {
    const t = toks[i]!;
    if ((t.t === "S" || t.t === "W") && isP(toks[i + 1], ":")) { key = t.s; i += 2; }
    else if (isP(t, "{")) { frames.push(true); path = [...path, key ?? ""]; key = undefined; i++; }
    else if (isP(t, "[") && key !== undefined) {
      let j = i + 1;
      const items: string[] = [];
      let plain = true;
      while (j < toks.length && !isP(toks[j], "]")) {
        const x = toks[j]!;
        if (x.t === "S") items.push(x.s);
        else if (x.t === "P" && (x.c === "{" || x.c === "[")) plain = false;
        j++;
      }
      if (plain && items.length) { emit(items.join(", ")); i = j + 1; }
      else { frames.push(false); arrayIndex.push(0); path = [...path, key]; key = undefined; i++; }
    } else if (isP(t, "[")) { frames.push(false); arrayIndex.push(0); path = [...path, ""]; i++; }
    else if (isP(t, "}") || isP(t, "]")) {
      if (frames.length) { if (!frames.pop()) arrayIndex.pop(); path = path.slice(0, -1); }
      key = undefined;
      i++;
    } else if (isP(t, ",")) {
      if (frames.length && frames[frames.length - 1] === false) arrayIndex.push(arrayIndex.pop()! + 1);
      key = undefined;
      i++;
    } else if (t.t === "S" && key !== undefined) { emit(t.s); key = undefined; i++; }
    else if (t.t === "W" && key !== undefined && /^[0-9.-]/.test(t.s)) { emit(t.s); key = undefined; i++; }
    else if (key !== undefined) { skipValue(); key = undefined; }
    else i++;
  }
  return out.map(([p, v]) => [p.filter((s) => s !== ""), v]);
}

// ---- what the tokens mean ----

interface Tokens { colors: [string, string][]; fonts: [string, string][]; radii: [string, string][]; unused: string[] }
const IGNORABLE = new Set(["theme", "extend", "tokens", "global", "$value", "value", "default", "light", "base", "semantic", "sys", "ref", "$type"]);

export function classify(raw: Raw): Tokens {
  const colors: [string, string][] = [], fonts: [string, string][] = [], radii: [string, string][] = [];
  const unused: string[] = [];
  for (const [path0, value] of raw) {
    const path = path0.map((p) => p.toLowerCase().replace(/_/g, "-"));
    const last = path[path.length - 1];
    if (path.some((p) => p === "dark" || p.endsWith("-dark")) || last === "$type" || last === "$description") continue;
    const segs = path.filter((p) => !IGNORABLE.has(p));
    const joined = segs.join("-");
    const fontSeg = segs.findIndex((s) => s === "fontfamily" || s === "font-family" || s === "family");
    const head = segs[0] ?? "";
    if (fontSeg >= 0 || head === "font" || head === "fonts") {
      const name = [...segs.slice(0, Math.max(fontSeg, 0)), ...segs.slice(fontSeg + 1)].filter((s) => !["font", "fonts", "typography"].includes(s)).join("-");
      const f = cleanFont(value);
      if (f !== undefined) fonts.push([name === "" ? "sans" : name, f]);
    } else if (["radius", "radii", "rounded", "borderradius", "border-radius"].includes(head) || joined.startsWith("radius")) {
      const name = segs.slice(1).join("-");
      const l = cssLength(value);
      if (l !== undefined) radii.push([name === "" ? "base" : name, l]);
    } else {
      const name = (["color", "colors", "palette"].includes(head) ? segs.slice(1) : segs).join("-");
      const hex = toHex(value);
      if (hex !== undefined && name !== "") colors.push([name, hex]);
      else unused.push(joined);
    }
  }
  return { colors, fonts, radii, unused: [...new Set(unused)] };
}

function cleanFont(v: string): string | undefined {
  const strip = (s: string) => {
    let f = s.trim();
    if (f.startsWith('"')) f = f.slice(1);
    if (f.endsWith('"')) f = f.slice(0, -1);
    if (f.startsWith("'")) f = f.slice(1);
    if (f.endsWith("'")) f = f.slice(0, -1);
    return f.trim();
  };
  const stack = v.split(",").map(strip).filter((f) => f !== "" && !f.startsWith("var(") && /^[A-Za-z0-9 -]+$/.test(f)).map((f) => (f.includes(" ") ? `'${f}'` : f));
  const out = stack.join(", ");
  return stack.length && out.length <= 200 ? out : undefined;
}

function cssLength(v: string): string | undefined {
  const t = v.trim();
  if (/^\d*\.?\d+(px|rem|em)$/.test(t)) return t;
  if (/^\d*\.?\d+$/.test(t)) return `${t}px`;
  return undefined;
}

// ---- DESIGN.md ----

/** Fmt.fixed: `decimals` places, half up from the shortest decimal form. */
function fixed(x: number, decimals: number): string {
  const neg = x < 0 || Object.is(x, -0);
  const [i, f = ""] = Math.abs(x).toString().includes("e") ? Math.abs(x).toFixed(20).split(".") : Math.abs(x).toString().split(".");
  let digits = (i! + f.padEnd(decimals + 1, "0").slice(0, decimals + 1));
  const roundUp = Number(digits[digits.length - 1]) >= 5;
  digits = digits.slice(0, -1);
  let n = BigInt(digits) + (roundUp ? 1n : 0n);
  let s = n.toString().padStart(decimals + 1, "0");
  const out = decimals ? `${s.slice(0, -decimals)}.${s.slice(-decimals)}` : s;
  return neg ? `-${out}` : out;
}

function render(name: string, t: Tokens): ThemeResult {
  const c = new Map(t.colors);
  const pick = (...names: string[]) => names.map((n) => c.get(n)).find((v) => v !== undefined);
  const shade = (base: string) => pick(`${base}-600`, `${base}-500`, `${base}-700`);
  const primary = pick("primary", "brand", "accent-primary", "main") ?? shade("primary") ?? shade("brand")
    ?? t.colors.find(([n]) => n.endsWith("-600") && !["gray", "grey", "slate", "zinc", "neutral", "stone"].some((g) => n.startsWith(g)))?.[1];
  const background = pick("background", "bg", "page", "base-100", "surface-background");
  const text = pick("foreground", "on-background", "text", "on-surface", "ink", "base-content", "body");
  const sec = pick("secondary", "inverse", "dark");
  const darkBand = sec !== undefined && isDark(sec) ? sec : text !== undefined && isDark(text) ? text : undefined;
  const tertiary = pick("accent", "tertiary", "highlight", "accent-primary");
  const roles = ([
    ["primary", primary],
    ["on-primary", pick("primary-foreground", "on-primary", "primary-content", "primary-contrast")],
    ["secondary", darkBand],
    ["on-secondary", darkBand === undefined ? undefined : (pick("secondary") === darkBand ? pick("secondary-foreground", "on-secondary") : undefined) ?? background],
    ["tertiary", tertiary !== undefined && tertiary !== primary ? tertiary : undefined],
    ["background", background],
    ["surface", pick("card", "surface", "muted", "base-200", "surface-container", "popover")],
    ["on-background", text],
    ["on-surface-variant", pick("muted-foreground", "on-surface-variant", "text-muted", "muted-text", "subtle")],
    ["outline-variant", pick("border", "outline", "outline-variant", "input", "divider")],
    ["error", pick("destructive", "error", "danger", "sale") ?? shade("red")],
  ] as [string, string | undefined][]).filter((r): r is [string, string] => r[1] !== undefined);
  const f = new Map(t.fonts);
  const heading = f.get("heading") ?? f.get("display") ?? f.get("headline") ?? f.get("sans") ?? f.get("body");
  const body = f.get("body") ?? f.get("sans") ?? f.get("text") ?? heading;
  const r = new Map(t.radii);
  const md = r.get("md") ?? r.get("base") ?? r.get("default") ?? r.get("lg");
  const scaled = (v: string, k: number) => {
    const m = /^[\d.]*/.exec(v)![0];
    const n = Number(m) || 0;
    const unit = v.slice(m.length);
    const x = n * k;
    return `${x === Math.round(x) ? String(Math.round(x)) : fixed(x, 3).replace(/0+$/, "")}${unit}`;
  };
  const rounded: [string, string][] = md === undefined ? [] : [["sm", r.get("sm") ?? scaled(md, 0.5)], ["md", md], ["lg", r.get("lg") ?? scaled(md, 1.5)], ["xl", r.get("xl") ?? scaled(md, 2)], ["full", "9999px"]];
  const lines = ["---", `name: ${quote(name)}`];
  if (roles.length) { lines.push("colors:"); for (const [k, v] of roles) lines.push(`  ${k}: ${quote(v)}`); }
  if (heading !== undefined || body !== undefined) {
    lines.push("typography:");
    if (heading !== undefined) lines.push("  headline-lg:", `    fontFamily: ${quote(heading)}`);
    if (body !== undefined) lines.push("  body-md:", `    fontFamily: ${quote(body)}`);
  }
  if (rounded.length) { lines.push("rounded:"); for (const [k, v] of rounded) lines.push(`  ${k}: ${quote(v)}`); }
  lines.push("---", "", `Imported from a theme file (${name}).`);
  const mapped = [...roles.map(([k, v]) => `${k} ${v}`), ...(heading ? [`headings ${heading}`] : []), ...(body ? [`body ${body}`] : []), ...(md ? [`corners ${md}`] : [])];
  const leftover = [...t.colors.filter(([n]) => !roles.some(([, v]) => v === c.get(n))).map(([n]) => n), ...t.unused];
  return { markdown: lines.join("\n") + "\n", mapped, unused: [...new Set(leftover)].slice(0, 40) };
}

const quote = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

function baseName(file: string): string {
  const base = file.split(/[/\\]/).pop() ?? file;
  const noExt = base.split(".")[0] ?? base;
  return noExt === "" || ["globals", "index", "tailwind", "theme", "tokens", "app", "styles", "style"].includes(noExt.toLowerCase()) ? "Imported theme" : noExt;
}

// ---- editing by token ----

/** Sets tokens in a DESIGN.md's front matter by path (`colors.primary`, `rounded.md`, `typography.body-md.fontFamily`). */
export function setTokens(markdown: string, changes: [string, string][]): { ok: true; value: string } | { ok: false; error: string } {
  const src = markdown.replace(/\r\n/g, "\n");
  let front: string[] = [], body = src;
  if (src.startsWith("---\n")) {
    const end = src.indexOf("\n---", 4);
    if (end >= 0) { front = src.slice(4, end).split("\n"); body = src.slice(end + 4).replace(/^\n/, ""); }
  }
  let lines = front;
  for (const [path, value0] of changes) {
    const segs = path.split(".").map((s) => s.trim()).filter((s) => s !== "");
    if (!segs.length) return { ok: false, error: "Empty token path" };
    const last = segs[segs.length - 1]!;
    let value: string | undefined;
    if (segs[0] === "colors") { value = toHex(value0); if (value === undefined) return { ok: false, error: `${path}: "${value0}" is not a color` }; }
    else if (segs[0] === "rounded" || last === "fontSize" || last === "letterSpacing") { value = cssLength(value0); if (value === undefined) return { ok: false, error: `${path}: "${value0}" is not a length (px, rem, em)` }; }
    else if (last === "fontFamily") { value = cleanFont(value0); if (value === undefined) return { ok: false, error: `${path}: "${value0}" is not a font stack` }; }
    else value = value0.trim();
    lines = setLine(lines, 0, lines.length, 0, segs, value);
  }
  return { ok: true, value: ["---", ...lines, "---"].join("\n") + "\n" + (body.startsWith("\n") || body === "" ? body : "\n" + body) };
}

const indentOf = (l: string) => /^ */.exec(l)![0].length;
function keyOf(l: string): string | undefined {
  const t = l.trim();
  if (t === "" || t.startsWith("#") || t.startsWith("-")) return undefined;
  const i = t.indexOf(":");
  if (i <= 0) return undefined;
  let k = t.slice(0, i).trim();
  if (k.startsWith('"')) k = k.slice(1);
  if (k.endsWith('"')) k = k.slice(0, -1);
  if (k.startsWith("'")) k = k.slice(1);
  if (k.endsWith("'")) k = k.slice(0, -1);
  return k;
}

function setLine(lines: string[], from: number, to: number, indent: number, segs: string[], value: string): string[] {
  const pad = " ".repeat(indent);
  let at = -1;
  for (let i = from; i < to; i++) if (indentOf(lines[i]!) === indent && keyOf(lines[i]!) === segs[0]) { at = i; break; }
  if (at < 0) {
    const added = segs.map((s, d) => " ".repeat(indent + 2 * d) + (d === segs.length - 1 ? `${s}: ${quote(value)}` : `${s}:`));
    return [...lines.slice(0, to), ...added, ...lines.slice(to)];
  }
  if (segs.length === 1) { const out = [...lines]; out[at] = `${pad}${segs[0]}: ${quote(value)}`; return out; }
  const t = lines[at]!.trim();
  const rest = t.slice(t.indexOf(":") + 1).trim();
  let expanded = lines;
  if (rest.startsWith("{") && rest.endsWith("}")) {
    const pairs = splitTop(rest.slice(1, -1)).flatMap((p) => { const j = p.indexOf(":"); return j > 0 ? [[p.slice(0, j).trim(), p.slice(j + 1).trim()]] : []; });
    expanded = [...lines.slice(0, at), `${pad}${segs[0]}:`, ...pairs.map(([k, v]) => `${pad}  ${k}: ${v}`), ...lines.slice(at + 1)];
  } else if (rest !== "") { expanded = [...lines]; expanded[at] = `${pad}${segs[0]}:`; }
  let end = expanded.length;
  for (let j = at + 1; j < expanded.length; j++) if (expanded[j]!.trim() !== "" && indentOf(expanded[j]!) <= indent) { end = j; break; }
  let childIndent = indent + 2;
  for (let j = at + 1; j < end; j++) if (expanded[j]!.trim() !== "") { childIndent = indentOf(expanded[j]!); break; }
  return setLine(expanded, at + 1, end, childIndent, segs.slice(1), value);
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, q: string | null = null, cur = "";
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; }
    else if (ch === '"' || ch === "'") { q = ch; cur += ch; }
    else if (ch === "{" || ch === "[") { depth++; cur += ch; }
    else if (ch === "}" || ch === "]") { depth--; cur += ch; }
    else if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  if (cur.trim() !== "") out.push(cur.trim());
  return out;
}

// ---- colors ----

/** CSS colors → `#rrggbb`: hex, rgb(), hsl() and shadcn's bare `h s% l%`, oklch(). */
export function toHex(value: string): string | undefined {
  const v = value.trim().toLowerCase().replace(/\s+/g, " ");
  let m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(v);
  if (m) return `#${m[1]}`;
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/.exec(v);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  m = /^(rgba?|hsla?|oklch)\((.*)\)$/.exec(v);
  if (m) { const cs = channels(m[2]!); return cs && convert(m[1]!.slice(0, 3).replace("okl", "oklch"), cs); }
  if (/^-?[\d.]+(deg)? [\d.]+% [\d.]+%$/.test(v)) { const cs = channels(v); return cs && convert("hsl", cs); }
  return undefined;
}

export function isDark(hex: string): boolean {
  const h = hex.replace(/^#/, "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  const lin = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) < 0.2;
}

function channels(args: string): string[] | undefined {
  const parts = args.split(/[,/ ]+/).map((p) => p.trim()).filter((p) => p !== "");
  return parts.length >= 3 ? parts.slice(0, 3) : undefined;
}

const dbl = (s: string): number | undefined => (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[dDfF]?$/.test(s.trim()) ? parseFloat(s) : undefined);
function num(s: string, percentOf: number): number | undefined {
  if (s.endsWith("%")) { const d = dbl(s.slice(0, -1)); return d === undefined ? undefined : (d / 100) * percentOf; }
  return dbl(s.replace(/deg$/, ""));
}

function convert(kind: string, cs: string[]): string | undefined {
  if (kind === "rgb") {
    const [r, g, b] = [num(cs[0]!, 255), num(cs[1]!, 255), num(cs[2]!, 255)];
    return r === undefined || g === undefined || b === undefined ? undefined : hex(r / 255, g / 255, b / 255);
  }
  if (kind === "hsl") {
    const [h, s, l] = [num(cs[0]!, 360), num(cs[1]!, 1), num(cs[2]!, 1)];
    if (h === undefined || s === undefined || l === undefined) return undefined;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = (((h % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    const [r1, g1, b1] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c]][Math.trunc(hp)] ?? [c, 0, x];
    const m = l - c / 2;
    return hex(r1! + m, g1! + m, b1! + m);
  }
  if (kind === "oklch") {
    const [l, c, h] = [num(cs[0]!, 1), num(cs[1]!, 0.4), num(cs[2]!, 360)];
    if (l === undefined || c === undefined || h === undefined) return undefined;
    const rad = (h * Math.PI) / 180;
    const a = c * Math.cos(rad), b = c * Math.sin(rad);
    const l_ = Math.pow(l + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m_ = Math.pow(l - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s_ = Math.pow(l - 0.0894841775 * a - 1.291485548 * b, 3);
    const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    return hex(gamma(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_), gamma(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
      gamma(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_));
  }
  return undefined;
}

function hex(r: number, g: number, b: number): string {
  // Scala's math.round: half up (floor(x + 0.5))
  const ch = (x: number) => Math.floor(Math.max(0, Math.min(1, x)) * 255 + 0.5).toString(16).padStart(2, "0");
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}
