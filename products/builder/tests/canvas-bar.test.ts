import { expect, test } from "bun:test";
import { chromium } from "playwright";

// Needs a running Studio. Opt in with AUVYX_STUDIO_URL so a clean checkout skips it instead of hanging in CI.
const studioUrl = process.env.AUVYX_STUDIO_URL ?? "http://127.0.0.1:9410/wp-admin/post.php?post=2&action=auvyx-studio";
const testLive = process.env.AUVYX_STUDIO_URL ? test : test.skip;

testLive(
  "the canvas toolbar has one preview eye and a separate interact control",
  async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("[data-canvas-bar]", { timeout: 120000 });
    const counts = await page.evaluate(() => {
      const bar = document.querySelector("[data-canvas-bar]");
      if (!bar) return null;
      const preview = bar.querySelectorAll("[data-canvas-bar-preview]").length;
      const interact = bar.querySelectorAll("[data-canvas-bar-interact]").length;
      const previewIcons = bar.querySelectorAll("[data-canvas-bar-preview] svg").length;
      const interactIcons = bar.querySelectorAll("[data-canvas-bar-interact] svg").length;
      const overflow = bar.scrollWidth > bar.clientWidth + 1;
      const barRect = bar.getBoundingClientRect();
      const panel = document.querySelector("[data-right-panel]");
      const panelRect = panel?.getBoundingClientRect();
      const overlapsPanel =
        panelRect != null && barRect.right > panelRect.left + 2 && barRect.bottom > panelRect.top && barRect.top < panelRect.bottom;
      return { preview, interact, previewIcons, interactIcons, overflow, overlapsPanel };
    });
    expect(counts).not.toBeNull();
    if (!counts) return;
    expect(counts.preview).toBe(1);
    expect(counts.interact).toBe(1);
    expect(counts.previewIcons).toBe(1);
    expect(counts.interactIcons).toBe(1);
    expect(counts.overlapsPanel).toBe(false);
  } finally {
    await browser.close();
  }
},
  120000
);
