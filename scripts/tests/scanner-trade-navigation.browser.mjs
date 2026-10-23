import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5193";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const stage = process.env.NAV_STAGE || "after";
mkdirSync("work/scanner-navigation", { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 1280, height: 900 },
  ]) {
    const ctx = await browser.newContext({
      viewport,
      hasTouch: viewport.width < 500,
      isMobile: viewport.width < 500,
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    let writes = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    await ctx.addInitScript(() =>
      localStorage.setItem("appClientToken", btoa("7:client:fixture")),
    );
    await ctx.routeWebSocket("**/api/ws?*", () => {});
    await ctx.route("https://fonts.**", (r) => r.abort());
    await ctx.route("**/fixture-robot.jpg", (r) =>
      r.fulfill({
        path: "artifacts/ea-cloud/public/default-robot.jpg",
        contentType: "image/jpeg",
      }),
    );
    await ctx.route("**/api/**", (r) => {
      const p = new URL(r.request().url()).pathname;
      if (r.request().method() !== "GET") writes++;
      return r.fulfill({
        json: p.endsWith("/me")
          ? { status: "approved", licenseKey: "fixture" }
          : p.endsWith("/dashboard")
            ? {
                mentor: {
                  robotName: "Fixture Bot",
                  backgroundImageUrl: "/fixture-robot.jpg",
                },
                eas: [],
              }
            : p.endsWith("/trading-controls")
              ? { copyingEnabled: false }
              : p.endsWith("/activity/snapshot")
                ? {
                    connected: false,
                    engine: false,
                    robotEnabled: false,
                    tradeAllowed: false,
                    account: null,
                    symbols: [],
                  }
                : p.endsWith("/activity")
                  ? { events: [] }
                  : p.includes("/scanner/history")
                    ? { records: [], hasMore: false }
                    : [],
      });
    });
    await page.goto(origin + "/ea-app/");
    await page.locator(".ea-startup").waitFor({ state: "detached" });
    const activate = async (locator) =>
      viewport.width < 500 ? locator.tap() : locator.click();
    const openScanner = async () => {
      await activate(
        page.getByRole("button", { name: "Settings", exact: true }),
      );
      await page.waitForTimeout(340);
      await activate(
        page.getByRole("button", { name: "Chart Scanner", exact: true }),
      );
      await page.locator(".scanner-screen").waitFor();
    };
    const openSheet = async () => {
      await openScanner();
      await activate(
        page.getByRole("button", { name: "Edit trade settings", exact: true }),
      );
      await page
        .getByRole("dialog", { name: "Trade Settings", exact: true })
        .waitFor();
      await page.waitForTimeout(340);
    };
    for (const dest of ["Home", "MetaTrader", "Settings"]) {
      await openSheet();
      const nav = page.locator(".scanner-navigation"),
        button = nav.getByRole("button", { name: dest, exact: true });
      const disabled = await nav.evaluate((el) =>
        Boolean(el.closest("[inert]")),
      );
      const geometry = await nav.boundingBox();
      if (stage === "before") {
        assert.equal(disabled, true);
        const b = await button.boundingBox();
        if (viewport.width < 500)
          await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
        else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
        assert.equal(await page.locator(".scanner-sheet-backdrop").count(), 1);
        results.push({
          viewport,
          destination: dest,
          inert: true,
          blocked: true,
          geometry,
        });
        await page.screenshot({
          path: `work/scanner-navigation/${stage}-${viewport.width}.png`,
        });
        break;
      }
      assert.equal(disabled, false, "navigation must not inherit inert");
      if (dest === "Home")
        await page.screenshot({
          path: `work/scanner-navigation/after-sheet-${viewport.width}.png`,
        });
      await activate(button);
      await page.waitForTimeout(350);
      assert.equal(await page.locator(".scanner-screen").count(), 0);
      assert.equal(await page.locator(".scanner-sheet-backdrop").count(), 0);
      assert.equal(
        await page
          .getByRole("dialog", { name: "Trade Settings", exact: true })
          .count(),
        0,
      );
      if (dest === "Settings") {
        const select = page.getByRole("button", {
          name: "Select Shape",
          exact: true,
        });
        await activate(select);
        assert(
          await page.getByRole("button", { name: "The Orbit" }).isVisible(),
        );
      } else if (dest === "MetaTrader") {
        // Check the actual visible MT5 input remains usable, without submitting credentials.
        const input = page.locator("input:visible").first();
        await input.fill("123456");
        assert.equal(await input.inputValue(), "123456");
      } else {
        assert.equal(
          await page
            .locator("[data-home-interface]")
            .evaluate((el) => Boolean(el.closest("[inert]"))),
          false,
        );
        await activate(
          page.getByRole("button", { name: "Settings", exact: true }),
        );
        await page.waitForTimeout(340);
        await activate(
          page.getByRole("button", { name: "Close Settings", exact: true }),
        );
        await page.waitForTimeout(340);
      }
      results.push({
        viewport,
        destination: dest,
        inert: false,
        navigated: true,
        noBackdrop: true,
        geometry,
      });
    }
    if (stage === "after") {
      // Existing parameters, confirmation and cancellation still behave normally.
      await openSheet();
      const sheet = page.getByRole("dialog", {
        name: "Trade Settings",
        exact: true,
      });
      await activate(
        sheet.getByRole("button", { name: "Set positions to 2", exact: true }),
      );
      await activate(
        sheet.getByRole("button", {
          name: "Set lot size to 0.05",
          exact: true,
        }),
      );
      assert.equal(
        await sheet
          .getByRole("textbox", { name: "Positions", exact: true })
          .inputValue(),
        "2",
      );
      await activate(
        sheet.getByRole("button", { name: "Confirm settings", exact: true }),
      );
      assert.equal(await sheet.count(), 0);
      assert.match(
        await page.locator(".scanner-settings-launch").innerText(),
        /2 positions · 0.05 lots each/,
      );
      await activate(
        page.getByRole("button", { name: "Edit trade settings", exact: true }),
      );
      await activate(
        sheet.getByRole("button", { name: "Set positions to 5", exact: true }),
      );
      await activate(
        sheet.getByRole("button", {
          name: "Close trade settings",
          exact: true,
        }),
      );
      assert.match(
        await page.locator(".scanner-settings-launch").innerText(),
        /2 positions · 0.05 lots each/,
      );
      await page.screenshot({
        path: `work/scanner-navigation/${stage}-${viewport.width}.png`,
      });
      await activate(
        page
          .locator(".scanner-navigation")
          .getByRole("button", { name: "Home", exact: true }),
      );
      await page.waitForTimeout(350);
      for (const dest of ["MetaTrader", "Settings", "Home"]) {
        await activate(page.getByRole("button", { name: dest, exact: true }));
        await page.waitForTimeout(350);
        assert.equal(await page.locator(".scanner-screen").count(), 0);
        const destination =
          dest === "MetaTrader"
            ? page.locator("#mt5-login")
            : dest === "Settings"
              ? page.getByRole("button", { name: "Select Font", exact: true })
              : page.locator("[data-home-interface]");
        assert.equal(
          await destination.evaluate((el) => Boolean(el.closest("[inert]"))),
          false,
          "normal destination remains interactive",
        );
      }
      assert.equal(
        writes,
        0,
        "navigation and local settings confirmation must not submit trades or alter server state",
      );
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  writeFileSync(
    `work/scanner-navigation/${stage}.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(
    `PASS ${stage}: scanner Trade Settings navigation at mobile and desktop sizes`,
  );
} finally {
  await browser.close();
}
