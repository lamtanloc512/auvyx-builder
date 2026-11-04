import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const frameSource = readFileSync(join(import.meta.dir, "../src/Modules/Sandbox/SandboxFrame.php"), "utf8");

/** The default policy SandboxFrame::csp emits when no https origin is allowlisted. */
const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

test("a sandboxed custom-code frame cannot reach the parent document, its cookies, or the network", async () => {
  expect(frameSource).toContain('sandbox="allow-scripts"');
  expect(frameSource).not.toContain("allow-same-origin");
  expect(frameSource).not.toContain("allow-top-navigation");
  expect(frameSource).not.toContain("allow-popups");
  expect(frameSource).toContain("connect-src ");

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><body data-mark="safe"><iframe id="box" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>
      <script>
        window.__reach = "none"; window.__cookie = "none"; window.__net = "none";
        addEventListener("message", function (e) {
          if (!e.data) return;
          if (e.data.reach) window.__reach = e.data.reach;
          if (e.data.cookie) window.__cookie = e.data.cookie;
          if (e.data.net) window.__net = e.data.net;
        });
      </script></body>`);
    await page.locator("#box").evaluate((el, policy) => {
      const frame = el as HTMLIFrameElement;
      frame.srcdoc = `<!doctype html><head><meta http-equiv="Content-Security-Policy" content="${policy}"></head><body><p id="inside">in</p><script>
        var reach = "reached";
        try { parent.document.body.setAttribute("data-mark", "pwned"); } catch (e) { reach = "blocked"; }
        var cookie = "read";
        try { void parent.document.cookie; } catch (e) { cookie = "blocked"; }
        parent.postMessage({ reach: reach, cookie: cookie }, "*");
        fetch("https://example.com/auvyx").then(function () { parent.postMessage({ net: "open" }, "*"); }, function () { parent.postMessage({ net: "blocked" }, "*"); });
      </script></body>`;
    }, csp);
    await page.waitForFunction(() => (window as unknown as { __net: string }).__net !== "none");
    const result = await page.evaluate(() => ({
      mark: document.body.dataset.mark,
      reach: (window as unknown as { __reach: string }).__reach,
      cookie: (window as unknown as { __cookie: string }).__cookie,
      net: (window as unknown as { __net: string }).__net,
      sandbox: document.querySelector("iframe")?.getAttribute("sandbox"),
    }));
    expect(result).toEqual({ mark: "safe", reach: "blocked", cookie: "blocked", net: "blocked", sandbox: "allow-scripts" });
  } finally {
    await browser.close();
  }
}, 30000);
