import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const stage = process.env.UI_STAGE || "after";
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5204";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/ios-refinements";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
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
          accentColor: "#00bcd4",
        }),
      );
      localStorage.setItem("ea-cloud:client:7:robot-shape", shape);
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
const cases = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 430, height: 932 },
  { width: 393, height: 852, top: 59, bottom: 34 },
  { width: 844, height: 390, left: 44, right: 44, bottom: 21 },
  { width: 390, height: 420 },
  { width: 1280, height: 900 },
];
try {
  for (const screen of cases) {
    const context = await browser.newContext({
      viewport: { width: screen.width, height: screen.height },
      isMobile: screen.width < 1000,
      hasTouch: true,
    });
    await fixture(context);
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: {
        top: screen.top || 0,
        bottom: screen.bottom || 0,
        left: screen.left || 0,
        right: screen.right || 0,
      },
    });
    await page.goto(origin + "/ea-app/");
    await page.locator(".ea-startup").waitFor({ state: "detached" });
    await page.evaluate(() => document.fonts.ready);
    const appNav = page.locator(".ea-app-viewport > .ea-glass-navigation");
    const navGeometry = (nav) =>
      nav.locator(".ea-glass-bar").evaluate((el) => {
        const r = el.getBoundingClientRect(),
          s = getComputedStyle(el);
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          bottom: innerHeight - r.bottom,
          blur: s.backdropFilter,
          background: s.backgroundImage,
          border: s.borderColor,
          radius: s.borderRadius,
        };
      });
    const home = await navGeometry(appNav);
    const activate = (scope, name) =>
      scope.getByRole("button", { name, exact: true }).tap();
    await activate(appNav, "Settings");
    await page.waitForTimeout(350);
    const settings = await navGeometry(appNav);
    await activate(appNav, "MetaTrader");
    await page.locator(".mt5-popup").waitFor();
    const mt5Nav = await navGeometry(appNav);
    const mt5 = await page.locator(".mt5-screen").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const image = await page
      .locator(".mt5-mentor-background")
      .evaluate((el) => ({
        src: el.getAttribute("src"),
        fit: getComputedStyle(el).objectFit,
        loaded: el.complete && el.naturalWidth > 0,
      }));
    const formDesign = await page
      .locator(
        ".mt5-intro h2,.mt5-topline,.mt5-floating-field > label,.mt5-input-wrap,.mt5-input-wrap input,.mt5-connect-button",
      )
      .evaluateAll((elements) =>
        elements.map((el) => {
          const s = getComputedStyle(el);
          return {
            tag: el.tagName,
            font: s.fontFamily,
            size: s.fontSize,
            weight: s.fontWeight,
            radius: s.borderRadius,
            background: s.backgroundImage,
            colour: s.color,
          };
        }),
      );
    if (stage === "after") {
      assert.equal(
        mt5.y,
        0,
        "MT5 must start at the viewport top, not in a sheet",
      );
      assert.equal(mt5.height, screen.height);
      assert.equal(image.fit, "cover");
      assert.equal(image.loaded, true);
      assert.equal(
        await page
          .locator(".mt5-popup-backdrop")
          .evaluate((el) => getComputedStyle(el).backdropFilter),
        "none",
      );
      assert.equal(
        await page
          .locator(".mt5-popup")
          .evaluate((el) => getComputedStyle(el).borderRadius),
        "0px",
      );
      assert.equal(home.height, 66);
      assert.equal(home.bottom, Math.max(4, screen.bottom || 0));
      assert.match(home.blur, /blur\(12px\)/);
      assert.equal(
        home.x,
        (screen.width - Math.min(430, screen.width)) / 2 +
          Math.max(10, screen.left || 0),
      );
      assert.equal(
        home.width,
        Math.min(430, screen.width) -
          Math.max(10, screen.left || 0) -
          Math.max(10, screen.right || 0),
      );
      assert.deepEqual(settings, home);
      assert.deepEqual(mt5Nav, home);
    }
    await page.locator("#mt5-login").fill("12345678");
    await page.locator("#mt5-password").fill("fixture-only");
    await page
      .getByRole("button", { name: "Show password", exact: true })
      .tap();
    assert.equal(
      await page.locator("#mt5-password").getAttribute("type"),
      "text",
    );
    await page.locator("#mt5-server").fill("Exness-MT5Real1");
    await page
      .locator(".mt5-content")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    const connect = page.getByRole("button", {
      name: "Connect MT5",
      exact: true,
    });
    await connect.scrollIntoViewIfNeeded();
    if (stage === "after") {
      const b = await connect.boundingBox();
      assert.ok(
        b.y + b.height <= home.y,
        "The submit button must scroll above navigation",
      );
      const centre = await connect.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          document
            .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
            ?.closest("button") === el
        );
      });
      assert.equal(centre, true);
    }
    await page.locator(".mt5-content").evaluate((el) => (el.scrollTop = 0));
    if ((screen.width === 390 && screen.height === 844) || screen.top)
      await page.screenshot({
        path: out + "/" + stage + "-mt5-" + screen.width + ".png",
      });
    await page
      .getByRole("button", { name: "Close MetaTrader", exact: true })
      .tap();
    await activate(appNav, "MetaTrader");
    assert.equal(await page.locator("#mt5-login").inputValue(), "12345678");
    assert.equal(await page.locator("#mt5-password").inputValue(), "");
    await activate(appNav, "Settings");
    await page.waitForTimeout(350);
    await page
      .getByRole("button", { name: "Chart Scanner", exact: true })
      .tap();
    await page.locator(".scanner-screen").waitFor();
    const scannerNav = page.locator(".scanner-navigation .ea-glass-navigation");
    const scanner = await navGeometry(scannerNav);
    const footer = await page.locator(".scanner-navigation").evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        background: s.backgroundImage,
        colour: s.backgroundColor,
        border: s.borderTopWidth,
        blur: s.backdropFilter,
      };
    });
    const scannerBg = await page
      .locator(".scanner-background")
      .evaluate((el) => ({
        src: el.getAttribute("src"),
        height: el.getBoundingClientRect().height,
        opacity: getComputedStyle(el).opacity,
      }));
    await page
      .locator(".scanner-scroll")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(100);
    assert.equal(
      await page.locator(".scanner-scroll").evaluate((el) => el.scrollTop > 0),
      true,
    );
    if (stage === "after") {
      assert.deepEqual(scanner, home);
      assert.deepEqual(footer, {
        background: "none",
        colour: "rgba(0, 0, 0, 0)",
        border: "0px",
        blur: "none",
      });
    }
    if ((screen.width === 390 && screen.height === 844) || screen.top)
      await page.screenshot({
        path: out + "/" + stage + "-scanner-" + screen.width + ".png",
      });
    // Navigation still works after scanner scrolling and through its trade settings.
    await page
      .getByRole("button", { name: "Edit trade settings", exact: true })
      .tap();
    await page.waitForTimeout(350);
    await activate(scannerNav, "MetaTrader");
    await page.locator(".scanner-screen").waitFor({ state: "detached" });
    await page.locator(".mt5-popup").waitFor();
    assert.deepEqual(await navGeometry(appNav), home);
    await page.locator("#mt5-login").focus();
    await page.keyboard.press("Escape");
    await page.locator(".mt5-popup").waitFor({ state: "hidden" });
    await activate(appNav, "Home");
    await page.waitForTimeout(200);
    const glass = await appNav.locator(".ea-glass-bar").boundingBox();
    const touch = async (type, x, y) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
      });
    await touch("touchStart", glass.x + glass.width / 2, glass.y + 30);
    await touch("touchMove", glass.x + glass.width - 30, glass.y + 30);
    await touch("touchEnd", 0, 0);
    await page.waitForTimeout(650);
    assert.equal(
      await appNav
        .getByRole("button", { name: "Settings", exact: true })
        .getAttribute("aria-current"),
      "page",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    results.push({
      screen,
      home,
      settings,
      mt5Nav,
      mt5,
      image,
      formDesign,
      scanner,
      footer,
      scannerBg,
    });
    await context.close();
    console.log(stage + ": " + screen.width + "x" + screen.height + " passed");
  }
  await writeFile(
    out + "/" + stage + "-results.json",
    JSON.stringify(results, null, 2),
  );
  if (stage === "after" && process.env.UI_BASELINE) {
    const before = JSON.parse(await readFile(process.env.UI_BASELINE, "utf8"));
    for (const record of results) {
      const old = before.find(
        (x) =>
          x.screen.width === record.screen.width &&
          x.screen.height === record.screen.height,
      );
      assert.deepEqual(
        record.formDesign,
        old.formDesign,
        "Login typography/field design changed",
      );
      for (const property of ["blur", "background", "border", "radius"])
        assert.equal(
          record.home[property],
          old.home[property],
          "Glass styling changed: " + property,
        );
      assert.deepEqual(
        record.scannerBg,
        old.scannerBg,
        "Scanner artwork changed",
      );
    }
  }
} finally {
  await browser.close();
}
