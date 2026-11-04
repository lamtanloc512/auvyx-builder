/**
 * The script a published page loads where it shows a game: each `[data-auvyx-play]` waits behind its poster until the
 * visitor presses play, then gets its sandboxed frame. Libraries resolve beside this script (like code.js).
 * Loaded once per page; an editor that draws a part again calls `auvyxIslands["play-page"]()` (a second copy does the same), which
 * sets up the games it has not set up yet.
 */
import { gameOf, mountGame, pageCapabilities } from "./page";

type Islands = Record<string, () => void>;
const islands = ((window as unknown as { auvyxIslands?: Islands }).auvyxIslands ??= {});

if (islands["play-page"]) islands["play-page"]();
else {
  const me = document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : "";
  const libraryBase = me ? me.replace(/[^/]*$/, "") : "/";
  const fetcher = (url: string, init: RequestInit) => fetch(url, init);

  const start = (container: HTMLElement) => {
    const game = gameOf(container.getAttribute("data-auvyx-play"));
    if (!game || container.classList.contains("is-playing")) return;
    container.classList.add("is-playing");
    mountGame({ container, game, mode: "site", capabilities: (frame) => pageCapabilities({ game, frame, libraryBase, fetcher }) });
  };

  const setUp = () => {
    for (const container of document.querySelectorAll<HTMLElement>("[data-auvyx-play]")) {
      if (container.dataset.auvyxPlayReady) continue;
      container.dataset.auvyxPlayReady = "1";
      const button = container.querySelector(".auvyx-play__start");
      if (button) button.addEventListener("click", () => start(container), { once: true });
      // no poster to press: a page plays it at once, an editor (data-auvyx-editing) never starts anything by itself
      else if (!document.documentElement.hasAttribute("data-auvyx-editing")) start(container);
    }
  };
  islands["play-page"] = setUp;
  setUp();
}
