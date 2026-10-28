import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5221";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
try {
  for (const device of [
    { name: "iOS PWA", ios: true, installed: true },
    { name: "wide iOS PWA", ios: true, installed: true, width: 460 },
    { name: "Safari tab", ios: true, installed: false },
    { name: "Android PWA", ios: false, installed: true },
  ].filter(device => !process.env.SIZING_WIDE_ONLY || device.width)) {
    const deviceWidth = device.width || 390;
    const context = await browser.newContext({ viewport: { width: deviceWidth, height: 844 }, isMobile: true, hasTouch: true,
      userAgent: device.ios ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" : "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36" });
    await context.addInitScript(installed => Object.defineProperty(navigator, "standalone", { value: installed }), device.installed);
    const page = await context.newPage();
    let signedIn = false;
    await page.route("**/api/**", route => {
      if (!signedIn) return route.fulfill({ status: 401, json: { error: "Unauthorized" } });
      const path = new URL(route.request().url()).pathname;
      const image = "/default-robot.jpg";
      const json = path.endsWith("/app/me") ? { id: 7, token: btoa("7:client:cookie"), status: "approved", licenseKey: "FIXTURE" }
        : path.endsWith("/app/dashboard") ? { mentor: { id: 5, robotName: "EA CLOUD PRO", backgroundImageUrl: image }, eas: [] }
        : path.endsWith("/app/ea-mode-images") ? { eas: [{ id: 1, name: "EA CLOUD PRO", images: Array(4).fill(image) }] }
        : path.endsWith("/trading-controls") ? { copyingEnabled: false }
        : path.endsWith("/scanner/history") ? { records: [], hasMore: false } : [];
      return route.fulfill({ json });
    });
    await context.routeWebSocket("**/api/ws?*", () => {});
    await page.goto(origin + "/ea-app/");
    await page.locator(".get-app-field input").first().waitFor();
    const locked = device.ios && device.installed;
    const measure = () => page.evaluate(() => ({
      guarded: document.documentElement.hasAttribute("data-ea-ios-standalone-zoom"),
      viewport: document.querySelector('meta[name="viewport"]').content,
      touch: getComputedStyle(document.documentElement).touchAction,
      font: [...document.querySelectorAll(".get-app-field input")].map(input => getComputedStyle(input).fontSize),
      rootTransform: getComputedStyle(document.querySelector("#root")).transform,
      scale: visualViewport.scale,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    const before = await measure();
    assert.equal(before.guarded, locked, device.name);
    assert.equal(before.viewport.includes("maximum-scale=1"), locked);
    assert.equal(before.viewport.includes("user-scalable=no"), locked);
    assert(before.font.every(font => font === "16px"));
    assert.equal(before.rootTransform, "none");
    const expectedScale = 1;
    assert(Math.abs(before.scale - expectedScale) < 0.005);
    assert.equal(before.overflow, false);
    if (locked) assert.equal(before.touch, "pan-x pan-y");
    const canceled = await page.evaluate(() => ["gesturestart", "gesturechange", "touchmove", "pointermove"].map(type => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    }));
    assert.deepEqual(canceled, [locked, locked, false, false]);
    await page.locator('.get-app-field input[type="email"]').focus();
    await page.setViewportSize({ width: deviceWidth, height: 500 });
    const keyboard = await measure();
    assert.deepEqual(keyboard.font, before.font);
    assert.equal(keyboard.rootTransform, "none");
    assert(Math.abs(keyboard.scale - expectedScale) < 0.005);
    await page.setViewportSize({ width: deviceWidth, height: 844 });
    await page.getByRole("button", { name: /sign in/i }).last().click();
    assert((await measure()).font.every(font => font === "16px"));
    if (locked) {
      signedIn = true;
      await page.evaluate(() => localStorage.setItem("ea-cloud:client:7:home-appearance", JSON.stringify({ interfaceStyle: "s2tone", accentColor: "#ff0000", showBg: true, backgroundAnimation: "none" })));
      await page.reload();
      await page.locator(".ea-startup").waitFor({ state: "detached", timeout: 30000 });
      assert.equal(await page.locator("[data-home-interface]").getAttribute("data-home-interface"), "s2tone");
      const reference = await page.evaluate(() => ({
        viewport: document.querySelector(".ea-app-viewport").getBoundingClientRect().width,
        portrait: document.querySelector("[data-portrait-interactive]").getBoundingClientRect().width,
        heading: getComputedStyle(document.querySelector('[data-bot-name="primary"]')).fontSize,
        controlHeight: document.querySelector(".s2tone-action-button").getBoundingClientRect().height,
        controlFont: getComputedStyle(document.querySelector(".s2tone-action-button span")).fontSize,
        scale: visualViewport.scale,
        rootTransform: getComputedStyle(document.querySelector(".ea-app-viewport")).transform,
      }));
      assert(Math.abs(reference.viewport - deviceWidth) <= 1);
      assert(Math.abs(reference.scale - expectedScale) < 0.005);
      assert.deepEqual({ ...reference, viewport: deviceWidth, scale: 1 }, { viewport: deviceWidth, portrait: 230, heading: "40px", controlHeight: 58, controlFont: "16px", scale: 1, rootTransform: "none" });
      console.log("PASS: S2tone retains October 26 dimensions without changing the native viewport width");
      await page.evaluate(() => {
        const key = "ea-cloud:client:7:home-appearance";
        localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), interfaceStyle: "matrix" }));
      });
      await page.reload();
      await page.locator(".ea-startup").waitFor({ state: "detached", timeout: 30000 });
      const portrait = page.locator("[data-portrait-interactive]");
      const controlBounds = await page.locator("[data-matrix-functions]").boundingBox();
      await portrait.focus();
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => {
        const portrait = document.querySelector("[data-portrait-interactive]");
        const branding = document.querySelector("[data-matrix-branding]");
        const controls = document.querySelector("[data-matrix-functions]");
        return portrait.getAttribute("data-hidden") === "true" && portrait.getBoundingClientRect().height > 259 && branding.getBoundingClientRect().top > controls.getBoundingClientRect().bottom;
      });
      assert.deepEqual(await page.locator("[data-matrix-functions]").boundingBox(), controlBounds, "Hiding the shape must not move the control panel");
      await portrait.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => {
        const portrait = document.querySelector("[data-portrait-interactive]");
        return portrait.getBoundingClientRect().height > 259 && document.querySelector("[data-matrix-branding]").getBoundingClientRect().bottom < document.querySelector("[data-matrix-functions]").getBoundingClientRect().top;
      });
      assert.deepEqual(await page.locator("[data-matrix-functions]").boundingBox(), controlBounds, "Restoring the shape must not move the control panel");
      console.log("PASS: Matrix controls stay fixed; only branding moves below/above controls when hiding/restoring the shape");
      if (deviceWidth > 390) {
        const nav = page.locator(".ea-glass-bar");
        for (const [mode, label] of [["regular", "Regular Interface"], ["matrix", "The Matrix Interface"], ["s2tone", "S2tone_"], ["lumo", "Lumo"]]) {
          await nav.getByRole("button", { name: "Settings", exact: true }).click();
          const option = page.getByRole("button", { name: label, exact: false });
          if (!(await option.isVisible())) await page.getByRole("button", { name: "Select Main Interface", exact: true }).click();
          await option.click();
          await nav.getByRole("button", { name: "Home", exact: true }).click();
          await page.locator(`[data-home-interface="${mode}"]`).waitFor();
          const width = await page.locator(".ea-app-viewport").evaluate(el => el.getBoundingClientRect().width);
          assert(Math.abs(width - deviceWidth) <= 1, `${mode}: native device width`);
          if (mode === "matrix") {
            const fraction = await page.locator("[data-matrix-functions]").evaluate(el => el.getBoundingClientRect().width / visualViewport.width);
            assert(Math.abs(fraction - 340 / deviceWidth) < 0.01, "Matrix panel keeps its October 26 dimensions");
          }
        }
        console.log("PASS: all four interfaces preserve device width; no inferred scaling");
        const trigger = page.locator(".trading-activity-trigger");
        const dragBefore = await trigger.boundingBox();
        await page.mouse.move(dragBefore.x + dragBefore.width / 2, dragBefore.y + dragBefore.height / 2);
        await page.mouse.down();
        await page.mouse.move(dragBefore.x + dragBefore.width / 2 - 35, dragBefore.y + dragBefore.height / 2 - 35, { steps: 10 });
        await page.mouse.up();
        await page.waitForFunction(before => document.querySelector(".trading-activity-trigger").getBoundingClientRect().x < before - 20, dragBefore.x);
        console.log("PASS: floating control remains draggable in the native viewport");
        await page.evaluate(() => Object.defineProperty(window, "orientation", { value: 90, configurable: true }));
        await page.setViewportSize({ width: 844, height: deviceWidth });
        await page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));
        await page.waitForFunction(() => document.querySelector('meta[name="viewport"]').content.includes("width=device-width"));
        assert(Math.abs(await page.locator(".ea-app-viewport").evaluate(el => el.getBoundingClientRect().width) - 844) <= 1);
        await page.evaluate(() => Object.defineProperty(window, "orientation", { value: 0, configurable: true }));
        await page.setViewportSize({ width: deviceWidth, height: 844 });
        await page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));
        await page.waitForFunction(width => Math.abs(document.querySelector(".ea-app-viewport").getBoundingClientRect().width - width) <= 1, deviceWidth);
        console.log("PASS: rotation keeps native fullscreen dimensions in both orientations");
      }
    }
    await context.close();
    console.log(`PASS: ${device.name}: viewport policy, fields, focus/resize, native-gesture guard and uncanceled pointer/touch events`);
  }
} finally { await browser.close(); }
