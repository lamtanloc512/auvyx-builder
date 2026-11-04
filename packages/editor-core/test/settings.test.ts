/**
 * The Settings panel's pure options (src/settings.ts): the cases of the Scala suites they mirror (SliderOptionsSuite,
 * PopupSuite, CountdownSuite, AnimateSuite, BoxPositionSuite, HotspotSuite), and, where the Scala core
 * (apps/studio/packages/mcp/dist/core.js) writes the same thing through an action, the very same result.
 */
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { DocJson, Settings as S, el, setStyle, type Doc, type TreeNode } from "../src/index";

const CORE = new URL("../../../apps/studio/packages/mcp/dist/core.js", import.meta.url).pathname;
const core = existsSync(CORE) ? await import(CORE) : null;
const maybe = core ? describe : describe.skip;
const bps = [{ id: "base", label: "Laptop" }, { id: "tablet", label: "iPad", maxWidth: 1024 }, { id: "mobile", label: "Mobile", maxWidth: 767 }];

describe("SliderOptions", () => {
  test("options round-trip through class tokens and keep other classes", () => {
    const o = { ...S.SLIDER_DEFAULTS, autoplay: 5, fade: true, arrows: false, dots: true };
    const c = S.writeSlider("auvyx-autoplay-3 keep", o);
    expect(c).toBe("keep auvyx-autoplay-5 auvyx-fade auvyx-no-arrows");
    expect(S.readSlider(c)).toEqual(o);
    expect(S.readSlider("")).toEqual(S.SLIDER_DEFAULTS);
    expect(S.writeSlider(c, S.SLIDER_DEFAULTS)).toBe("keep");
  });
  test("navigation styles, loop and entrance round-trip; unknown entrances are dropped", () => {
    const o = { ...S.SLIDER_DEFAULTS, arrowStyle: "simple", dotStyle: "dashes", dark: true, outside: true, loop: false, enter: "up" };
    const c = S.writeSlider("keep auvyx-enter-left", o);
    expect(c).toBe("keep auvyx-arrows-simple auvyx-dots-dashes auvyx-nav-dark auvyx-nav-outside auvyx-no-loop auvyx-enter-up");
    expect(S.readSlider(c)).toEqual(o);
    expect(S.readSlider("auvyx-enter-spin").enter).toBe("");
  });
  test("layouts: single, multiple, focus and gallery", () => {
    expect(S.sliderLayoutOf(S.SLIDER_DEFAULTS, 1)).toBe("Single");
    expect(S.sliderLayoutOf(S.SLIDER_DEFAULTS, 3)).toBe("Multiple");
    const focus = S.withSliderLayout({ ...S.SLIDER_DEFAULTS, fade: true, dotStyle: "thumbs" }, "Focus");
    expect([focus.focus, focus.fade, focus.dotStyle]).toEqual([true, false, "dots"]);
    expect(S.sliderLayoutOf(focus, 1)).toBe("Focus");
    const gallery = S.withSliderLayout({ ...S.SLIDER_DEFAULTS, dots: false }, "Gallery");
    expect(S.sliderLayoutOf(gallery, 1)).toBe("Gallery");
    expect(S.withSliderLayout(gallery, "Single").dotStyle).toBe("dots");
    expect(S.readSlider(S.writeSlider("", focus)).focus).toBe(true);
  });
  test("slides per view: width per slide and reading it back", () => {
    expect(S.slideBasis(1, "16px")).toBe("100%");
    expect(S.slideBasis(3, "16px")).toBe("calc((100% - 2 * 16px) / 3)");
    expect(S.slideBasis(2, "0")).toBe("calc((100% - 1 * 0px) / 2)");
    expect(S.perViewOf(`0 0 ${S.slideBasis(2, "0")}`)).toBe(2);
    expect(S.perViewOf(`0 0 ${S.slideBasis(3, "16px")}`)).toBe(3);
    expect(S.perViewOf("0 0 100%")).toBe(1);
    expect(S.perViewOf(undefined)).toBe(1);
    expect(S.slidePatch(1, "0px", undefined, true)).toEqual([["flex", "0 0 100%"], ["scroll-snap-align", "center"]]);
  });
  test("a track is a section that scroll-snaps sideways; the focus finds the slide holding the selection", () => {
    const track = el("t", "Section", { children: ["s1", "s2"], styles: setStyle({}, "base", "default", "scroll-snap-type", "x mandatory") });
    const doc: Doc = { roots: ["t"], nodes: { t: track, s1: el("s1", "Section", { children: ["h"] }), s2: el("s2", "Section"), h: el("h", "Heading") } };
    expect(S.isTrack(track, bps, "mobile")).toBe(true);
    expect(S.sliderFocusOf(doc, "h", bps, "base")).toEqual({ track: "t", slides: ["s1", "s2"], current: "s1" });
    expect(S.sliderFocusOf(doc, "t", bps, "base")?.current).toBeNull();
  });
});

describe("Popup, Countdown, Animate, Hotspot, BoxPosition", () => {
  test("popup options round-trip, only what the trigger uses is written", () => {
    const o = { trigger: "scroll", delay: 10, scroll: 75, show: "day", place: "corner", size: "sm" };
    const c = S.writePopup("auvyx-keep", o);
    expect(c).toBe("auvyx-keep auvyx-popup auvyx-popup-on-scroll auvyx-popup-scroll-75 auvyx-popup-show-day auvyx-popup-at-corner auvyx-popup-w-sm");
    expect(S.readPopup(c)).toEqual({ ...o, delay: 5 });
    expect(S.writePopup("", S.POPUP_DEFAULTS)).toBe("auvyx-popup auvyx-popup-on-load auvyx-popup-delay-5");
    expect(S.readPopup("auvyx-popup auvyx-popup-on-hover auvyx-popup-delay-7 auvyx-popup-at-top")).toEqual(S.POPUP_DEFAULTS);
    expect(S.removePopup("a auvyx-popup auvyx-popup-on-exit b")).toBe("a b");
    expect(S.isPopup("x auvyx-popup") && !S.isPopup("auvyx-popup-on-load")).toBe(true);
    expect(S.popupAnchorFor("Newsletter popup")).toBe("newsletter-popup");
    expect(S.popupAnchorFor("10% off!")).toBe("popup-10-off");
    expect(S.popupAnchorFor("")).toBe("popup");
  });
  test("countdown end round-trips; invalid input leaves no token", () => {
    const c = S.withCountdownUntil("auvyx-timer promo", "2026-12-31T23:59");
    expect(c).toBe("auvyx-timer promo auvyx-until-20261231t2359z");
    expect(S.countdownUntil(c)).toBe("2026-12-31T23:59");
    expect(S.isCountdown(c)).toBe(true);
    expect(S.withCountdownUntil(c, "2027-01-02T08:05")).toBe("auvyx-timer promo auvyx-until-20270102t0805z");
    expect(S.withCountdownUntil("auvyx-timer auvyx-until-20261231t2359z", "")).toBe("auvyx-timer");
    expect(S.withCountdownUntil("auvyx-timer", "2026-13-01T00:00")).toBe("auvyx-timer");
    expect(S.countdownUntil("auvyx-timer auvyx-until-20261299t2599z")).toBeUndefined();
    expect(S.countdownUntil("auvyx-timer auvyx-until-<script>")).toBeUndefined();
  });
  test("animate tokens round-trip; a delay needs an animation", () => {
    const c = S.writeAnimate("keep auvyx-animate-up auvyx-delay-1", "zoom", 2);
    expect(c).toBe("keep auvyx-animate-zoom auvyx-delay-2");
    expect(S.readAnimate(c)).toEqual(["zoom", 2]);
    expect(S.writeAnimate(c, "", 3)).toBe("keep");
    expect(S.readAnimate("auvyx-animate-spin auvyx-delay-9")).toEqual(["", 0]);
  });
  test("hotspot side round-trips; a dot is centred on its spot", () => {
    const c = S.withHotspotSide("auvyx-hotspot keep auvyx-hotspot--left", "below");
    expect(c).toBe("auvyx-hotspot keep auvyx-hotspot--below");
    expect(S.hotspotSide(c)).toBe("below");
    expect(S.withHotspotSide(c, "")).toBe("auvyx-hotspot keep");
    expect(S.hotspotSide("auvyx-hotspot--up")).toBe("");
    expect(S.boxPositionPatch([30, 40], true).at(-1)).toEqual(["transform", "translate(-50%, -50%)"]);
  });
  test("box position: x/y write left/top and the matching translate; read follows breakpoints", () => {
    expect(S.boxPositionPatch([20, 75.55])).toEqual([["position", "absolute"], ["left", "20%"], ["top", "75.6%"], ["transform", "translate(-20%, -75.6%)"]]);
    expect([...new Set(S.boxPositionPatch(null).map(([, v]) => v))]).toEqual([undefined]);
    expect(S.clampPct(140)).toBe(100);
    const desk = S.setStyles({}, "base", "default", S.boxPositionPatch([10, 50]));
    const styles = S.setStyles(desk, "mobile", "default", S.boxPositionPatch([50, 90]));
    expect(S.readBoxPosition(styles, bps, "base")).toEqual([10, 50]);
    expect(S.readBoxPosition(styles, bps, "tablet")).toEqual([10, 50]);
    expect(S.readBoxPosition(styles, bps, "mobile")).toEqual([50, 90]);
    expect(S.readBoxPosition({}, bps, "base")).toBeNull();
  });
  test("a background video moves to the box's first place and back; removing its link removes it", () => {
    const box = el("b", "Section", { children: ["h", "v"], styles: setStyle({}, "base", "default", "background-image", "linear-gradient(rgb(0 0 0 / .4), rgb(0 0 0 / .4)), url(\"/a.jpg\")") });
    const doc: Doc = { roots: ["b"], nodes: { b: box, h: el("h", "Heading"), v: el("v", "Video", { src: "https://youtu.be/abcdefgh" }) } };
    const on = S.setVideoBackground(doc, "v", true, "base");
    expect(on.nodes.b!.children).toEqual(["v", "h"]);
    expect(on.nodes.b!.className).toBe(S.HAS_VIDEO);
    expect(on.nodes.v!.className).toBe(S.BG_VIDEO_CLASS);
    expect(on.nodes.b!.styles.base?.default?.["--auvyx-scrim"]).toBe("rgb(0 0 0 / .4)");
    expect(S.backgroundVideo(on, "b")?.id).toBe("v");
    const gone = S.writeBackgroundVideo(on, "b", "", "base", () => "x");
    expect(gone.nodes.v).toBeUndefined();
    expect(gone.nodes.b!.className).toBe("");
    const added = S.writeBackgroundVideo(gone, "b", "https://x.test/a.mp4", "base", () => "n1");
    expect(added.nodes.b!.children[0]).toBe("n1");
    expect(added.nodes.n1!.label).toBe("Background video");
  });
});

describe("RawBlocks, HtmlBlock, UiCatalog", () => {
  test("block attributes: read, rewrite (escaping --), inner blocks untouched", () => {
    expect(S.rawAttrs('<!-- wp:latest-posts {"postsToShow":3} /-->')).toEqual({ postsToShow: 3 });
    expect(S.rawAttrs("<!-- wp:group --><div></div><!-- /wp:group -->")).toBeUndefined();
    expect(S.openingAttrs('<!-- wp:group {"a":1} --><div></div><!-- /wp:group -->')).toEqual({ a: 1 });
    expect(S.withRawAttrs('<!-- wp:latest-posts {"postsToShow":3} /-->', { postsToShow: 5, x: "a--b" })).toBe('<!-- wp:latest-posts {"postsToShow":5,"x":"a\\u002d\\u002db"} /-->');
    expect(S.withRawAttrs("<!-- wp:group {\"a\":1} -->\n<div></div>\n<!-- /wp:group -->", {})).toBe("<!-- wp:group -->\n<div></div>\n<!-- /wp:group -->");
    expect(S.niceName("postsToShow")).toBe("Posts to show");
  });
  test("custom HTML block: inner HTML and back, attributes kept", () => {
    const raw = '<!-- wp:html {"lock":{"move":true}} -->\n<p>Hi</p>\n<!-- /wp:html -->';
    expect(S.htmlBlockInner(raw)).toBe("<p>Hi</p>");
    expect(S.htmlBlockMarkup("<b>x</b>", raw)).toBe('<!-- wp:html {"lock":{"move":true}} -->\n<b>x</b>\n<!-- /wp:html -->');
    expect(S.htmlBlockMarkup("x")).toBe("<!-- wp:html -->\nx\n<!-- /wp:html -->");
  });
  test("layout widgets: props, choices and the styles a choice writes", () => {
    const row = el("r", "Section", { className: "auvyx-ui-row auvyx-variant-default" });
    expect(S.uiIdOf(row)).toBe("row");
    expect(S.uiIsLayout(row)).toBe(true);
    expect(S.uiProp(row, "fit", "auto")).toBe("auto");
    const fit = S.uiWithChoice(row, "fit", "full");
    expect(fit.className).toBe("auvyx-ui-row auvyx-variant-default auvyx-fit-full");
    expect(S.uiProp(fit, "fit")).toBe("full");
    expect(S.uiChoicePatch("justify", "between")).toEqual([["justify-content", "space-between"]]);
    expect(S.uiWithChoice(el("a", "Section", { className: "auvyx-ui-alert cn-alert-variant-default" }), "variant", "destructive").className)
      .toBe("auvyx-ui-alert auvyx-variant-destructive cn-alert-variant-destructive");
    expect(S.ICON_NAMES.slice(0, 3)).toEqual(["check", "circle-check", "star"]);
  });
});

maybe("the Scala core writes the same", () => {
  const open = (blocks: TreeNode[]) => {
    const key = `s${Math.random().toString(36).slice(2)}`;
    core.openDocument(key, JSON.stringify({ blocks, canScript: true, blockNames: [] }));
    return key;
  };
  const docOf = (key: string): Doc => {
    const d = DocJson.decode(JSON.stringify(JSON.parse(core.studioDocument(key)).result));
    if (!("doc" in d)) throw new Error(d.error);
    return d.doc;
  };
  test("interaction recipes: update_element's className equals writeRecipe", () => {
    const cases: [string, string, { recipe: string; variant: string }][] = [
      ["auvyx/button", "keep auvyx-ix-v-subtle", { recipe: "link", variant: "expressive" }],
      ["auvyx/image", "", { recipe: "card", variant: "default" }],
      ["auvyx/section", "a auvyx-ix-card b", { recipe: "auto", variant: "default" }],
      ["auvyx/heading", "auvyx-ix-link", { recipe: "none", variant: "subtle" }],
    ];
    for (const [block, className, choice] of cases) {
      const key = open([{ block, className, text: "x" } as TreeNode]);
      const before = docOf(key);
      const id = before.roots[0]!;
      const out = JSON.parse(core.callAction(key, "update_element", JSON.stringify({ id, interaction: choice })));
      expect(out.ok).toBe(true);
      const after = docOf(key).nodes[id]!;
      expect(after.className).toBe(S.writeRecipe(before.nodes[id]!.className, choice));
      expect(S.readRecipe(after.className)).toEqual(choice);
      core.closeDocument(key);
    }
  });
  test("video frames: what insert_elements writes reads back as the same frame", () => {
    for (const frame of ["16:9", "9:16", "1:1", "4:5"]) {
      const key = open([]);
      const out = JSON.parse(core.callAction(key, "insert_elements", JSON.stringify({ elements: [{ kind: "video", src: "https://youtu.be/abcdefgh", frame }] })));
      expect(out.ok).toBe(true);
      const v = docOf(key).nodes[out.result.ids[0]]!;
      expect(S.frameOf(v)).toBe(frame);
      core.closeDocument(key);
    }
  });
});

maybe("forms: the definition reads back and writes the same comment as the Scala core", () => {
  test("insert_elements' form block equals FormSettings.markup(parseForm(...))", async () => {
    const { FormSettings: F } = await import("../src/index");
    const attrs = { id: "contact1", fields: [{ name: "name", label: " Your name ", kind: "text", required: true }, { name: "bad name", kind: "text" },
      { name: "pick", label: "Pick", kind: "select", options: ["A", "A", " B "] }, { name: "x", kind: "nope" }], submit: "", to: "a@b.co, nope", redirect: "javascript:x", mail: false };
    const key = `f${Math.random().toString(36).slice(2)}`;
    core.openDocument(key, JSON.stringify({ blocks: [], canScript: true, blockNames: ["auvyx/form"] }));
    const out = JSON.parse(core.callAction(key, "insert_elements", JSON.stringify({ elements: [{ kind: "block", block: "auvyx/form", attrs }] })));
    expect(out.ok).toBe(true);
    const d = DocJson.decode(JSON.stringify(JSON.parse(core.studioDocument(key)).result));
    if (!("doc" in d)) throw new Error(d.error);
    const raw = d.doc.nodes[out.result.ids[0]]!.raw;
    const parsed = F.parseForm(`<!-- wp:auvyx/form ${JSON.stringify(attrs)} /-->`)!;
    expect(F.markup(parsed)).toBe(raw);
    expect(F.markup(F.parseForm(raw)!)).toBe(raw);
    core.closeDocument(key);
  });
});
