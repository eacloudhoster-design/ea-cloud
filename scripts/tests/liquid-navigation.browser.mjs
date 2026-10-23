import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const before = process.env.BEFORE_ORIGIN || "http://127.0.0.1:5201";
const after = process.env.AFTER_ORIGIN || "http://127.0.0.1:5200";
const dev = process.env.DEV_ORIGIN || "http://127.0.0.1:5202";
for (const origin of [before, after, dev])
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/liquid-navigation";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
const pause = (page) => page.waitForTimeout(650);
const position = (page) =>
  page
    .locator(".ea-glass-indicator")
    .evaluate((e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).m41);
async function touch(cdp, type, x, y) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints:
      type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y, id: 1 }],
  });
}
async function fixture(context, style = "regular", shape = "orbit") {
  await context.addInitScript(
    ({ style, shape }) => {
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
      localStorage.setItem("ea-cloud:client:7:robot-shape", shape);
      localStorage.setItem(
        "ea-cloud:floating-robot-position",
        JSON.stringify({ x: 10, y: 80 }),
      );
    },
    { style, shape },
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
                : p.endsWith("/scanner/history")
                  ? { records: [], hasMore: false }
                  : [],
    });
  });
}
async function loaded(page, origin) {
  await page.goto(origin + "/ea-app/");
  await page.locator(".ea-startup").waitFor({ state: "detached" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(80);
}
async function geometry(page) {
  return page.evaluate(() => {
    const home = document.querySelector("[data-home-interface]");
    const rect = (e) => {
      const r = e.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height];
    };
    return [
      ...home.querySelectorAll(
        "button,img,.ea-bot-name-primary,[data-matrix-branding],span,p",
      ),
      document.querySelector(".trading-activity-trigger"),
    ]
      .filter(Boolean)
      .map((e) => ({ text: e.textContent, rect: rect(e) }));
  });
}
try {
  if (
    !process.env.NAV_TEST_SECTION ||
    process.env.NAV_TEST_SECTION === "geometry"
  ) {
    // Original vs updated geometry: all interfaces and shapes, with identical fixtures.
    for (const screen of [
      { width: 390, height: 844 },
      { width: 320, height: 568 },
      { width: 844, height: 390 },
      { width: 1280, height: 900 },
      { width: 393, height: 852, top: 59, bottom: 34 },
    ]) {
      for (const style of ["regular", "s2tone", "matrix"]) {
        const phases = [];
        for (const origin of [before, after]) {
          const context = await browser.newContext({
            viewport: { width: screen.width, height: screen.height },
            isMobile: screen.width < 1000,
            hasTouch: true,
          });
          await fixture(context, style);
          const page = await context.newPage();
          page.setDefaultTimeout(12000);
          const errors = [];
          page.on("pageerror", (e) => errors.push(e.message));
          const cdp = await context.newCDPSession(page);
          if (screen.top)
            await cdp.send("Emulation.setSafeAreaInsetsOverride", {
              insets: {
                top: screen.top,
                bottom: screen.bottom,
                left: 0,
                right: 0,
              },
            });
          await loaded(page, origin);
          assert.equal(
            await page
              .locator("[data-home-interface]")
              .getAttribute("data-home-interface"),
            style,
          );
          const rows = [];
          for (const shape of ["orbit", "none", "neural"]) {
            if (shape !== "orbit") {
              await page
                .getByRole("button", { name: "Settings", exact: true })
                .tap();
              await page.waitForTimeout(350);
              const select = page.getByRole("button", {
                name: "Select Shape",
                exact: true,
              });
              if (await select.locator(".lucide-chevron-down").count())
                await select.tap({ position: { x: 20, y: 20 } });
              await page
                .getByRole("button", {
                  name:
                    shape === "none" ? /^None\b/ : /^The Neural Interface\b/,
                })
                .tap({ position: { x: 20, y: 20 } });
              await page
                .getByRole("button", { name: "Home", exact: true })
                .tap();
              await pause(page);
            }
            rows.push({ shape, geometry: await geometry(page) });
          }
          const bg = await page
            .locator("[data-home-background]")
            .evaluate((e) => {
              const r = e.getBoundingClientRect(),
                s = getComputedStyle(e);
              return {
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
                fit: s.objectFit,
                position: s.objectPosition,
                filter: s.filter,
                loaded: e.complete && e.naturalWidth > 0,
              };
            });
          assert.equal(bg.y, 0);
          assert.equal(bg.height, screen.height);
          assert.equal(bg.width, Math.min(430, screen.width));
          assert.equal(bg.fit, "cover");
          assert.equal(bg.position, "50% 50%");
          assert.equal(bg.filter, "none");
          assert(bg.loaded);
          if (origin === after) {
            assert.equal(await page.locator(".ea-glass-indicator").count(), 1);
            const bar = await page.locator(".ea-glass-bar").boundingBox();
            assert(
              bar.y + bar.height <= screen.height - (screen.bottom || 8) + 1,
            );
            if (screen.width === 390)
              await page.screenshot({ path: `${out}/${style}-rest.png` });
            // Dynamic browser viewport size changes preserve complete image coverage.
            await page.setViewportSize({
              width: screen.width,
              height: screen.height - 60,
            });
            assert.equal(
              await page
                .locator("[data-home-background]")
                .evaluate((e) => e.getBoundingClientRect().height),
              screen.height - 60,
            );
          }
          phases.push(rows);
          assert.deepEqual(errors, []);
          await context.close();
        }
        assert.equal(phases[0].length, phases[1].length);
        for (let i = 0; i < 3; i++) {
          assert.equal(
            phases[0][i].geometry.length,
            phases[1][i].geometry.length,
          );
          phases[0][i].geometry.forEach((a, j) => {
            const b = phases[1][i].geometry[j];
            assert.equal(a.text, b.text);
            a.rect.forEach((v, k) =>
              assert(
                Math.abs(v - b.rect[k]) < 0.75,
                `${style}/${screen.width}/${phases[0][i].shape} element ${j}, coordinate ${k}: ${v} -> ${b.rect[k]}`,
              ),
            );
          });
        }
        results.push({
          test: "unchanged foreground and full background",
          style,
          screen,
          shapes: 3,
          passed: true,
        });
      }
    }
  }
  if (
    !process.env.NAV_TEST_SECTION ||
    process.env.NAV_TEST_SECTION === "interaction"
  ) {
    // Functional navigation, theme changes and real touch drag on each Home layout.
    for (const style of ["regular", "s2tone", "matrix"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      await fixture(context, style);
      const page = await context.newPage();
      await loaded(page, after);
      const nav = (n) => page.getByRole("button", { name: n, exact: true });
      const bar = page.locator(".ea-glass-bar");
      const cdp = await context.newCDPSession(page);
      const step = await bar.evaluate((e) =>
        parseFloat(e.style.getPropertyValue("--glass-step")),
      );
      await nav("MetaTrader").tap();
      await page
        .getByRole("dialog", { name: "MetaTrader 5", exact: true })
        .waitFor();
      await pause(page);
      assert(Math.abs(await position(page)) < 1);
      await page.touchscreen.tap(130, 50);
      await pause(page);
      assert(Math.abs((await position(page)) - step) < 1);
      await nav("Settings").tap();
      await page.waitForTimeout(350);
      await nav("Select Colour").tap({ position: { x: 20, y: 20 } });
      for (const [label, hex] of [
        ["Pure Red", "#ef4444"],
        ["Electric Blue", "#3b82f6"],
        ["Emerald Green", "#22c55e"],
        ["Royal Purple", "#a855f7"],
      ]) {
        await page
          .getByRole("button", { name: label, exact: true })
          .tap({ position: { x: 20, y: 15 } });
        assert.equal(
          await page
            .locator(".ea-glass-navigation")
            .evaluate((e) => e.style.getPropertyValue("--nav-accent")),
          hex,
        );
      }
      await nav("Home").tap();
      await pause(page);
      const b = await bar.boundingBox(),
        y = b.y + b.height / 2,
        home = b.x + b.width / 2,
        left = b.x + b.width / 6,
        right = b.x + (b.width * 5) / 6;
      await touch(cdp, "touchStart", home, y);
      await page.waitForTimeout(250);
      assert.equal(await bar.getAttribute("data-pressed"), "true");
      await page.screenshot({ path: `${out}/${style}-held.png` });
      for (let i = 1; i <= 6; i++) {
        await touch(cdp, "touchMove", home + ((left - home) * i) / 6, y);
        await page.waitForTimeout(16);
      }
      assert.equal(
        await page.locator(".mt5-popup-backdrop:visible").count(),
        0,
      );
      assert((await position(page)) < step * 0.2);
      const lensShift = await page
        .locator(".ea-glass-lens img")
        .evaluate((e) => parseFloat(getComputedStyle(e).translate));
      assert(
        Math.abs(lensShift + (await position(page))) < 1,
        "Magnification plane must remain aligned during dragging",
      );
      await page.screenshot({ path: `${out}/${style}-drag-left.png` });
      await touch(cdp, "touchEnd");
      await page
        .getByRole("dialog", { name: "MetaTrader 5", exact: true })
        .waitFor();
      await pause(page);
      assert(Math.abs(await position(page)) < 1);
      await touch(cdp, "touchStart", left, y);
      for (let i = 1; i <= 8; i++) {
        await touch(cdp, "touchMove", left + ((right - left) * i) / 8, y);
        await page.waitForTimeout(16);
      }
      assert.equal(await nav("Settings").getAttribute("aria-current"), null);
      await touch(cdp, "touchEnd");
      await page.waitForTimeout(650);
      assert.equal(await nav("Settings").getAttribute("aria-current"), "page");
      assert(Math.abs((await position(page)) - step * 2) < 1);
      await nav("Home").tap();
      await pause(page);
      await nav("MetaTrader").focus();
      await page.keyboard.press("Enter");
      await page
        .getByRole("dialog", { name: "MetaTrader 5", exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
      await pause(page);
      assert.equal(await nav("Home").getAttribute("aria-current"), "page");
      results.push({
        test: "touch, theme and keyboard navigation",
        style,
        passed: true,
      });
      await context.close();
    }
  }
  if (
    !process.env.NAV_TEST_SECTION ||
    process.env.NAV_TEST_SECTION === "safearea"
  ) {
    for (const style of ["regular", "s2tone", "matrix"]) {
      const context = await browser.newContext({
        viewport: { width: 393, height: 852 },
        isMobile: true,
        hasTouch: true,
      });
      await fixture(context, style);
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setSafeAreaInsetsOverride", {
        insets: { top: 59, bottom: 34, left: 0, right: 0 },
      });
      await loaded(page, after);
      await page.getByRole("button", { name: "Settings", exact: true }).tap();
      await page.waitForTimeout(350);
      const button = page.getByRole("button", {
        name: "MetaTrader",
        exact: true,
      });
      const b = await button.boundingBox();
      const hit = await page.evaluate(
        ({ x, y }) =>
          document
            .elementFromPoint(x, y)
            ?.closest("button")
            ?.textContent.trim(),
        { x: b.x + 20, y: b.y + 10 },
      );
      assert.equal(
        hit,
        "MetaTrader",
        "Settings dismiss target must not cover safe-area navigation",
      );
      await button.tap({ position: { x: 20, y: 10 } });
      await page
        .getByRole("dialog", { name: "MetaTrader 5", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Home", exact: true }).tap();
      results.push({
        test: "safe-area navigation not covered by Settings dismiss strip",
        style,
        passed: true,
      });
      await context.close();
    }
  }
  if (
    !process.env.NAV_TEST_SECTION ||
    process.env.NAV_TEST_SECTION === "fixture"
  ) {
    // Count callback executions using the real component, independent of page side effects.
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.route("**/ea-app/nav-test", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import RefreshRuntime from "/ea-app/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/ea-app/@fs/workspace/ea-cloud/scripts/tests/fixtures/liquid-navigation.tsx"></script></body></html>',
      }),
    );
    await page.goto(dev + "/ea-app/nav-test");
    await page.locator(".ea-glass-bar").waitFor();
    await pause(page);
    const count = () => page.locator("output").getAttribute("data-count");
    const tab = () => page.locator("output").getAttribute("data-tab");
    const bar = page.locator(".ea-glass-bar"),
      cdp = await context.newCDPSession(page),
      b = await bar.boundingBox(),
      y = b.y + 30,
      home = b.x + b.width / 2,
      left = b.x + b.width / 6,
      right = b.x + (b.width * 5) / 6;
    await touch(cdp, "touchStart", home, y);
    await page.waitForTimeout(300);
    assert.equal(await count(), "0");
    for (let i = 1; i <= 6; i++) {
      await touch(cdp, "touchMove", home + ((right - home) * i) / 6, y);
      await page.waitForTimeout(16);
    }
    assert.equal(await count(), "0");
    await touch(cdp, "touchEnd");
    await pause(page);
    assert.equal(await count(), "1");
    assert.equal(await tab(), "settings");
    await touch(cdp, "touchStart", right, y);
    await touch(cdp, "touchMove", left, y);
    await touch(cdp, "touchCancel");
    await pause(page);
    assert.equal(await count(), "1");
    assert.equal(await tab(), "settings");
    await page.getByRole("button", { name: "Home", exact: true }).tap();
    await pause(page);
    assert.equal(await count(), "2");
    // Mouse uses the same pointer path. Hold/drag does not select until release.
    await page.mouse.move(home, y);
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.mouse.move(left, y, { steps: 8 });
    assert.equal(await count(), "2");
    await page.mouse.up();
    await pause(page);
    assert.equal(await count(), "3");
    assert.equal(await tab(), "metatrader");
    await page.getByRole("button", { name: "Home", exact: true }).focus();
    await page.keyboard.press("Space");
    await pause(page);
    assert.equal(await count(), "4");
    // Reduced motion keeps tracking and selection, without stretch or spring frames.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await touch(cdp, "touchStart", home, y);
    await touch(cdp, "touchMove", right, y);
    await page.waitForTimeout(50);
    assert.equal(
      await page
        .locator(".ea-glass-indicator")
        .evaluate(
          (e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).m11,
        ),
      1,
    );
    await touch(cdp, "touchEnd");
    await page.waitForTimeout(50);
    assert.equal(await count(), "5");
    assert.equal(await tab(), "settings");
    await page.getByRole("button", { name: "Home", exact: true }).tap();
    await pause(page);
    await page.getByRole("button", { name: "Outside", exact: true }).tap();
    assert.equal(await count(), "6");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForTimeout(50);
    await page.getByRole("button", { name: "MetaTrader", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(35);
    const intermediate = await position(page);
    const step = await bar.evaluate((e) =>
      parseFloat(e.style.getPropertyValue("--glass-step")),
    );
    assert(
      intermediate > 0.5 && intermediate < step - 0.5,
      `Spring must travel through intermediate positions: ${intermediate}`,
    );
    await pause(page);
    assert(Math.abs(await position(page)) < 1);
    assert.equal(await count(), "7");
    await page.addStyleTag({
      content:
        ".ea-glass-bar,.ea-glass-indicator {backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}",
    });
    const fallback = await bar.evaluate(
      (e) => getComputedStyle(e).backgroundColor,
    );
    assert.match(fallback, /^rgba\(/);
    assert(
      parseFloat(fallback.split(",")[3]) < 0.7,
      "Fallback must remain translucent",
    );
    await page.screenshot({ path: `${out}/fallback.png` });
    results.push({
      test: "exactly-once callbacks, cancellation, mouse, keyboard, reduced motion",
      passed: true,
    });
    await context.close();
  }
  await writeFile(
    `${out}/${process.env.NAV_TEST_SECTION || "all"}-results.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
