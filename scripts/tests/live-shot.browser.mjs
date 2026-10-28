// Explicitly isolated UI fixtures: no production quotes or orders.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5234/ea-app/";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
await mkdir("work/live-shot", { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      isMobile: width < 600,
      hasTouch: width < 600,
      userAgent:
        width < 600
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
          : undefined,
    });
    const style = "matrix",
      requests = [];
    let unavailable = true,
      marketReads = 0;
    await context.addInitScript(
      ({ style }) => {
        Object.defineProperty(navigator, "standalone", { value: true });
        window.AudioContext = undefined;
        window.webkitAudioContext = undefined;
        localStorage.setItem(
          "ea-cloud:client:7:home-appearance",
          JSON.stringify({
            interfaceStyle: style,
            showBg: true,
            backgroundAnimation: "none",
            accentColor: "#ef4444",
          }),
        );
      },
      { style },
    );
    await context.route("https://fonts.**", (r) => r.abort());
    let signedOut = false;
    await context.route("**/api/**", async (r) => {
      const path = new URL(r.request().url()).pathname;
      requests.push({ path, method: r.request().method() });
      if (path.startsWith("/api/app/scanner/live-shot/")) {
        if (unavailable)
          return r.fulfill({
            status: 503,
            json: { error: "Read-only MT5 candle bridge is unavailable." },
          });
        if (path.endsWith("/symbols"))
          return r.fulfill({ json: { symbols: ["XAUUSD.a", "EURUSD.raw"] } });
        const selection =
          r.request().method() === "POST"
            ? r.request().postDataJSON()
            : Object.fromEntries(new URL(r.request().url()).searchParams);
        if (path.endsWith("/analyze"))
          return r.fulfill({
            json: {
              symbol: selection.symbol,
              timeframe: selection.timeframe,
              candleTime: Math.floor(Date.now() / 900000) * 900,
              analysedAt: Date.now(),
              report: {
                bias: "Bullish",
                setup: "BUY",
                structure: "Isolated browser fixture: higher lows.",
                analysis:
                  "Isolated test fixture only. These levels validate chart drawing and never represent market advice.",
                levels: [
                  { kind: "SUPPORT", price: 100, reason: "Fixture level" },
                ],
                entry: 103,
                stopLoss: 101,
                takeProfit: 107,
                confidence: null,
                confidenceReason: null,
              },
            },
          });
        marketReads++;
        const time = Math.floor(Date.now() / 900000) * 900;
        return r.fulfill({
          json: {
            ...selection,
            candles: Array.from({ length: 100 }, (_, i) => ({
              time: time - (99 - i) * 900,
              open: 103,
              high: 108,
              low: 98,
              close: 104 + marketReads / 100,
            })),
            lastPrice: 104 + marketReads / 100,
            tickTime: Date.now(),
            observedAt: Date.now(),
            connected: true,
            marketStatus: "unknown",
            digits: 2,
          },
        });
      }
      if (path === "/api/app/logout") {
        signedOut = true;
        return r.fulfill({ json: { ok: true } });
      }
      if (path === "/api/app/me" && signedOut)
        return r.fulfill({ status: 401, json: {} });
      let json = [];
      if (path === "/api/app/me")
        json = {
          id: 7,
          token: btoa("7:client:cookie"),
          status: "approved",
          licenseKey: "TEST",
        };
      if (path === "/api/app/dashboard")
        json = {
          mentor: {
            id: 5,
            robotName: "EA Cloud Pro",
            backgroundImageUrl: "/default-robot.jpg",
          },
          eas: [],
        };
      if (path === "/api/app/ea-mode-images")
        json = {
          eas: [
            {
              id: 1,
              name: "EA Cloud Pro",
              images: Array(4).fill("/default-robot.jpg"),
            },
          ],
        };
      if (path === "/api/app/trading-controls")
        json = { copyingEnabled: false };
      if (path === "/api/app/scanner/history")
        json = { records: [], hasMore: false };
      return r.fulfill({ json });
    });

    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await page.waitForSelector(".ea-startup", {
      state: "detached",
      timeout: 25000,
    });
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await page.getByRole("button", { name: "Live Shot", exact: true }).click();
    const licenseResponse=await page.request.get(new URL('licenses/chart-notices.txt',origin).href);
    assert.equal(licenseResponse.status(),200);
    const notices=await licenseResponse.text();
    assert(notices.includes('Apache License')&&notices.includes('Copyright (с) 2025 TradingView')&&notices.includes('Permission is hereby granted'));
    const dialog = page.getByRole("dialog", {
      name: "Live Shot market analysis",
    });
    await dialog
      .getByRole("heading", { name: "Market data unavailable" })
      .waitFor();
    assert(
      await dialog
        .getByRole("button", { name: "ANALYZE MARKET", exact: true })
        .isDisabled(),
    );
    assert.equal(await dialog.locator("canvas").count(), 0);
    await page.screenshot({
      path: `work/live-shot/${width}-honest-unavailable.png`,
    });
    unavailable = false;
    await dialog.getByRole("button", { name: "Retry connection" }).click();
    await dialog.locator("canvas").first().waitFor();
    assert(
      await page.evaluate(
        () =>
          Number(
            getComputedStyle(document.querySelector(".live-shot")).zIndex,
          ) >
          Number(
            getComputedStyle(document.querySelector(".trading-activity-trigger"))
              .zIndex,
          ),
      ),
      "analysis page covers trading overlays",
    );
    const analyze = dialog.getByRole("button", {
      name: "ANALYZE MARKET",
      exact: true,
    });
    await analyze.evaluate((n) => {
      n.click();
      n.click();
    });
    await dialog.getByText("BUY · Bullish", { exact: true }).waitFor();
    assert.equal(
      requests.filter((r) => r.path.endsWith("/live-shot/analyze")).length,
      1,
      "duplicate Analyze clicks coalesce",
    );
    const risk = dialog.locator(".live-shot-ratio");
    assert((await risk.textContent()).includes("1:2.00"));
    const handle = dialog.getByRole("button", {
      name: "Adjust stopLoss",
      exact: true,
    });
    await handle.scrollIntoViewIfNeeded();
    await handle.focus();
    await page.keyboard.press("ArrowDown");
    assert(
      !(await risk.textContent()).includes("1:2.00"),
      "visual adjustment updates ratio",
    );
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + 8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 8, box.y + box.height / 2 + 4, { steps: 4 });
    await page.mouse.up();
    await page.screenshot({
      path: `work/live-shot/${width}-fixture-analysis.png`,
    });
    const canvas = dialog.locator(".live-shot-canvas");
    await canvas.scrollIntoViewIfNeeded();
    const area = await canvas.boundingBox(),
      zone = await dialog.locator(".live-shot-zone.reward").boundingBox();
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(150);
    const zoomed = await dialog.locator(".live-shot-zone.reward").boundingBox();
    assert.notEqual(zoomed.width, zone.width, "overlay follows chart zoom");
    const quote = await dialog.locator(".live-shot-price strong").textContent();
    await page.waitForFunction(
      (old) =>
        document.querySelector(".live-shot-price strong")?.textContent !== old,
      quote,
      { timeout: 8000 },
    );
    unavailable = true;
    await dialog
      .getByRole("status")
      .getByText("Unavailable", { exact: true })
      .waitFor({ timeout: 8000 });
    assert(await analyze.isDisabled());
    assert(await dialog.locator("canvas").count());
    unavailable = false;
    await page.waitForFunction(
      () =>
        document.querySelector(".live-shot-connection")?.textContent ===
        "Receiving quotes",
      null,
      { timeout: 8000 },
    );
    await dialog.getByLabel("Timeframe", { exact: true }).selectOption("H1");
    await page.waitForFunction(
      () => !document.querySelector(".live-shot-level-handle"),
    );
    await dialog
      .getByLabel("Trading symbol", { exact: true })
      .selectOption("EURUSD.raw");
    await page.waitForFunction(
      () =>
        document
          .querySelector(".live-shot-chart")
          ?.getAttribute("aria-label") === "EURUSD.raw H1 candlestick chart",
    );
    assert.equal(await dialog.locator(".live-shot-level-handle").count(), 0);
    assert(
      await dialog.evaluate((n) => n.scrollWidth <= n.clientWidth),
      "no horizontal overflow",
    );
    assert.equal(await page.evaluate(() => visualViewport.scale), 1);
    assert(
      requests.every((r) => r.method === "GET" || r.path.endsWith("/analyze")),
      "no order requests",
    );
    await dialog.getByRole("button", { name: "Back from Live Shot" }).click();
    assert.equal(await page.locator(".live-shot").count(), 0);
    if (width === 390) {
      const count = requests.filter((r) =>
        r.path.includes("/live-shot/"),
      ).length;
      await page.waitForTimeout(5500);
      assert.equal(
        requests.filter((r) => r.path.includes("/live-shot/")).length,
        count,
        "exit cleans up polling",
      );
    }
    assert(
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .isVisible(),
    );
    const colour = page.getByRole("button", {
      name: "Electric Blue",
      exact: true,
    });
    if (!(await colour.isVisible()))
      await page
        .getByRole("button", { name: "Select Colour", exact: true })
        .click();
    await colour.click();
    await page.getByRole("button", { name: "Live Shot", exact: true }).click();
    assert.equal(
      await page
        .locator(".live-shot")
        .evaluate((n) =>
          getComputedStyle(n).getPropertyValue("--live-accent").trim(),
        ),
      "#3b82f6",
    );
    await page.getByRole("button", { name: "Back from Live Shot" }).click();
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}: unavailable, candles, analysis, risk/reward edits, selection reset, safe exit, no orders`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
