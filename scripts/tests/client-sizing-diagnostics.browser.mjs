import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5222";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
try {
  for (const width of [390, 460]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, screen: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      permissions: ["clipboard-read", "clipboard-write"], userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", { value: true });
      Object.defineProperty(window, "AudioContext", { value: undefined });
      Object.defineProperty(window, "webkitAudioContext", { value: undefined });
      localStorage.setItem("PRIVATE_STORAGE", "PRIVATE_STORAGE_VALUE");
      document.cookie = "sizing_fixture=PRIVATE_COOKIE_VALUE; path=/";
      localStorage.setItem("ea-cloud:client:7:home-appearance", JSON.stringify({ interfaceStyle: "matrix", accentColor: "#ef4444", showBg: true, backgroundAnimation: "none" }));
    });
    await context.routeWebSocket("**/api/ws?*", () => {});
    await context.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      const json = path.endsWith("/app/me") ? { id: 7, token: btoa("7:client:PRIVATE_TOKEN"), status: "approved", licenseKey: "PRIVATE_LICENSE" }
        : path.endsWith("/app/dashboard") ? { mentor: { id: 5, robotName: "PRIVATE_ACCOUNT_NAME", backgroundImageUrl: "/default-robot.jpg" }, eas: [] }
        : path.endsWith("/app/ea-mode-images") ? { eas: [{ id: 1, name: "PRIVATE_ACCOUNT_NAME", images: Array(4).fill("/default-robot.jpg") }] }
        : path.endsWith("/trading-controls") ? { copyingEnabled: false }
        : path.endsWith("/scanner/history") ? { records: [], hasMore: false } : [];
      return route.fulfill({ json });
    });
    let buildReads = 0;
    await context.route("**/build-info.json", route => {
      buildReads++;
      assert.equal(route.request().method(), "GET");
      assert.equal(route.request().headers().cookie, undefined);
      return route.fulfill({ json: { commit: "a5ca4509634d7d3255abaae33339d377773126a3", unexpectedSecret: "PRIVATE_BUILD_FIELD" } });
    });
    const page = await context.newPage();
    await page.goto(origin + "/ea-app/?private=PRIVATE_QUERY_VALUE");
    await page.locator(".ea-startup").waitFor({ state: "detached", timeout: 30000 });
    const observed = await page.evaluate(() => ({
      innerWidth, appWidth: Math.round(document.querySelector(".ea-app-viewport").getBoundingClientRect().width * 1000) / 1000,
      viewport: document.querySelector('meta[name="viewport"]').content,
      scale: Math.round(visualViewport.scale * 1000) / 1000,
    }));
    const geometry = () => page.locator("[data-matrix-functions]").boundingBox();
    const before = await geometry();
    await page.locator(".ea-glass-bar").getByRole("button", { name: "Settings", exact: true }).click();
    const trigger = page.getByRole("button", { name: "Client display diagnostics", exact: true });
    const titleStyle = await trigger.evaluate(el => ({ font: getComputedStyle(el).fontSize, parentFont: getComputedStyle(el.parentElement).fontSize, parentHeight: el.parentElement.getBoundingClientRect().height }));
    assert.equal(titleStyle.font, titleStyle.parentFont);
    assert.equal(titleStyle.parentHeight, 32, "Existing Settings heading geometry is unchanged");
    for (let i = 0; i < 6; i++) await trigger.click();
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.equal(buildReads, 0, "No diagnostic network request before opt-in");
    await trigger.click();
    await page.getByRole("dialog", { name: "Client display diagnostics" }).waitFor();
    await page.waitForFunction(() => document.querySelector("[data-client-sizing-report]")?.textContent.includes("a5ca4509634d7d3255abaae33339d377773126a3"));
    const text = await page.locator("[data-client-sizing-report]").textContent();
    assert.doesNotMatch(text, /PRIVATE_|private=|client:|email|password|license/i);
    const report = JSON.parse(text);
    assert.equal(report.screen.width, 390);
    assert.equal(report.window.innerWidth, observed.innerWidth);
    assert.equal(report.app.width, observed.appWidth);
    assert.equal(report.viewportMeta, observed.viewport);
    assert.equal(report.visualViewport.scale, observed.scale);
    assert.equal(report.matrixControls.width, 340);
    assert.equal(report.standalone, true);
    assert.equal(report.buildCommit, "a5ca4509634d7d3255abaae33339d377773126a3");
    assert(report.assets.every(name => /^index-[\w-]+\.js$/.test(name)));
    await page.getByRole("button", { name: "Copy report", exact: true }).click();
    await page.getByRole("button", { name: "Copied", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), text);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.locator(".ea-glass-bar").getByRole("button", { name: "Home", exact: true }).click();
    assert.deepEqual(await geometry(), before, "Diagnostic must not change control geometry");
    assert.equal(buildReads, 1);
    await context.close();
    console.log(`PASS: ${width}px: opt-in, viewport capture, secret exclusion, credential-free build read, copy/close and unchanged controls`);
  }
} finally { await browser.close(); }
