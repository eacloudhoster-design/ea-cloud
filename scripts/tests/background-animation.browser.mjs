import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5183/ea-app/";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
await mkdir("work/background-animation", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [],
  errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
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
  await context.route("**/api/**", (r) => {
    const p = new URL(r.request().url()).pathname;
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
              ? { copyingEnabled: true }
              : p === "/api/app/activity"
                ? { events: [] }
                : p === "/api/app/activity/snapshot"
                  ? { observedAt: Date.now(), symbols: [], connected: false }
                  : [],
    });
  });
  const boot = async () => {
    await page.goto(origin);
    await page.waitForSelector(".ea-startup", { state: "detached" });
  };
  const tab = async (name) => {
    await page.getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(350);
  };
  const accordion = async (name) => {
    const b = page.getByRole("button", { name, exact: true });
    if (await b.locator(".lucide-chevron-down").count()) await b.click();
  };
  const effect = page.locator("[data-background-effect]");
  await boot();
  for (const [layout, label] of [
    ["regular", "Regular Interface"],
    ["s2tone", "S2tone_"],
    ["matrix", "The Matrix Interface"],
  ]) {
    await tab("Settings");
    await accordion("Select Main Interface");
    await page.getByRole("button", { name: label, exact: false }).click();
    for (const [id, name] of [
      ["pulse", "Pulse"],
      ["glow", "Glow"],
      ["matrix", "Matrix Rain"],
      ["particles", "Particles"],
      ["none", "None"],
    ]) {
      await accordion("Back Animation");
      const option = page.getByRole("button", { name, exact: true });
      await option.click({ position: { x: 20, y: 20 } });
      assert.equal(await option.getAttribute("aria-pressed"), "true");
      assert.equal(
        await effect.count(),
        0,
        "Offscreen effect must be stopped while Settings is open",
      );
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("ea-cloud:client:7:home-appearance")),
      );
      assert.equal(saved.backgroundAnimation, id);
      await tab("Home");
      assert.equal(
        await page
          .locator("[data-home-interface]")
          .getAttribute("data-home-interface"),
        layout,
      );
      const bg = page.locator("[data-home-background]");
      assert(await bg.isVisible());
      assert.equal(await bg.getAttribute("src"), "/fixture-robot.jpg");
      assert.equal(await page.locator("[data-robot-shape]").count(), 1);
      if (id === "none") {
        assert.equal(await effect.count(), 0);
        await page.screenshot({
          path: `work/background-animation/${layout}-none.png`,
        });
      } else {
        assert.equal(await effect.count(), 1);
        assert.equal(await effect.getAttribute("data-background-effect"), id);
        assert.equal(
          await effect.evaluate((el) => getComputedStyle(el).pointerEvents),
          "none",
        );
        assert.equal(
          await effect.evaluate((el) => getComputedStyle(el).zIndex),
          "1",
        );
        // Pause unrelated decorative animations so screenshot differences demonstrate THIS effect.
        await page.evaluate(() =>
          document.getAnimations().forEach((a) => {
            if (!a.effect?.target?.closest?.("[data-background-effect]"))
              a.pause();
          }),
        );
        const state = () =>
          effect.evaluate((el) =>
            [...el.querySelectorAll("*")].map((n) => ({
              transform: getComputedStyle(n).transform,
              opacity: getComputedStyle(n).opacity,
            })),
          );
        const before = await state();
        const a = await page.screenshot({
          path: `work/background-animation/${layout}-${id}-a.png`,
        });
        await page.waitForTimeout(700);
        const after = await state();
        const b = await page.screenshot({
          path: `work/background-animation/${layout}-${id}-b.png`,
        });
        assert.notDeepEqual(
          before,
          after,
          "Effect styles must advance over time",
        );
        assert.notEqual(
          createHash("sha256").update(a).digest("hex"),
          createHash("sha256").update(b).digest("hex"),
          "Actual application frames must differ",
        );
        assert(
          await effect.evaluate((el) =>
            el
              .getAnimations({ subtree: true })
              .every((a) => a.playState === "running"),
          ),
        );
        results.push({
          layout,
          effect: id,
          frameChanged: true,
          exclusiveLayer: true,
          backgroundAndShapePreserved: true,
        });
      }
      if (id === "particles") {
        const control =
          layout === "regular"
            ? page
                .getByText("SYMBOLS", { exact: true })
                .locator("..")
                .locator("button")
            : page.getByRole("button", {
                name: layout === "matrix" ? "QUOTES" : "Symbols",
                exact: true,
              });
        await control.click();
        await page
          .getByRole("button", { name: "SELECTED SYMBOLS", exact: true })
          .waitFor();
        await page.locator("button:has(.lucide-chevron-left)").click();
        const robot = page.getByRole("button", {
          name: "Open live trading activity",
          exact: true,
        });
        const box = await robot.boundingBox();
        const cdp = await context.newCDPSession(page);
        const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ ...start, id: 1 }],
        });
        for (let i = 1; i <= 6; i++)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
              {
                x: start.x + ((330 - start.x) * i) / 6,
                y:
                  start.y +
                  (((layout === "regular"
                    ? 100
                    : layout === "s2tone"
                      ? 190
                      : 280) -
                    start.y) *
                    i) /
                    6,
                id: 1,
              },
            ],
          });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await page.waitForTimeout(80);
        assert(Math.abs((await robot.boundingBox()).y - box.y) > 20);
        assert.equal(await page.getByRole("dialog").count(), 0);
        await robot.click();
        await page.getByRole("dialog").waitFor();
        await page
          .getByRole("button", { name: "Close trading activity", exact: true })
          .click();
        await cdp.detach();
      }
      // Real scrolling passes through the animation layer.
      await page.setViewportSize({ width: 390, height: 568 });
      const scroller = page.locator("[data-home-swipe-surface]");
      await scroller.hover();
      await page.mouse.wheel(0, 250);
      await page.waitForTimeout(100);
      assert((await scroller.evaluate((el) => el.scrollTop)) > 0);
      await scroller.evaluate((el) => (el.scrollTop = 0));
      await page.setViewportSize({ width: 390, height: 844 });
      await tab("Settings");
    }
  }
  // Colour changes use the existing theme selection immediately.
  await accordion("Back Animation");
  await page
    .getByRole("button", { name: "Matrix Rain", exact: true })
    .click({ position: { x: 20, y: 20 } });
  await accordion("Select Colour");
  await page
    .getByRole("button", { name: "Electric Blue", exact: false })
    .click();
  await tab("Home");
  assert.equal(
    await effect.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--back-color").trim(),
    ),
    "#3b82f6",
  );
  // Reload reuses existing account-scoped settings.
  await page.reload();
  await page.waitForSelector(".ea-startup", { state: "detached" });
  assert.equal(await effect.getAttribute("data-background-effect"), "matrix");
  await tab("MetaTrader");
  assert.equal(await effect.count(), 0);
  await tab("Home");
  assert.equal(await effect.count(), 1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await effect.waitFor({ state: "detached" });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await effect.waitFor();
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await effect.locator(".ea-back-stream:visible").count(), 12);
  await page.setViewportSize({ width: 1024, height: 900 });
  assert.equal(await effect.locator(".ea-back-stream:visible").count(), 18);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await effect.waitFor({ state: "detached" });
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await effect.waitFor();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(origin);
  await reopened.waitForSelector(".ea-startup", { state: "detached" });
  assert.equal(
    await reopened
      .locator("[data-background-effect]")
      .getAttribute("data-background-effect"),
    "matrix",
  );
  await reopened.close();
  assert.deepEqual(errors, []);
  await writeFile(
    "work/background-animation/results.json",
    JSON.stringify(
      {
        results,
        themeUpdated: true,
        reloadPersisted: true,
        reopenPersisted: true,
        hiddenDocumentStopsEffects: true,
        tabsStopInactiveEffects: true,
        reducedMotionHonored: true,
        responsiveDensity: true,
        touchDraggingAndControls: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ tested: results.length, errors }, null, 2));
} finally {
  await browser.close();
}
