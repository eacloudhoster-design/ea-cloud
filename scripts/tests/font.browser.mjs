// Real app UI and bundled fonts. API/account data are isolated local fixtures;
// no production login, trading or database calls are made.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const origin = process.env.FONT_ORIGIN || "http://127.0.0.1:5180";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
mkdirSync("work/font-previews", { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = [];
let fontRequests = 0;
const fonts = ["Inter", "Roboto", "Orbitron", "Flipside BRK"];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 1280, height: 900 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: viewport.width < 500,
      hasTouch: viewport.width < 500,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.routeWebSocket("**/api/ws?*", (socket) =>
      socket.onMessage(() => {}),
    );
    let fixtureName = "Smc Blueprint Ea V3+";
    await context.addInitScript(
      ({ legacy }) => {
        if (!localStorage.getItem("appClientToken"))
          localStorage.setItem(
            "appClientToken",
            btoa("7:client:isolated-font-test"),
          );
        const key = "ea-cloud:client:7:bot-font";
        if (!localStorage.getItem(key)) localStorage.setItem(key, legacy);
      },
      { legacy: viewport.width === 320 ? "Exo 2" : "Rajdhani" },
    );
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      // Existing global Inter link stays unchanged; selected bot fonts must still
      // render authentically with every external website deliberately blocked.
      if (url.origin !== origin) return route.abort();
      if (/\.(woff2|ttf)$/.test(url.pathname)) fontRequests++;
      if (url.pathname === "/_fixture/mentor.jpg")
        return route.fulfill({
          contentType: "image/jpeg",
          body: readFileSync("artifacts/ea-cloud/public/default-robot.jpg"),
        });
      if (!url.pathname.startsWith("/api/")) return route.continue();
      let data = {};
      if (url.pathname === "/api/app/me")
        data = { status: "approved", licenseKey: "ISOLATED" };
      if (url.pathname === "/api/app/dashboard")
        data = {
          mentor: {
            robotName: fixtureName,
            backgroundImageUrl: "/_fixture/mentor.jpg",
          },
          eas: [],
        };
      if (url.pathname === "/api/app/trading-controls")
        data = { mt5Connected: false, copyingEnabled: false };
      if (url.pathname === "/api/app/executions") data = [];
      if (url.pathname === "/api/app/activity") data = { events: [] };
      if (url.pathname === "/api/app/activity/snapshot")
        data = {
          observedAt: Date.now(),
          engine: false,
          robotEnabled: false,
          connected: false,
          tradeAllowed: false,
          account: null,
          symbols: [],
        };
      return route.fulfill({ json: data });
    });
    await page.goto(origin + "/ea-app/");
    await page.waitForSelector(".ea-startup", { state: "detached" });
    await page.locator('[data-bot-name="primary"]').waitFor();
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("ea-cloud:client:7:bot-font"),
      ),
      "Inter",
    );
    const client = await context.newCDPSession(page);
    await client.send("DOM.enable");
    await client.send("CSS.enable");
    const settings = async () => {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.waitForTimeout(350);
    };
    for (const [layout, label] of [
      ["matrix", "The Matrix Interface"],
      ["regular", "Regular Interface"],
      ["s2tone", "S2tone_"],
    ]) {
      await settings();
      await page
        .getByRole("button", { name: "Select Main Interface", exact: true })
        .click();
      const option = page
        .getByRole("button")
        .filter({ has: page.getByText(label, { exact: true }) });
      if ((await option.count()) !== 1)
        throw Error("Cannot locate interface option " + label);
      await option.click();
      await page
        .getByRole("button", { name: "Select Font", exact: true })
        .click();
      assert.equal(
        await page.getByRole("button", { name: /^(Rajdhani|Exo 2)$/ }).count(),
        0,
      );
      for (const font of fonts) {
        const choice = page.getByRole("button", { name: font, exact: true });
        await choice.click();
        assert.equal(await choice.getAttribute("aria-pressed"), "true");
        assert.equal(
          await page
            .locator('button[aria-pressed="true"]')
            .filter({
              has: page.locator("p").filter({
                hasText: new RegExp("^(Inter|Roboto|Orbitron|Flipside BRK)$"),
              }),
            })
            .count(),
          1,
        );
        await page.getByRole("button", { name: "Home", exact: true }).click();
        await page.evaluate(() => document.fonts.ready);
        const title = page.locator('[data-bot-name="primary"]');
        const metrics = await title.evaluate((el) => {
          const rect = el.getBoundingClientRect(),
            style = getComputedStyle(el);
          return {
            family: style.fontFamily,
            weight: style.fontWeight,
            left: rect.left,
            right: rect.right,
            centre: (rect.left + rect.right) / 2,
            text: el.textContent,
            scroll: el.scrollWidth,
            width: el.clientWidth,
            transform: style.textTransform,
          };
        });
        assert.equal(metrics.transform, "uppercase");
        assert.equal(metrics.text.toUpperCase(), "SMC BLUEPRINT EA V3+");
        assert.ok(metrics.family.includes("EA Bot " + font));
        assert.equal(metrics.weight, font === "Flipside BRK" ? "400" : "900");
        assert.ok(metrics.scroll <= metrics.width + 1, "Bot name overflows");
        const appBounds = await page
          .locator('[data-bot-name="primary"]')
          .evaluate((el) => {
            let parent = el;
            while (
              parent.parentElement &&
              parent.parentElement.getBoundingClientRect().width <= 460
            )
              parent = parent.parentElement;
            return parent.getBoundingClientRect().toJSON();
          });
        assert.ok(
          Math.abs(metrics.centre - viewport.width / 2) <= 1,
          "Bot name is not horizontally centred",
        );
        assert.ok(
          metrics.left >= -1 && metrics.right <= viewport.width + 1,
          "Title outside viewport",
        );
        const doc = await client.send("DOM.getDocument");
        const node = await client.send("DOM.querySelector", {
          nodeId: doc.root.nodeId,
          selector: '[data-bot-name="primary"]',
        });
        const actual = await client.send("CSS.getPlatformFontsForNode", {
          nodeId: node.nodeId,
        });
        assert.ok(
          actual.fonts.length > 0 && actual.fonts.every((f) => f.isCustomFont),
          "Browser used a fallback font",
        );
        assert.ok(
          actual.fonts.some((f) =>
            f.familyName.toLowerCase().includes(font.toLowerCase()),
          ),
          JSON.stringify(actual.fonts),
        );
        const secondary = await page
          .locator('[data-bot-name="secondary"]')
          .evaluateAll((nodes) =>
            nodes.map((n) => getComputedStyle(n).fontFamily),
          );
        assert(secondary.every((f) => f.includes("EA Bot Inter")));
        results.push({
          viewport,
          layout,
          font,
          actual: actual.fonts.map((f) => ({
            family: f.familyName,
            custom: f.isCustomFont,
          })),
          metrics,
        });
        if (viewport.width === 390 && layout === "matrix")
          await page.waitForTimeout(500);
        if (
          viewport.width === 390 &&
          (layout === "matrix" || font === "Flipside BRK")
        )
          await page.screenshot({
            path: `work/font-previews/${layout}-${font.toLowerCase().replace(" ", "-")}-mobile.png`,
          });
        await settings();
        if (
          !(await page
            .getByRole("button", { name: "Inter", exact: true })
            .isVisible())
        )
          await page
            .getByRole("button", { name: "Select Font", exact: true })
            .click();
        assert.equal(
          await page
            .getByRole("button", { name: font, exact: true })
            .getAttribute("aria-pressed"),
          "true",
        );
      }
    }
    // Reopening a new page in the same browser context exercises storage reload.
    await page.reload();
    await page.locator('[data-bot-name="primary"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.ok(
      (
        await page
          .locator('[data-bot-name="primary"]')
          .evaluate((el) => getComputedStyle(el).fontFamily)
      ).includes("EA Bot Flipside BRK"),
    );
    await settings();
    if (
      !(await page
        .getByRole("button", { name: "Inter", exact: true })
        .isVisible())
    )
      await page
        .getByRole("button", { name: "Select Font", exact: true })
        .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Flipside BRK", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    const reopened = await context.newPage();
    await reopened.goto(origin + "/ea-app/");
    await reopened.locator('[data-bot-name="primary"]').waitFor();
    assert.ok(
      (
        await reopened
          .locator('[data-bot-name="primary"]')
          .evaluate((el) => getComputedStyle(el).fontFamily)
      ).includes("EA Bot Flipside BRK"),
    );
    await reopened.close();
    fixtureName =
      "ExtremelyLongUnbrokenBotNameWithoutSpaces123456789 SMC Blueprint Advanced Trading System V3+";
    await page.reload();
    await page.waitForSelector(".ea-startup", { state: "detached" });
    await page.evaluate(() => document.fonts.ready);
    const longTitle = await page
      .locator('[data-bot-name="primary"]')
      .evaluate((el) => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
        rect: el.getBoundingClientRect().toJSON(),
        transform: getComputedStyle(el).textTransform,
      }));
    assert(longTitle.scroll <= longTitle.width + 1);
    assert.equal(longTitle.transform, "uppercase");
    assert(longTitle.rect.x >= 0 && longTitle.rect.right <= viewport.width + 1);
    assert.deepEqual(errors, []);
    await context.close();
  }
  writeFileSync(
    "work/font-previews/browser-results.json",
    JSON.stringify({ results, fontRequests }, null, 2),
  );
  console.log(
    `${results.length} real-app font/layout/viewport combinations passed; custom bundled glyphs confirmed; navigation/reload/reopen passed.`,
  );
} finally {
  await browser.close();
}
