// The front-end islands (assets/*.js) in an editor that draws parts of the page again (the Studio's web canvas, docs/canvas-renderer.md §4):
// a second copy of a script, or a part replaced and set up again, never adds a page-wide listener, a dialog or an id twice, and in edit
// mode nothing starts by itself.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";

const asset = (name: string) => readFileSync(join(import.meta.dir, "../assets", `${name}.js`), "utf8");

type Counted = { window: Window & typeof globalThis; listeners: () => Record<string, number>; intervals: () => number };

async function page(body: string, editing = false): Promise<Counted> {
  const dom = new JSDOM(`<!doctype html><html${editing ? " data-auvyx-editing" : ""}><body>${body}</body></html>`, { pretendToBeVisual: true });
  const win = dom.window as unknown as Window & typeof globalThis;
  if (win.document.readyState !== "complete") await new Promise((done) => win.addEventListener("load", done));
  const counts: Record<string, number> = {};
  let intervals = 0;
  const proto = (win as unknown as { EventTarget: { prototype: EventTarget } }).EventTarget.prototype;
  const add = proto.addEventListener;
  proto.addEventListener = function (this: EventTarget, type: string, fn: EventListenerOrEventListenerObject | null, opts?: boolean | AddEventListenerOptions) {
    const name = this === win.document ? "document" : this === (win as unknown) || (this as unknown) === win.window ? "window" : "";
    if (name) counts[`${name}:${type}`] = (counts[`${name}:${type}`] ?? 0) + 1;
    return add.call(this, type, fn, opts);
  };
  const setInterval = win.setInterval.bind(win);
  const counted = ((fn: () => void, ms?: number) => { intervals++; return setInterval(fn, ms); }) as typeof win.setInterval;
  (win as unknown as { setInterval: typeof win.setInterval }).setInterval = counted;
  // jsdom has no showModal
  const dialog = (win as unknown as { HTMLDialogElement: { prototype: { showModal?: () => void } } }).HTMLDialogElement.prototype;
  dialog.showModal ??= function (this: HTMLElement) { this.setAttribute("open", ""); };
  return { window: win, listeners: () => ({ ...counts }), intervals: () => intervals };
}

// Bun cannot run jsdom's script contexts: the island runs as a function of the page's globals.
const run = (p: Counted, name: string) => {
  const w = p.window;
  const globals = { window: w, document: w.document, getComputedStyle: w.getComputedStyle.bind(w), requestAnimationFrame: w.requestAnimationFrame.bind(w),
    cancelAnimationFrame: w.cancelAnimationFrame.bind(w), setTimeout: w.setTimeout.bind(w), clearTimeout: w.clearTimeout.bind(w), setInterval: w.setInterval,
    CustomEvent: w.CustomEvent, matchMedia: undefined };
  new Function(...Object.keys(globals), asset(name))(...Object.values(globals));
};

const drawerNav = (n: number) =>
  `<nav class="wp-block-auvyx-nav auvyx-drawer-left" id="nav${n}"><details class="auvyx-nav__menu"><summary class="auvyx-nav__toggle">Menu</summary><div class="auvyx-nav__panel"><a href="/a">A</a></div></details></nav>`;

test("drawer: a second copy and a replaced menu add no page-wide listener; Escape closes the menu on the page now", async () => {
  const p = await page(`<div id="part">${drawerNav(1)}</div>`, true);
  run(p, "drawer");
  const once = p.listeners();
  expect(once["document:keydown"]).toBe(1);
  expect(once["window:resize"]).toBe(1);
  run(p, "drawer"); // the editor loads it again
  const doc = p.window.document;
  // the part is drawn again: a new menu replaces the old one
  doc.getElementById("part")!.innerHTML = drawerNav(2);
  const drawer = (p.window as unknown as { auvyxIslands?: { drawer?: () => void } }).auvyxIslands?.drawer;
  if (!drawer) throw new Error("drawer island did not register");
  drawer();
  expect(p.listeners()).toEqual(once);
  const menu = doc.querySelector<HTMLDetailsElement>("#nav2 .auvyx-nav__menu")!;
  expect(menu.dataset.auvyxDrawer).toBe("1");
  menu.open = true;
  doc.dispatchEvent(new p.window.KeyboardEvent("keydown", { key: "Escape" }));
  expect(menu.open).toBe(false);
});

test("tabs: drawing a part again keeps ids unique (the counter is the page's, not the copy's)", async () => {
  const tabs = (n: number) => `<div class="auvyx-tabs" id="t${n}"><section><h3>One</h3></section><section><h3>Two</h3></section></div>`;
  const p = await page(`<div id="a">${tabs(1)}</div><div id="b"></div>`, true);
  run(p, "tabs");
  p.window.document.getElementById("b")!.innerHTML = tabs(2);
  run(p, "tabs"); // a second copy runs the first one's setup
  const ids = [...p.window.document.querySelectorAll("[id]")].map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(p.window.document.querySelectorAll(".auvyx-tabs--ready").length).toBe(2);
  expect(p.window.document.querySelectorAll(".auvyx-tabs__list").length).toBe(2);
});

test("gallery: two copies open one shared dialog", async () => {
  const p = await page(`<div class="auvyx-gallery"><img src="/a.jpg" alt="a"><img src="/b.jpg" alt="b"></div>`, true);
  run(p, "gallery");
  run(p, "gallery");
  const img = p.window.document.querySelector("img")!;
  img.dispatchEvent(new p.window.MouseEvent("click", { bubbles: true }));
  expect(p.window.document.querySelectorAll("dialog").length).toBe(1);
});

test("slider: one resize listener for every slider, none added again, no autoplay in edit mode", async () => {
  const slider = (n: number) => `<div class="auvyx-slider-wrap"><section class="auvyx-slider auvyx-autoplay-3" id="s${n}"><div>1</div><div>2</div></section></div>`;
  const p = await page(`<div id="a">${slider(1)}</div><div id="b"></div>`, true);
  run(p, "slider");
  const once = p.listeners();
  expect(once["window:resize"]).toBe(1);
  p.window.document.getElementById("b")!.innerHTML = slider(2);
  run(p, "slider");
  expect(p.listeners()).toEqual(once);
  expect(p.window.document.querySelectorAll(".auvyx-slider-ready").length).toBe(2);
  expect(p.window.document.querySelectorAll(".auvyx-slider-prev").length).toBe(2);
  expect(p.intervals()).toBe(0);
  // on the published page the same slider plays by itself
  const live = await page(slider(1));
  run(live, "slider");
  expect(live.intervals()).toBe(1);
});

test("header and entrance animations: set up once however many copies", async () => {
  const p = await page(`<div class="auvyx-fragment"><header class="auvyx-header-sticky"></header></div><p class="auvyx-animate-fade">x</p>`, true);
  run(p, "header");
  run(p, "header");
  expect(p.listeners()["window:scroll"]).toBe(1);
  run(p, "animate");
  run(p, "animate");
  expect(p.window.document.querySelectorAll(".auvyx-fragment[data-auvyx-sticky]").length).toBe(1);
});
