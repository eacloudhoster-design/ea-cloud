import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5186/ea-app/";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
await mkdir("work/matrix-colour", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
const near = (a, b, message) =>
  assert(Math.abs(a - b) < 1, `${message}: ${a} != ${b}`);
try {
  for (const viewport of [
    { width: 390, height: 844 },
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
    await page.goto(origin);
    await page.waitForSelector(".ea-startup", { state: "detached" });
    await page.evaluate(() => document.fonts.ready);
    const tab = async (name) => {
      await page.getByRole("button", { name, exact: true }).click();
      await page.waitForTimeout(350);
    };
    const accordion = async (name) => {
      const b = page.getByRole("button", { name, exact: true });
      if (await b.locator(".lucide-chevron-down").count()) await b.click();
    };
    const robot = page.getByRole("button", {
      name: "Open live trading activity",
      exact: true,
    });
    // Real touch gestures on mobile, mouse gestures on desktop. No position resets.
    const start = await robot.boundingBox();
    const root = await page.locator(".trading-activity-root").boundingBox();
    const target = {
      x: root.x + root.width * 0.8,
      y: root.y + root.height * 0.32,
    };
    if (viewport.width < 500) {
      const cdp = await context.newCDPSession(page);
      const from = {
        x: start.x + start.width / 2,
        y: start.y + start.height / 2,
      };
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ ...from, id: 1 }],
      });
      for (let i = 1; i <= 8; i++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: from.x + ((target.x - from.x) * i) / 8,
              y: from.y + ((target.y - from.y) * i) / 8,
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
      await cdp.detach();
    } else {
      await page.mouse.move(
        start.x + start.width / 2,
        start.y + start.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(target.x, target.y, { steps: 12 });
      await page.mouse.up();
    }
    await page.waitForTimeout(100);
    const position = await robot.boundingBox();
    assert(Math.abs(position.y - start.y) > 40);
    assert.equal(await page.getByRole("dialog").count(), 0);
    const savedPosition = await page.evaluate(() =>
      localStorage.getItem("ea-cloud:floating-robot-position"),
    );
    // Capture only opaque centre pixels of the robot image, excluding themed edges.
    const pictureHash = async () => {
      const b = await robot.boundingBox();
      return createHash("sha256")
        .update(
          await page.screenshot({
            clip: {
              x: Math.round(b.x + b.width / 2 - 10),
              y: Math.round(b.y + b.height / 2 - 10),
              width: 20,
              height: 20,
            },
          }),
        )
        .digest("hex");
    };
    const originalPicture = await pictureHash();
    const metrics = async () =>
      page.locator("[data-home-interface]").evaluate((root) => {
        const box = (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        return {
          title: box(root.querySelector('[data-bot-name="primary"]')),
          bar: box(root.querySelector("[data-matrix-functions]")),
          frame: box(root.querySelector("[data-robot-shape]")),
          header: box(
            root.querySelector("[data-home-swipe-surface]").firstElementChild,
          ),
          images: [...root.querySelectorAll("img")].map((el) => ({
            src: el.getAttribute("src"),
            filter: getComputedStyle(el).filter,
          })),
          font: getComputedStyle(
            root.querySelector('[data-bot-name="primary"]'),
          ).fontFamily,
        };
      });
    const original = await metrics();
    for (const [label, hex, rgb] of [
      ["Pure Red", "#ef4444", "rgb(239, 68, 68)"],
      ["Electric Blue", "#3b82f6", "rgb(59, 130, 246)"],
      ["Emerald Green", "#22c55e", "rgb(34, 197, 94)"],
      ["Royal Purple", "#a855f7", "rgb(168, 85, 247)"],
    ]) {
      await tab("Settings");
      await accordion("Select Colour");
      await page
        .getByRole("button", { name: label, exact: false })
        .click({ position: { x: 20, y: 20 } });
      assert.equal(
        await robot.evaluate((el) => getComputedStyle(el).borderTopColor),
        rgb,
        "Floating trigger updates while Settings is open",
      );
      await tab("Home");
      await page.evaluate(() =>
        document.getAnimations().forEach((a) => {
          if (a instanceof CSSTransition) a.finish();
          else {
            a.pause();
            a.currentTime = 0;
          }
        }),
      );
      const current = await metrics();
      assert.deepEqual(
        current,
        original,
        "Colour must not change layout, images, font or frame geometry",
      );
      const styled = await page
        .locator("[data-home-interface]")
        .evaluate((root) => {
          const bar = root.querySelector("[data-matrix-functions]"),
            active = bar.querySelectorAll("button")[1],
            frame = root.querySelector("[data-robot-shape]");
          return {
            activeBorder: getComputedStyle(active).borderTopColor,
            selectedDot: getComputedStyle(
              root.querySelectorAll(".opacity-30 > div")[2],
            ).backgroundColor,
            activeBackground: getComputedStyle(active).backgroundImage,
            barBorder: getComputedStyle(bar).borderTopColor,
            frameShadow: getComputedStyle(frame).boxShadow,
            ringBorders: [
              ...frame.parentElement.querySelectorAll(
                ":scope > .pointer-events-none",
              ),
            ].map((el) => getComputedStyle(el).borderTopColor),
            branding: getComputedStyle(
              [...root.querySelectorAll("span")].find(
                (el) => el.textContent === "EA Cloud",
              ),
            ).color,
          };
        });
      assert.equal(styled.activeBorder, rgb);
      assert.equal(styled.selectedDot, rgb);
      assert.equal(styled.branding, rgb);
      assert(
        styled.activeBackground.includes(rgb.slice(4, -1)) ||
          styled.activeBackground.includes("color(srgb"),
      );
      assert(styled.barBorder.includes(rgb.slice(4, -1)));
      assert(styled.ringBorders.every((c) => c.includes(rgb.slice(4, -1))));
      assert(styled.frameShadow.includes(rgb.slice(4, -1)));
      assert.notEqual(styled.frameShadow, "none");
      const trigger = await robot.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          border: s.borderTopColor,
          shadow: s.boxShadow,
          background: s.backgroundColor,
          image: el.querySelector("img").getAttribute("src"),
          filter: getComputedStyle(el.querySelector("img")).filter,
        };
      });
      assert.equal(trigger.border, rgb);
      assert.equal(trigger.image, "/fixture-robot.jpg");
      assert.equal(trigger.filter, "none");
      assert.equal(await pictureHash(), originalPicture);
      for (const key of ["x", "y", "width", "height"])
        near(
          (await robot.boundingBox())[key],
          position[key],
          "Robot position/size",
        );
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("ea-cloud:floating-robot-position"),
        ),
        savedPosition,
      );
      assert.equal(
        await page.evaluate(
          () =>
            JSON.parse(
              localStorage.getItem("ea-cloud:client:7:home-appearance"),
            ).accentColor,
        ),
        hex,
      );
      if (viewport.width === 390)
        await page.screenshot({
          path: `work/matrix-colour/${label.replaceAll(" ", "-").toLowerCase()}.png`,
        });
      results.push({
        viewport,
        hex,
        styled,
        trigger,
        layoutPreserved: true,
        imagePixelsUnchanged: true,
        positionPreserved: true,
      });
    }
    // Scope of the change: other interfaces keep their existing selected-colour logic.
    for (const [id, label] of [
      ["regular", "Regular Interface"],
      ["s2tone", "S2tone_"],
      ["matrix", "The Matrix Interface"],
    ]) {
      await tab("Settings");
      await accordion("Select Main Interface");
      await page.getByRole("button", { name: label, exact: false }).click();
      await tab("Home");
      assert.equal(
        await page
          .locator("[data-home-interface]")
          .getAttribute("data-home-interface"),
        id,
      );
      assert.equal(
        await robot.evaluate((el) => getComputedStyle(el).borderTopColor),
        "rgb(168, 85, 247)",
      );
      for (const key of ["x", "y", "width", "height"])
        near(
          (await robot.boundingBox())[key],
          position[key],
          "Position across layouts",
        );
    }
    await robot.click();
    await page.getByRole("dialog").waitFor();
    await page
      .getByRole("button", { name: "Close trading activity", exact: true })
      .click();
    await tab("MetaTrader");
    assert.equal(
      await robot.evaluate((el) => getComputedStyle(el).borderTopColor),
      "rgb(168, 85, 247)",
    );
    await tab("Home");
    await page.reload();
    await page.waitForSelector(".ea-startup", { state: "detached" });
    assert.equal(
      await robot.evaluate((el) => getComputedStyle(el).borderTopColor),
      "rgb(168, 85, 247)",
    );
    for (const key of ["x", "y", "width", "height"])
      near(
        (await robot.boundingBox())[key],
        position[key],
        "Position after reload",
      );
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(origin);
    await reopened.waitForSelector(".ea-startup", { state: "detached" });
    assert.equal(
      await reopened
        .locator(".trading-activity-trigger")
        .evaluate((el) => getComputedStyle(el).borderTopColor),
      "rgb(168, 85, 247)",
    );
    assert.equal(
      await reopened
        .locator("[data-matrix-functions] button")
        .nth(1)
        .evaluate((el) => getComputedStyle(el).borderTopColor),
      "rgb(168, 85, 247)",
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(
    "work/matrix-colour/results.json",
    JSON.stringify(
      {
        results,
        touchAndMouseDragging: true,
        clickFunctionPreserved: true,
        persistedOnReloadAndReopen: true,
        allInterfacesPreservePosition: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      colourViewportCombinations: results.length,
      passed: true,
    }),
  );
} finally {
  await browser.close();
}
