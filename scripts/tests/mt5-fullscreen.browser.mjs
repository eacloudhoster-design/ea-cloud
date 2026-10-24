import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origins = {
  before: process.env.BEFORE_ORIGIN || "http://127.0.0.1:5207",
  after: process.env.AFTER_ORIGIN || "http://127.0.0.1:5208",
};
for (const origin of Object.values(origins))
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/mt5-fullscreen";
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
    if (p === "/api/app/ea-mode-images")
      return r.fulfill({ json: { eas: [] } });
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
      panel: r(document.querySelector(".mt5-view, .mt5-popup")),
      content: r(document.querySelector(".mt5-content")),
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
async function navigationSkin(page) {
  return page.locator(".ea-glass-bar").evaluate((e) => {
    const r = e.getBoundingClientRect(),
      s = getComputedStyle(e);
    return {
      rect: [r.x, r.y, r.width, r.height],
      css: Object.fromEntries(
        [
          "background",
          "border",
          "borderRadius",
          "boxShadow",
          "backdropFilter",
          "padding",
        ].map((k) => [k, s[k]]),
      ),
    };
  });
}
async function homeGeometry(page) {
  return page.locator("[data-home-interface]").evaluate((e) =>
    [
      ...e.querySelectorAll(
        "button,img,span,p,.ea-bot-name-primary,[data-matrix-branding]",
      ),
    ].map((n) => {
      const r = n.getBoundingClientRect();
      return { text: n.textContent, rect: [r.x, r.y, r.width, r.height] };
    }),
  );
}
try {
  for (const test of cases) {
    const samples = {},
      homes = {},
      skins = {};
    for (const phase of ["before", "after"]) {
      const context = await browser.newContext({
        viewport: { width: test.width, height: test.height },
        isMobile: test.width < 1000,
        hasTouch: true,
      });
      await setup(context, test.style);
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.setDefaultTimeout(12000);
      if (test.top)
        await cdp.send("Emulation.setSafeAreaInsetsOverride", {
          insets: { top: test.top, bottom: test.bottom, left: 0, right: 0 },
        });
      await page.goto(origins[phase] + "/ea-app/");
      await page
        .locator(".ea-startup")
        .waitFor({ state: "detached", timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const nav = (n) => page.getByRole("button", { name: n, exact: true });
      homes[phase] = await homeGeometry(page);
      const timeOrigin = await page.evaluate(() => performance.timeOrigin);
      await nav("MetaTrader").tap();
      await page.waitForTimeout(650);
      samples[phase] = await metrics(page);
      skins[phase] = await navigationSkin(page);
      await page.screenshot({
        path: `${out}/${test.style}-${test.width}-${phase}.png`,
      });
      if (phase === "after") {
        assert.equal(await nav("Close MetaTrader").count(), 0);
        assert.equal(
          await page
            .locator(".mt5-popup-backdrop,.mt5-popup-header,.mt5-popup")
            .count(),
          0,
        );
        assert.equal(
          await page.locator('.mt5-view [role="dialog"]').count(),
          0,
        );
        assert.equal(
          await nav("MetaTrader").getAttribute("aria-current"),
          "page",
        );
        const coverage = await page.evaluate(() => {
          const r = (e) => {
            const b = e.getBoundingClientRect();
            return [b.x, b.y, b.width, b.height];
          };
          const host = document.querySelector("[data-mt5-background-host]"),
            root = document.querySelector(".ea-app-viewport"),
            content = document.querySelector(".ea-app-content"),
            view = document.querySelector(".mt5-view"),
            screen = view.querySelector(".mt5-screen");
          return {
            host: r(host),
            root: r(root),
            view: r(view),
            content: r(content),
            layer: r(host.querySelector(".mt5-background-layer")),
            image: r(host.querySelector("img")),
            images: host.querySelectorAll("img").length,
            insideViewImages: view.querySelectorAll(".mt5-mentor-background")
              .length,
            homeImageHidden: document.querySelector("[data-home-background]")
              .hidden,
            homeForegroundHidden:
              getComputedStyle(
                document.querySelector("[data-home-interface]").parentElement,
              ).opacity === "0",
            backgroundOpaque:
              getComputedStyle(host.querySelector(".mt5-background-layer"))
                .backgroundColor === "rgb(8, 10, 16)",
            viewRadius: getComputedStyle(view).borderRadius,
            background: getComputedStyle(screen).backgroundColor,
            scrollX:
              view.querySelector(".mt5-content").scrollWidth -
              view.querySelector(".mt5-content").clientWidth,
          };
        });
        assert.deepEqual(coverage.host, coverage.root);
        assert.deepEqual(coverage.layer, coverage.root);
        assert.deepEqual(coverage.view, coverage.content);
        assert.equal(coverage.images, 1);
        assert.equal(coverage.insideViewImages, 0);
        assert(coverage.backgroundOpaque);
        assert(coverage.homeForegroundHidden);
        assert.equal(
          await page
            .locator(".trading-activity-trigger")
            .evaluate((e) => !!e.closest("[inert]")),
          false,
        );
        assert.equal(coverage.viewRadius, "0px");
        assert.equal(coverage.background, "rgba(0, 0, 0, 0)");
        assert.equal(coverage.scrollX, 0);
        const m = samples.after;
        assert(m.logo.loaded);
        assert(m.logo.rect.y >= coverage.content[1]);
        assert(m.heading.rect.y >= m.logo.rect.bottom);
        assert.equal(m.subtitle.display, "block");
        m.labels.forEach((l) => assert.equal(l.css.fontWeight, "700"));
        // Empty page space no longer dismisses MT5, and Escape is not a page-close action.
        await page.touchscreen.tap(m.panel.x + 100, m.panel.y + 5);
        await page.keyboard.press("Escape");
        assert.equal(
          await nav("MetaTrader").getAttribute("aria-current"),
          "page",
        );
        // Native touch scrolling with a fixed continuous background layer.
        const scroller = page.locator(".mt5-content"),
          b = await scroller.boundingBox();
        const overflow = await scroller.evaluate(
          (e) => e.scrollHeight > e.clientHeight,
        );
        if (overflow && test.width < 1000) {
          const x = b.x + b.width / 2,
            y = b.y + b.height - 130;
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x, y, id: 1 }],
          });
          for (let i = 1; i <= 7; i++)
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [
                { x, y: y - (Math.min(220, b.height / 2) * i) / 7, id: 1 },
              ],
            });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          await page.waitForTimeout(200);
          assert((await scroller.evaluate((e) => e.scrollTop)) > 0);
        }
        await scroller.evaluate((e) => e.scrollTo(0, e.scrollHeight));
        await page.waitForTimeout(100);
        const bottom = await page.evaluate(() => ({
          button: document
            .querySelector(".mt5-connect-button")
            .getBoundingClientRect().bottom,
          note: document
            .querySelector(".mt5-availability-note")
            .getBoundingClientRect().bottom,
          nav: document.querySelector(".ea-glass-bar").getBoundingClientRect()
            .top,
          bg: document
            .querySelector("[data-mt5-background-host]")
            .getBoundingClientRect()
            .toJSON(),
        }));
        assert(bottom.button <= bottom.nav);
        assert(bottom.note <= bottom.nav);
        assert.equal(bottom.bg.y, coverage.root[1]);
        assert.equal(bottom.bg.height, coverage.root[3]);
        await page.screenshot({
          path: `${out}/${test.style}-${test.width}-bottom.png`,
        });
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
          .getByRole("heading", {
            name: "Backend not reachable right now.",
            exact: true,
          })
          .waitFor({ timeout: 12000 });
        assert.match(
          await page.locator("#mt5-dialog-description").textContent(),
          /no broker login was performed/,
        );
        await nav("Back to login").tap();
        await nav("Home").tap();
        await page.waitForTimeout(650);
        assert.equal(await page.locator(".mt5-view:visible").count(), 0);
        assert.equal(
          await page.locator("[data-mt5-background-host]:visible").count(),
          0,
        );
        assert.equal(
          await page
            .locator("[data-home-background]")
            .evaluate((e) => e.hidden),
          false,
        );
        assert.deepEqual(await homeGeometry(page), homes.after);
        await nav("MetaTrader").tap();
        assert.equal(await page.locator("#mt5-login").inputValue(), "123456");
        assert.equal(await page.locator("#mt5-password").inputValue(), "");
        assert.equal(await scroller.evaluate((e) => e.scrollTop), 0);
        await nav("Settings").tap();
        await page.waitForTimeout(350);
        await nav("Select Colour").tap({ position: { x: 20, y: 20 } });
        for (const [label, hex] of [
          ["Pure Red", "#ef4444"],
          ["Emerald Green", "#22c55e"],
          ["Royal Purple", "#a855f7"],
        ]) {
          await nav(label).tap({ position: { x: 20, y: 15 } });
          await nav("MetaTrader").tap();
          assert.equal(
            await page
              .locator(".mt5-background-layer")
              .evaluate((e) => e.style.getPropertyValue("--mt5-accent")),
            hex,
          );
          assert.equal(
            await page
              .locator(".mt5-view>.mt5-screen")
              .evaluate((e) => e.style.getPropertyValue("--mt5-accent")),
            hex,
          );
          await nav("Settings").tap();
          await page.waitForTimeout(350);
        }
        assert.equal(
          await page.evaluate(() => performance.timeOrigin),
          timeOrigin,
        );
        assert.equal(context.pages().length, 1);
        assert.equal(
          await page.evaluate(() => localStorage.getItem("appClientToken")),
          Buffer.from("7:client:fixture").toString("base64"),
        );
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    // Preserve all actual MT5 form styling and positions from the current main branch.
    const a = samples.before,
      b = samples.after;
    assert.deepEqual(b.logo.css, a.logo.css);
    assert.deepEqual(b.logo.rect, a.logo.rect);
    assert.equal(new URL(b.logo.src).pathname, new URL(a.logo.src).pathname);
    assert.deepEqual(b.heading, a.heading);
    assert.deepEqual(b.inputs, a.inputs);
    assert.deepEqual(b.labels, a.labels);
    assert.deepEqual(b.background, a.background);
    assert.deepEqual(skins.after, skins.before);
    assert.deepEqual(homes.after, homes.before);
    results.push({
      test,
      formAndPositionsUnchanged: true,
      logoAndBackgroundUnchanged: true,
      navigationSkinAndGeometryUnchanged: true,
      homeUnchanged: true,
      fullscreenCoverage: true,
      noOuterCloseOrModal: true,
      scrollingAndNavigation: true,
      connectionPreviewPreserved: true,
    });
    await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
