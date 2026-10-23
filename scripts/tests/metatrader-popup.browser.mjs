import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5199/ea-app/";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
await mkdir("work/metatrader-popup", { recursive: true });
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    for (const style of ["regular", "s2tone", "matrix"]) {
      const context = await browser.newContext({
        viewport,
        isMobile: true,
        hasTouch: true,
      });
      await context.addInitScript(
        ({ style }) => {
          localStorage.setItem("appClientToken", btoa("7:client:fixture"));
          localStorage.setItem(
            "ea-cloud:client:7:home-appearance",
            JSON.stringify({
              interfaceStyle: style,
              showBg: true,
              backgroundAnimation: "none",
              accentColor: "#00bcd4",
            }),
          );
          localStorage.setItem(
            "ea-cloud:floating-robot-position",
            JSON.stringify({ x: 10, y: 80 }),
          );
        },
        { style },
      );
      await context.routeWebSocket("**/api/ws?*", () => {});
      await context.route("https://fonts.**", (r) => r.abort());
      await context.route("**/fixture-robot.jpg", (r) =>
        r.fulfill({
          path: "artifacts/ea-cloud/public/default-robot.jpg",
          contentType: "image/jpeg",
        }),
      );
      const writes = [];
      await context.route("**/api/**", (r) => {
        const p = new URL(r.request().url()).pathname;
        if (r.request().method() !== "GET") writes.push(p);
        return r.fulfill({
          json:
            p === "/api/app/me"
              ? { status: "approved", licenseKey: "fixture" }
              : p === "/api/app/dashboard"
                ? {
                    mentor: {
                      robotName: "SMC Blueprint EA V3+",
                      backgroundImageUrl: "/fixture-robot.jpg",
                    },
                    eas: [],
                  }
                : p === "/api/app/trading-controls"
                  ? { copyingEnabled: false }
                  : p === "/api/app/activity"
                    ? { events: [] }
                    : p === "/api/app/activity/snapshot"
                      ? {
                          observedAt: Date.now(),
                          connected: false,
                          engine: false,
                          robotEnabled: false,
                          tradeAllowed: false,
                          account: null,
                          symbols: [],
                        }
                      : [],
        });
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(origin);
      await page.waitForSelector(".ea-startup", { state: "detached" });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(
        await page
          .locator("[data-home-interface]")
          .getAttribute("data-home-interface"),
        style,
      );
      const nav = (label) =>
        page.getByRole("button", { name: label, exact: true });
      const popup = page.getByRole("dialog", {
        name: "MetaTrader 5",
        exact: true,
      });
      const homeBefore = await page
        .locator("[data-home-background]")
        .getAttribute("src");
      await nav("MetaTrader").tap();
      await popup.waitFor();
      let rect = await popup.boundingBox();
      assert(rect.y > 60);
      assert(rect.y + rect.height <= viewport.height - 74);
      assert.equal(
        await page.locator("[data-home-background]").getAttribute("src"),
        homeBefore,
      );
      assert.equal(
        await page
          .locator(".mt5-popup-backdrop")
          .evaluate((e) => getComputedStyle(e).backdropFilter),
        "blur(4px)",
      );
      await page.locator("#mt5-login").fill("123456");
      await page.locator("#mt5-password").fill("fixture-only");
      await page
        .getByRole("button", { name: "Show password", exact: true })
        .tap();
      assert.equal(
        await page.locator("#mt5-password").getAttribute("type"),
        "text",
      );
      await page.locator("#mt5-server").fill("Exness-MT5Real1");
      await page.screenshot({
        path: `work/metatrader-popup/${style}-${viewport.width}-open.png`,
      });
      // Keep the touch well inside the exposed area: Chromium adjusts taps
      // within a few pixels of the sheet boundary to its clickable header.
      // On the taller viewport this also overlaps the inert robot circle.
      await page.touchscreen.tap(35, Math.min(105, rect.y / 2));
      await popup.waitFor({ state: "hidden" });
      assert.equal(
        await page
          .locator("[data-home-interface]")
          .getAttribute("data-home-interface"),
        style,
      );
      await page.screenshot({
        path: `work/metatrader-popup/${style}-${viewport.width}-closed.png`,
      });
      assert.equal(
        await page
          .getByRole("button", {
            name: "Close live trading activity",
            exact: true,
          })
          .count(),
        0,
      );
      await nav("MetaTrader").tap();
      assert.equal(await page.locator("#mt5-login").inputValue(), "123456");
      assert.equal(await page.locator("#mt5-password").inputValue(), "");
      await nav("Home").tap();
      await popup.waitFor({ state: "hidden" });
      await nav("MetaTrader").tap();
      await nav("Settings").tap();
      await page.waitForTimeout(350);
      await popup.waitFor({ state: "hidden" });
      await page
        .getByRole("button", { name: "Select Main Interface", exact: true })
        .tap({ position: { x: 20, y: 20 } });
      await nav("Home").tap();
      await page.waitForTimeout(350);
      await nav("MetaTrader").tap();
      await page
        .getByRole("button", { name: "Close MetaTrader", exact: true })
        .tap();
      await popup.waitFor({ state: "hidden" });
      await nav("MetaTrader").tap();
      await page.locator("#mt5-password").fill("fixture-only");
      await page
        .getByRole("button", { name: "Connect MT5", exact: true })
        .tap();
      await page
        .getByRole("heading", {
          name: "Backend not reachable right now.",
          exact: true,
        })
        .waitFor({ timeout: 20000 });
      assert.match(
        await page.locator("#mt5-dialog-description").textContent(),
        /no broker login was performed/,
      );
      await page
        .getByRole("button", { name: "Back to login", exact: true })
        .tap();
      await page
        .getByRole("button", { name: "Close MetaTrader", exact: true })
        .tap();
      await nav("Home").tap();
      assert.equal(
        await page.locator(".mt5-popup-backdrop:visible").count(),
        0,
      );
      assert.deepEqual(writes, []);
      assert.deepEqual(errors, []);
      results.push({ style, viewport, passed: true });
      await context.close();
    }
  }
  await writeFile(
    "work/metatrader-popup/results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
