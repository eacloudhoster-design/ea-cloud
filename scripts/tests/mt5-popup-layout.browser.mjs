import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origins = {
  before: process.env.BEFORE_ORIGIN || "http://127.0.0.1:5203",
  after: process.env.AFTER_ORIGIN || "http://127.0.0.1:5204",
};
for (const origin of Object.values(origins))
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/mt5-popup-layout";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
const resultPath = process.env.MT5_LAYOUT_WIDTH
  ? `${out}/focused-results.json`
  : `${out}/results.json`;
const cases = [
  ...["regular", "s2tone", "matrix"].flatMap((style) => [
    { style, width: 390, height: 844 },
    { style, width: 320, height: 568 },
  ]),
  { style: "matrix", width: 393, height: 852, top: 59, bottom: 34 },
  { style: "s2tone", width: 844, height: 390 },
  { style: "regular", width: 1280, height: 900 },
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
async function metrics(page) {
  return page.evaluate(() => {
    const r = (e) => {
      const b = e.getBoundingClientRect();
      return {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        bottom: b.bottom,
      };
    };
    const css = (e) => {
      const s = getComputedStyle(e);
      return Object.fromEntries(
        [
          "fontFamily",
          "fontSize",
          "fontWeight",
          "color",
          "background",
          "borderRadius",
          "border",
          "padding",
          "filter",
          "boxShadow",
        ].map((k) => [k, s[k]]),
      );
    };
    const logo = document.querySelector(".mt5-platform-logo");
    return {
      panel: r(document.querySelector(".mt5-popup")),
      content: r(document.querySelector(".mt5-content")),
      headerHeight: document
        .querySelector(".mt5-popup-header")
        .getBoundingClientRect().height,
      logo: {
        rect: r(logo),
        css: css(logo),
        src: logo.getAttribute("src"),
        loaded: logo.complete && logo.naturalWidth > 0,
      },
      heading: {
        rect: r(document.querySelector(".mt5-intro h2")),
        css: css(document.querySelector(".mt5-intro h2")),
      },
      subtitle: {
        rect: r(document.querySelector(".mt5-intro p")),
        display: getComputedStyle(document.querySelector(".mt5-intro p"))
          .display,
      },
      inputs: [...document.querySelectorAll(".mt5-input-wrap")].map((e) => ({
        rect: r(e),
        css: css(e),
        input: css(e.querySelector("input")),
        placeholder: e.querySelector("input").placeholder,
      })),
      labels: [...document.querySelectorAll(".mt5-floating-field>label")].map(
        (e) => ({ text: e.textContent, css: css(e) }),
      ),
      background: {
        src: document
          .querySelector(".mt5-mentor-background")
          .getAttribute("src"),
        css: css(document.querySelector(".mt5-mentor-background")),
      },
    };
  });
}
try {
  for (const test of cases.filter(
    (test) =>
      (!process.env.MT5_LAYOUT_WIDTH ||
        test.width === Number(process.env.MT5_LAYOUT_WIDTH)) &&
      (!process.env.MT5_LAYOUT_STYLE ||
        test.style === process.env.MT5_LAYOUT_STYLE),
  )) {
    const samples = {};
    for (const phase of ["before", "after"]) {
      const context = await browser.newContext({
        viewport: { width: test.width, height: test.height },
        isMobile: test.width < 1000,
        hasTouch: true,
      });
      await setup(context, test.style);
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const cdp = await context.newCDPSession(page);
      if (test.top)
        await cdp.send("Emulation.setSafeAreaInsetsOverride", {
          insets: { top: test.top, bottom: test.bottom, left: 0, right: 0 },
        });
      await page.goto(origins[phase] + "/ea-app/");
      await page.locator(".ea-startup").waitFor({ state: "detached" });
      await page.evaluate(() => document.fonts.ready);
      const nav = (n) => page.getByRole("button", { name: n, exact: true });
      await nav("MetaTrader").tap();
      await page
        .getByRole("dialog", { name: "MetaTrader 5", exact: true })
        .waitFor();
      await page.waitForTimeout(650);
      samples[phase] = await metrics(page);
      await page.screenshot({
        path: `${out}/${test.style}-${test.width}-${phase}-top.png`,
      });
      if (phase === "after") {
        const m = samples.after;
        assert(m.panel.y - test.top < 30 || (!test.top && m.panel.y < 30));
        assert(m.logo.loaded);
        assert(m.logo.rect.y >= m.content.y);
        assert(m.logo.rect.bottom <= m.content.bottom);
        assert(m.heading.rect.y >= m.logo.rect.bottom);
        assert(m.heading.rect.bottom <= m.subtitle.rect.y);
        assert.equal(m.subtitle.display, "block");
        assert(
          Math.abs(
            m.heading.rect.x +
              m.heading.rect.width / 2 -
              (m.panel.x + m.panel.width / 2),
          ) < 1,
        );
        for (const label of m.labels) {
          assert.equal(label.css.fontSize, "17px");
          assert.equal(label.css.fontWeight, "700");
        }
        // Real touch scroll, followed by a deterministic bottom check of all lower content.
        if (test.width < 1000) {
          const needsScroll = await page
            .locator(".mt5-content")
            .evaluate((e) => e.scrollHeight > e.clientHeight);
          const b = await page.locator(".mt5-content").boundingBox();
          const x = b.x + b.width / 2,
            y = b.y + b.height - 45;
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x, y, id: 1 }],
          });
          for (let i = 1; i <= 6; i++)
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [
                { x, y: y - (Math.min(230, b.height / 2) * i) / 6, id: 1 },
              ],
            });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          await page.waitForTimeout(250);
          if (needsScroll)
            assert(
              (await page
                .locator(".mt5-content")
                .evaluate((e) => e.scrollTop)) > 0,
            );
        }
        await page
          .locator(".mt5-content")
          .evaluate((e) => e.scrollTo(0, e.scrollHeight));
        await page.waitForTimeout(100);
        const bottom = await page.evaluate(() => {
          const content = document
              .querySelector(".mt5-content")
              .getBoundingClientRect(),
            button = document
              .querySelector(".mt5-connect-button")
              .getBoundingClientRect(),
            note = document
              .querySelector(".mt5-availability-note")
              .getBoundingClientRect(),
            nav = document
              .querySelector(".ea-glass-bar")
              .getBoundingClientRect();
          return {
            button: { top: button.top, bottom: button.bottom },
            noteBottom: note.bottom,
            content: { top: content.top, bottom: content.bottom },
            navTop: nav.top,
          };
        });
        assert(bottom.button.top >= bottom.content.top);
        assert(bottom.button.bottom <= bottom.content.bottom);
        assert(bottom.noteBottom <= bottom.content.bottom);
        assert(bottom.content.bottom <= bottom.navTop + 1);
        await page.screenshot({
          path: `${out}/${test.style}-${test.width}-after-bottom.png`,
        });
        await nav("Close MetaTrader").tap();
        await nav("MetaTrader").tap();
        assert.equal(
          await page.locator(".mt5-content").evaluate((e) => e.scrollTop),
          0,
        );
        await page.locator("#mt5-login").fill("123456");
        await page.locator("#mt5-password").fill("fixture-only");
        await nav("Show password").tap();
        assert.equal(
          await page.locator("#mt5-password").getAttribute("type"),
          "text",
        );
        await page.locator("#mt5-server").fill("Exness-MT5Real1");
        await nav("Connect MT5").tap();
        await page
          .getByRole("button", { name: "Cancel connection", exact: true })
          .waitFor();
        const outerClose = await nav("Close MetaTrader").boundingBox();
        const innerClose = await nav("Cancel connection").boundingBox();
        assert(
          innerClose.y >= outerClose.y + outerClose.height,
          "Connection close must not overlap popup close",
        );
        await nav("Cancel connection").tap();
        assert.equal(
          await page.locator(".mt5-screen").getAttribute("data-state"),
          "idle",
        );
        await nav("Close MetaTrader").tap();
        await nav("MetaTrader").tap();
        assert.equal(await page.locator("#mt5-login").inputValue(), "123456");
        assert.equal(await page.locator("#mt5-password").inputValue(), "");
        assert.equal(
          await page.locator(".mt5-content").evaluate((e) => e.scrollTop),
          0,
        );
        if (test.width < 1000)
          await page.touchscreen.tap(m.panel.x + 100, (test.top || 0) + 8);
        else await page.mouse.click(m.panel.x + 100, 8);
        await page
          .getByRole("dialog", { name: "MetaTrader 5", exact: true })
          .waitFor({ state: "hidden" });
        await nav("MetaTrader").tap();
        await nav("Home").tap();
        await page
          .getByRole("dialog", { name: "MetaTrader 5", exact: true })
          .waitFor({ state: "hidden" });
        await nav("MetaTrader").tap();
        await nav("Settings").tap();
        await page.waitForTimeout(350);
        await page
          .getByRole("button", { name: "Select Colour", exact: true })
          .tap({ position: { x: 20, y: 20 } });
        for (const [label, hex] of [
          ["Pure Red", "#ef4444"],
          ["Emerald Green", "#22c55e"],
          ["Royal Purple", "#a855f7"],
        ]) {
          await page
            .getByRole("button", { name: label, exact: true })
            .tap({ position: { x: 20, y: 15 } });
          await nav("MetaTrader").tap();
          assert.equal(
            await page
              .locator(".mt5-popup-backdrop")
              .evaluate((e) => e.style.getPropertyValue("--mt5-popup-accent")),
            hex,
          );
          await nav("Settings").tap();
          await page.waitForTimeout(350);
        }
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    assert.deepEqual(samples.after.logo.css, samples.before.logo.css);
    assert.deepEqual(
      {
        width: samples.after.logo.rect.width,
        height: samples.after.logo.rect.height,
      },
      {
        width: samples.before.logo.rect.width,
        height: samples.before.logo.rect.height,
      },
    );
    assert.equal(
      new URL(samples.after.logo.src).pathname,
      new URL(samples.before.logo.src).pathname,
    );
    assert.deepEqual(samples.after.heading.css, samples.before.heading.css);
    assert.deepEqual(samples.after.background, samples.before.background);
    samples.before.inputs.forEach((input, i) => {
      const after = samples.after.inputs[i];
      assert.deepEqual(after.css, input.css);
      assert.deepEqual(after.input, input.input);
      assert.equal(after.placeholder, input.placeholder);
      assert.equal(after.rect.width, input.rect.width);
      assert.equal(after.rect.height, input.rect.height);
    });
    results.push({
      test,
      logoAndInputStylesUnchanged: true,
      headingFontUnchanged: true,
      backgroundUnchanged: true,
      initialScrollReset: true,
      labels17px700: true,
      scrollingAndDismissalPassed: true,
      beforePanel: samples.before.panel,
      afterPanel: samples.after.panel,
    });
    await writeFile(resultPath, JSON.stringify(results, null, 2));
  }
  await writeFile(resultPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
