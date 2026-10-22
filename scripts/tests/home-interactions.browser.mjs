// Actual app, CDP touch input and isolated local API fixtures. No production writes.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const origin = process.env.HOME_ORIGIN || "http://127.0.0.1:5180";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
mkdirSync("work/home-interactions", { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = [];
const writes = [];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 800 },
    { width: 1280, height: 900 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: viewport.width < 500,
      hasTouch: viewport.width < 500,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.routeWebSocket("**/api/ws?*", (socket) =>
      socket.onMessage(() => {}),
    );
    await context.addInitScript(() => {
      if (!localStorage.getItem("appClientToken"))
        localStorage.setItem(
          "appClientToken",
          btoa("7:client:isolated-home-test"),
        );
    });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      // Use only the locally served app and isolated API fixtures.
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/_fixture/mentor.jpg")
        return route.fulfill({
          contentType: "image/jpeg",
          body: readFileSync("artifacts/ea-cloud/public/default-robot.jpg"),
        });
      if (!url.pathname.startsWith("/api/")) return route.continue();
      let data = {};
      if (
        url.pathname === "/api/app/trading-controls" &&
        route.request().method() === "PATCH"
      ) {
        writes.push(JSON.parse(route.request().postData()));
        return route.fulfill({ json: { ok: true } });
      }
      if (url.pathname === "/api/app/symbol-configs") data = [];
      if (url.pathname === "/api/app/me")
        data = { status: "approved", licenseKey: "ISOLATED" };
      if (url.pathname === "/api/app/dashboard")
        data = {
          mentor: {
            robotName: "SMC BLUEPRINT EA V3+",
            backgroundImageUrl: "/_fixture/mentor.jpg",
          },
          eas: [],
        };
      if (url.pathname === "/api/app/trading-controls")
        data = { mt5Connected: false, copyingEnabled: false };
      if (url.pathname === "/api/app/executions") data = [];
      if (url.pathname === "/api/app/activity") data = { events: [] };
      if (url.pathname === "/api/app/activity/snapshot")
        data = {
          observedAt: Date.now(),
          engine: false,
          robotEnabled: false,
          connected: false,
          tradeAllowed: false,
          account: null,
          symbols: [],
        };
      return route.fulfill({ json: data });
    });
    await page.goto(origin + "/ea-app/");
    await page.locator('[data-bot-name="primary"]').waitFor();
    await page.locator(".ea-startup").waitFor({ state: "detached" });
    const client = await context.newCDPSession(page);
    const settings = async () => {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
    };
    await page.evaluate(() => {
      window.__homeAnimations = [];
      document.addEventListener("animationstart", (event) => {
        if (event.animationName.startsWith("ea-home-slide"))
          window.__homeAnimations.push({
            name: event.animationName,
            duration: getComputedStyle(event.target).animationDuration,
          });
      });
    });
    assert.equal(
      await page
        .locator("[data-home-background]")
        .evaluate((el) => getComputedStyle(el).transitionDuration),
      "0.25s",
    );
    const style = () =>
      page.locator("[data-home-interface]").getAttribute("data-home-interface");
    const surface = page.locator("[data-home-swipe-surface]");
    const select = async (label) => {
      await settings();
      if (!(await page.getByText(label, { exact: true }).isVisible()))
        await page
          .getByRole("button", { name: "Select Main Interface", exact: true })
          .click();
      await page
        .getByRole("button")
        .filter({ has: page.getByText(label, { exact: true }) })
        .click();
      await page.getByRole("button", { name: "Home", exact: true }).click();
      await page.waitForTimeout(400);
    };
    const touch = async (x, y, dx, dy) => {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 1 }],
      });
      for (let step = 1; step <= 6; step++) {
        await client.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: x + (dx * step) / 6, y: y + (dy * step) / 6, id: 1 },
          ],
        });
        await page.waitForTimeout(16);
      }
      await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await page.waitForTimeout(300);
    };
    const swipe = async (direction) => {
      await surface.evaluate((el) => (el.scrollTop = 0));
      const rect = await surface.boundingBox();
      await touch(
        direction === "next" ? rect.x + rect.width - 40 : rect.x + 40,
        180,
        direction === "next" ? -(rect.width - 80) : rect.width - 80,
        0,
      );
    };
    await select("Regular Interface");
    for (const expected of ["matrix", "s2tone", "regular", "matrix"]) {
      await swipe("next");
      assert.equal(await style(), expected);
    }
    for (const expected of ["regular", "s2tone", "matrix"]) {
      await swipe("previous");
      assert.equal(await style(), expected);
    }
    await settings();
    assert.equal(
      await page
        .getByRole("button")
        .filter({
          has: page.getByText("The Matrix Interface", { exact: true }),
        })
        .locator("svg.lucide-check")
        .count(),
      1,
    );
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.waitForTimeout(400);
    // Settings selection becomes the starting point for the next swipe.
    await select("S2tone_");
    await swipe("next");
    assert.equal(await style(), "regular");
    await select("S2tone_");
    const rect = await surface.boundingBox();
    await surface.evaluate((el) => (el.scrollTop = 0));
    await touch(rect.x + rect.width - 35, 220, 2, -150);
    assert.equal(await style(), "s2tone");
    const scrolling = await surface.evaluate((el) => ({
      top: el.scrollTop,
      height: el.clientHeight,
      content: el.scrollHeight,
    }));
    if (scrolling.content > scrolling.height)
      assert.ok(scrolling.top > 0, JSON.stringify({ viewport, scrolling }));
    await surface.evaluate((el) => (el.scrollTop = 0));
    await touch(rect.x + rect.width - 40, 180, -40, 0);
    assert.equal(await style(), "s2tone");
    // Swipe beginning on a control must not change layout.
    const remove = page.getByRole("button", { name: "Remove", exact: true });
    await remove.scrollIntoViewIfNeeded();
    const removeBox = await remove.boundingBox();
    await touch(
      removeBox.x + removeBox.width / 2,
      removeBox.y + removeBox.height / 2,
      -90,
      0,
    );
    assert.equal(await style(), "s2tone");
    if (
      await page
        .getByRole("button", { name: "Cancel", exact: true })
        .isVisible()
    )
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    // Mouse dragging is deliberately not a touchscreen navigation gesture.
    await surface.evaluate((el) => (el.scrollTop = 0));
    await page.mouse.move(rect.x + rect.width - 40, 180);
    await page.mouse.down();
    await page.mouse.move(rect.x + 40, 180, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    assert.equal(await style(), "s2tone");
    // Cancellation and multiple fingers must not complete a navigation gesture.
    await surface.evaluate((el) => (el.scrollTop = 0));
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: rect.x + rect.width - 50, y: 180, id: 1 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: rect.x + 50, y: 180, id: 1 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await page.waitForTimeout(300);
    assert.equal(await style(), "s2tone");
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: rect.x + rect.width - 50, y: 180, id: 1 },
        { x: rect.x + rect.width - 80, y: 220, id: 2 },
      ],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: rect.x + rect.width - 150, y: 180, id: 1 },
        { x: rect.x + rect.width - 180, y: 220, id: 2 },
      ],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(300);
    assert.equal(await style(), "s2tone");
    // No swipe while Settings or a Home sheet is open.
    await settings();
    await touch(rect.x + rect.width - 40, 180, -150, 0);
    assert.equal(await style(), "s2tone");
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Symbols", exact: true }).click();
    await page.getByText("SELECTED SYMBOLS", { exact: true }).waitFor();
    await touch(rect.x + rect.width - 40, 180, -150, 0);
    assert.equal(await style(), "s2tone");
    await page
      .getByRole("heading", {
        name: "SMC BLUEPRINT EA V3+",
        level: 2,
        exact: true,
      })
      .locator("..")
      .getByRole("button")
      .click();

    for (const [layout, label] of [
      ["regular", "Regular Interface"],
      ["matrix", "The Matrix Interface"],
      ["s2tone", "S2tone_"],
    ]) {
      await select(label);
      const title = page.locator('[data-bot-name="primary"]');
      await title.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      const visual = () =>
        title.evaluate((el) => {
          const r = el.getBoundingClientRect(),
            s = getComputedStyle(el);
          return {
            text: el.textContent,
            font: s.fontFamily,
            size: s.fontSize,
            weight: s.fontWeight,
            colour: s.color,
            align: s.textAlign,
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
          };
        });
      const original = await visual();
      const images = () =>
        page.locator("[data-home-interface] img").evaluateAll((elements) =>
          elements.map((el) => ({
            src: el.getAttribute("src"),
            opacity: getComputedStyle(el).opacity,
            display: getComputedStyle(el).display,
          })),
        );
      const profiles = await images();
      for (let repeat = 0; repeat < 2; repeat++) {
        const nameButton = page.getByRole("button", {
          name: "Hide background image",
          exact: true,
        });
        if (viewport.width < 500) await nameButton.tap();
        else await nameButton.click();
        await page.waitForTimeout(300);
        assert.equal(
          await page
            .locator("[data-home-background]")
            .evaluate((el) => getComputedStyle(el).opacity),
          "0",
        );
        assert.deepEqual(
          await visual(),
          original,
          "Bot name geometry/typography changed",
        );
        assert.deepEqual(
          await images(),
          profiles,
          "Avatar or other Home images changed",
        );
        assert.equal(await style(), layout);
        if (viewport.width === 390 && repeat === 0)
          await page.screenshot({
            path: "work/home-interactions/" + layout + "-background-hidden.png",
          });
        await page
          .getByRole("button", { name: "Show background image", exact: true })
          .click();
        await page.waitForTimeout(300);
        assert.equal(
          await page
            .locator("[data-home-background]")
            .evaluate((el) => getComputedStyle(el).opacity),
          "1",
        );
        assert.deepEqual(await visual(), original);
      }
      const action = (name) =>
        layout === "regular"
          ? page
              .getByText(name.toUpperCase(), { exact: true })
              .locator("..")
              .getByRole("button")
          : page.getByRole("button", {
              name: new RegExp("^" + name + "$", "i"),
            });
      const writeCount = writes.length;
      await action("Start").click();
      await page.waitForTimeout(100);
      assert.equal(writes.length, writeCount + 1);
      assert.deepEqual(writes.at(-1), { copyingEnabled: true });
      await action("Stop").click();
      await page.waitForTimeout(100);
      assert.deepEqual(writes.at(-1), { copyingEnabled: false });
      await action("Remove").click();
      await page
        .getByRole("heading", { name: "Remove EA?", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await action(layout === "matrix" ? "Quotes" : "Symbols").click();
      await page.getByText("SELECTED SYMBOLS", { exact: true }).waitFor();
      await page
        .getByRole("heading", {
          name: "SMC BLUEPRINT EA V3+",
          level: 2,
          exact: true,
        })
        .locator("..")
        .getByRole("button")
        .click();
      // Keyboard activation is supported without an extra visible button.
      await page
        .getByRole("button", { name: "Hide background image", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      assert.equal(
        await page
          .locator("[data-home-background]")
          .evaluate((el) => getComputedStyle(el).opacity),
        "0",
      );
      await page
        .getByRole("button", { name: "Show background image", exact: true })
        .click();
      await page.waitForTimeout(300);
      results.push({
        viewport,
        layout,
        name: original,
        profileImages: profiles,
        scrolling,
        swipes:
          "cycle, reverse, threshold, vertical scrolling, controls and overlays passed",
      });
    }
    const animations = await page.evaluate(() => window.__homeAnimations);
    assert.ok(animations.some((a) => a.name === "ea-home-slide-next"));
    assert.ok(animations.some((a) => a.name === "ea-home-slide-previous"));
    assert.ok(animations.every((a) => a.duration === "0.25s"));
    // Hidden preference survives layout changes, reload, reopening and account switches.
    await page
      .getByRole("button", { name: "Hide background image", exact: true })
      .click();
    await page.waitForTimeout(300);
    await select("Regular Interface");
    assert.equal(
      await page
        .locator("[data-home-background]")
        .evaluate((el) => getComputedStyle(el).opacity),
      "0",
    );
    await page.reload();
    await page.locator(".ea-startup").waitFor({ state: "detached" });
    assert.equal(await style(), "regular");
    assert.equal(
      await page
        .locator("[data-home-background]")
        .evaluate((el) => getComputedStyle(el).opacity),
      "0",
    );
    const reopened = await context.newPage();
    await reopened.goto(origin + "/ea-app/");
    await reopened.locator(".ea-startup").waitFor({ state: "detached" });
    assert.equal(
      await reopened
        .locator("[data-home-interface]")
        .getAttribute("data-home-interface"),
      "regular",
    );
    assert.equal(
      await reopened
        .locator("[data-home-background]")
        .evaluate((el) => getComputedStyle(el).opacity),
      "0",
    );
    await reopened.close();
    await page.evaluate(() =>
      localStorage.setItem(
        "appClientToken",
        btoa("8:client:isolated-home-test"),
      ),
    );
    await page.reload();
    await page.locator(".ea-startup").waitFor({ state: "detached" });
    assert.equal(await style(), "matrix");
    assert.equal(
      await page
        .locator("[data-home-background]")
        .evaluate((el) => getComputedStyle(el).opacity),
      "1",
    );
    await page.evaluate(() =>
      localStorage.setItem(
        "appClientToken",
        btoa("7:client:isolated-home-test"),
      ),
    );
    await page.reload();
    await page.locator(".ea-startup").waitFor({ state: "detached" });
    assert.equal(await style(), "regular");
    assert.equal(
      await page
        .locator("[data-home-background]")
        .evaluate((el) => getComputedStyle(el).opacity),
      "0",
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
  writeFileSync(
    "work/home-interactions/browser-results.json",
    JSON.stringify({ results, writes }, null, 2),
  );
  console.log(
    "Home touch swipes, scrolling/control exclusions, all name toggles, geometry/profile preservation and account-scoped persistence passed.",
  );
} finally {
  await browser.close();
}
