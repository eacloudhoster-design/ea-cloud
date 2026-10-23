import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5206";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/iphone-navigation-position";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
const cases = [
  ...["regular", "s2tone", "matrix"].map((style) => ({
    style,
    width: 393,
    height: 852,
    top: 59,
    bottom: 34,
    simulate: true,
    interactions: true,
  })),
  {
    style: "regular",
    width: 375,
    height: 667,
    top: 20,
    bottom: 0,
    simulate: true,
  },
  {
    style: "matrix",
    width: 390,
    height: 844,
    top: 44,
    bottom: 34,
    simulate: true,
  },
  {
    style: "s2tone",
    width: 430,
    height: 932,
    top: 59,
    bottom: 34,
    simulate: true,
  },
  {
    style: "regular",
    width: 440,
    height: 956,
    top: 62,
    bottom: 34,
    simulate: true,
  },
  {
    style: "matrix",
    width: 393,
    height: 852,
    top: 59,
    bottom: 21,
    simulate: true,
  },
  {
    style: "s2tone",
    width: 844,
    height: 390,
    bottom: 21,
    left: 44,
    right: 44,
    simulate: true,
  },
  { style: "regular", width: 1280, height: 900, bottom: 0, simulate: false },
  { style: "regular", width: 390, height: 844, bottom: 34, simulate: false },
  { style: "matrix", width: 393, height: 852, bottom: 34, simulate: false },
];
async function setup(context, style) {
  await context.addInitScript((style) => {
    localStorage.setItem("appClientToken", btoa("7:client:fixture"));
    localStorage.setItem(
      "ea-cloud:client:7:home-appearance",
      JSON.stringify({
        interfaceStyle: style,
        showBg: true,
        backgroundAnimation: "none",
        accentColor: "#3b82f6",
      }),
    );
    localStorage.setItem(
      "ea-cloud:floating-robot-position",
      JSON.stringify({ x: 10, y: 80 }),
    );
  }, style);
  await context.routeWebSocket("**/api/ws?*", () => {});
  await context.route("https://fonts.**", (r) => r.abort());
  await context.route("**/fixture-robot.jpg", (r) =>
    r.fulfill({
      path: "artifacts/ea-cloud/public/default-robot.jpg",
      contentType: "image/jpeg",
    }),
  );
  await context.route("**/api/**", (r) => {
    assert.equal(r.request().method(), "GET");
    const p = new URL(r.request().url()).pathname;
    return r.fulfill({
      json: p.endsWith("/me")
        ? { status: "approved", licenseKey: "fixture" }
        : p.endsWith("/dashboard")
          ? {
              mentor: {
                robotName: "SMC BLUEPRINT EA V3+",
                backgroundImageUrl: "/fixture-robot.jpg",
              },
              eas: [],
            }
          : p.endsWith("/trading-controls")
            ? { copyingEnabled: false }
            : p.endsWith("/activity")
              ? { events: [] }
              : p.endsWith("/activity/snapshot")
                ? {
                    observedAt: Date.now(),
                    connected: false,
                    engine: false,
                    robotEnabled: false,
                    tradeAllowed: false,
                    account: null,
                    symbols: [],
                  }
                : [],
    });
  });
}
async function snapshot(page) {
  return page.evaluate(() => {
    const rect = (e) => {
      const r = e.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        bottom: r.bottom,
      };
    };
    const skin = (e) => {
      const s = getComputedStyle(e);
      return Object.fromEntries(
        [
          "height",
          "background",
          "border",
          "borderRadius",
          "boxShadow",
          "backdropFilter",
          "padding",
          "fontSize",
          "fontWeight",
          "color",
          "gap",
        ].map((k) => [k, s[k]]),
      );
    };
    const bar = document.querySelector(".ea-glass-bar");
    return {
      bar: rect(bar),
      skin: skin(bar),
      indicator: skin(document.querySelector(".ea-glass-indicator")),
      buttons: [...bar.querySelectorAll("button")].map((e) => ({
        rect: rect(e),
        skin: skin(e),
        icon: skin(e.querySelector("svg")),
        label: skin(e.querySelector("span")),
      })),
      foreground: [
        ...document
          .querySelector("[data-home-interface]")
          .querySelectorAll(
            "button,img,span,p,.ea-bot-name-primary,[data-matrix-branding]",
          ),
        document.querySelector(".trading-activity-trigger"),
        document.querySelector("[data-home-background]"),
      ].map((e) => ({ text: e.textContent, rect: rect(e) })),
    };
  });
}
try {
  for (const test of cases) {
    const context = await browser.newContext({
      viewport: { width: test.width, height: test.height },
      isMobile: test.width < 1000,
      hasTouch: true,
    });
    await setup(context, test.style);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: {
        top: test.top || 0,
        bottom: test.bottom,
        left: test.left || 0,
        right: test.right || 0,
      },
    });
    await page.goto(origin + "/ea-app/");
    await page.locator(".ea-startup").waitFor({ state: "detached" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const rule = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const support of rules) {
          if (
            support instanceof CSSSupportsRule &&
            support.conditionText.includes("-webkit-touch-callout")
          )
            for (const media of support.cssRules)
              if (
                media instanceof CSSMediaRule &&
                media.conditionText.includes("display-mode")
              )
                return {
                  support: support.conditionText,
                  media: media.conditionText,
                  css: [...media.cssRules].map((r) => r.cssText).join("\n"),
                };
        }
      }
    });
    assert(rule);
    assert.match(rule.media, /display-mode:\s*standalone/);
    assert.match(rule.media, /max-width:\s*440px/);
    assert.match(rule.support, /-webkit-touch-callout:\s*none/);
    assert.equal(
      await page.evaluate(() => CSS.supports("-webkit-touch-callout", "none")),
      false,
      "Chromium must not accidentally qualify as iOS",
    );
    const before = await snapshot(page);
    // Chromium cannot emulate iOS WebKit's feature query or native standalone mode.
    // Exercise the exact source declarations under an explicitly simulated gate;
    // retain the real width media query. This is geometry/interaction evidence only.
    if (test.simulate)
      await page.addStyleTag({
        content: `@media (max-width:440px){${rule.css}}`,
      });
    await page.waitForTimeout(100);
    const after = await snapshot(page);
    assert.deepEqual(after.foreground, before.foreground);
    assert.deepEqual(after.skin, before.skin);
    assert.deepEqual(after.indicator, before.indicator);
    after.buttons.forEach((b, i) => {
      assert.deepEqual(b.skin, before.buttons[i].skin);
      assert.deepEqual(b.icon, before.buttons[i].icon);
      assert.deepEqual(b.label, before.buttons[i].label);
    });
    let delta = 0;
    if (test.simulate && test.width <= 440) {
      delta = test.bottom >= 32 ? 12 : test.bottom === 21 ? 1 : 0;
      assert(Math.abs(after.bar.y - before.bar.y - delta) < 0.1);
      assert(Math.abs(after.bar.x - 8) < 0.1);
      assert(Math.abs(test.width - after.bar.x - after.bar.width - 8) < 0.1);
      if (test.bottom >= 20) assert(test.height - after.bar.bottom >= 20);
    } else assert.deepEqual(after.bar, before.bar);
    assert.equal(after.bar.height, 62);
    assert(Math.abs(after.bar.x + after.bar.width / 2 - test.width / 2) < 0.1);
    const centers = after.buttons.map((b) => b.rect.x + b.rect.width / 2);
    assert(Math.abs(centers[1] - centers[0] - (centers[2] - centers[1])) < 0.1);
    if (test.interactions) {
      await page.screenshot({
        path: `${out}/${test.style}-simulated-standalone.png`,
      });
      const nav = (name) => page.getByRole("button", { name, exact: true }),
        bar = page.locator(".ea-glass-bar");
      await nav("MetaTrader").tap();
      await page
        .getByRole("dialog", { name: "MetaTrader 5", exact: true })
        .waitFor();
      await nav("Home").tap();
      await page.waitForTimeout(650);
      await nav("Settings").tap();
      await page.waitForTimeout(350);
      await nav("Home").tap();
      await page.waitForTimeout(650);
      const b = await bar.boundingBox(),
        x = b.x + b.width / 2,
        y = b.y + b.height / 2,
        right = b.x + (b.width * 5) / 6;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 1 }],
      });
      await page.waitForTimeout(220);
      assert.equal(await bar.getAttribute("data-pressed"), "true");
      for (let i = 1; i <= 7; i++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + ((right - x) * i) / 7, y, id: 1 }],
        });
        await page.waitForTimeout(16);
      }
      assert.equal(await nav("Home").getAttribute("aria-current"), "page");
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await page.waitForTimeout(650);
      assert.equal(await nav("Settings").getAttribute("aria-current"), "page");
      const settle = await page
        .locator(".ea-glass-indicator")
        .evaluate((e) => ({
          x: new DOMMatrixReadOnly(getComputedStyle(e).transform).m41,
          step: parseFloat(
            e.parentElement.style.getPropertyValue("--glass-step"),
          ),
        }));
      assert(Math.abs(settle.x - settle.step * 2) < 1);
    }
    assert.deepEqual(errors, []);
    results.push({
      test,
      deltaDown: delta,
      before: before.bar,
      after: after.bar,
      foregroundAndGlassStylesUnchanged: true,
      realIosStandalone: false,
    });
    await context.close();
  }
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
