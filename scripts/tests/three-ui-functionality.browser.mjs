import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5194/ea-app/";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
await mkdir("work/three-ui-fixes", { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width < 500,
      isMobile: viewport.width < 500,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let enabled = false,
      failWrite = false,
      failRead = false,
      delay = 0,
      reads = 0;
    await context.addInitScript(() =>
      localStorage.setItem("appClientToken", btoa("7:client:fixture")),
    );
    const sockets = [];
    await context.routeWebSocket("**/api/ws?*", (socket) =>
      sockets.push(socket),
    );
    await context.route("https://fonts.**", (r) => r.abort());
    await context.route("**/fixture-robot.jpg", (r) =>
      r.fulfill({
        path: "artifacts/ea-cloud/public/default-robot.jpg",
        contentType: "image/jpeg",
      }),
    );
    await context.route("**/api/**", async (r) => {
      const p = new URL(r.request().url()).pathname;
      if (p === "/api/app/trading-controls") {
        if (r.request().method() === "PATCH") {
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          if (failWrite)
            return r.fulfill({
              status: 500,
              json: { error: "fixture rejection" },
            });
          enabled = r.request().postDataJSON().copyingEnabled;
        } else if (failRead)
          return r.fulfill({
            status: 503,
            json: { error: "fixture unavailable" },
          });
        return r.fulfill({ json: { copyingEnabled: enabled } });
      }
      if (p === "/api/app/activity") reads++;
      const events = Array.from({ length: 25 }, (_, i) => ({
        id: String(i),
        createdAt: new Date().toISOString(),
        source: "system",
        level: "info",
        message: `Fixture event ${i}: broker status checked`,
        details: { symbol: "XAUUSD", ticket: i + 1 },
      }));
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
              : p === "/api/app/activity"
                ? { events }
                : p === "/api/app/activity/snapshot"
                  ? {
                      observedAt: Date.now(),
                      connected: true,
                      engine: true,
                      robotEnabled: enabled,
                      tradeAllowed: true,
                      account: {
                        balance: 1250,
                        equity: 1260,
                        profit: 10,
                        currency: "USD",
                      },
                      symbols: [{ symbol: "XAUUSD", available: true }],
                    }
                  : [],
      });
    });
    page.setDefaultTimeout(12000);
    await context.addInitScript(
      ({ width }) =>
        localStorage.setItem(
          "ea-cloud:floating-robot-position",
          JSON.stringify({ x: width - 74, y: 80 }),
        ),
      viewport,
    );
    await page.goto(origin);
    await page.waitForSelector(".ea-startup", { state: "detached" });
    await page.evaluate(() => document.fonts.ready);
    const nav = (label) =>
      page.getByRole("button", { name: label, exact: true });
    const circle = nav("Open live trading activity");
    const cdp = await context.newCDPSession(page);
    const settle = () => page.waitForTimeout(100);
    const drag = async (locator, dx, dy) => {
      const b = await locator.boundingBox(),
        x = b.x + b.width / 2,
        y = b.y + b.height / 2;
      dx = Math.max(5, Math.min(viewport.width - 5, x + dx)) - x;
      dy = Math.max(5, Math.min(viewport.height - 5, y + dy)) - y;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 1 }],
      });
      for (let i = 1; i <= 8; i++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8, id: 1 }],
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await settle();
    };
    // Move only the fixture's circle away from lower Home controls.

    const openSettings = async () => {
      await nav("Settings").tap();
      await page.waitForTimeout(350);
    };
    const accordion = async (label) => {
      const b = nav(label);
      if (await b.locator(".lucide-chevron-down").count())
        await b.tap({ position: { x: 10, y: 25 } });
    };
    const chooseInterface = async (label) => {
      await openSettings();
      await accordion("Select Main Interface");
      await page
        .getByRole("button", { name: label })
        .tap({ position: { x: 20, y: 20 } });
      await nav("Home").tap();
      await page.waitForTimeout(350);
    };
    const state = () =>
      page.evaluate(() => ({
        preferences: Object.entries(localStorage)
          .filter(([k]) => k !== "ea-cloud:robot-panel-window")
          .sort(),
        bg: document
          .querySelector("[data-home-background]")
          .getAttribute("src"),
        opacity: getComputedStyle(
          document.querySelector("[data-home-background]"),
        ).opacity,
      }));
    for (const [label, id] of [
      ["Regular Interface", "regular"],
      ["S2tone_", "s2tone"],
      ["The Matrix Interface", "matrix"],
    ]) {
      await chooseInterface(label);
      const home = page.locator(`[data-home-interface="${id}"]`),
        surface = page.locator("[data-home-swipe-surface]");
      await surface.evaluate((el) => (el.scrollTop = 0));
      await home.locator("button:has(svg.lucide-bell)").tap();
      const backdrop = page.locator("[data-copied-trades-backdrop]");
      await backdrop.waitFor();
      await backdrop.getByText("Copied Trades", { exact: true }).waitFor();
      await backdrop.getByText("LIVE", { exact: true }).waitFor();
      await backdrop.getByText("Copied Trades", { exact: true }).tap();
      assert(await backdrop.isVisible(), "inside taps must not dismiss trades");
      if (id === "regular")
        await backdrop
          .getByText("No trades copied yet", { exact: true })
          .waitFor();
      // Assert existing live feed merging is intact, using a local WebSocket fixture only.
      const execution = {
        id: 1,
        signalId: 1,
        mentorId: 1,
        clientId: 7,
        signalKind: "BUY",
        symbol: "XAUUSD",
        action: "BUY",
        volume: "0.1",
        status: "success",
        ticket: "123",
        mentorTicket: "456",
        retcode: 10009,
        attempts: 1,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      for (const socket of sockets)
        socket.send(JSON.stringify({ type: "TRADE_EXECUTION", execution }));
      await backdrop.getByText("XAUUSD", { exact: true }).waitFor();
      const sheet = backdrop.locator(":scope > div");
      const sheetRect = await sheet.boundingBox();
      assert(sheetRect.y > 50, "background above trades is exposed");
      const before = await state(),
        wasEnabled = enabled;
      await surface.evaluate((el) => {
        window.homeClicks = 0;
        el.addEventListener("click", () => window.homeClicks++, true);
      });
      await page.screenshot({
        path: `work/three-ui-fixes/${viewport.width}-${id}-trades.png`,
      });
      await page.touchscreen.tap(
        viewport.width / 2,
        Math.min(80, sheetRect.y / 2),
      );
      await settle();
      assert.equal(await backdrop.count(), 0);
      assert.deepEqual(await state(), before);
      assert.equal(enabled, wasEnabled);
      assert.equal(await page.evaluate(() => window.homeClicks), 0);
      await home.locator("button:has(svg.lucide-bell)").tap();
      await backdrop.locator("button:has(svg.lucide-x)").tap();
      assert.equal(await backdrop.count(), 0, "X still closes trades");
      // Quotes and Symbols share the existing QuotesSheet; Home must dismiss that local state.
      const symbols = home
        .locator(
          "button:has(svg.lucide-chart-no-axes-column),button:has(svg.lucide-trending-up)",
        )
        .first();
      await symbols.scrollIntoViewIfNeeded();
      const b = await symbols.boundingBox();
      await surface.evaluate(
        (el, delta) => (el.scrollTop += delta),
        b.y + b.height / 2 - (viewport.height - 145),
      );
      await symbols.tap();
      await home.getByText("ALLOWED SYMBOLS", { exact: true }).waitFor();
      const beforeHome = await state();
      await nav("Home").tap();
      await settle();
      assert.equal(
        await home.getByText("ALLOWED SYMBOLS", { exact: true }).count(),
        0,
      );
      assert.equal(
        await home.locator("button:has(svg.lucide-chevron-left)").count(),
        0,
      );
      assert.deepEqual(await state(), beforeHome);
      // The first subsequent trading-control touch must work normally.
      const start = home.locator("button:has(svg.lucide-play)");
      await start.scrollIntoViewIfNeeded();
      await start.tap();
      await page.waitForTimeout(150);
      assert.equal(enabled, true);
      const controlIndex = await home
        .locator("button:has(svg.lucide-pause),button:has(div.rounded-sm)")
        .evaluate((el) =>
          Array.from(
            el.closest("[data-home-interface]").querySelectorAll("button"),
          ).indexOf(el),
        );
      await home.locator("button").nth(controlIndex).tap();
      await page.waitForTimeout(150);
      assert.equal(enabled, false);
      results.push({
        width: viewport.width,
        interface: id,
        outsideTradeTap: true,
        xClose: true,
        liveFeed: true,
        homeDismissesSymbols: true,
        preferencesUnchanged: true,
        controlsInteractive: true,
      });
    }
    // Keep the same panel open through real Settings colour changes.
    await circle.tap();
    const panel = page.getByRole("dialog", {
      name: "Live trading activity monitor",
      exact: true,
    });
    await panel.waitFor();
    await page.waitForTimeout(250);
    const move = panel.getByRole("button", {
      name: "Move robot panel",
      exact: true,
    });
    await drag(move, -1000, -1000);
    await drag(
      panel.getByRole("button", {
        name: "Resize robot panel right",
        exact: true,
      }),
      -100,
      0,
    );
    await drag(move, 1000, 0);
    const geometry = () => panel.boundingBox();
    const originalGeometry = await geometry();
    const snapshot = () =>
      panel.evaluate((el) => ({
        text: el.querySelector("h2").textContent,
        image: getComputedStyle(
          el.querySelector("header"),
        ).backgroundImage.split("url(")[1],
        border: getComputedStyle(el).borderColor,
        glow: getComputedStyle(el).boxShadow,
        refresh: getComputedStyle(el.querySelector("footer button")).color,
        off: getComputedStyle(el.querySelector(".activity-badges .off")).color,
        robotStatus: getComputedStyle(
          el.querySelector(".activity-badges span:last-child"),
        ).color,
        gain: getComputedStyle(el.querySelector(".gain")).color,
      }));
    const baseline = await snapshot();
    await openSettings();
    await accordion("Select Colour");
    const colours = [];
    for (const [label, color] of [
      ["Pure Red", "#ef4444"],
      ["Electric Blue", "#3b82f6"],
      ["Emerald Green", "#22c55e"],
      ["Royal Purple", "#a855f7"],
    ]) {
      const option = nav(label);
      await option.scrollIntoViewIfNeeded();
      await option.tap({ position: { x: 10, y: 30 } });
      await page.waitForTimeout(250);
      assert.equal(
        await panel.evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--robot-panel-accent").trim(),
        ),
        color,
      );
      assert.deepEqual(
        await geometry(),
        originalGeometry,
        "theme changes must not change window dimensions or position",
      );
      const current = await snapshot();
      assert.equal(current.text, baseline.text);
      assert.equal(current.image, baseline.image);
      assert.equal(current.off, baseline.off);
      assert.equal(current.robotStatus, "rgb(252, 141, 134)");
      assert.equal(current.gain, baseline.gain);
      assert.equal(
        await circle
          .locator(".activity-dot")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
        "rgb(255, 68, 68)",
      );
      if (colours.length) {
        assert.notEqual(current.border, colours.at(-1).border);
        assert.notEqual(current.glow, colours.at(-1).glow);
        assert.notEqual(current.refresh, colours.at(-1).refresh);
      }
      colours.push({ color, ...current });
      await page.screenshot({
        path: `work/three-ui-fixes/${viewport.width}-${label.replaceAll(" ", "-")}.png`,
      });
    }
    await nav("Home").tap();
    await page.waitForTimeout(350);
    // Window remains non-modal and retains drag, corner resize, pinch and refresh.
    const g = await geometry();
    await drag(move, -25, 35);
    const moved = await geometry();
    assert.notEqual(g.x, moved.x);
    assert.equal(g.width, moved.width);
    await drag(
      panel.getByRole("button", {
        name: "Resize robot panel bottom right",
        exact: true,
      }),
      -15,
      -30,
    );
    const resized = await geometry();
    assert(resized.height < moved.height);
    const a = await geometry(),
      cx = a.x + a.width / 2,
      cy = a.y + 70;
    const points = (d) => [
      { x: cx - d, y: cy, id: 1 },
      { x: cx + d, y: cy, id: 2 },
    ];
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: points(35),
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: points(35 + i * 2),
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await settle();
    assert(
      (await geometry()).width > a.width + 5,
      "pinch still grows the themed window",
    );
    const previousReads = reads;
    await panel
      .getByRole("button", { name: "Refresh activity", exact: true })
      .tap();
    await page.waitForTimeout(200);
    assert(reads > previousReads);
    await panel
      .getByRole("button", { name: "Close trading activity", exact: true })
      .tap();
    // Semantic activation stays green while purple remains selected.
    const home = page.locator("[data-home-interface]");
    const start = home.locator("button:has(svg.lucide-play)");
    await start.scrollIntoViewIfNeeded();
    await start.tap();
    await page.waitForTimeout(150);
    assert.equal(
      await circle
        .locator(".activity-dot")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(57, 230, 149)",
    );
    results.push({
      width: viewport.width,
      colours,
      geometryPreserved: true,
      drag: true,
      resize: true,
      pinch: true,
      refresh: true,
      semanticStatusPreserved: true,
    });
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(
    "work/three-ui-fixes/results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(
    "PASS: themed robot window, safe outside trade dismissal and Home from Quotes/Symbols across three interfaces.",
  );
} finally {
  await browser.close();
}
