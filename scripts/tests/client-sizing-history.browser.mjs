// Compare actual rendered controls using an independently built historical app.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const origins = [process.env.OCT26_ORIGIN || "http://127.0.0.1:5223", process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5222"];
origins.forEach(origin => assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname)));
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const samples = [];
try {
  for (const width of [390, 460]) {
    const versions = [];
    for (const origin of origins) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "standalone", { value: true });
        Object.defineProperty(window, "AudioContext", { value: undefined });
        Object.defineProperty(window, "webkitAudioContext", { value: undefined });
        localStorage.setItem("ea-cloud:client:7:home-appearance", JSON.stringify({ interfaceStyle: "regular", accentColor: "#ef4444", showBg: true, backgroundAnimation: "none" }));
      });
      await context.routeWebSocket("**/api/ws?*", () => {});
      await context.route("**/api/**", route => {
        const path = new URL(route.request().url()).pathname;
        const json = path.endsWith("/app/me") ? { id: 7, token: btoa("7:client:cookie"), status: "approved", licenseKey: "FIXTURE" }
          : path.endsWith("/app/dashboard") ? { mentor: { id: 5, robotName: "EA CLOUD PRO", backgroundImageUrl: "/default-robot.jpg" }, eas: [] }
          : path.endsWith("/app/ea-mode-images") ? { eas: [{ id: 1, name: "EA CLOUD PRO", images: Array(4).fill("/default-robot.jpg") }] }
          : path.endsWith("/trading-controls") ? { copyingEnabled: false }
          : path.endsWith("/scanner/history") ? { records: [], hasMore: false } : [];
        return route.fulfill({ json });
      });
      const page = await context.newPage();
      await page.goto(origin + "/ea-app/");
      await page.locator(".ea-startup").waitFor({ state: "detached", timeout: 30000 });
      const modes = {};
      for (const [mode, label] of [["regular", "Regular Interface"], ["matrix", "The Matrix Interface"], ["s2tone", "S2tone_"], ["lumo", "Lumo"]]) {
        if (mode !== "regular") {
          const nav = page.locator(".ea-glass-bar");
          await nav.getByRole("button", { name: "Settings", exact: true }).click();
          const option = page.getByRole("button", { name: label, exact: false });
          if (!(await option.isVisible())) await page.getByRole("button", { name: "Select Main Interface", exact: true }).click();
          await option.click();
          await nav.getByRole("button", { name: "Home", exact: true }).click();
        }
        await page.locator(`[data-home-interface="${mode}"]`).waitFor();
        // Wait for existing horizontal transition to finish; no startup changes.
        await page.waitForTimeout(350);
        modes[mode] = await page.evaluate(() => {
          const round = n => Math.round(n * 100) / 100;
          const controls = [...document.querySelectorAll("[data-home-swipe-surface] button, .ea-glass-bar button")].map(el => {
            const box = el.getBoundingClientRect();
            return { name: el.getAttribute("aria-label") || el.textContent.trim(), width: round(box.width), height: round(box.height), font: getComputedStyle(el).fontSize };
          });
          const panel = document.querySelector("[data-matrix-functions]");
          return { viewport: innerWidth, scale: visualViewport.scale, controls, panelWidth: panel ? round(panel.getBoundingClientRect().width) : null };
        });
      }
      versions.push(modes);
      await context.close();
    }
    assert.deepEqual(versions[1], versions[0], `${width}px: current controls must match October 26 under identical conditions`);
    samples.push({ width, matrixPanel: versions[0].matrix.panelWidth, modes: Object.keys(versions[0]) });
    console.log(`PASS: October 26/current control dimensions identical across all four interfaces at ${width}px`);
  }
  console.log(JSON.stringify(samples));
} finally { await browser.close(); }
