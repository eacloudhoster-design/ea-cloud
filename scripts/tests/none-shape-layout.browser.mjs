import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const stage = process.env.LAYOUT_STAGE || "after",
  origin = process.env.APP_ORIGIN || "http://127.0.0.1:5185/ea-app/";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
await mkdir("work/none-shape-layout", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
const dynamicOnly = process.env.LAYOUT_DYNAMIC === "1";
const dynamicResults = [];
const near = (a, b, message) =>
  assert(Math.abs(a - b) < 1, `${message}: ${a} != ${b}`);
try {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await context.addInitScript(() =>
      localStorage.setItem("appClientToken", btoa("7:client:fixture")),
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
        json:
          p === "/api/app/me"
            ? { status: "approved", licenseKey: "fixture" }
            : p === "/api/app/dashboard"
              ? {
                  mentor: {
                    robotName: "SMC Blueprint EA V3+",
                    robotTagline: "@ea_cloud",
                    backgroundImageUrl: "/fixture-robot.jpg",
                  },
                  eas: [],
                }
              : p === "/api/app/trading-controls"
                ? { copyingEnabled: true }
                : p === "/api/app/activity"
                  ? { events: [] }
                  : p === "/api/app/activity/snapshot"
                    ? { observedAt: Date.now(), symbols: [], connected: false }
                    : [],
      });
    });
    await page.goto(origin);
    await page.waitForSelector(".ea-startup", { state: "detached" });
    const tab = async (name) => {
      await page.getByRole("button", { name, exact: true }).click();
      await page.waitForTimeout(350);
    };
    const accordion = async (name) => {
      const b = page.getByRole("button", { name, exact: true });
      if (await b.locator(".lucide-chevron-down").count()) await b.click();
    };
    for (const [layout, label] of dynamicOnly
      ? []
      : [
          ["regular", "Regular Interface"],
          ["s2tone", "S2tone_"],
          ["matrix", "The Matrix Interface"],
        ]) {
      await tab("Settings");
      await accordion("Select Main Interface");
      await page.getByRole("button", { name: label, exact: false }).click();
      for (const [shape, label] of [
        ["none", "None"],
        ["orbit", "The Orbit"],
        ["neural", "The Neural Interface"],
      ]) {
        await accordion("Select Shape");
        await page
          .getByRole("button", { name: new RegExp("^" + label) })
          .click({ position: { x: 20, y: 20 } });
        await tab("Home");
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() =>
          document.getAnimations().forEach((a) => {
            if (a instanceof CSSTransition) a.finish();
            else {
              a.pause();
              a.currentTime = 0;
            }
          }),
        );
        const home = page.locator("[data-home-interface]");
        const scroller = page.locator("[data-home-swipe-surface]");
        await scroller.evaluate((el) => (el.scrollTop = 0));
        const rect = async (loc) => {
          const b = await loc.boundingBox();
          assert(b);
          return b;
        };
        const title = home.locator('[data-bot-name="primary"]');
        const pill = home
          .getByText("Powered By", { exact: false })
          .locator("..");
        const symbols = home
          .getByText(
            layout === "matrix"
              ? "QUOTES"
              : layout === "s2tone"
                ? "Symbols"
                : "SYMBOLS",
            { exact: true },
          )
          .locator("..");
        const bot = page.getByRole("button", {
          name: "Open live trading activity",
          exact: true,
        });
        const metrics = {
          viewport,
          layout,
          shape,
          title: await rect(title),
          pill: await rect(pill),
          controls: await rect(symbols),
          status: await rect(home.getByText("ACTIVE", { exact: true })),
          bell: await rect(home.locator("button:has(.lucide-bell)")),
          nav: await rect(
            page.getByRole("button", { name: "Home", exact: true }),
          ),
          floating: await rect(bot),
          background: await page
            .locator("[data-home-background]")
            .getAttribute("src"),
          frames: await home.locator("[data-robot-shape]").count(),
        };
        if (layout === "s2tone") {
          metrics.list = await rect(
            home.getByText("Robots List:", { exact: true }),
          );
          metrics.avatar = await rect(
            home.locator('img[src="/fixture-robot.jpg"]').last(),
          );
        }
        if (shape === "none") assert.equal(metrics.frames, 0);
        else assert.equal(metrics.frames, 1);
        if (stage === "after") {
          const old = JSON.parse(
            await readFile("docs/none-shape-layout/before.json", "utf8"),
          ).find(
            (r) =>
              r.viewport.width === viewport.width &&
              r.layout === layout &&
              r.shape === shape,
          );
          for (const k of ["status", "bell", "nav", "floating"])
            for (const dim of ["x", "y", "width", "height"])
              near(
                metrics[k][dim],
                old[k][dim],
                `${layout}/${shape}/${k}/${dim}`,
              );
          assert.equal(metrics.background, old.background);
          if (shape !== "none")
            for (const k of [
              "title",
              "pill",
              "controls",
              ...(layout === "s2tone" ? ["list", "avatar"] : []),
            ])
              for (const dim of ["x", "y", "width", "height"])
                near(
                  metrics[k][dim],
                  old[k][dim],
                  `${layout}/${shape}/${k}/${dim}`,
                );
          else if (layout === "matrix") {
            for (const k of ["pill", "controls"])
              for (const dim of ["x", "y", "width", "height"])
                near(metrics[k][dim], old[k][dim], `Matrix must preserve ${k}`);
            near(metrics.title.x, old.title.x, "Matrix title x");
            near(metrics.title.width, old.title.width, "Matrix title width");
            near(metrics.title.height, old.title.height, "Matrix title height");
            const barBox = await rect(symbols.locator(".."));
            near(
              barBox.y - (metrics.title.y + metrics.title.height),
              32,
              "Matrix title gap",
            );
            assert(metrics.title.y > old.title.y);
          } else {
            const shift = layout === "regular" ? 314 : 250;
            for (const k of [
              "title",
              "pill",
              "controls",
              ...(layout === "s2tone" ? ["list", "avatar"] : []),
            ])
              near(
                metrics[k].y - old[k].y,
                shift,
                `${layout} content must move together`,
              );
            for (const k of ["title", "pill", "controls"]) {
              near(metrics[k].x, old[k].x, "Content x");
              near(metrics[k].height, old[k].height, "Content height");
            }
          }
        }
        if (viewport.width === 390)
          await page.screenshot({
            path: `work/none-shape-layout/${stage}-${layout}-${shape}.png`,
          });
        results.push(metrics);
        if (stage === "after" && shape === "none") {
          (await symbols.locator("button").count())
            ? await symbols.locator("button").click()
            : await symbols.click();
          await page
            .getByRole("button", { name: "SELECTED SYMBOLS", exact: true })
            .waitFor();
          await page.locator("button:has(.lucide-chevron-left)").click();
          await scroller.evaluate((el) => (el.scrollTop = 0));
          await scroller.hover();
          await page.mouse.wheel(0, 250);
          await page.waitForTimeout(100);
          const canScroll = await scroller.evaluate(
            (el) => el.scrollHeight > el.clientHeight,
          );
          if (canScroll)
            assert((await scroller.evaluate((el) => el.scrollTop)) > 0);
          await scroller.evaluate((el) => (el.scrollTop = 0));
        }
        await tab("Settings");
      }
    }
    if (stage === "after" && dynamicOnly) {
      await tab("Settings");
      await accordion("Select Main Interface");
      await page
        .getByRole("button", { name: "The Matrix Interface", exact: false })
        .click();
      await accordion("Select Shape");
      await page
        .getByRole("button", { name: /^None/ })
        .click({ position: { x: 20, y: 20 } });
      for (const font of ["Inter", "Roboto", "Orbitron", "Flipside BRK"]) {
        await accordion("Select Font");
        await page.getByRole("button", { name: font, exact: true }).click();
        await tab("Home");
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(100);
        for (const width of [
          viewport.width,
          viewport.width === 320 ? 390 : 320,
        ]) {
          await page.setViewportSize({ width, height: viewport.height });
          await page.waitForTimeout(100);
          const geometry = await page
            .locator("[data-home-interface]")
            .evaluate((root) => {
              const name = root.querySelector('[data-bot-name="primary"]'),
                bar = root.querySelector("[data-matrix-functions]");
              return {
                name: name.getBoundingClientRect().toJSON(),
                bar: bar.getBoundingClientRect().toJSON(),
                font: getComputedStyle(name).fontFamily,
              };
            });
          near(
            geometry.bar.y - geometry.name.bottom,
            32,
            "Resized/font-adjusted title gap",
          );
          near(
            geometry.name.x + geometry.name.width / 2,
            width / 2,
            "Resized name centred",
          );
          assert(geometry.font.includes(font));
          dynamicResults.push({
            viewport: { width, height: viewport.height },
            font,
            ...geometry,
          });
        }
        await page.setViewportSize(viewport);
        await tab("Settings");
      }
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(
    `work/none-shape-layout/${dynamicOnly ? "dynamic" : stage}.json`,
    JSON.stringify(dynamicOnly ? dynamicResults : results, null, 2),
  );
  console.log(
    JSON.stringify({
      stage,
      combinations: results.length,
      dynamicChecks: dynamicResults.length,
      passed: true,
    }),
  );
} finally {
  await browser.close();
}
