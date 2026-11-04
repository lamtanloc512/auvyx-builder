/**
 * What is wrong with what the agent just made, measured in the canvas (the theme's real page): unreadable text,
 * boxes wider than their parent, placeholder or broken pictures, colors fixed instead of theme tokens, vectors used as
 * shapes. Same rules as tools/agent-bench/probe.ts, which scores the agent from outside. `audit` is ui-craft's value audit
 * (every rendered value against the theme's tokens), run once at the end of a request.
 */

import type { ValueAudit } from "./harness";

function canvasDoc(): Document | null {
  for (const f of document.querySelectorAll("iframe")) {
    const d = (f as HTMLIFrameElement).contentDocument;
    if (d?.querySelector("[data-auvyx-id]")) return d;
  }
  return (document.querySelector("iframe") as HTMLIFrameElement | null)?.contentDocument ?? null;
}

type Rgba = { r: number; g: number; b: number; a: number };

function rgba(s: string): Rgba | null {
  const m = s.match(/rgba?\(([^)]+)\)/);
  const c = s.match(/color\(srgb ([^)]+)\)/);
  const p = (m ?? c)?.[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  if (!p) return null;
  const k = c ? 255 : 1;
  return { r: p[0] * k, g: p[1] * k, b: p[2] * k, a: p.length > 3 ? p[3] : 1 };
}

function luminance(c: Rgba): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

const COLOR_PROPS = /^(color|background-color|background|border-color|border|fill|stroke|box-shadow|outline-color)$/;

/** Problems in the elements `ids` (and what they hold), as lines the model can act on. */
export function check(ids: string[]): string[] {
  const doc = canvasDoc();
  const win = doc?.defaultView;
  if (!doc || !win || ids.length === 0) return [];
  const scope = ids.map((id) => doc.querySelector(`[data-auvyx-id="${CSS.escape(id)}"]`)).filter((e): e is Element => !!e);
  const all = scope.flatMap((e) => [e, ...e.querySelectorAll("[data-auvyx-id]")]);
  const name = (e: Element) => `${e.closest("[data-auvyx-id]")?.getAttribute("data-auvyx-id") ?? ""} "${(e.textContent ?? "").trim().slice(0, 30)}"`;
  const background = (e: Element | null): Rgba | null => {
    for (let n = e; n; n = n.parentElement) {
      const cs = win.getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null; // a picture or gradient: cannot tell
      const c = rgba(cs.backgroundColor);
      if (c && c.a > 0.5) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const out: string[] = [];

  const texts = new Set<Element>();
  // Text people see: not what is hidden from them on purpose (a form's spam trap, screen-reader-only labels).
  for (const e of scope)
    for (const n of [e, ...e.querySelectorAll("*")])
      if ([...n.childNodes].some((c) => c.nodeType === 3 && c.textContent?.trim()) && !n.closest('[aria-hidden="true"], .screen-reader-text, .auvyx-form__trap')) texts.add(n);
  for (const n of texts) {
    if (n.getBoundingClientRect().width === 0 || n.closest(".star-rating, [role=img], .screen-reader-text")) continue;
    const cs = win.getComputedStyle(n);
    const fg = rgba(cs.color);
    const bg = background(n);
    if (!fg || !bg) continue;
    const a = luminance(fg);
    const b = luminance(bg);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const large = Number.parseFloat(cs.fontSize) >= 24 || (Number.parseFloat(cs.fontSize) >= 18.6 && Number.parseInt(cs.fontWeight) >= 600);
    if (ratio < (large ? 3 : 4.5)) out.push(`${name(n)}: text contrast ${ratio.toFixed(1)}:1 (needs ${large ? 3 : 4.5}:1), ${cs.color} on rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`);
  }

  for (const sheet of doc.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      const sr = rule as CSSStyleRule;
      if (!sr.selectorText?.includes(".auvyx-")) continue;
      let hit: Element | undefined;
      try {
        hit = all.find((e) => e.matches(sr.selectorText));
      } catch {
        continue;
      }
      if (!hit) continue;
      const pad = sr.style.getPropertyValue("padding-inline-start") || sr.style.getPropertyValue("padding-left");
      const maxW = sr.style.getPropertyValue("max-width");
      if (/100%\s*-|--auvyx-band/.test(pad) && maxW && maxW !== "none")
        out.push(`${name(hit)}: padding-inline ${pad} measures the page, not this box, so with max-width ${maxW} it squeezes the content to nothing on wide screens; use a plain padding-inline (24px–40px)`);
      for (const prop of sr.style) {
        const v = sr.style.getPropertyValue(prop);
        if (COLOR_PROPS.test(prop) && /#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i.test(v) && !v.includes("var(")) out.push(`${name(hit)}: fixed color ${prop}: ${v}, use a theme token (catalog theme)`);
      }
    }
  }

  // Text touching the page's edge: a full-width section without inline padding.
  const width = doc.documentElement.clientWidth;
  for (const n of texts) {
    const r = n.getBoundingClientRect();
    if (r.width > 0 && (r.left < 8 || r.right > width - 8)) {
      out.push(`${name(n)}: text touches the edge of the page; give its section padding-inline var(--auvyx-band)`);
      break;
    }
  }

  for (const n of all) {
    const r = n.getBoundingClientRect();
    const p = n.parentElement;
    if (p && r.width > 0 && win.getComputedStyle(p).overflow === "visible" && win.getComputedStyle(n).position !== "absolute" && r.right > p.getBoundingClientRect().right + 2)
      out.push(`${name(n)}: wider than its parent by ${Math.round(r.right - p.getBoundingClientRect().right)}px`);
    if (n.tagName === "IMG" && /\/placeholders\//.test(n.getAttribute("src") ?? "")) out.push(`${name(n)}: placeholder picture, use a real one (catalog products) if the site has it`);
    if (n.tagName === "IMG" && (n as HTMLImageElement).complete && (n as HTMLImageElement).naturalWidth === 0) out.push(`${name(n)}: picture does not load`);
    if (n.classList.contains("wp-block-auvyx-vector") && Number.parseFloat(win.getComputedStyle(n).borderTopLeftRadius) > 0)
      out.push(`${name(n)}: a vector is not clipped by border-radius, use a box with a background for shapes`);
  }
  out.push(...craft(doc, win, texts, name));
  return [...new Set(out)];
}

const EMOJI = /\p{Extended_Pictographic}/u;
const ONLY_EMOJI = /^(?:[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\s])+$/u;
const LEADING_EMOJI = /^\p{Extended_Pictographic}(?:[\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]|\p{Extended_Pictographic})*\s+\S/u;
const ICON_SLOTS = /^(H[1-6]|LI|BUTTON|A|SPAN|STRONG|LABEL|DT)$/;
const isBlack = (c: Rgba | null) => !!c && c.a >= 0.99 && c.r < 0.5 && c.g < 0.5 && c.b < 0.5;

/**
 * The light craft check after each edit (`<element>: craft <rule>: …`): only the clear defects, which harness.triage
 * holds the request back for. Pure black text on a theme with color tokens (and no black token), emoji used as icons.
 */
function craft(doc: Document, win: Window, texts: Set<Element>, name: (e: Element) => string): string[] {
  const out: string[] = [];
  const colors = system(doc).colors;
  const blackIsTheme = colors.some((c) => c.value === "#000000");
  for (const n of texts) {
    if (n.getBoundingClientRect().width === 0 || n.closest(ART)) continue;
    const cs = win.getComputedStyle(n);
    const own = [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent ?? "").join("").trim();
    if (colors.length && !blackIsTheme && isBlack(rgba(cs.color)))
      out.push(`${name(n)}: craft pure-black: text is pure black (#000) on a theme with color tokens; use the theme's text token (var(--wp--preset--color--auvyx-text))`);
    if (EMOJI.test(own) && (ONLY_EMOJI.test(own) || (LEADING_EMOJI.test(own) && ICON_SLOTS.test(n.tagName))))
      out.push(`${name(n)}: craft emoji-icon: an emoji used as an icon; use an icon element or none`);
  }
  return out;
}

// ---- the value audit (ui-craft's audit, on the canvas) ----

/** Art: where the picture is the content and any value is allowed (ui-craft's data-art). Exempt and counted. */
const ART = ".wp-block-auvyx-vector, .wp-block-auvyx-code, .wp-block-auvyx-game, [data-art], svg, canvas, video, iframe, img, picture";
/** The theme's own controls size themselves (ui-craft exempts the foundation's controls from spacing). */
const CONTROL = "button, input, select, textarea, .wp-element-button, .wp-block-button__link";

type Token = { value: string | number; name: string };
interface SystemValues {
  colors: Token[];
  sizes: Token[];
  weights: Token[];
  families: Token[];
  tracking: Token[];
  radii: Token[];
  spacing: Token[];
  shadows: Token[];
}

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
const toHex = (c: Rgba) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
const channels = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
const colorDist = (a: string, b: string) => Math.max(...channels(a).map((v, i) => Math.abs(v - channels(b)[i])));
const firstFamily = (f: string) => f.split(",")[0].replace(/["']/g, "").trim().toLowerCase();
const shadowLayers = (s: string) => (s && s !== "none" ? (s.match(/(?:[^,(]|\([^)]*\))+/g) ?? []).map((l) => l.trim()).filter((l) => !/rgba\(\d+, \d+, \d+, 0\)/.test(l)) : []);

let cached: { doc: Document; at: number; values: SystemValues } | undefined;

/**
 * The values the page's system allows, read in the canvas (ui-craft's readSystem): the theme's tokens declared on the root
 * (colors, font sizes and families, spacing, corners, shadows), resolved by the browser through a hidden probe, and the
 * theme's own text roles (body, headings, buttons), which stand for ui-craft's type classes. Read again after a second
 * (a new look reloads the canvas).
 */
export function system(doc: Document): SystemValues {
  if (cached && cached.doc === doc && Date.now() - cached.at < 1000) return cached.values;
  const win = doc.defaultView!;
  const names = new Set<string>();
  const walk = (rules: CSSRuleList) => {
    for (const r of rules) {
      const sr = r as CSSStyleRule;
      if (sr.selectorText && /(^|,)\s*(:root|html|body|\.editor-styles-wrapper)\s*(,|$)/.test(sr.selectorText))
        for (const p of sr.style) if (/^--(wp--preset--|wp--custom--|auvyx-)/.test(p)) names.add(p);
      if ((r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of doc.styleSheets) {
    try {
      walk(sheet.cssRules);
    } catch {
      /* another origin */
    }
  }
  const probe = doc.createElement("span");
  probe.textContent = "x";
  doc.body.append(probe);
  const read = (name: string, set: string, get: (cs: CSSStyleDeclaration) => string) => {
    probe.style.cssText = `visibility:hidden;position:absolute;${set}:var(${name})`;
    return get(win.getComputedStyle(probe));
  };
  const px = (v: string) => (v.endsWith("px") && Number.isFinite(Number.parseFloat(v)) ? Number.parseFloat(v) : null);
  const pick = <T,>(re: RegExp, set: string, get: (cs: CSSStyleDeclaration) => string, parse: (v: string) => T | null) =>
    [...names].filter((n) => re.test(n)).flatMap((n) => {
      const value = parse(read(n, set, get));
      return value === null ? [] : [{ name: `var(${n})`, value: value as unknown as string | number }];
    });
  const values: SystemValues = {
    colors: pick(/--color--/, "background-color", (cs) => cs.backgroundColor, (v) => {
      const c = rgba(v);
      return c && c.a > 0 ? toHex(c) : null;
    }),
    sizes: pick(/--font-size--/, "font-size", (cs) => cs.fontSize, px),
    families: pick(/--font-family--/, "font-family", (cs) => cs.fontFamily, (v) => (v ? firstFamily(v) : null)),
    radii: pick(/radius/, "border-top-left-radius", (cs) => cs.borderTopLeftRadius, px),
    spacing: pick(/--spacing--|--auvyx-band|gap|gutter/, "padding-left", (cs) => cs.paddingLeft, px),
    shadows: pick(/--shadow--/, "box-shadow", (cs) => cs.boxShadow, (v) => (v && v !== "none" ? v : null)),
    weights: [],
    tracking: [{ value: 0, name: "no letter-spacing" }],
  };
  probe.remove();
  // The theme's text roles, as a hidden sample in the page: what headings, body text and buttons render with.
  const sample = doc.createElement("div");
  sample.style.cssText = "visibility:hidden;position:absolute;left:-9999px;top:0;width:800px";
  sample.innerHTML = "<h1>x</h1><h2>x</h2><h3>x</h3><h4>x</h4><h5>x</h5><h6>x</h6><p>x</p><p><strong>x</strong></p><div class=\"wp-block-button\"><a class=\"wp-block-button__link wp-element-button\">x</a></div>";
  (doc.querySelector(".editor-styles-wrapper, .wp-site-blocks, main") ?? doc.body).append(sample);
  for (const e of sample.querySelectorAll("h1, h2, h3, h4, h5, h6, p, strong, a")) {
    const cs = win.getComputedStyle(e);
    const role = `the theme's ${e.tagName === "A" ? "button" : e.tagName.toLowerCase()}`;
    const size = Number.parseFloat(cs.fontSize);
    values.sizes.push({ value: size, name: role });
    values.weights.push({ value: Number(cs.fontWeight), name: role });
    values.families.push({ value: firstFamily(cs.fontFamily), name: role });
    if (cs.letterSpacing !== "normal") values.tracking.push({ value: Number.parseFloat(cs.letterSpacing) / size, name: role });
  }
  sample.remove();
  cached = { doc, at: Date.now(), values };
  return values;
}

/** The Auvyx style rules (`.auvyx-…`) an element matches, with what they declare: the values the agent itself wrote. */
function authored(doc: Document, el: Element): CSSStyleDeclaration[] {
  const out: CSSStyleDeclaration[] = [];
  const walk = (rules: CSSRuleList) => {
    for (const r of rules) {
      const sr = r as CSSStyleRule;
      if (sr.selectorText?.includes(".auvyx-")) {
        try {
          if (el.matches(sr.selectorText)) out.push(sr.style);
        } catch {
          /* a selector the engine cannot match (pseudo-elements) */
        }
      }
      if ((r as CSSGroupingRule).cssRules && !(r instanceof CSSMediaRule && !doc.defaultView!.matchMedia(r.conditionText).matches)) walk((r as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of doc.styleSheets) {
    try {
      walk(sheet.cssRules);
    } catch {
      /* another origin */
    }
  }
  return out;
}

const SPACE_PROPS = ["padding-top", "padding-right", "padding-bottom", "padding-left", "row-gap", "column-gap", "margin-top", "margin-bottom"];

/**
 * Every rendered value of what a request built, against the system the canvas loaded (ui-craft's audit): text size,
 * weight, family, letter-spacing and color; surface, border and gradient colors; corners; shadows; and the spacing the
 * agent wrote itself (padding, gap, margin in its own styles: the theme's components space themselves). A value is
 * on-system when it equals a token within a small tolerance, or when its style is written with the theme's variables
 * (color-mix on tokens, calc on a spacing token). Art is exempt and counted. Each off-system value is a line naming the
 * nearest token; harness.triage keeps them advisory.
 */
export function audit(ids: string[]): ValueAudit {
  const doc = canvasDoc();
  const win = doc?.defaultView;
  if (!doc || !win || ids.length === 0) return { checks: 0, off: [], art: 0 };
  const sys = system(doc);
  const roots = [...new Set(ids)].map((id) => doc.querySelector(`[data-auvyx-id="${CSS.escape(id)}"]`)).filter((e): e is Element => !!e);
  const scope = roots.filter((e) => !roots.some((o) => o !== e && o.contains(e)));
  const els = scope.flatMap((e) => [e, ...e.querySelectorAll("*")]);
  const art = new Set(els.filter((e) => e.matches(ART) && !e.parentElement?.closest(ART)).filter((e) => scope.some((s) => s.contains(e))));
  const name = (e: Element) => `${e.closest("[data-auvyx-id]")?.getAttribute("data-auvyx-id") ?? ""} "${(e.textContent ?? "").trim().slice(0, 30)}"`;
  const off = new Map<string, string>();
  let checks = 0;
  const viaVar = (el: Element, props: string[]) => authored(doc, el).some((st) => props.some((p) => st.getPropertyValue(p).includes("var(")));
  const judge = (el: Element, rule: string, value: string | number, pool: Token[], dist: (a: string | number, b: string | number) => number, tol: number, unit = "", props: string[] = []) => {
    checks++;
    if (!pool.length) return;
    let best = { d: Infinity, t: pool[0] };
    for (const t of pool) {
      const d = dist(value, t.value);
      if (d < best.d) best = { d, t };
    }
    if (best.d <= tol || (props.length && viaVar(el, props))) return;
    const shown = typeof value === "number" ? `${Math.round(value * 100) / 100}${unit}` : value;
    const near = typeof best.t.value === "number" ? `${Math.round(best.t.value * 100) / 100}${unit}` : best.t.value;
    const key = `${rule}|${shown}|${best.t.name}`;
    if (!off.has(key)) off.set(key, `${name(el)}: craft off-system ${rule} ${shown} → ${best.t.name}${near !== best.t.name ? ` (${near})` : ""}`);
  };
  const num = (a: string | number, b: string | number) => Math.abs(Number(a) - Number(b));
  const str = (a: string | number, b: string | number) => (String(a).toLowerCase() === String(b).toLowerCase() ? 0 : 1);
  const col = (a: string | number, b: string | number) => colorDist(String(a), String(b));

  for (const el of els) {
    if (el.closest(ART) || el.getBoundingClientRect().width === 0 || el.closest('[aria-hidden="true"], .screen-reader-text')) continue;
    const cs = win.getComputedStyle(el);
    if ([...el.childNodes].some((c) => c.nodeType === 3 && c.textContent?.trim())) {
      const size = Number.parseFloat(cs.fontSize);
      judge(el, "text-size", size, sys.sizes, num, 0.5, "px", ["font-size"]);
      judge(el, "text-weight", Number(cs.fontWeight), [...sys.weights, { value: 400, name: "regular" }, { value: 700, name: "bold" }], num, 0);
      judge(el, "text-family", firstFamily(cs.fontFamily), sys.families, str, 0);
      if (cs.letterSpacing !== "normal") judge(el, "text-tracking", Number.parseFloat(cs.letterSpacing) / size, sys.tracking, num, 0.006, "em", ["letter-spacing"]);
      const c = rgba(cs.color);
      if (c && c.a > 0) judge(el, "text-color", toHex(c), sys.colors, col, 2, "", ["color"]);
    }
    const bg = rgba(cs.backgroundColor);
    if (bg && bg.a > 0) judge(el, "surface-color", toHex(bg), sys.colors, col, 2, "", ["background-color", "background"]);
    for (const stop of cs.backgroundImage.includes("gradient") ? cs.backgroundImage.match(/rgba?\([^)]+\)/g) ?? [] : []) {
      const c = rgba(stop);
      if (c && c.a > 0) judge(el, "gradient-color", toHex(c), sys.colors, col, 2, "", ["background-image", "background"]);
    }
    for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
      if (Number.parseFloat(cs[`border${side}Width`]) === 0 || cs[`border${side}Style`] === "none") continue;
      const c = rgba(cs[`border${side}Color`]);
      if (c && c.a > 0) judge(el, "border-color", toHex(c), sys.colors, col, 2, "", ["border-color", "border", `border-${side.toLowerCase()}`, `border-${side.toLowerCase()}-color`]);
    }
    for (const corner of new Set([cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius])) {
      const r = Number.parseFloat(corner);
      if (r > 0 && corner.endsWith("px") && r < Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height) / 2)
        judge(el, "radius", r, sys.radii, num, 0.5, "px", ["border-radius"]);
    }
    for (const layer of shadowLayers(cs.boxShadow)) {
      if (/ 0px 0px 0px [\d.]+px/.test(layer)) continue; // a ring is a border
      judge(el, "shadow", layer, sys.shadows.flatMap((s) => shadowLayers(String(s.value)).map((value) => ({ value, name: s.name }))), str, 0, "", ["box-shadow"]);
    }
    if (!el.matches(CONTROL))
      for (const st of authored(doc, el))
        for (const p of SPACE_PROPS) {
          const v = st.getPropertyValue(p).trim();
          if (!v || v.includes("var(") || /^(0|auto|0px)$/.test(v)) continue;
          const n = Number.parseFloat(cs.getPropertyValue(p));
          if (n > 0) judge(el, "spacing", n, sys.spacing, num, 0.5, "px");
        }
  }
  return { checks, off: [...off.values()], art: art.size };
}
