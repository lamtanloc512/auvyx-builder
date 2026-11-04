/**
 * The element options the Studio's Settings panel writes (U/SettingsPanel.scala), as pure functions over class tokens
 * and styles: Flatsome's slider options (SliderOptions), box effects and background video (BoxEffects, Embed),
 * countdown end (Countdown), popups (Popup), department menus and drawers (NavDept, NavDrawer), entrance animation
 * (Animate), interaction recipes (InteractionRecipes), hotspots (Hotspot), the text box position (BoxPosition), the
 * data fields an element can show (DataFields), WordPress block attributes (RawBlocks, HtmlBlock) and the layout
 * widgets' props (U/UiCatalog.scala). Each function names the Scala one it mirrors.
 */
import { resolveValue, type Breakpoint, type Styles } from "@auvyx/style-engine";
import icons from "../../../shared/icons.json";
import { parseBackground } from "./background";
import { readDrawer, writeDrawer } from "./elementJson";
import { normalizeCarousel, normalizeQuery } from "./elements";
import { childrenOf, el, parentOf, type Doc, type El, type Kind } from "./model";
import { getStyle, insert, move, remove, setStyle, update } from "./ops";

type Patch = [string, string | undefined][];
const cls = (className: string) => className.split(" ");
/** Ops.setStyles: several declarations at once. */
export const setStyles = (styles: Styles, bp: string, state: string, patch: Patch): Styles =>
  patch.reduce((s, [p, v]) => setStyle(s, bp, state, p, v), styles);

// ---- SliderOptions -----------------------------------------------------------------------------

export type SliderLayout = "Single" | "Multiple" | "Focus" | "Gallery";
export const SLIDER_LAYOUTS: SliderLayout[] = ["Single", "Multiple", "Focus", "Gallery"];
export const SLIDER_ENTERS: [string, string][] = [["", "None"], ["fade", "Fade"], ["up", "Up"], ["left", "Left"], ["right", "Right"], ["zoom", "Zoom"], ["blur", "Blur"]];
export interface SliderOpts {
  autoplay: number; fade: boolean; arrows: boolean; dots: boolean; arrowStyle: string; dotStyle: string;
  dark: boolean; outside: boolean; loop: boolean; enter: string; focus: boolean;
}
export const SLIDER_DEFAULTS: SliderOpts = { autoplay: 0, fade: false, arrows: true, dots: true, arrowStyle: "circle", dotStyle: "dots", dark: false, outside: false, loop: true, enter: "", focus: false };
export const AUTOPLAY_CHOICES = [0, 3, 5, 7];
export const HEIGHT_CHOICES: [string, string][] = [["360px", "Short"], ["480px", "Medium"], ["640px", "Tall"], ["100vh", "Full screen"]];
export const PER_VIEW_CHOICES = [2, 3, 4, 5];
export const FOCUS_SIDE = "10%";
export const FOCUS_WIDTH = "100%";
const SLIDER_FIXED = new Set(["auvyx-fade", "auvyx-no-arrows", "auvyx-no-dots", "auvyx-arrows-simple", "auvyx-dots-dashes", "auvyx-dots-thumbs", "auvyx-nav-dark", "auvyx-nav-outside", "auvyx-no-loop", "auvyx-slider-focus"]);

/** SliderOptions.read */
export function readSlider(className: string): SliderOpts {
  const list = cls(className), cs = new Set(list);
  const auto = list.map((c) => /^auvyx-autoplay-(\d{1,2})$/.exec(c)).find(Boolean);
  const enter = list.map((c) => /^auvyx-enter-([a-z]+)$/.exec(c)).find((m) => m && SLIDER_ENTERS.some(([e]) => e === m[1]));
  return {
    autoplay: auto ? Number(auto[1]) : 0, fade: cs.has("auvyx-fade"), arrows: !cs.has("auvyx-no-arrows"), dots: !cs.has("auvyx-no-dots"),
    arrowStyle: cs.has("auvyx-arrows-simple") ? "simple" : "circle",
    dotStyle: cs.has("auvyx-dots-thumbs") ? "thumbs" : cs.has("auvyx-dots-dashes") ? "dashes" : "dots",
    dark: cs.has("auvyx-nav-dark"), outside: cs.has("auvyx-nav-outside"), loop: !cs.has("auvyx-no-loop"), enter: enter ? enter[1]! : "", focus: cs.has("auvyx-slider-focus"),
  };
}

/** SliderOptions.write */
export function writeSlider(className: string, o: SliderOpts): string {
  const rest = cls(className).filter((c) => c !== "" && !c.startsWith("auvyx-autoplay-") && !c.startsWith("auvyx-enter-") && !SLIDER_FIXED.has(c));
  const t: string[] = [];
  if (o.autoplay > 0) t.push(`auvyx-autoplay-${o.autoplay}`);
  if (o.fade) t.push("auvyx-fade");
  if (!o.arrows) t.push("auvyx-no-arrows");
  if (!o.dots) t.push("auvyx-no-dots");
  if (o.arrowStyle === "simple") t.push("auvyx-arrows-simple");
  if (o.dotStyle === "dashes") t.push("auvyx-dots-dashes");
  if (o.dotStyle === "thumbs") t.push("auvyx-dots-thumbs");
  if (o.dark) t.push("auvyx-nav-dark");
  if (o.outside) t.push("auvyx-nav-outside");
  if (!o.loop) t.push("auvyx-no-loop");
  if (o.enter !== "") t.push(`auvyx-enter-${o.enter}`);
  if (o.focus) t.push("auvyx-slider-focus");
  return [...rest, ...t].join(" ");
}

/** SliderOptions.layoutOf */
export const sliderLayoutOf = (o: SliderOpts, perView: number): SliderLayout =>
  o.focus ? "Focus" : o.dots && o.dotStyle === "thumbs" ? "Gallery" : perView > 1 ? "Multiple" : "Single";

/** SliderOptions.withLayout */
export function withSliderLayout(o: SliderOpts, l: SliderLayout): SliderOpts {
  const noThumbs = o.dotStyle === "thumbs" ? "dots" : o.dotStyle;
  switch (l) {
    case "Focus": return { ...o, focus: true, fade: false, dotStyle: noThumbs };
    case "Gallery": return { ...o, focus: false, dots: true, dotStyle: "thumbs" };
    case "Multiple": return { ...o, focus: false, fade: false, dotStyle: noThumbs };
    default: return { ...o, focus: false, dotStyle: noThumbs };
  }
}

/** SliderOptions.basis */
export function slideBasis(perView: number, gap: string): string {
  const g = /^[-+]?0*\.?0*$/.test(gap.trim()) ? "0px" : gap;
  return perView <= 1 ? "100%" : `calc((100% - ${perView - 1} * ${g}) / ${perView})`;
}

/** SliderOptions.slidePatch */
export const slidePatch = (perView: number, gap: string, height: string | undefined, focus = false): Patch => [
  ["flex", `0 0 ${focus ? FOCUS_WIDTH : slideBasis(perView, gap)}`],
  ["scroll-snap-align", focus ? "center" : "start"],
  ...(height !== undefined ? [["min-height", height] as [string, string]] : []),
];

/** SliderOptions.perViewOf */
export function perViewOf(flex: string | undefined): number {
  if (flex === undefined) return 1;
  let f = flex.trim();
  if (f.endsWith(")")) f = f.slice(0, -1);
  if (f.endsWith(" ")) f = f.slice(0, -1);
  const m = /\/ (\d)\)$/.exec(f + ")");
  return m ? Number(m[1]) : 1;
}

/** SliderFocus.isTrack: a section that scroll-snaps sideways on the screen being edited. */
export const isTrack = (n: El, breakpoints: readonly Breakpoint[], bp: string): boolean =>
  n.kind === "Section" && (resolveValue(n.styles, breakpoints as Breakpoint[], bp, "default", "scroll-snap-type")?.value.trim().startsWith("x") ?? false);

/** SliderFocus.focusOf: the track the selection is in, its slides and the slide holding the selection. */
export function sliderFocusOf(doc: Doc, selected: string | null, breakpoints: readonly Breakpoint[], bp: string): { track: string; slides: string[]; current: string | null } | null {
  if (!selected || !doc.nodes[selected]) return null;
  const chain = [selected, ...ancestorsOf(doc, selected)];
  const track = chain.find((i) => { const n = doc.nodes[i]; return !!n && isTrack(n, breakpoints, bp); });
  const node = track ? doc.nodes[track] : undefined;
  if (!track || !node) return null;
  return { track, slides: [...node.children], current: node.children.find((c) => chain.includes(c)) ?? null };
}
const ancestorsOf = (doc: Doc, id: string): string[] => {
  const out: string[] = [];
  for (let p = parentOf(doc, id); p; p = parentOf(doc, p)) out.push(p);
  return out;
};

// ---- Embed, BoxEffects ---------------------------------------------------------------------------

export const BG_VIDEO_CLASS = "auvyx-bg-video";
export const AUTOPLAY_CLASS = "auvyx-video-autoplay";
export const STRETCH = "auvyx-stretch-link";
export const BG_ZOOM = "auvyx-bg-zoom";
export const HAS_VIDEO = "auvyx-has-bg-video";
/** Embed.Frames */
export const FRAMES: { id: string; label: string; ratio: string }[] = [
  { id: "16:9", label: "Wide 16:9", ratio: "16 / 9" }, { id: "9:16", label: "Vertical 9:16 (TikTok, Reels, Shorts)", ratio: "9 / 16" },
  { id: "1:1", label: "Square 1:1", ratio: "1 / 1" }, { id: "4:5", label: "Portrait 4:5", ratio: "4 / 5" },
];
/** Embed.frame: from the player's base aspect-ratio; wide when it has none of these. */
export function frameOf(n: El): string {
  const ratio = (getStyle(n.styles, "base", "default", "aspect-ratio") ?? "").replace(/\s+/g, "");
  return (FRAMES.find((f) => f.ratio.replace(/\s+/g, "") === ratio) ?? FRAMES[0]!).id;
}
const YOUTUBE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/;
const VIMEO = /vimeo\.com\/(?:video\/)?(\d{5,12})/;
const VIDEO_FILE = /^https?:\/\/[^\s"'<>]+\.(?:mp4|webm|ogv)(?:\?[^\s"'<>]*)?$/i;
/** Embed.background is defined: a YouTube, Vimeo or video file link. */
export const playsAsBackground = (video: string) => { const v = video.trim(); return VIDEO_FILE.test(v) || YOUTUBE.test(v) || VIMEO.test(v); };
/** Embed.poster */
export const videoPoster = (video: string) => { const m = YOUTUBE.exec(video); return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : undefined; };

/** BoxEffects.has */
export const hasClass = (className: string, token: string) => cls(className).includes(token);
/** BoxEffects.toggle */
export const toggleToken = (className: string, token: string, on: boolean) =>
  [...cls(className).filter((c) => c !== "" && c !== token), ...(on ? [token] : [])].join(" ");
/** BoxEffects.scrim */
export const scrimOf = (backgroundImage: string | undefined) => {
  if (backgroundImage === undefined) return undefined;
  const o = parseBackground(backgroundImage).overlay;
  return o !== "" ? o : undefined;
};
/** BoxEffects.backgroundVideo: the box's first child, a Video marked auvyx-bg-video. */
export function backgroundVideo(doc: Doc, box: string): El | undefined {
  const first = doc.nodes[box]?.children[0];
  const c = first ? doc.nodes[first] : undefined;
  return c && c.kind === "Video" && hasClass(c.className, BG_VIDEO_CLASS) ? c : undefined;
}
/** BoxEffects.setBackground: a Video into the background of its box, or back into a player. One document change. */
export function setVideoBackground(doc: Doc, video: string, on: boolean, base: string): Doc {
  const v = doc.nodes[video];
  const box = parentOf(doc, video);
  const b = box ? doc.nodes[box] : undefined;
  if (!v || v.kind !== "Video" || !box || !b) return doc;
  if (on) {
    const cover = scrimOf(getStyle(b.styles, base, "default", "background-image"));
    const moved = update(move(doc, video, box, 0), video, (x) => ({ ...x, className: toggleToken(x.className, BG_VIDEO_CLASS, true) }));
    return update(moved, box, (x) => ({ ...x, className: toggleToken(x.className, HAS_VIDEO, true), styles: setStyle(x.styles, base, "default", "--auvyx-scrim", cover) }));
  }
  const back = update(doc, video, (x) => ({ ...x, className: toggleToken(x.className, BG_VIDEO_CLASS, false) }));
  return update(back, box, (x) => ({ ...x, className: toggleToken(x.className, HAS_VIDEO, false), styles: setStyle(x.styles, base, "default", "--auvyx-scrim", undefined) }));
}
/** SettingsPanel.backgroundVideo write: add, change or remove a box's background video by its link. */
export function writeBackgroundVideo(doc: Doc, box: string, url: string, base: string, newId: () => string): Doc {
  const n = doc.nodes[box];
  if (!n) return doc;
  const v = url.trim();
  const current = backgroundVideo(doc, box);
  if (current && v === "") return remove(setVideoBackground(doc, current.id, false, base), current.id);
  if (current) return update(doc, current.id, (x) => ({ ...x, src: v }));
  if (v === "") return doc;
  const video = el(newId(), "Video", { src: v, label: "Background video" });
  return setVideoBackground(insert(doc, video, box, 0), video.id, true, base);
}

// ---- Countdown ----------------------------------------------------------------------------------

export const COUNTDOWN = "auvyx-timer";
const validTime = (mo: string, d: string, h: string, mi: string) => {
  const [a, b, c, e] = [mo, d, h, mi].map(Number) as [number, number, number, number];
  return a >= 1 && a <= 12 && b >= 1 && b <= 31 && c >= 0 && c <= 23 && e >= 0 && e <= 59;
};
export const isCountdown = (className: string) => cls(className).includes(COUNTDOWN);
/** Countdown.until: "YYYY-MM-DDTHH:MM" (UTC). */
export function countdownUntil(className: string): string | undefined {
  for (const c of cls(className)) {
    const m = /^auvyx-until-(\d{4})(\d{2})(\d{2})t(\d{2})(\d{2})z$/.exec(c);
    if (m && validTime(m[2]!, m[3]!, m[4]!, m[5]!)) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  }
  return undefined;
}
/** Countdown.withUntil */
export function withCountdownUntil(className: string, iso: string): string {
  const rest = cls(className).filter((c) => c !== "" && !c.startsWith("auvyx-until-"));
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  const token = m && validTime(m[2]!, m[3]!, m[4]!, m[5]!) ? [`auvyx-until-${m[1]}${m[2]}${m[3]}t${m[4]}${m[5]}z`] : [];
  return [...rest, ...token].join(" ");
}

// ---- Popup ----------------------------------------------------------------------------------------

export const POPUP = "auvyx-popup";
export interface PopupOpts { trigger: string; delay: number; scroll: number; show: string; place: string; size: string }
export const POPUP_DEFAULTS: PopupOpts = { trigger: "load", delay: 5, scroll: 50, show: "session", place: "center", size: "md" };
export const POPUP_TRIGGERS: [string, string][] = [["load", "When the page opens"], ["exit", "When the visitor is about to leave"], ["scroll", "After scrolling"], ["link", "Only from a link or button"]];
export const POPUP_DELAYS = [0, 3, 5, 10, 20, 30, 60];
export const POPUP_SCROLLS = [25, 50, 75, 100];
export const POPUP_SHOWS: [string, string][] = [["always", "Every page view"], ["session", "Once per visit"], ["day", "Once a day"], ["once", "Only once"]];
export const POPUP_PLACES: [string, string][] = [["center", "Center (modal)"], ["bar", "Bottom bar"], ["corner", "Bottom corner"], ["side", "Side panel"]];
export const POPUP_SIZES: [string, string][] = [["sm", "Small"], ["md", "Medium"], ["lg", "Large"]];
const PP = "auvyx-popup-";
export const isPopup = (className: string) => cls(className).includes(POPUP);
/** Popup.read */
export function readPopup(className: string): PopupOpts {
  const cs = cls(className);
  const pick = (list: [string, string][], prefix: string, d: string) => list.map(([v]) => v).find((v) => cs.includes(prefix + v)) ?? d;
  const num = (re: RegExp, allowed: number[], d: number) => {
    for (const c of cs) { const m = re.exec(c); if (m && allowed.includes(Number(m[1]))) return Number(m[1]); }
    return d;
  };
  const d = POPUP_DEFAULTS;
  return {
    trigger: pick(POPUP_TRIGGERS, PP + "on-", d.trigger), delay: num(/^auvyx-popup-delay-(\d{1,2})$/, POPUP_DELAYS, d.delay),
    scroll: num(/^auvyx-popup-scroll-(\d{2,3})$/, POPUP_SCROLLS, d.scroll), show: pick(POPUP_SHOWS, PP + "show-", d.show),
    place: pick(POPUP_PLACES, PP + "at-", d.place), size: pick(POPUP_SIZES, PP + "w-", d.size),
  };
}
/** Popup.write */
export function writePopup(className: string, o: PopupOpts): string {
  const rest = cls(className).filter((c) => c !== "" && c !== POPUP && !c.startsWith(PP));
  const d = POPUP_DEFAULTS;
  const trigger = POPUP_TRIGGERS.some(([v]) => v === o.trigger) ? o.trigger : d.trigger;
  const t = [POPUP, `${PP}on-${trigger}`];
  if (trigger === "load" && POPUP_DELAYS.includes(o.delay)) t.push(`${PP}delay-${o.delay}`);
  if (trigger === "scroll" && POPUP_SCROLLS.includes(o.scroll)) t.push(`${PP}scroll-${o.scroll}`);
  if (o.show !== d.show && POPUP_SHOWS.some(([v]) => v === o.show)) t.push(`${PP}show-${o.show}`);
  if (o.place !== d.place && POPUP_PLACES.some(([v]) => v === o.place)) t.push(`${PP}at-${o.place}`);
  if (o.size !== d.size && POPUP_SIZES.some(([v]) => v === o.size)) t.push(`${PP}w-${o.size}`);
  return [...rest, ...t].join(" ");
}
/** Popup.remove */
export const removePopup = (className: string) => cls(className).filter((c) => c !== "" && c !== POPUP && !c.startsWith(PP)).join(" ");
/** Popup.anchorFor */
export function popupAnchorFor(label: string): string {
  const slug = [...label.toLowerCase()].map((c) => ((c >= "a" && c <= "z") || (c >= "0" && c <= "9") ? c : "-")).join("")
    .replace(/-+/g, "-").replace(/^-/, "").replace(/-$/, "").slice(0, 40);
  return slug === "" || !/\p{L}/u.test(slug[0]!) ? `popup-${slug}`.replace(/-$/, "") : slug;
}

// ---- NavDept, NavDrawer -----------------------------------------------------------------------------

export const NAV_DEPT = "auvyx-nav-dept";
export const NAV_DEPT_HOME = "auvyx-nav-dept-home";
export const NAV_DEPT_LABEL = "Shop by categories";
/** NavDept.read */
export const readDept = (className: string) => { const cs = new Set(cls(className)); return { on: cs.has(NAV_DEPT), home: cs.has(NAV_DEPT) && cs.has(NAV_DEPT_HOME) }; };
export const isDept = (className: string) => readDept(className).on;
/** NavDept.write */
export const writeDept = (className: string, o: { on: boolean; home: boolean }) =>
  [...cls(className).filter((c) => c !== "" && c !== NAV_DEPT && c !== NAV_DEPT_HOME), ...(o.on ? [NAV_DEPT] : []), ...(o.on && o.home ? [NAV_DEPT_HOME] : [])].join(" ");
export const DRAWER_STYLES: [string, string][] = [["dropdown", "Dropdown"], ["left", "Drawer from the left"], ["right", "Drawer from the right"], ["full", "Full screen"], ["sheet", "Bottom sheet"]];
export const DRAWER_WIDTHS: [string, string][] = [["narrow", "Narrow"], ["default", "Default"], ["wide", "Wide"]];
export const DRAWER_BACKDROPS: [string, string][] = [["dim", "Dim"], ["blur", "Blur"], ["none", "None"]];
export { readDrawer, writeDrawer };
/** Carousel.normalize and DataFields.normalizeQuery (elements.ts), for the panels. */
export { normalizeCarousel, normalizeQuery };

// ---- Animate -----------------------------------------------------------------------------------------

export const ANIMATE_CHOICES: [string, string][] = [
  ["", "None"], ["fade", "Fade"], ["up", "Fade up"], ["down", "Fade down"], ["left", "From left"], ["right", "From right"],
  ["zoom", "Zoom in"], ["blur", "Blur in"], ["bounce", "Bounce in"], ["flip-x", "Flip X"], ["flip-y", "Flip Y"],
];
export const ANIMATE_DELAYS = [0, 1, 2, 3, 4];
/** Animate.read: (name, delay). */
export function readAnimate(className: string): [string, number] {
  const cs = cls(className);
  let name = "", delay = 0, gotName = false, gotDelay = false;
  for (const c of cs) {
    const t = /^auvyx-animate-([a-z-]+)$/.exec(c);
    if (!gotName && t && ANIMATE_CHOICES.some(([n]) => n === t[1])) { name = t[1]!; gotName = true; }
    const d = /^auvyx-delay-(\d)$/.exec(c);
    if (!gotDelay && d) { delay = Number(d[1]); gotDelay = true; }
  }
  return [name, ANIMATE_DELAYS.includes(delay) ? delay : 0];
}
/** Animate.write */
export function writeAnimate(className: string, name: string, delay: number): string {
  const rest = cls(className).filter((c) => c !== "" && !c.startsWith("auvyx-animate-") && !c.startsWith("auvyx-delay-"));
  const on = name !== "" && ANIMATE_CHOICES.some(([n]) => n === name);
  return [...rest, ...(on ? [`auvyx-animate-${name}`] : []), ...(on && delay > 0 ? [`auvyx-delay-${delay}`] : [])].join(" ");
}

// ---- InteractionRecipes -------------------------------------------------------------------------------

export const RECIPES: { id: string; label: string }[] = [
  { id: "auto", label: "Automatic" }, { id: "button", label: "Button" }, { id: "link", label: "Link" }, { id: "card", label: "Card" },
  { id: "control", label: "Form controls" }, { id: "disclosure", label: "Disclosure" }, { id: "none", label: "None" },
];
export const RECIPE_VARIANTS: { id: string; label: string }[] = [{ id: "default", label: "Default" }, { id: "subtle", label: "Subtle" }, { id: "expressive", label: "Expressive" }];
const recipeIds = RECIPES.map((r) => r.id), variantIds = RECIPE_VARIANTS.map((v) => v.id);
/** InteractionRecipes.recipesFor */
export function recipesFor(k: Kind): string[] {
  switch (k) {
    case "Button": return ["auto", "button", "link", "none"];
    case "Image": case "Icon": return ["auto", "link", "card", "none"];
    case "Section": return ["auto", "card", "control", "none"];
    case "Accordion": return ["auto", "disclosure", "none"];
    case "Text": case "Heading": case "Nav": return ["auto", "link", "none"];
    default: return ["auto", "none"];
  }
}
/** InteractionRecipes.automatic */
export const automaticRecipe = (k: Kind) =>
  k === "Button" ? "button" : k === "Image" || k === "Icon" || k === "Text" || k === "Heading" || k === "Nav" ? "link" : k === "Accordion" ? "disclosure" : "none";
/** InteractionRecipes.editable */
export const recipeEditable = (k: Kind) => k !== "Raw" && recipesFor(k).length > 2;
const isRecipeMarker = (t: string) => (t.startsWith("auvyx-ix-v-") ? variantIds.includes(t.slice(11)) : t.startsWith("auvyx-ix-") && recipeIds.includes(t.slice(9)));
const recipeTokens = (className: string) => className.split(/\s+/).filter((t) => t !== "");
/** InteractionRecipes.read */
export function readRecipe(className: string): { recipe: string; variant: string } {
  const t = recipeTokens(className);
  return {
    recipe: t.find((x) => !x.startsWith("auvyx-ix-v-") && x.startsWith("auvyx-ix-") && recipeIds.includes(x.slice(9)))?.slice(9) ?? "auto",
    variant: t.find((x) => x.startsWith("auvyx-ix-v-") && variantIds.includes(x.slice(11)))?.slice(11) ?? "default",
  };
}
/** InteractionRecipes.write */
export const writeRecipe = (className: string, c: { recipe: string; variant: string }) =>
  [...recipeTokens(className).filter((t) => !isRecipeMarker(t)), ...(c.recipe !== "auto" ? [`auvyx-ix-${c.recipe}`] : []), ...(c.variant !== "default" ? [`auvyx-ix-v-${c.variant}`] : [])].join(" ");

// ---- Hotspot, BoxPosition -------------------------------------------------------------------------------

export const HOTSPOT = "auvyx-hotspot";
export const HOTSPOT_SIDES: [string, string][] = [["", "Above"], ["below", "Below"], ["left", "Left"], ["right", "Right"]];
export const isHotspot = (className: string) => cls(className).includes(HOTSPOT);
/** Hotspot.side */
export function hotspotSide(className: string): string {
  const s = cls(className).find((c) => c.startsWith("auvyx-hotspot--"))?.slice("auvyx-hotspot--".length);
  return s !== undefined && HOTSPOT_SIDES.some(([v]) => v === s) ? s : "";
}
/** Hotspot.withSide */
export const withHotspotSide = (className: string, s: string) =>
  [...cls(className).filter((c) => c !== "" && !c.startsWith("auvyx-hotspot--")), ...(s !== "" ? [`auvyx-hotspot--${s}`] : [])].join(" ");

export const BOX_POSITION_PROPS = ["position", "left", "top", "transform"];
/** BoxPosition.clamp */
export const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));
const pct = (v: number) => `${clampPct(v)}%`;
/** BoxPosition.patch */
export function boxPositionPatch(xy: [number, number] | null, centred = false): Patch {
  if (!xy) return BOX_POSITION_PROPS.map((p) => [p, undefined]);
  const [x, y] = xy;
  return [["position", "absolute"], ["left", pct(x)], ["top", pct(y)], ["transform", centred ? "translate(-50%, -50%)" : `translate(-${pct(x)}, -${pct(y)})`]];
}
/** BoxPosition.read */
export function readBoxPosition(styles: Styles, breakpoints: readonly Breakpoint[], bp: string): [number, number] | null {
  const get = (p: string) => resolveValue(styles, breakpoints as Breakpoint[], bp, "default", p)?.value.trim();
  if (get("position") !== "absolute") return null;
  const num = (v: string | undefined) => { const m = v === undefined ? null : /^(-?\d+(?:\.\d+)?)%$/.exec(v); return m ? Number(m[1]) : null; };
  const x = num(get("left")), y = num(get("top"));
  return x === null || y === null ? null : [x, y];
}
const hasBackgroundPicture = (n: El) =>
  Object.values(n.styles).some((states) => (states as Record<string, Record<string, string>>).default?.["background-image"]?.includes("url(") ?? false);
/** TextBoxPosition.placeable: a Section inside a banner-like Section (background, video, or named Banner). */
export function placeable(doc: Doc, id: string, breakpoints: readonly Breakpoint[], bp: string): boolean {
  const n = doc.nodes[id];
  const pid = parentOf(doc, id);
  const p = pid ? doc.nodes[pid] : undefined;
  if (!n || n.kind !== "Section" || !p) return false;
  return p.kind === "Section" && !isTrack(p, breakpoints, bp) && !isTrack(n, breakpoints, bp) &&
    (isHotspot(n.className) || p.label === "Banner" || hasClass(p.className, HAS_VIDEO) || hasBackgroundPicture(p));
}
/** TextBoxPosition.set: x/y on a screen (or cleared); the banner becomes the positioning box. */
export function placeBox(doc: Doc, id: string, xy: [number, number] | null, bp: string, base: string): Doc {
  const placed = update(doc, id, (n) => ({ ...n, styles: setStyles(n.styles, bp, "default", boxPositionPatch(xy, isHotspot(n.className))) }));
  const p = parentOf(doc, id);
  if (!p) return placed;
  return update(placed, p, (b) => (xy && getStyle(b.styles, base, "default", "position") === undefined ? { ...b, styles: setStyle(b.styles, base, "default", "position", "relative") } : b));
}
/** SettingsPanel.boxEffects: whether a box has a button somewhere inside, and a background picture. */
export function boxEffectsOf(doc: Doc, n: El): { button: boolean; background: boolean } {
  const walk = (id: string): boolean => { const c = doc.nodes[id]; return !!c && (c.kind === "Button" || c.children.some(walk)); };
  return { button: n.children.some(walk), background: hasBackgroundPicture(n) };
}

// ---- DataFields -------------------------------------------------------------------------------------------

export type Shape = "Text" | "Url" | "Image";
export interface DataField { key: string; label: string; group: string; shape: Shape }
/** DataFields.all */
export const DATA_FIELDS: DataField[] = ([
  ["post_title", "Title", "Post", "Text"], ["post_excerpt", "Excerpt", "Post", "Text"], ["post_date", "Date", "Post", "Text"],
  ["post_author", "Author", "Post", "Text"], ["post_categories", "Categories", "Post", "Text"], ["post_url", "Link", "Post", "Url"],
  ["featured_image", "Featured image", "Post", "Image"], ["featured_image_alt", "Featured image alt", "Post", "Text"],
  ["site_title", "Site title", "Site", "Text"], ["site_tagline", "Tagline", "Site", "Text"], ["site_url", "Home link", "Site", "Url"],
  ["site_logo", "Logo", "Site", "Image"], ["archive_title", "Archive title", "Archive", "Text"], ["product_price", "Price", "Product", "Text"],
  ["product_sku", "SKU", "Product", "Text"], ["product_add_to_cart_url", "Add to cart link", "Product", "Url"],
  ["product_add_to_cart_text", "Add to cart label", "Product", "Text"],
] as [string, string, string, Shape][]).map(([key, label, group, shape]) => ({ key, label, group, shape }));
export const META_PREFIX = "meta:";
/** DataFields.bindable, with names and shapes. */
export function bindableAttrs(kind: Kind): [string, string, Shape][] {
  switch (kind) {
    case "Heading": return [["content", "Text", "Text"], ["href", "Link", "Url"]];
    case "Text": return [["content", "Text", "Text"]];
    case "Button": return [["text", "Text", "Text"], ["url", "Link", "Url"]];
    case "Image": return [["url", "Image", "Image"], ["alt", "Alt text", "Text"], ["href", "Link", "Url"]];
    default: return [];
  }
}
/** DataFields.extensionKey */
export const extensionKey = (key: string) => /^[a-z0-9-]{1,30}\/[a-z0-9_]{1,60}$/.test(key);
/** DataFields.options: matching shape (text attributes also take URLs as text). */
export const dataOptions = (shape: Shape, extra: DataField[] = []) =>
  [...DATA_FIELDS, ...extra].filter((f) => f.shape === shape || (shape === "Text" && f.shape === "Url"));
/** DataFields.label */
export function dataLabel(key: string, extra: DataField[] = []): string {
  if (key.startsWith(META_PREFIX)) return `Field: ${key.slice(META_PREFIX.length)}`;
  const f = DATA_FIELDS.find((x) => x.key === key) ?? extra.find((x) => x.key === key);
  return f ? `${f.group}: ${f.label}` : key;
}
const QUERY_DEFAULTS: Record<string, string> = {
  postType: "post", perPage: "3", orderBy: "date", order: "desc", offset: "0", inherit: "false", excludeCurrent: "false",
  taxonomy: "", terms: "", paginate: "false", source: "", include: "", more: "",
};
/** DataFields.query */
export const queryValue = (q: Readonly<Record<string, string>>, key: string) => (Object.hasOwn(q, key) ? q[key]! : QUERY_DEFAULTS[key] ?? "");
export const ORDER_BY: [string, string][] = [["date", "Date"], ["modified", "Last modified"], ["title", "Title"], ["menu_order", "Menu order"], ["comment_count", "Comments"], ["rand", "Random"]];
export const PAGINATION: [string, string][] = [["", "Page numbers"], ["button", "Load more button"], ["scroll", "Infinite scroll"]];

// ---- Carousel (the classic slider's slides) ------------------------------------------------------------------

export interface CarouselSlide {
  eyebrow: string; title: string; body: string; button: string; href: string; image: string; color: string; alt: string; hover: string;
  depth: string; depthHover: string; parallax: string; animate: string; posX: string; posY: string; target: string; imageHref: string;
}
export const CAROUSEL_DEFAULTS: Record<string, string> = { layout: "banner", size: "full", height: "480", arrows: "on", gap: "0", slides: "" };
/** Carousel.get */
export const carouselValue = (q: Readonly<Record<string, string>>, key: string) => (Object.hasOwn(q, key) ? q[key]! : CAROUSEL_DEFAULTS[key] ?? "");
const TONES = [
  "var(--wp--preset--color--auvyx-surface)",
  "color-mix(in srgb, var(--wp--preset--color--auvyx-primary) 12%, var(--wp--preset--color--auvyx-surface))",
  "color-mix(in srgb, var(--wp--preset--color--auvyx-accent) 16%, var(--wp--preset--color--auvyx-surface))",
];
/** Carousel.blank */
export const blankSlide = (image: string, index: number): CarouselSlide => ({
  eyebrow: "Shop now", title: `Slide ${index + 1}`, body: "Write the slide here.", button: "Learn more", href: "#", image, color: TONES[index % TONES.length]!,
  alt: "", hover: "none", depth: "0", depthHover: "0", parallax: "0", animate: "none", posX: "50", posY: "50", target: "", imageHref: "",
});

// ---- RawBlocks, HtmlBlock --------------------------------------------------------------------------------------

const SELF_CLOSING = /^\s*<!--\s+wp:([a-z0-9_\-/]+)(\s+(\{[\s\S]*\}))?\s+\/-->\s*$/;
const OPENING = /^(\s*<!--\s+wp:[a-z0-9_\-/]+)(?:\s+(\{[\s\S]*?\}))?(\s+\/?-->)([\s\S]*)$/;
const parseAttrs = (json: string | undefined): Record<string, unknown> => {
  if (!json) return {};
  try { const v: unknown = JSON.parse(json); return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}; } catch { return {}; }
};
/** RawBlocks.attrs: attributes of a self-closing block comment, or undefined when the block has content. */
export function rawAttrs(raw: string): Record<string, unknown> | undefined {
  const m = SELF_CLOSING.exec(raw);
  return m ? parseAttrs(m[3]) : undefined;
}
/** RawBlocks.openingAttrs */
export function openingAttrs(raw: string): Record<string, unknown> | undefined {
  const m = OPENING.exec(raw);
  return m ? parseAttrs(m[2]) : undefined;
}
/** RawBlocks.withAttrs: the block with new attributes (inner blocks and saved HTML untouched). */
export function withRawAttrs(raw: string, attrs: Record<string, unknown>): string | undefined {
  const m = OPENING.exec(raw);
  if (!m) return undefined;
  const json = Object.keys(attrs).length === 0 ? "" : " " + JSON.stringify(attrs).replaceAll("--", "\\u002d\\u002d");
  return `${m[1]}${json}${m[3]}${m[4]}`;
}
/** RawBlocks.nice: "postsToShow" → "Posts to show". */
export function niceName(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.slice(0, 1).toUpperCase() + words.slice(1);
}
export const HTML_BLOCK = "core/html";
/** HtmlBlock.inner: the HTML inside the block's comments. */
export const htmlBlockInner = (raw: string): string =>
  raw.replace(/^\s*<!--\s*wp:html(\s+\{.*?\})?\s*-->\n?/, "").replace(/\n?<!--\s*\/wp:html\s*-->\s*$/, "");
/** HtmlBlock.markup: the block for `html`, keeping the attributes its opening comment had. */
export function htmlBlockMarkup(html: string, previous = ""): string {
  const attrs = /^\s*<!--\s*wp:html(\s+\{.*?\})?\s*-->\n?/.exec(previous)?.[1] ?? "";
  return `<!-- wp:html${attrs} -->\n${html}\n<!-- /wp:html -->`;
}

// ---- UiCatalog (layout widgets and shadcn components marked auvyx-ui-<id>) ----------------------------------------

export interface UiChoice { value: string; label: string }
export interface UiField { key: string; label: string; choices: UiChoice[] }
export interface UiWidget { id: string; label: string; group: string; fields: UiField[] }
const choices = (...v: string[]): UiChoice[] => v.map((x) => ({ value: x, label: x.charAt(0).toUpperCase() + x.slice(1) }));
const pairs = (...v: [string, string][]): UiChoice[] => v.map(([value, label]) => ({ value, label }));
const f = (key: string, label: string, c: UiChoice[] = []): UiField => ({ key, label, choices: c });
/** UiCatalog.fitField */
export const FIT_FIELD = f("fit", "Fit", pairs(["auto", "Hug"], ["full", "Full"], ["start", "Start"], ["center", "Center"], ["end", "End"]));
const text = f("text", "Text"), disabled = f("disabled", "Disabled"), checked = f("checked", "Checked");
const gap = f("gap", "Gap", pairs(["0", "None"], ["8px", "Small"], ["16px", "Medium"], ["24px", "Large"]));
const justify = f("justify", "Justify", choices("start", "center", "end", "between"));
const align = f("align", "Align", choices("start", "center", "end", "stretch"));
const wrap = f("wrap", "Wrap", choices("wrap", "nowrap"));
const columns = f("columns", "Columns", pairs(["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["6", "6"]));
const sizes3 = pairs(["sm", "Small"], ["default", "Default"], ["lg", "Large"]);
const w = (id: string, label: string, group: string, fields: UiField[]): UiWidget => ({ id, label, group, fields: [...fields, FIT_FIELD] });
/** UiCatalog.all (fields only: what the Content tab edits). */
export const UI_WIDGETS: UiWidget[] = [
  w("row", "Row", "Layout", [justify, align, gap, wrap]),
  w("col", "Column", "Layout", [align, gap]),
  w("grid", "Grid", "Layout", [columns, gap, justify, align]),
  w("alert", "Alert", "Presentation", [f("title", "Title"), f("description", "Description"), f("variant", "Variant", choices("default", "destructive"))]),
  w("switch", "Switch", "Form", [text, checked, disabled]),
  w("checkbox", "Checkbox", "Form", [text, checked, disabled]),
  w("radio-group", "Radio group", "Form", [f("items", "Items")]),
  w("progress", "Progress", "Presentation", [f("text", "Value")]),
  w("badge", "Badge", "Presentation", [text, f("variant", "Variant", choices("default", "secondary", "outline", "destructive"))]),
  w("separator", "Separator", "Presentation", [f("orientation", "Orientation", choices("horizontal", "vertical"))]),
  w("kbd", "Kbd", "Presentation", [f("text", "Keys")]),
  w("input", "Input", "Form", [f("variant", "Variant", pairs(["text", "Text"], ["textarea", "Textarea"])), f("type", "Type", choices("text", "email", "password", "number", "search")), f("placeholder", "Placeholder"), disabled]),
  w("select", "Select", "Form", [f("placeholder", "Placeholder"), f("options", "Options")]),
  w("button", "UI button", "Interactive", [text, f("href", "Link"), f("variant", "Variant", choices("default", "outline", "ghost", "secondary", "destructive", "link")), f("size", "Size", pairs(["sm", "Small"], ["default", "Default"], ["lg", "Large"], ["icon", "Icon"])), disabled]),
  w("button-group", "UI button group", "Interactive", [f("items", "Labels"), f("orientation", "Orientation", choices("horizontal", "vertical"))]),
  w("toggle", "Toggle", "Interactive", [text, f("variant", "Variant", choices("default", "outline")), f("size", "Size", sizes3), f("checked", "Pressed")]),
  w("toggle-group", "Toggle group", "Interactive", [f("items", "Items"), f("variant", "Variant", choices("default", "outline")), f("size", "Size", sizes3)]),
  w("tabs", "UI tabs", "Interactive", [f("items", "Labels"), f("orientation", "Orientation", choices("horizontal", "vertical"))]),
  w("tooltip", "Tooltip", "Interactive", [f("trigger", "Trigger"), f("content", "Content")]),
  w("dialog", "Dialog", "Interactive", [f("trigger", "Trigger"), f("title", "Title"), f("description", "Description"), f("variant", "Variant", choices("dialog", "alert"))]),
];
/** UiCatalog.idOf */
export const uiIdOf = (n: El) => { const m = cls(n.className).find((c) => c.startsWith("auvyx-ui-"))?.slice(9); return m ? m : undefined; };
export const uiWidget = (id: string | undefined) => (id ? UI_WIDGETS.find((x) => x.id === id) : undefined);
/** UiCatalog.isLayout */
export const uiIsLayout = (n: El) => uiWidget(uiIdOf(n))?.group === "Layout";
/** UiCatalog.prop */
export const uiProp = (n: El, key: string, fallback = "") => { const v = cls(n.className).find((c) => c.startsWith(`auvyx-${key}-`))?.slice(`auvyx-${key}-`.length); return v ? v : fallback; };
/** UiCatalog.flagged */
export const uiFlagged = (n: El, name: string) => cls(n.className).includes(`auvyx-flag-${name}`);
/** UiCatalog.setChoice's class part (the alert's variant class too). */
export function uiWithChoice(n: El, key: string, value: string): El {
  const prefix = `auvyx-${key}-`;
  let c = [...cls(n.className).filter((x) => x !== "" && !x.startsWith(prefix)), `${prefix}${value}`].join(" ");
  if (uiIdOf(n) === "alert" && key === "variant")
    c = [...cls(c).filter((x) => x !== "" && !x.startsWith("cn-alert-variant-")), `cn-alert-variant-${value === "destructive" ? "destructive" : "default"}`].join(" ");
  return { ...n, className: c };
}
/** UiCatalog.setFlag's class part. */
export const uiWithFlag = (n: El, name: string, on: boolean): El => {
  const token = `auvyx-flag-${name}`;
  const rest = cls(n.className).filter((c) => c !== "" && c !== token);
  return { ...n, className: (on ? [...rest, token] : rest).join(" ") };
};
/** The styles a choice also writes (UiCatalog.setChoice: fit, justify, align, gap, wrap, columns). */
export function uiChoicePatch(key: string, value: string): Patch {
  switch (key) {
    case "fit": return fitPatch(value);
    case "justify": return [["justify-content", value === "center" ? "center" : value === "end" ? "flex-end" : value === "between" ? "space-between" : "flex-start"]];
    case "align": return [["align-items", value === "center" ? "center" : value === "end" ? "flex-end" : value === "stretch" ? "stretch" : "flex-start"]];
    case "gap": return [["gap", value]];
    case "wrap": return [["flex-wrap", value]];
    case "columns": return [["grid-template-columns", `repeat(${value}, minmax(0, 1fr))`]];
    default: return [];
  }
}
/** UiCatalog.applyFit */
export function fitPatch(fit: string): Patch {
  const none: Patch = [["width", undefined], ["flex-grow", undefined], ["flex-basis", undefined], ["min-width", undefined]];
  switch (fit) {
    case "full": return [["width", "100%"], ["flex-grow", "1"], ["flex-basis", "0%"], ["min-width", "0px"], ["margin-inline-start", undefined], ["margin-inline-end", undefined], ["align-self", undefined]];
    case "start": return [...none, ["margin-inline-end", "auto"], ["margin-inline-start", "0px"], ["align-self", "flex-start"]];
    case "end": return [...none, ["margin-inline-start", "auto"], ["margin-inline-end", "0px"], ["align-self", "flex-end"]];
    case "center": return [...none, ["margin-inline-start", "auto"], ["margin-inline-end", "auto"], ["align-self", "center"]];
    default: return [...none, ["margin-inline-start", undefined], ["margin-inline-end", undefined], ["align-self", undefined]];
  }
}
/** SettingsPanel.readProp: where a text field of a component lives. */
export function uiReadText(n: El, key: string): string {
  switch (key) {
    case "href": return n.href;
    case "title": case "content": return n.alt;
    case "description": return n.src;
    default: return n.text;
  }
}
/** UiCatalog.setText: a title or description edits the first heading or text inside; otherwise the element. */
export function uiSetText(doc: Doc, id: string, key: string, value: string): [string, (n: El) => El] | null {
  const root = doc.nodes[id];
  if (!root) return null;
  const kids = childrenOf(doc, id).map((c) => doc.nodes[c]).filter((c): c is El => !!c);
  const child = key === "title" ? kids.find((c) => c.kind === "Heading") : key === "description" ? kids.find((c) => c.kind === "Text") : undefined;
  if (child) return [child.id, (n) => ({ ...n, text: value })];
  return [id, (n) => {
    switch (key) {
      case "href": return { ...n, href: value.trim() };
      case "title": case "content": return { ...n, alt: value };
      case "description": return { ...n, src: value };
      default: return { ...n, text: value };
    }
  }];
}
/** UiCatalog.prop's fallback per key (SettingsPanel.propField). */
export const uiFallback = (key: string) =>
  ({ type: "text", orientation: "horizontal", fit: "auto", justify: "start", align: "stretch", gap: "16px", wrap: "wrap", columns: "3", layout: "banner", height: "480", arrows: "on" } as Record<string, string>)[key] ?? "default";
export const UI_CHOICE_KEYS = new Set(["variant", "size", "type", "orientation", "fit", "justify", "align", "gap", "wrap", "columns", "layout", "height", "arrows"]);

// ---- IconSet --------------------------------------------------------------------------------------------------

const ICONS = (icons as { icons: Record<string, string> }).icons;
/** IconSet.names (the order of shared/icons.json). */
export const ICON_NAMES: string[] = Object.keys(ICONS);
/** IconSet.svg */
export const iconSvg = (name: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ""}</svg>`;
