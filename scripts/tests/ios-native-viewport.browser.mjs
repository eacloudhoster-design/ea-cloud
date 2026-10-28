import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const built = await build({ entryPoints: ["artifacts/ea-app/src/hooks/use-ios-standalone-zoom.ts"], bundle: true, platform: "browser", format: "esm", write: false });
const moduleUrl = "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64");
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
try {
  for (const width of [320, 375, 390, 393, 414, 430, 440]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
    await context.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
    const page = await context.newPage();
    await page.route("http://127.0.0.1/viewport-fixture", route => route.fulfill({ contentType: "text/html", body: '<meta name="viewport" content="width=device-width,initial-scale=.85,minimum-scale=.85,maximum-scale=.85,viewport-fit=cover"><style>html,body{margin:0}#app{width:100%;height:100vh}.panel{width:calc(100% - 32px);max-width:340px;height:84px;margin-inline:auto}</style><div id="app"><div class="panel"></div></div>' }));
    await page.goto("http://127.0.0.1/viewport-fixture");
    const before = await page.evaluate(() => ({ width: innerWidth, scale: visualViewport.scale }));
    assert(Math.abs(before.scale - .85) < .01, "Browser fixture actually starts downscaled");
    await page.evaluate(async url => { const { installIosStandaloneZoomGuard } = await import(url); window.cleanViewportTest = installIosStandaloneZoomGuard(); }, moduleUrl);
    await page.waitForFunction(width => Math.abs(innerWidth - width) <= 1 && Math.abs(visualViewport.width - width) <= 1 && Math.abs(visualViewport.scale - 1) < .001, width);
    const panel = await page.locator(".panel").boundingBox();
    assert(Math.abs(panel.width - Math.min(340, width - 32)) < 1);
    assert.equal(panel.height, 84, "Control dimensions are not inflated");
    await page.setViewportSize({ width, height: 500 });
    assert.equal(await page.evaluate(() => visualViewport.scale), 1, "Keyboard-sized resize cannot change scale");
    await context.close();
    console.log(`PASS: ${width}px native width restored from .85; panel dimensions preserved; keyboard scale stable`);
  }
} finally { await browser.close(); }
