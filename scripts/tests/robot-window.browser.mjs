import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5192/ea-app/";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const output = process.env.ROBOT_OUTPUT || "work/robot-window";
const startedOn =
  process.env.ROBOT_START_TAB === "metatrader" ? "metatrader" : "home";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
const near = (a, b, msg) => assert(Math.abs(a - b) < 2, `${msg}: ${a} vs ${b}`);
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 1280, height: 900 },
  ].filter(
    (v) =>
      !process.env.WINDOW_WIDTH || v.width === Number(process.env.WINDOW_WIDTH),
  )) {
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
      if (p === "/api/app/ea-mode-images")
        return r.fulfill({ json: { eas: [] } });
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
    await page.goto(origin);
    await page.waitForSelector(".ea-startup", {
      state: "detached",
      timeout: 30000,
    });
    await page.evaluate(() => document.fonts.ready);
    if (startedOn === "metatrader") {
      await page
        .getByRole("button", { name: "MetaTrader", exact: true })
        .click();
      await page.waitForTimeout(650);
    }
    const circle = page.getByRole("button", {
      name: "Open live trading activity",
      exact: true,
    });
    let circleStorage = await page.evaluate(() =>
      localStorage.getItem("ea-cloud:floating-robot-position"),
    );
    let circleBefore = await circle.boundingBox();
    const circleImage = await circle.locator("img").getAttribute("src");
    if (viewport.width < 500) await circle.tap();
    else await circle.click();
    const panel = page.getByRole("dialog", {
      name: "Live trading activity monitor",
      exact: true,
    });
    await panel.waitFor();
    await page.waitForTimeout(250);
    const initial = await panel.boundingBox();
    assert.equal(await panel.getAttribute("aria-modal"), null);
    assert.equal(await page.locator(".trading-activity-backdrop").count(), 0);
    for (const text of [
      "SMC BLUEPRINT EA V3+",
      "BALANCE",
      "EQUITY",
      "P&L",
      "USD 1,250.00",
      "USD 1,260.00",
      "Powered by EA Cloud",
    ])
      assert((await panel.innerText()).includes(text), text);
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("ea-cloud:robot-panel-window")),
      );
    const settle = () => page.waitForTimeout(80);
    let cdp = await context.newCDPSession(page);
    const drag = async (locator, dx, dy) => {
      const b = await locator.boundingBox(),
        x = b.x + b.width / 2,
        y = b.y + b.height / 2;
      dx = Math.max(5, Math.min(viewport.width - 5, x + dx)) - x;
      dy = Math.max(5, Math.min(viewport.height - 5, y + dy)) - y;
      if (viewport.width < 500) {
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
      } else {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + dx, y + dy, { steps: 8 });
        await page.mouse.up();
      }
      await settle();
    };
    if (startedOn === "metatrader") {
      await panel
        .getByRole("button", { name: "Close trading activity", exact: true })
        .click();
      await drag(circle, -140, -180);
      assert.equal(
        await panel.isVisible(),
        false,
        "circle drag must not open the panel",
      );
      const moved = await circle.boundingBox();
      assert(moved.x !== circleBefore.x || moved.y !== circleBefore.y);
      assert.equal(moved.width, circleBefore.width);
      assert.equal(moved.height, circleBefore.height);
      circleBefore = moved;
      circleStorage = await page.evaluate(() =>
        localStorage.getItem("ea-cloud:floating-robot-position"),
      );
      if (viewport.width < 500) await circle.tap();
      else await circle.click();
      await panel.waitFor();
      assert.equal(await page.locator(".trading-activity-panel").count(), 1);
    }
    const handle = panel.getByRole("button", {
      name: "Move robot panel",
      exact: true,
    });
    {
      // Make room in both directions before checking all eight resize handles.
      await drag(handle, -1000, -1000);
      for (const [edge, dx, dy] of [
        ["bottom", 0, -30],
        ["right", -22, 0],
        ["top", 0, 18],
        ["left", 16, 0],
        ["bottom right", -16, -18],
        ["bottom left", 12, -14],
        ["top right", -12, 14],
        ["top left", 12, 14],
      ]) {
        await drag(handle, -1000, -1000);
        await drag(
          panel.getByRole("button", {
            name: "Resize robot panel right",
            exact: true,
          }),
          40,
          0,
        );
        await drag(
          panel.getByRole("button", {
            name: "Resize robot panel bottom",
            exact: true,
          }),
          0,
          45,
        );
        const before = await panel.boundingBox();
        await drag(
          panel.getByRole("button", {
            name: `Resize robot panel ${edge}`,
            exact: true,
          }),
          dx,
          dy,
        );
        const after = await panel.boundingBox();
        assert(
          Math.abs(before.width - after.width) > 5 ||
            Math.abs(before.height - after.height) > 5,
          `${edge} must resize`,
        );
        if (edge === "left" || edge.endsWith("left"))
          near(
            before.x + before.width,
            after.x + after.width,
            "left keeps right edge anchored",
          );
        if (edge === "top" || edge.startsWith("top"))
          near(
            before.y + before.height,
            after.y + after.height,
            "top keeps bottom anchored",
          );
      }
      if (viewport.width < 500) {
        await drag(handle, -1000, -1000);
        await drag(
          panel.getByRole("button", {
            name: "Resize robot panel right",
            exact: true,
          }),
          -30,
          0,
        );
        await drag(
          panel.getByRole("button", {
            name: "Resize robot panel bottom",
            exact: true,
          }),
          0,
          -120,
        );
        const pinch = async (ratio) => {
          const b = await panel.boundingBox(),
            cx = b.x + b.width / 2,
            cy = b.y + 70;
          const points = (d) => [
            { x: cx - d, y: cy, id: 1 },
            { x: cx + d, y: cy, id: 2 },
          ];
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: points(42),
          });
          for (let i = 1; i <= 8; i++)
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: points(42 * (1 + ((ratio - 1) * i) / 8)),
            });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          await settle();
        };
        // First grow, so shrinking can be verified independently of minimum size.
        const a = await panel.boundingBox();
        await pinch(1.22);
        const b = await panel.boundingBox();
        assert(b.width > a.width + 10, "pinch out grows");
        assert(
          Math.abs(b.width / a.width - b.height / a.height) < 0.01,
          "pinch preserves proportions",
        );
        const scaleOut = (await saved()).scale;
        await pinch(0.88);
        const c = await panel.boundingBox();
        assert(c.width < b.width - 5, "pinch in shrinks");
        assert((await saved()).scale < scaleOut, "contents shrink with panel");
        const content = await panel
          .locator(".activity-panel-content")
          .boundingBox();
        near(c.width, content.width, "scaled content fits outer width");
        assert.equal(
          await page.evaluate(() => visualViewport.scale),
          1,
          "pinch must not zoom the page",
        );
      }
    }
    const beforeMove = await panel.boundingBox();
    await drag(handle, 34, 25);
    const afterMove = await panel.boundingBox();
    near(beforeMove.width, afterMove.width, "moving does not resize width");
    near(beforeMove.height, afterMove.height, "moving does not resize height");
    assert(
      afterMove.x !== beforeMove.x || afterMove.y !== beforeMove.y,
      "panel moved",
    );
    // Native touch scrolling must remain independent of panel movement.
    const beforeScroll = await saved(),
      log = panel.getByRole("log");
    await log.evaluate((el) => (el.scrollTop = 0));
    const lb = await log.boundingBox();
    if (viewport.width < 500 && lb.height > 30) {
      const x = lb.x + lb.width / 2,
        y = lb.y + lb.height - 12;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 1 }],
      });
      for (let i = 1; i <= 8; i++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x, y: y - (Math.min(90, lb.height - 20) * i) / 8, id: 1 },
          ],
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await page.waitForTimeout(250);
      assert(
        (await log.evaluate((el) => el.scrollTop)) > 0,
        "one-finger log scroll works",
      );
    }
    assert.deepEqual(
      await saved(),
      beforeScroll,
      "log scrolling does not change window geometry",
    );
    await panel
      .getByRole("button", { name: "Refresh activity", exact: true })
      .click();
    await page.waitForTimeout(150);
    assert(reads > 1, "refresh still reads activity");
    await page.screenshot({
      path: `${output}/${viewport.width}-resized.png`,
    });
    if (startedOn === "metatrader") {
      await drag(handle, -1000, -1000);
      await drag(
        panel.getByRole("button", {
          name: "Resize robot panel bottom",
          exact: true,
        }),
        0,
        -1000,
      );
      const useField = async (selector, value) => {
        const field = page.locator(selector);
        await field.scrollIntoViewIfNeeded();
        let b = await field.boundingBox();
        await page
          .locator(".mt5-content")
          .evaluate(
            (el, delta) => (el.scrollTop += delta),
            b.y + b.height / 2 - (viewport.height - 145),
          );
        await settle();
        b = await field.boundingBox();
        const exposed = () =>
          field.evaluate((el) => {
            const r = el.getBoundingClientRect(),
              y = r.y + r.height / 2;
            for (const x of [r.x + 12, r.right - 12, r.x + r.width / 2]) {
              const hit = document.elementFromPoint(x, y);
              if (hit && (hit === el || el.contains(hit)))
                return { x: x - r.x, y: r.height / 2 };
            }
            return null;
          });
        let point = await exposed();
        if (!point) {
          await drag(handle, 0, 1000);
          point = await exposed();
        }
        if (!point) {
          await drag(handle, 0, -1000);
          point = await exposed();
        }
        assert(
          point,
          "an exposed field point is interactive outside the movable window/circle",
        );
        if (viewport.width < 500) await field.tap({ position: point });
        else await field.click({ position: point });
        if (value !== undefined) await field.fill(value);
        assert(await panel.isVisible());
      };
      await useField("#mt5-login", "123456");
      await useField("#mt5-password", "fixture-only");
      await useField("#mt5-server", "Exness-MT5Real1");
      await useField(".mt5-connect-button");
      await page
        .getByRole("button", { name: "Cancel connection", exact: true })
        .waitFor();
      await drag(handle, 0, 1000);
      await page
        .getByRole("button", { name: "Cancel connection", exact: true })
        .click();
      assert.equal(
        await page.locator(".mt5-view>.mt5-screen").getAttribute("data-state"),
        "idle",
      );
      assert(await panel.isVisible());
      assert.equal(
        await panel.evaluate((e) =>
          e.style.getPropertyValue("--robot-panel-accent"),
        ),
        await page
          .locator(".ea-glass-navigation")
          .evaluate((e) => e.style.getPropertyValue("--nav-accent")),
      );
    }
    // Preserve the independently draggable robot circle and its storage key.
    assert.equal(await circle.locator("img").getAttribute("src"), circleImage);
    assert.deepEqual(await circle.boundingBox(), circleBefore);
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("ea-cloud:floating-robot-position"),
      ),
      circleStorage,
    );
    const persisted = await saved();
    await panel
      .getByRole("button", { name: "Close trading activity", exact: true })
      .click();
    await circle.click();
    await settle();
    assert.deepEqual(await saved(), persisted);
    await page.reload();
    await page
      .locator(".ea-startup")
      .waitFor({ state: "detached", timeout: 30000 });
    await cdp.detach();
    cdp = await context.newCDPSession(page);
    await circle.click();
    await settle();
    assert.deepEqual(await saved(), persisted, "reload restores all geometry");
    await drag(circle, 0, -1000);
    // Move to the top and shrink height, leaving the Home controls and navigation free.
    await drag(handle, -1000, -1000);
    await drag(
      panel.getByRole("button", {
        name: "Resize robot panel bottom",
        exact: true,
      }),
      0,
      -1000,
    );
    const clickOutside = async (locator) => {
      await locator.scrollIntoViewIfNeeded();
      let b = await locator.boundingBox();
      const homeScroll = page.locator("[data-home-swipe-surface]");
      if (
        await locator.evaluate((el) =>
          Boolean(el.closest("[data-home-swipe-surface]")),
        )
      ) {
        await homeScroll.evaluate(
          (el, delta) => (el.scrollTop += delta),
          b.y + b.height / 2 - (viewport.height - 145),
        );
        await settle();
        b = await locator.boundingBox();
      }
      assert(b, "outside control exists");
      const p = await panel.boundingBox();
      assert(
        b.y + b.height / 2 < p.y ||
          b.y + b.height / 2 > p.y + p.height ||
          b.x + b.width / 2 < p.x ||
          b.x + b.width / 2 > p.x + p.width,
        "control is outside panel",
      );
      if (viewport.width < 500) await locator.tap();
      else await locator.click();
      assert(await panel.isVisible(), "panel stays open");
    };
    // Test each actual Home interface while the non-modal window remains open.
    for (const [name, id] of [
      ["Regular Interface", "regular"],
      ["S2tone_", "s2tone"],
      ["The Matrix Interface", "matrix"],
    ]) {
      await clickOutside(
        page.getByRole("button", { name: "Settings", exact: true }),
      );
      await page.waitForTimeout(350);
      await page.screenshot({
        path: `${output}/${viewport.width}-${id}-after-nav.png`,
      });
      // Move window down temporarily so the Settings header/options are exposed.
      await drag(handle, 0, 1000);
      await page.screenshot({
        path: `${output}/${viewport.width}-${id}-settings.png`,
      });
      const accordion = page.getByRole("button", {
        name: "Select Main Interface",
        exact: true,
      });
      if (await accordion.locator(".lucide-chevron-down").count())
        await accordion.click();
      const option = page.getByRole("button", { name, exact: false });
      const optionRect = await option.boundingBox();
      await option.click({ position: { x: optionRect.width - 20, y: 20 } });
      await drag(handle, 0, -1000);
      await clickOutside(
        page.getByRole("button", { name: "Home", exact: true }),
      );
      await page.waitForTimeout(350);
      await drag(handle, 0, -1000);
      const home = page.locator(`[data-home-interface="${id}"]`);
      const index = await home
        .locator("button:has(svg.lucide-play)")
        .evaluate((el) =>
          Array.from(
            el.closest("[data-home-interface]").querySelectorAll("button"),
          ).indexOf(el),
        );
      const control = home.locator("button").nth(index);
      await clickOutside(control);
      await page.waitForTimeout(150);
      assert.equal(enabled, true);
      await clickOutside(control);
      await page.waitForTimeout(150);
      assert.equal(enabled, false);
      const symbols = home
        .locator(
          "button:has(svg.lucide-chart-no-axes-column),button:has(svg.lucide-chart-column),button:has(svg.lucide-trending-up)",
        )
        .first();
      await clickOutside(symbols);
      await page.screenshot({
        path: `${output}/${viewport.width}-${id}-symbols.png`,
      });
      await home.getByText("ALLOWED SYMBOLS", { exact: true }).waitFor();
      await drag(handle, 0, 1000);
      await clickOutside(home.locator("button:has(svg.lucide-chevron-left)"));
      await drag(handle, 0, -1000);
    }
    await panel
      .getByRole("button", {
        name: "Resize robot panel bottom left",
        exact: true,
      })
      .focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await panel.evaluate((el) => el.contains(document.activeElement)),
      false,
      "keyboard focus is not trapped",
    );
    await clickOutside(
      page.getByRole("button", { name: "MetaTrader", exact: true }),
    );
    await page.waitForTimeout(350);
    assert(await panel.isVisible());
    await clickOutside(page.getByRole("button", { name: "Home", exact: true }));
    await page.waitForTimeout(350);
    // Resize/rotation clamps all bounds while the close button remains inside viewport.
    await page.setViewportSize({ width: 360, height: 420 });
    await page.waitForTimeout(200);
    const rotated = await panel.boundingBox();
    assert(
      rotated.x >= 0 &&
        rotated.y >= 0 &&
        rotated.x + rotated.width <= 360.1 &&
        rotated.y + rotated.height <= 420.1,
    );
    const close = await panel
      .getByRole("button", { name: "Close trading activity", exact: true })
      .boundingBox();
    assert(close.y >= 0 && close.y + close.height <= 420);
    let outsideZoom = 1;
    if (viewport.width < 500) {
      const points = (d) => [
        { x: 180 - d, y: 315, id: 1 },
        { x: 180 + d, y: 315, id: 2 },
      ];
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: points(70),
      });
      for (let i = 1; i <= 12; i++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: points(70 + i * 6),
        });
        await page.waitForTimeout(20);
      }
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await page.waitForTimeout(300);
      outsideZoom = await page.evaluate(() => visualViewport.scale);
      assert(
        outsideZoom > 1.05,
        "two touches outside the open panel must still zoom the page",
      );
    }
    assert.deepEqual(errors, []);
    results.push({
      outsideZoom,
      viewport,
      initial,
      persisted,
      rotated,
      startedOn,
      allEightHandles: true,
      pinch: viewport.width < 500,
      nonBlockingAllInterfaces: true,
      refresh: true,
      circleUnchanged: true,
    });
    await writeFile(
      `${output}/${viewport.width}-results.json`,
      JSON.stringify(results.at(-1), null, 2),
    );
    await context.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(
    "PASS: floating, draggable, eight resize handles, mobile pinch/scroll, persistence and viewport clamping.",
  );
} finally {
  await browser.close();
}
