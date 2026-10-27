import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5221";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
try {
  for (const device of [
    { name: "iOS PWA", ios: true, installed: true },
    { name: "Safari tab", ios: true, installed: false },
    { name: "Android PWA", ios: false, installed: true },
  ]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
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
    assert.equal(before.scale, 1);
    assert.equal(before.overflow, false);
    if (locked) assert.equal(before.touch, "pan-x pan-y");
    const canceled = await page.evaluate(() => ["gesturestart", "gesturechange", "touchmove", "pointermove"].map(type => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    }));
    assert.deepEqual(canceled, [locked, locked, false, false]);
    await page.locator('.get-app-field input[type="email"]').focus();
    await page.setViewportSize({ width: 390, height: 500 });
    const keyboard = await measure();
    assert.deepEqual(keyboard.font, before.font);
    assert.equal(keyboard.rootTransform, "none");
    assert.equal(keyboard.scale, 1);
    await page.setViewportSize({ width: 390, height: 844 });
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
      assert.deepEqual(reference, { viewport: 390, portrait: 230, heading: "40px", controlHeight: 58, controlFont: "16px", scale: 1, rootTransform: "none" });
      console.log("PASS: original S2tone reference geometry after startup: 230px portrait, 40px heading, 58px controls at 390px viewport and scale 1");
    }
    await context.close();
    console.log(`PASS: ${device.name}: viewport policy, fields, focus/resize, native-gesture guard and uncanceled pointer/touch events`);
  }
} finally { await browser.close(); }
