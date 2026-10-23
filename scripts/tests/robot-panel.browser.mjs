import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5190/ea-app/";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const stage = process.env.PANEL_STAGE || "after";
await mkdir("work/robot-panel", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 1280, height: 900 },
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
    await context.routeWebSocket("**/api/ws?*", () => {});
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
    await page.goto(origin);
    await page.waitForSelector(".ea-startup", { state: "detached" });
    await page.evaluate(() => document.fonts.ready);
    const circle = page.getByRole("button", {
        name: "Open live trading activity",
        exact: true,
      }),
      dot = circle.locator(".activity-dot");
    const circleBefore = await circle.boundingBox();
    const circleImage = await circle.locator("img").getAttribute("src");
    await circle.click();
    const panel = page.getByRole("dialog");
    await panel.waitFor();
    await page.waitForTimeout(300);
    const box = await panel.boundingBox();
    const image = await panel
      .locator("header")
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    const texts = await panel.innerText();
    for (const text of [
      "SMC BLUEPRINT EA V3+",
      "BALANCE",
      "EQUITY",
      "P&L",
      "USD 1,250.00",
      "USD 1,260.00",
      "+USD 10.00",
      "Powered by EA Cloud",
      "Fixture event 24",
    ])
      assert(texts.includes(text), text);
    const terminal = panel.getByRole("log");
    assert(await terminal.evaluate((el) => el.scrollHeight > el.clientHeight));
    if (stage === "after") {
      const before = JSON.parse(
        await readFile("docs/robot-panel/before.json", "utf8"),
      ).find((r) => r.viewport.width === viewport.width);
      assert(box.width < before.box.width * 0.92, "Panel is visibly narrower");
      assert(box.height < before.box.height * 0.92, "Panel is visibly shorter");
      assert.equal(image, before.image);
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute("aria-label"),
        ),
        "Close trading activity",
      );
      await page.keyboard.press("Shift+Tab");
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute("aria-label"),
        ),
        "Move robot panel",
      );
      await page.keyboard.press("Shift+Tab");
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute("aria-label"),
        ),
        "Refresh activity",
      );
      const handle = page.getByRole("button", {
        name: "Move robot panel",
        exact: true,
      });
      const cdp =
        viewport.width < 500 ? await context.newCDPSession(page) : null;
      const drag = async (x, y) => {
        const h = await handle.boundingBox(),
          from = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
        if (cdp) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ ...from, id: 1 }],
          });
          for (let i = 1; i <= 8; i++) {
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [
                {
                  x: from.x + ((x - from.x) * i) / 8,
                  y: from.y + ((y - from.y) * i) / 8,
                  id: 1,
                },
              ],
            });
            await page.waitForTimeout(16);
          }
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
        } else {
          await page.mouse.move(from.x, from.y);
          await page.mouse.down();
          await page.mouse.move(x, y, { steps: 12 });
          await page.mouse.up();
        }
        await page.waitForTimeout(100);
        assert(await panel.isVisible());
        return panel.boundingBox();
      };
      const moved = await drag(viewport.width * 0.3, viewport.height * 0.18);
      assert(Math.abs(moved.y - box.y) > 15);
      await page.waitForTimeout(350);
      assert.deepEqual(
        await panel.boundingBox(),
        moved,
        "Release keeps position",
      );
      for (const [x, y] of [
        [-100, -100],
        [viewport.width + 200, viewport.height + 200],
        [viewport.width * 0.5, viewport.height * 0.25],
      ]) {
        const bounds = await drag(x, y),
          root = await page.locator(".trading-activity-root").boundingBox();
        assert(bounds.x >= root.x + 3 && bounds.y >= root.y + 3);
        assert(bounds.x + bounds.width <= root.x + root.width - 3);
        assert(bounds.y + bounds.height <= root.y + root.height - 3);
        const close = await panel
          .getByRole("button", { name: "Close trading activity" })
          .boundingBox();
        assert(close.y >= 0 && close.y + close.height <= viewport.height);
      }
      const settled = await panel.boundingBox();
      await page
        .getByRole("button", { name: "Move robot panel", exact: true })
        .focus();
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(50);
      assert((await panel.boundingBox()).y >= settled.y);
      // Messages own scrolling and selection, not dragging.
      const fixed = await panel.boundingBox();
      await terminal.evaluate((el) => (el.scrollTop = 0));
      await terminal.hover();
      await page.mouse.wheel(0, 180);
      await page.waitForTimeout(100);
      assert((await terminal.evaluate((el) => el.scrollTop)) > 0);
      assert.deepEqual(await panel.boundingBox(), fixed);
      await terminal.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el.querySelector("p"));
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });
      assert((await page.evaluate(() => getSelection().toString())).length > 0);
      await page.evaluate(() => getSelection().removeAllRanges());
      const previousReads = reads;
      await panel
        .getByRole("button", { name: "Refresh activity", exact: true })
        .click();
      await page.waitForTimeout(200);
      assert(reads > previousReads);
      assert.deepEqual(await panel.boundingBox(), fixed);
      await page.screenshot({
        path: `work/robot-panel/after-${viewport.width}.png`,
      });
      await panel
        .getByRole("button", { name: "Close trading activity", exact: true })
        .click();
      assert.equal(await panel.count(), 0);
      await circle.click();
      await panel.waitFor();
      await page.waitForTimeout(250);
      assert.deepEqual(
        await panel.boundingBox(),
        fixed,
        "Reopen preserves panel position",
      );
      await page.keyboard.press("Escape");
      assert.equal(await panel.count(), 0);
      assert.deepEqual(await circle.boundingBox(), circleBefore);
      assert.equal(
        await circle.locator("img").getAttribute("src"),
        circleImage,
      );
      await circle.click();
      await panel.waitFor();
      await page.waitForTimeout(100);
      await page.setViewportSize({
        width: viewport.width < 500 ? 568 : viewport.width,
        height: 360,
      });
      await page.waitForTimeout(180);
      const resized = await panel.boundingBox();
      const area = await page.locator(".trading-activity-root").boundingBox();
      assert(resized.y >= 3 && resized.y + resized.height <= 363);
      assert(
        resized.x >= area.x + 3 &&
          resized.x + resized.width <= area.x + area.width - 3,
      );
      const visibleClose = await panel
        .getByRole("button", { name: "Close trading activity", exact: true })
        .boundingBox();
      assert(
        visibleClose.y >= 0 && visibleClose.y + visibleClose.height <= 360,
      );
      await page.setViewportSize(viewport);
      await page.waitForTimeout(150);
      await page.keyboard.press("Escape");
      if (cdp) await cdp.detach();
      // Confirmed server state drives the light. Requests are delayed or rejected deliberately.
      const action = () =>
        page.locator("[data-matrix-functions] button").nth(1);
      assert.equal(await dot.getAttribute("aria-label"), "Bot paused");
      assert.equal(
        await dot.evaluate((el) => getComputedStyle(el).backgroundColor),
        "rgb(255, 68, 68)",
      );
      delay = 500;
      failWrite = true;
      await action().click();
      await page.waitForTimeout(100);
      assert.notEqual(await dot.getAttribute("aria-label"), "Bot active");
      await page.waitForTimeout(600);
      assert.notEqual(await dot.getAttribute("aria-label"), "Bot active");
      assert.equal(enabled, false);
      failWrite = false;
      await action().click();
      await page.waitForTimeout(100);
      assert.notEqual(await dot.getAttribute("aria-label"), "Bot active");
      await page.waitForTimeout(650);
      assert.equal(await dot.getAttribute("aria-label"), "Bot active");
      assert.equal(
        await dot.evaluate((el) => getComputedStyle(el).backgroundColor),
        "rgb(57, 230, 149)",
      );
      await action().click();
      await page.waitForTimeout(650);
      assert.equal(await dot.getAttribute("aria-label"), "Bot paused");
      assert.equal(enabled, false);
      delay = 200;
      await action().click();
      await action().click();
      await page.waitForTimeout(250);
      assert.notEqual(await dot.getAttribute("aria-label"), "Bot active");
      await page.waitForTimeout(350);
      assert.equal(enabled, false);
      assert.equal(await dot.getAttribute("aria-label"), "Bot paused");
      delay = 0;
      // Colour selection changes the ring, never the activation light.
      const tab = async (name) => {
        await page.getByRole("button", { name, exact: true }).click();
        await page.waitForTimeout(330);
      };
      await tab("Settings");
      await page
        .getByRole("button", { name: "Select Colour", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Royal Purple", exact: false })
        .click();
      assert.equal(
        await circle.evaluate((el) => getComputedStyle(el).borderTopColor),
        "rgb(168, 85, 247)",
      );
      assert.equal(
        await dot.evaluate((el) => getComputedStyle(el).backgroundColor),
        "rgb(255, 68, 68)",
      );
      for (const label of [
        "Regular Interface",
        "S2tone_",
        "The Matrix Interface",
      ]) {
        const b = page.getByRole("button", {
          name: "Select Main Interface",
          exact: true,
        });
        if (await b.locator(".lucide-chevron-down").count()) await b.click();
        await page.getByRole("button", { name: label, exact: false }).click();
        await tab("Home");
        assert.equal(await dot.getAttribute("aria-label"), "Bot paused");
        await tab("Settings");
      }
      await tab("Home");
      await action().click();
      await page.waitForTimeout(150);
      assert.equal(await dot.getAttribute("aria-label"), "Bot active");
      await page.reload();
      await page.waitForSelector(".ea-startup", { state: "detached" });
      assert.equal(await dot.getAttribute("aria-label"), "Bot active");
      if (viewport.width === 390)
        await page.screenshot({
          path: "work/robot-panel/indicator-active.png",
        });
      failRead = true;
      await page.reload();
      await page.waitForSelector(".ea-startup", { state: "detached" });
      assert.equal(
        await dot.getAttribute("aria-label"),
        "Bot status unconfirmed",
      );
      // Existing circle remains draggable independently.
      const c = await circle.boundingBox();
      await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
      await page.mouse.down();
      await page.mouse.move(c.x + c.width / 2 - 60, c.y + c.height / 2 - 80, {
        steps: 12,
      });
      await page.mouse.up();
      await page.waitForTimeout(100);
      assert(Math.abs((await circle.boundingBox()).y - c.y) > 30);
      assert.equal(await panel.count(), 0);
    } else
      await page.screenshot({
        path: `work/robot-panel/before-${viewport.width}.png`,
      });
    results.push({
      viewport,
      box,
      image,
      allInformationPresent: true,
      ...(stage === "after"
        ? {
            dragging: viewport.width < 500 ? "touch" : "mouse",
            boundsAndResizePassed: true,
            releaseAndReopenPositionPreserved: true,
            scrollAndSelectionPassed: true,
            closeAndRefreshPassed: true,
            keyboardFocusPassed: true,
            confirmedStartStopPassed: true,
            rejectedAndPendingStartNotGreen: true,
            rapidCommandsOrdered: true,
            unknownStatusNotGreen: true,
            themeIndependentStatusColours: true,
            circlePreserved: true,
          }
        : {}),
      errors,
    });
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(
    `work/robot-panel/${stage}.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(
    JSON.stringify({ stage, viewports: results.length, passed: true }),
  );
} finally {
  await browser.close();
}
