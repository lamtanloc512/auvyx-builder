/**
 * The Studio pieces the importers build with, each as its Scala original writes it: slider and entrance class tokens
 * (SliderOptions, Animate), the text box position (BoxPosition), the countdown token (Countdown), video addresses
 * (Embed), forms (Forms), keys (SiteTemplate.slugify), Auvyx's product card loop (ProductCards) and the logo (Mark).
 */
import { escapeAttr, escapeComment, escapeText } from "../markup";
import { javaTrim, jsonString } from "../json";
import { type Ctx, type Decl, NONE, S, css } from "./ctx";

// ---- SliderOptions ------------------------------------------------------------------------------

export interface SliderOptions { autoplay?: number; fade?: boolean; arrows?: boolean; dots?: boolean }

/** SliderOptions.write for a track with no classes yet (the other options at their defaults). */
export const sliderClass = (o: SliderOptions): string =>
  [
    (o.autoplay ?? 0) > 0 ? `auvyx-autoplay-${o.autoplay}` : "",
    o.fade ? "auvyx-fade" : "",
    o.arrows === false ? "auvyx-no-arrows" : "",
    o.dots === false ? "auvyx-no-dots" : "",
  ].filter(Boolean).join(" ");

// ---- Animate ------------------------------------------------------------------------------------

const ANIMATIONS = new Set(["fade", "up", "down", "left", "right", "zoom", "blur", "bounce", "flip-x", "flip-y"]);

/** Animate.write("", name, 0). */
export const animateClass = (name: string): string => (ANIMATIONS.has(name) ? `auvyx-animate-${name}` : "");

// ---- BoxPosition --------------------------------------------------------------------------------

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));
const pct = (v: number) => `${clamp(v)}%`;

/** BoxPosition.patch(Some((x, y))): the box at x% / y% of its banner, its own point x% / y% on that spot. */
export const boxPosition = (x: number, y: number): Decl[] =>
  [["position", "absolute"], ["left", pct(x)], ["top", pct(y)], ["transform", `translate(-${pct(x)}, -${pct(y)})`]];

// ---- Countdown ----------------------------------------------------------------------------------

export const COUNTDOWN = "auvyx-timer";

/** Countdown.withUntil(Countdown.Marker, iso). */
export const countdownClass = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  const ok = m && +m[2]! >= 1 && +m[2]! <= 12 && +m[3]! >= 1 && +m[3]! <= 31 && +m[4]! <= 23 && +m[5]! <= 59;
  return ok ? `${COUNTDOWN} auvyx-until-${m[1]}${m[2]}${m[3]}t${m[4]}${m[5]}z` : COUNTDOWN;
};

// ---- Embed --------------------------------------------------------------------------------------

const YOUTUBE = /(?:youtube\.com\/(?:watch\?(?:[^\n\r\u0085\u2028\u2029]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/;
const VIMEO = /vimeo\.com\/(?:video\/)?(\d{5,12})/;
const VIDEO_FILE = /^https?:\/\/[^ \t\n\x0B\f\r"'<>]+\.(?:mp4|webm|ogv)(?:\?[^ \t\n\x0B\f\r"'<>]*)?$/i;

/** Embed.url: a YouTube or Vimeo page → its privacy-friendly player. */
export const embedUrl = (video: string): string | undefined => {
  // Scala matches the whole string against an unanchored pattern: the first match wins
  const y = YOUTUBE.exec(video);
  if (y) return `https://www.youtube-nocookie.com/embed/${y[1]}`;
  const v = VIMEO.exec(video);
  return v ? `https://player.vimeo.com/video/${v[1]}` : undefined;
};

/** Embed.file: a video file (.mp4, .webm, .ogv). */
export const embedFile = (video: string): string | undefined => {
  const t = javaTrim(video);
  return VIDEO_FILE.test(t) ? t : undefined;
};

// ---- Forms --------------------------------------------------------------------------------------

export const FORM_BLOCK = "auvyx/form";
export const FORM_MAX_FIELDS = 30;
export const FORM_MAX_OPTIONS = 30;

export interface FormField { name: string; label: string; kind: string; required: boolean; options: string[]; placeholder: string }
export interface Form { id: string; fields: FormField[]; submit: string; success: string }

export const field = (name: string, label: string, kind = "text", required = false, options: string[] = [], placeholder = ""): FormField =>
  ({ name, label, kind, required, options, placeholder });

/** Forms.markup: the element's comment for a definition (mail on, no recipients, redirect or webhook). */
export const formMarkup = (form: Form): string => {
  const fields = form.fields.map((f) => {
    const parts = [`"name":${jsonString(f.name)}`, `"label":${jsonString(f.label)}`, `"kind":${jsonString(f.kind)}`];
    if (f.required) parts.push(`"required":true`);
    if (f.options.length) parts.push(`"options":[${f.options.map(jsonString).join(",")}]`);
    if (f.placeholder) parts.push(`"placeholder":${jsonString(f.placeholder)}`);
    return `{${parts.join(",")}}`;
  });
  const json = `{"id":${jsonString(form.id)},"fields":[${fields.join(",")}],"submit":${jsonString(form.submit)},"success":${jsonString(form.success)}}`;
  return `<!-- wp:${FORM_BLOCK} ${escapeComment(json)} /-->`;
};

const ftext = (t: string) => escapeText(t).replaceAll("[", "&#91;").replaceAll("$", "&#36;");
const fattr = (t: string) => escapeAttr(t).replaceAll("[", "&#91;").replaceAll("$", "&#36;");

/** Forms.html(form, Forms.Preview): the form as the canvas shows it (it goes nowhere). */
export const formPreview = (form: Form): string => {
  const id = fattr(form.id);
  const fields = form.fields.map((f) => {
    const fid = `auvyx-${id}-${fattr(f.name)}`;
    const req = f.required ? " required" : "";
    const star = f.required ? `<span class="auvyx-form__req" aria-hidden="true">*</span>` : "";
    const label = `<label class="auvyx-form__label" for="${fid}">${ftext(f.label)}${star}</label>`;
    const ph = f.placeholder ? ` placeholder="${fattr(f.placeholder)}"` : "";
    let control: string;
    switch (f.kind) {
      case "textarea": control = `<textarea class="auvyx-form__control" id="${fid}" name="${fattr(f.name)}" rows="5" maxlength="5000"${ph}${req}></textarea>`; break;
      case "select": {
        const opts = [`<option value="">—</option>`, ...f.options.map((o) => `<option value="${fattr(o)}">${ftext(o)}</option>`)].join("");
        control = `<select class="auvyx-form__control" id="${fid}" name="${fattr(f.name)}"${req}>${opts}</select>`;
        break;
      }
      case "radio":
        control = f.options.map((o, i) =>
          `<label class="auvyx-form__choice"><input class="auvyx-form__check" type="radio" id="${fid}-${i}" name="${fattr(f.name)}" value="${fattr(o)}"${req}> ${ftext(o)}</label>`).join("");
        break;
      case "checkbox": control = `<input class="auvyx-form__check" type="checkbox" id="${fid}" name="${fattr(f.name)}" value="yes"${req}>`; break;
      default: control = `<input class="auvyx-form__control" type="${f.kind}" id="${fid}" name="${fattr(f.name)}" maxlength="300"${ph}${req}>`;
    }
    if (f.kind === "checkbox") return `<div class="auvyx-form__field auvyx-form__field--check">${control}${label}</div>`;
    if (f.kind === "radio") return `<fieldset class="auvyx-form__field auvyx-form__field--choices"><legend class="auvyx-form__label">${ftext(f.label)}${star}</legend>${control}</fieldset>`;
    return `<div class="auvyx-form__field">${label}${control}</div>`;
  }).join("");
  const hidden = `<input type="hidden" name="_auvyx_form" value="${fattr(form.id)}">`;
  const trap = `<div class="auvyx-form__trap" aria-hidden="true"><label>Leave this empty<input type="text" name="_auvyx_hp" tabindex="-1" autocomplete="off"></label></div>`;
  return `<form class="auvyx-form" id="auvyx-form-${id}" action="#" method="post" accept-charset="UTF-8">` +
    `<p class="auvyx-form__sent" id="auvyx-form-${id}-sent" role="status">${ftext(form.success)}</p>` +
    `<p class="auvyx-form__error" id="auvyx-form-${id}-error" role="alert">Your message could not be sent. Check the fields and try again.</p>` +
    `${fields}${trap}${hidden}<button class="auvyx-form__submit" type="submit" disabled>${ftext(form.submit)}</button></form>`;
};

// ---- SiteTemplate.slugify -----------------------------------------------------------------------

const FOLDS = new Map<string, string>(
  ([["a", "àáạảãâầấậẩẫăằắặẳẵäåā"], ["e", "èéẹẻẽêềếệểễëē"], ["i", "ìíịỉĩîïī"], ["o", "òóọỏõôồốộổỗơờớợởỡöøō"],
    ["u", "ùúụủũưừứựửữûüū"], ["y", "ỳýỵỷỹÿ"], ["d", "đ"], ["c", "ç"], ["n", "ñ"], ["s", "ß"]] as const)
    .flatMap(([base, accented]) => [...accented].map((c) => [c, base] as [string, string])),
);

/** A key from any title: "Trang chủ" → "trang-chu". */
export const slugify = (s: string): string => {
  const ascii = [...s.toLowerCase()].map((c) => FOLDS.get(c) ?? c).join("");
  const k = ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/, "");
  return k || "page";
};

// ---- ProductCards -------------------------------------------------------------------------------

/** The card preset the importers use (ProductCards.Style("imported", "Imported", "", columns = …), its defaults). */
export interface CardStyle { key: string; name: string; columns: [number, number, number] }

const color = (slug: string) => `var(--wp--preset--color--${slug})`;
const ink = color("auvyx-text");
const surface = color("auvyx-surface");
const muted = `color-mix(in srgb, ${color("auvyx-text")} 60%, transparent)`;
const radius = (size: string) => `var(--wp--custom--radius--${size}, 0)`;
const m0: Decl[] = [["margin-block-start", "0"], ["margin-block-end", "0"]];
const col = (gap: string): Decl[] => [["display", "flex"], ["flex-direction", "column"], ["gap", gap]];
const row = (gap: string): Decl[] => [["display", "flex"], ["flex-wrap", "wrap"], ["align-items", "center"], ["gap", gap]];

/** ProductCards.card for the default preset values: photo on a tile with the second photo on hover, corner badges,
 * category, name and price. */
function card(c: Ctx, s: CardStyle): string {
  // the words first, then the photo box (as Scala builds them: `body` is a value before the card's root)
  const text = css(...col("6px"), ["align-items", "stretch"], ["text-align", "start"], ["min-width", "0"]);
  const category = c.bind(c.text("Category", css(["font-size", "0.75rem"], ["color", muted], ["letter-spacing", "0.02em"], ...m0)), ["content", "post_categories"]);
  const title = c.bind(c.heading("Product name", 3, css(["font-size", "0.9375rem"], ["font-weight", "500"], ["line-height", "1.35"], ["color", ink], ...m0)),
    ["content", "post_title"], ["href", "post_url"]);
  const price = c.named("Price", c.classed("auvyx-card__row", c.div(css(...row("8px"), ["justify-content", "flex-start"]), [
    c.bind(c.text("$0.00", css(["font-size", "0.9375rem"], ["font-weight", "600"], ["color", ink], ...m0)), ["content", "woo/price"]),
    c.bind(c.text("$0.00", css(["font-size", "0.8125rem"], ["color", muted], ["text-decoration", "line-through"], ...m0)), ["content", "woo/was_price"]),
  ])));
  const photo = c.bind(
    c.linkedImage("square", "", "#", css(["width", "100%"], ["height", "100%"], ["aspect-ratio", "1 / 1"], ["object-fit", "contain"], ["display", "block"])),
    ["url", "featured_image"], ["alt", "post_title"], ["href", "post_url"]);
  const alt = c.classed("auvyx-card__alt", c.bind(
    c.linkedImage("square", "", "#", css(["position", "absolute"], ["inset", "0"], ["width", "100%"], ["height", "100%"], ["object-fit", "contain"], ["background-color", surface])),
    ["url", "woo/gallery_1"], ["alt", "post_title"], ["href", "post_url"]));
  const corner = css(["position", "absolute"], ["inset-block-start", "12px"], ["inset-inline-start", "12px"], ["z-index", "2"], ["pointer-events", "none"]);
  const box = css(["position", "relative"], ["overflow", "hidden"], ["border-radius", radius("md")], ["background-color", surface]);
  const b = c.block("auvyx-woo/badges", "Badges", "", NONE);
  const badges = c.named("Badges", c.classed("auvyx-card__badges", c.div(corner, [b])));
  const media = c.named("Photo", c.classed("auvyx-card__media auvyx-card__tile", c.div(box, [photo, alt, badges])));
  const body = c.div(text, [category, title, price]);
  const root = c.section(css(...col("12px"), ["height", "100%"]), "article", "", [media, body]);
  return c.named(`Product card — ${s.name}`, c.classed(`auvyx-card auvyx-card--${s.key}`, root));
}

/** ProductCards.grid: loop styles for the preset's columns. */
export const cardGrid = (s: CardStyle, gap = "32px 24px"): S => {
  const [d, t, m] = s.columns;
  return css(["display", "grid"], ["grid-template-columns", `repeat(${d}, minmax(0, 1fr))`], ["gap", gap])
    .t(["grid-template-columns", `repeat(${t}, minmax(0, 1fr))`])
    .m(["grid-template-columns", `repeat(${m}, minmax(0, 1fr))`], ["gap", m === 1 ? "16px" : "24px 12px"]);
};

/** ProductCards.loop: a products loop of the preset's cards. */
export const cardLoop = (c: Ctx, s: CardStyle, perPage: number, styles: S, query: readonly Decl[]): string => {
  // the card is built before the loop (Scala evaluates the loop's children first)
  const children = [card(c, s)];
  return c.loop([["postType", "product"], ["perPage", String(perPage)], ...query], styles, children);
};

// ---- Mark ---------------------------------------------------------------------------------------

/** Mark.linked: Auvyx's mark linked to the home page. */
export const markLinked = (c: Ctx, size: string): string =>
  c.linkedImage("auvyx-mark", "Home", "/", css(["display", "block"], ["width", size], ["height", size], ["flex-shrink", "0"], ["border-radius", "50%"]));

export { S };
