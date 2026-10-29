// Actual app, isolated API fixtures and Chromium viewport/touch emulation.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5221";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const baseline = process.env.SETTINGS_BASELINE === "1";
const output = `work/android-settings/${baseline ? "before" : "after"}`;
await mkdir(output, { recursive: true });
const image = await readFile("artifacts/ea-cloud/public/default-robot.jpg");
const cases = [
  {
    name: "ios-reference",
    width: 393,
    height: 852,
    ios: true,
    standalone: true,
    top: 47,
    bottom: 34,
  },
  // Matched insets isolate platform styling from native status-bar differences.
  {
    name: "android-matched-insets",
    width: 393,
    height: 852,
    android: true,
    standalone: true,
    top: 47,
    bottom: 34,
  },
  {
    name: "android-small",
    width: 320,
    height: 568,
    android: true,
    standalone: true,
    top: 24,
    bottom: 24,
  },
  {
    name: "android-chrome",
    width: 360,
    height: 800,
    android: true,
    standalone: false,
    top: 24,
    bottom: 0,
  },
  {
    name: "android-large",
    width: 412,
    height: 915,
    android: true,
    standalone: true,
    top: 24,
    bottom: 24,
  },
  {
    name: "android-landscape",
    width: 800,
    height: 360,
    android: true,
    standalone: true,
    top: 0,
    bottom: 24,
  },
  {
    name: "ios-safari",
    width: 390,
    height: 744,
    ios: true,
    standalone: false,
    top: 0,
    bottom: 0,
  },
  { name: "desktop", width: 1280, height: 900, top: 0, bottom: 0 },
];
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-gpu"],
});
const results = [];
try {
  for (const device of cases) {
    const c = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      isMobile: !!(device.android || device.ios),
      hasTouch: !!(device.android || device.ios),
      reducedMotion: "reduce",
      userAgent: device.ios
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
        : device.android
          ? "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36"
          : undefined,
    });
    await c.addInitScript((standalone) => {
      const media = window.matchMedia.bind(window);
      window.matchMedia = (q) => {
        const m = media(q);
        if (q === "(display-mode: standalone)")
          Object.defineProperty(m, "matches", { value: standalone });
        return m;
      };
      Object.defineProperty(navigator, "standalone", { value: standalone });
      Object.defineProperty(window, "AudioContext", { value: undefined });
      Object.defineProperty(window, "webkitAudioContext", { value: undefined });
      localStorage.setItem("appClientToken", btoa("7:client:fixture"));
      localStorage.setItem(
        "ea-cloud:client:7:home-appearance",
        JSON.stringify({
          interfaceStyle: "matrix",
          accentColor: "#ef4444",
          showBg: true,
          backgroundAnimation: "none",
        }),
      );
    }, !!device.standalone);
    await c.routeWebSocket("**/api/ws?*", () => {});
    await c.route("**/settings-mentor.jpg", (r) =>
      r.fulfill({ body: image, contentType: "image/jpeg" }),
    );
    const writes = [];
    await c.route("**/api/**", (r) => {
      const p = new URL(r.request().url()).pathname;
      if (r.request().method() !== "GET") writes.push(p);
      const json = p.endsWith("/app/me")
        ? {
            id: 7,
            token: btoa("7:client:cookie"),
            status: "approved",
            licenseKey: "TEST",
          }
        : p.endsWith("/app/dashboard")
          ? {
              mentor: {
                id: 5,
                robotName: "EA Cloud Pro",
                backgroundImageUrl: "/settings-mentor.jpg",
              },
              eas: [],
            }
          : p.endsWith("/app/ea-mode-images")
            ? {
                eas: [
                  {
                    id: 11,
                    name: "EA Cloud Pro",
                    images: Array(4).fill("/settings-mentor.jpg"),
                  },
                ],
              }
            : p.endsWith("/trading-controls")
              ? { copyingEnabled: false }
              : p.endsWith("/activity/snapshot")
                ? {
                    observedAt: Date.now(),
                    connected: false,
                    engine: false,
                    robotEnabled: false,
                    account: null,
                    symbols: [],
                  }
                : p.endsWith("/activity")
                  ? { events: [] }
                  : [];
      return r.fulfill({ json });
    });
    const p = await c.newPage();
    p.setDefaultTimeout(15000);
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const cdp = await c.newCDPSession(p);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: device.top, bottom: device.bottom, left: 0, right: 0 },
    });
    await p.goto(origin + "/ea-app/");
    await p.locator(".ea-startup").waitFor({ state: "detached" });
    await p.evaluate(() => document.fonts.ready);
    const nav = p.getByRole("navigation", { name: "Main navigation" });
    const settle = () => p.waitForTimeout(450);
    await settle();
    await p.screenshot({ path: `${output}/${device.name}-home.png` });
    const navBefore = await nav.boundingBox();
    await nav.getByRole("button", { name: "Settings", exact: true }).click();
    await settle();
    const settings = p.locator(".ea-settings");
    const expected = [
      "Select Main Interface",
      "Control Panel",
      "Select Shape",
      "Select Colour",
      "Select Font",
      "EA Manipulation",
    ];
    assert.deepEqual(
      await settings
        .locator(".ea-settings-section > button")
        .allTextContents()
        .then((t) => t.slice(0, 6)),
      expected,
    );
    const metrics = await settings.evaluate((el) => {
      const box = (n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const style = (n) => {
        const s = getComputedStyle(n);
        return {
          color: s.color,
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          padding: s.padding,
          gap: s.gap,
          borderRadius: s.borderRadius,
          background: s.background,
          border: s.border,
          boxShadow: s.boxShadow,
        };
      };
      return {
        box: box(el),
        header: {
          box: box(el.querySelector(".ea-settings-header")),
          style: style(el.querySelector(".ea-settings-title")),
        },
        cards: [...el.querySelectorAll(".ea-settings-section > button")]
          .slice(0, 6)
          .map((n) => ({
            label: n.textContent,
            box: box(n),
            style: style(n),
            icon: style(n.querySelector(".ea-settings-icon")),
            text: style(n.querySelector(".ea-settings-label")),
          })),
        fullscreen: el.dataset.fullscreenBackground,
        overflow: el.scrollWidth > el.clientWidth,
      };
    });
    assert.equal(metrics.overflow, false);
    assert.deepEqual(await nav.boundingBox(), navBefore);
    assert.equal(
      metrics.fullscreen,
      String(
        (device.ios && device.standalone) ||
          (!baseline && device.android) ||
          false,
      ),
    );
    if (!baseline && device.android) {
      const bg = p.locator(
        ".ea-settings-fullscreen-background[data-active=true]",
      );
      await bg.waitFor();
      const rect = await bg.boundingBox();
      assert.equal(rect.x, 0);
      assert.equal(rect.y, 0);
      assert.equal(rect.width, device.width);
      assert.equal(rect.height, device.height);
      assert.equal(
        await bg.locator("img").getAttribute("src"),
        "/settings-mentor.jpg",
      );
      assert.equal(
        await bg
          .locator("img")
          .evaluate((el) => getComputedStyle(el).objectFit),
        "cover",
      );
      assert.equal(
        await settings.evaluate((el) => getComputedStyle(el).backgroundColor),
        "rgba(0, 0, 0, 0)",
      );
    }
    await p.screenshot({ path: `${output}/${device.name}-settings.png` });
    if (!baseline && device.android) {
      for (const label of [...expected, "Back Animation"]) {
        const button = settings.getByRole("button", {
          name: label,
          exact: true,
        });
        await button.click();
        assert.equal(await button.getAttribute("aria-expanded"), "true");
        assert.equal(
          await button
            .locator("..")
            .locator(".ea-settings-expansion")
            .getAttribute("aria-hidden"),
          "false",
        );
        await button.click();
        assert.equal(await button.getAttribute("aria-expanded"), "false");
      }
      const scroll = settings.locator(".ea-settings-scroll");
      await scroll.evaluate((el) => (el.scrollTop = el.scrollHeight));
      assert(await scroll.evaluate((el) => el.scrollTop > 0));
      await settings
        .getByRole("button", { name: "Sign Out", exact: true })
        .scrollIntoViewIfNeeded();
      assert(
        await settings
          .getByRole("button", { name: "Sign Out", exact: true })
          .isVisible(),
      );
      assert.deepEqual(await nav.boundingBox(), navBefore);
      await scroll.evaluate((el) => (el.scrollTop = 0));
      const avatar = p.getByRole("button", {
        name: "Open live trading activity",
        exact: true,
      });
      const before = await avatar.boundingBox();
      await p.mouse.move(
        before.x + before.width / 2,
        before.y + before.height / 2,
      );
      await p.mouse.down();
      await p.mouse.move(
        Math.max(60, before.x - 65),
        Math.max(80, before.y - 90),
        { steps: 8 },
      );
      await p.mouse.up();
      const moved = await avatar.boundingBox();
      assert(
        Math.abs(moved.x - before.x) > 10 || Math.abs(moved.y - before.y) > 10,
      );
      await avatar.click();
      await p
        .getByRole("dialog", {
          name: "Live trading activity monitor",
          exact: true,
        })
        .waitFor();
      await p
        .getByRole("button", { name: "Close trading activity", exact: true })
        .click();
      assert.equal(await avatar.getByRole("img").count(), 1);
    }
    await nav.getByRole("button", { name: "Home", exact: true }).click();
    await settle();
    await p.screenshot({ path: `${output}/${device.name}-home-return.png` });
    assert.equal(
      await p
        .locator(".ea-settings-fullscreen-background[data-active=true]")
        .count(),
      0,
    );
    assert.equal(
      await p
        .locator(".ea-settings")
        .getAttribute("data-fullscreen-background"),
      metrics.fullscreen,
    );
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    results.push({ device, metrics, nav: navBefore });
    await c.close();
    console.log(`PASS ${device.name}`);
  }
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
