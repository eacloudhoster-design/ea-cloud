import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origins = {
  before: process.env.BEFORE_ORIGIN || "http://127.0.0.1:5198",
  after: process.env.AFTER_ORIGIN || "http://127.0.0.1:5196",
};
for (const origin of Object.values(origins))
  assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
await mkdir("work/status-bar", { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const all = [];
try {
  for (const screen of [
    { width: 370, height: 800, top: 44, bottom: 34 },
    { width: 393, height: 852, top: 59, bottom: 34 },
    { width: 375, height: 667, top: 20 },
    { width: 390, height: 844, top: 0 },
    { width: 844, height: 390, top: 0 },
  ].filter(
    (screen) =>
      !process.env.STATUS_WIDTH ||
      screen.width === Number(process.env.STATUS_WIDTH),
  )) {
    const phases = {};
    const mt5Geometry = {};
    for (const phase of ["before", "after"]) {
      const offset = phase === "before" ? screen.top : 0;
      const context = await browser.newContext({
        viewport: { width: screen.width, height: screen.height - offset },
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const errors = [];
      let enabled = false;
      page.on("pageerror", (e) => errors.push(e.message));
      const cdp = await context.newCDPSession(page);
      if (phase === "after")
        await cdp.send("Emulation.setSafeAreaInsetsOverride", {
          insets: {
            top: screen.top,
            bottom: screen.bottom || 0,
            left: 0,
            right: 0,
          },
        });
      await context.addInitScript(() => {
        localStorage.setItem("appClientToken", btoa("7:client:fixture"));
        localStorage.setItem("ea-cloud:client:7:bot-font", "Orbitron");
      });
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
        if (p.endsWith("/trading-controls")) {
          if (r.request().method() === "PATCH")
            enabled = r.request().postDataJSON().copyingEnabled;
          return r.fulfill({ json: { copyingEnabled: enabled } });
        }
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
                  : p.includes("/scanner/history")
                    ? { records: [], hasMore: false }
                    : [],
        });
      });
      await page.goto(origins[phase] + "/ea-app/");
      await page.locator(".ea-startup").waitFor({ state: "detached" });
      await page.evaluate(() => document.fonts.ready);
      // Compare resting layout rather than mobile's transient/sticky :active scale.
      await page.addStyleTag({
        content: "button:active { scale: 1 !important; }",
      });
      const nav = (label) =>
        page.getByRole("button", { name: label, exact: true });
      const accordion = async (name) => {
        const b = nav(name);
        if (await b.locator(".lucide-chevron-down").count()) await b.tap();
      };
      const rows = [];
      for (const [label, id] of [
        ["Regular Interface", "regular"],
        ["S2tone_", "s2tone"],
        ["The Matrix Interface", "matrix"],
      ]) {
        await nav("Settings").tap();
        await page.waitForTimeout(340);
        await accordion("Select Main Interface");
        await page
          .getByRole("button", { name: label })
          .tap({ position: { x: 20, y: 20 } });
        for (const [shapeName, shape] of [
          ["None", "none"],
          ["The Orbit", "orbit"],
          ["The Neural Interface", "neural"],
        ]) {
          await accordion("Select Shape");
          await page
            .getByRole("button", {
              name: new RegExp("^" + shapeName + "(?:\\s|$)"),
            })
            .tap({ position: { x: 20, y: 20 } });
          await nav("Home").tap();
          await page.waitForTimeout(340);
          const result = await page.evaluate(
            ({ offset, id, shape }) => {
              const rect = (el) => {
                const r = el.getBoundingClientRect();
                return {
                  x: r.x,
                  y: r.y + offset,
                  width: r.width,
                  height: r.height,
                };
              };
              const home = document.querySelector("[data-home-interface]");
              const bg = document.querySelector("[data-home-background]");
              const fore = Array.from(
                home.querySelectorAll(
                  "button,img,.ea-bot-name-primary,[data-matrix-branding]",
                ),
              ).map((el, i) => ({
                key: i,
                tag: el.tagName,
                text: el.textContent,
                rect: rect(el),
              }));
              for (const [i, el] of Array.from(
                home.querySelectorAll("span,p"),
              ).entries())
                if (
                  /^(ACTIVE|PAUSED|Powered by EA Cloud)$/.test(el.textContent)
                )
                  fore.push({
                    key: "label" + i,
                    text: el.textContent,
                    rect: rect(el),
                  });
              for (const label of [
                "Home",
                "MetaTrader",
                "Settings",
                "Open live trading activity",
              ]) {
                const el = Array.from(document.querySelectorAll("button")).find(
                  (el) =>
                    el.getAttribute("aria-label") === label ||
                    el.textContent === label,
                );
                fore.push({ key: label, rect: rect(el) });
              }
              const css = getComputedStyle(bg);
              return {
                id,
                shape,
                fore,
                background: rect(bg),
                fit: css.objectFit,
                position: css.objectPosition,
                source: bg.getAttribute("src"),
                loaded: bg.complete && bg.naturalWidth > 0,
              };
            },
            { offset, id, shape },
          );
          assert(result.loaded);
          assert.equal(result.fit, "cover");
          assert.equal(result.position, "50% 50%");
          if (phase === "after") {
            assert.equal(result.background.y, 0);
            assert.equal(result.background.height, screen.height);
          } else {
            assert.equal(result.background.y, screen.top);
          }
          rows.push(result);
          if (id === "regular" && shape === "none")
            await page.screenshot({
              path: `work/status-bar/${phase}-${screen.width}-${screen.top}.png`,
            });
          await nav("Settings").tap();
          await page.waitForTimeout(340);
        }
        await nav("Home").tap();
        await page.waitForTimeout(340);
      }
      await nav("MetaTrader").tap();
      await page.waitForTimeout(340);
      mt5Geometry[phase] = await page.locator(".mt5-content").evaluate(
        (root, offset) =>
          Array.from(root.querySelectorAll("h2,label,input,button,img")).map(
            (el) => {
              const r = el.getBoundingClientRect();
              return {
                x: r.x,
                y: r.y + offset,
                width: r.width,
                height: r.height,
              };
            },
          ),
        offset,
      );
      if (phase === "after") {
        assert.match(
          await page.locator("meta[name=viewport]").getAttribute("content"),
          /viewport-fit=cover/,
        );
        assert.equal(
          await page
            .locator("meta[name=apple-mobile-web-app-status-bar-style]")
            .getAttribute("content"),
          "black-translucent",
        );
        await nav("MetaTrader").tap();
        await page.waitForTimeout(340);
        await page.locator("#mt5-login").fill("12345");
        assert.equal(await page.locator("#mt5-login").inputValue(), "12345");
        await nav("Settings").tap();
        await page.waitForTimeout(340);
        await nav("Select Font").tap();
        assert(
          await page
            .getByRole("button", { name: /^Orbitron(?:\s|$)/ })
            .isVisible(),
        );
        await nav("Home").tap();
        await page.waitForTimeout(340);
        const home = page.locator("[data-home-interface]");
        const start = home.locator("button:has(svg.lucide-play)");
        await start.scrollIntoViewIfNeeded();
        await start.tap();
        await page.waitForTimeout(120);
        assert(enabled);
        await home
          .locator("button")
          .filter({ hasText: /^STOP$/ })
          .tap();
        await page.waitForTimeout(120);
        assert.equal(enabled, false);
        await home.getByRole("button", { name: "QUOTES", exact: true }).tap();
        await home.getByText("ALLOWED SYMBOLS", { exact: true }).waitFor();
        await nav("Home").tap();
        assert.equal(
          await home.getByText("ALLOWED SYMBOLS", { exact: true }).count(),
          0,
        );
        await home.getByRole("button", { name: "REMOVE", exact: true }).tap();
        await home.getByRole("button", { name: "Cancel", exact: true }).tap();
        await home.locator("button:has(svg.lucide-bell)").tap();
        await home.getByText("Copied Trades", { exact: true }).waitFor();
        await page.touchscreen.tap(screen.width / 2, screen.top + 40);
        assert.equal(
          await home.getByText("Copied Trades", { exact: true }).count(),
          0,
        );
        await nav("Open live trading activity").tap();
        const panel = page.getByRole("dialog", {
          name: "Live trading activity monitor",
          exact: true,
        });
        await panel.waitFor();
        await panel
          .getByRole("button", { name: "Refresh activity", exact: true })
          .tap();
        await panel
          .getByRole("button", { name: "Close trading activity", exact: true })
          .tap();
      }
      phases[phase] = rows;
      assert.deepEqual(errors, []);
      await context.close();
    }
    for (let i = 0; i < phases.before.length; i++) {
      const a = phases.before[i],
        b = phases.after[i];
      assert.equal(a.source, b.source);
      assert.equal(a.fore.length, b.fore.length);
      for (let j = 0; j < a.fore.length; j++)
        for (const key of ["x", "y", "width", "height"])
          assert(
            Math.abs(a.fore[j].rect[key] - b.fore[j].rect[key]) < 1,
            `${JSON.stringify(screen)} ${a.id}/${a.shape} ${JSON.stringify(a.fore[j])} ${key}: ${a.fore[j].rect[key]} -> ${b.fore[j].rect[key]}`,
          );
    }
    assert.equal(mt5Geometry.before.length, mt5Geometry.after.length);
    for (let i = 0; i < mt5Geometry.before.length; i++)
      for (const key of ["x", "y", "width", "height"])
        assert(
          Math.abs(mt5Geometry.before[i][key] - mt5Geometry.after[i][key]) < 1,
          `MT5 ${JSON.stringify(screen)} ${key}: ${JSON.stringify(mt5Geometry.before[i])} -> ${JSON.stringify(mt5Geometry.after[i])}`,
        );
    all.push({
      screen,
      cases: phases.after.length,
      foregroundUnchanged: true,
      mt5GeometryUnchanged: true,
      before: phases.before,
      after: phases.after,
    });
    console.log("PASS", screen);
  }
  await writeFile(
    process.env.STATUS_RESULT || "work/status-bar/results.json",
    JSON.stringify(all, null, 2),
  );
} finally {
  await browser.close();
}
