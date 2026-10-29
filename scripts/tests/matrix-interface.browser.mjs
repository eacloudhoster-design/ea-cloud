import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5259";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const baseline = process.env.MATRIX_BASELINE === "1";
const missingArtwork = process.env.MATRIX_NO_IMAGE === "1";
const output = `work/matrix-interface/${baseline ? "before" : missingArtwork ? "fallback" : "after"}`;
await mkdir(output, { recursive: true });
const image = await readFile("artifacts/ea-cloud/public/default-robot.jpg");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const device of [
    { width: 390, height: 844, touch: true },
    { width: 320, height: 568, touch: true },
    { width: 430, height: 932, touch: true },
    { width: 360, height: 800, touch: true },
  ].filter(
    (d) =>
      !process.env.PORTRAIT_WIDTH ||
      d.width === Number(process.env.PORTRAIT_WIDTH),
  )) {
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      isMobile: device.touch,
      hasTouch: device.touch,
    });
    await context.addInitScript(() => {
      localStorage.setItem("appClientToken", btoa("7:client:fixture"));
      if (!localStorage.getItem("ea-cloud:client:7:home-appearance"))
        localStorage.setItem(
          "ea-cloud:client:7:home-appearance",
          JSON.stringify({
            interfaceStyle: "matrix",
            accentColor: "#a855f7",
            showBg: true,
            backgroundAnimation: "none",
          }),
        );
      Object.defineProperty(window, "AudioContext", { value: undefined });
      Object.defineProperty(window, "webkitAudioContext", { value: undefined });
    });
    await context.routeWebSocket("**/api/ws?*", () => {});
    await context.route("https://fonts.**", (r) => r.abort());
    await context.route("**/portrait-*.jpg", (r) =>
      r.fulfill({ body: image, contentType: "image/jpeg" }),
    );
    const writes = [];
    let artwork = 1;
    await context.route("**/api/**", (r) => {
      const p = new URL(r.request().url()).pathname;
      if (r.request().method() !== "GET") {
        writes.push(p);
        return r.fulfill({ status: 503, json: { error: "fixture" } });
      }
      return r.fulfill({
        json: p.endsWith("/app/me")
          ? {
              id: 7,
              token: btoa("7:client:cookie"),
              status: "approved",
              licenseKey: "VALID",
            }
          : p.endsWith("/app/dashboard")
            ? {
                mentor: {
                  id: 5,
                  robotName: "Portrait Test EA",
                  backgroundImageUrl: missingArtwork ? null : "/portrait-1.jpg",
                  shapeStyle: "neural",
                },
                eas: [],
              }
            : p.endsWith("/app/ea-mode-images")
              ? {
                  eas: [
                    {
                      id: 11,
                      name: "Portrait Test EA",
                      images: missingArtwork
                        ? []
                        : Array(4).fill(`/portrait-${artwork}.jpg`),
                    },
                  ],
                }
              : p.endsWith("/trading-controls")
                ? { copyingEnabled: false }
                : p.endsWith("/app/activity")
                  ? { events: [] }
                  : p.endsWith("/activity/snapshot")
                    ? {
                        observedAt: Date.now(),
                        connected: false,
                        engine: false,
                        robotEnabled: false,
                        account: null,
                        symbols: [],
                      }
                    : [],
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/ea-app/");
    await page.locator(".ea-startup").waitFor({ state: "detached" });
    const nav = page.getByRole("navigation", { name: "Main navigation" }),
      slot = page.locator("[data-portrait-interactive]"),
      frame = page.locator("[data-robot-shape]");

    const pause = () => page.waitForTimeout(600);
    const chooseShape = async (label) => {
      await nav.getByRole("button", { name: "Settings", exact: true }).click();
      const choice = page.getByRole("button", { name: label, exact: false });
      if (!(await choice.isVisible()))
        await page
          .getByRole("button", { name: "Select Shape", exact: true })
          .click();
      await choice.click();
      await nav.getByRole("button", { name: "Home", exact: true }).click();
      await pause();
    };
    const geometry = () =>
      page.evaluate(() => {
        const box = (s) => {
          const el = document.querySelector(s);
          const r = el?.getBoundingClientRect();
          return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
        };
        const name = document.querySelector("[data-bot-name=primary]");
        return {
          name: box("[data-bot-name=primary]"),
          branding: box("[data-matrix-branding]"),
          controls: box("[data-matrix-functions]"),
          nav: box('nav[aria-label="Main navigation"]'),
          header: box(".matrix-portrait-layout > div:first-child"),
          font: getComputedStyle(name).fontFamily,
          fontSize: getComputedStyle(name).fontSize,
          bg: box("[data-home-background]"),
        };
      });
    const states = {};
    for (const [shape, label] of [
      ["neural", "The Neural Interface"],
      ["none", "None"],
      ["orbit", "The Orbit"],
      ["none", "None"],
    ]) {
      await chooseShape(label);
      const g = await geometry();
      if (!baseline) {
        const status = page.locator("[data-matrix-status-image]");
        await status.waitFor();
        if (missingArtwork)
          assert((await status.getAttribute("src")).includes("default-robot"));
        else assert.equal(await status.getAttribute("src"), "/portrait-1.jpg");
        assert(
          await status.evaluate((el) => el.complete && el.naturalWidth > 0),
        );
        assert.equal(
          await status.evaluate((el) => getComputedStyle(el).objectFit),
          "cover",
        );
        if (shape === "none") {
          assert.equal(await frame.count(), 0);
          assert(Math.abs(g.controls.y - (g.name.y + g.name.h) - 32) < 1);
          assert(g.branding.y > g.controls.y + g.controls.h);
        } else {
          assert.equal(await frame.getAttribute("data-robot-shape"), shape);
          assert(Math.abs(g.branding.y - (g.name.y + g.name.h) - 8) < 1);
          assert(g.branding.y + g.branding.h < g.controls.y);
        }
        if (states.neural) {
          assert.deepEqual(g.controls, states.neural.controls);
          assert.deepEqual(g.nav, states.neural.nav);
          assert.deepEqual(g.header, states.neural.header);
        }
      }
      states[shape] = g;
      await page.screenshot({ path: `${output}/${device.width}-${shape}.png` });
    }
    if (!baseline && !missingArtwork) {
      artwork = 2;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForFunction(
        () =>
          document
            .querySelector("[data-matrix-status-image]")
            ?.getAttribute("src") === "/portrait-2.jpg",
      );
      await page.route("**/portrait-3.jpg", (r) =>
        r.fulfill({ status: 404, body: "missing" }),
      );
      artwork = 3;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForTimeout(1000);
      assert(
        await page
          .locator("[data-matrix-status-image]")
          .evaluate((el) => el.complete && el.naturalWidth > 0),
      );
    }
    for (const [style, label] of [
      ["regular", "Regular Interface"],
      ["s2tone", "S2tone_"],
      ["lumo", "Lumo"],
    ]) {
      await nav.getByRole("button", { name: "Settings", exact: true }).click();
      const choice = page.getByRole("button", { name: label, exact: false });
      if (!(await choice.isVisible()))
        await page
          .getByRole("button", { name: "Select Main Interface", exact: true })
          .click();
      await choice.click();
      await nav.getByRole("button", { name: "Home", exact: true }).click();
      await pause();
      await page.locator(`[data-home-interface="${style}"]`).waitFor();
      states[style] = await geometry();
      assert.equal(await page.locator("[data-matrix-status-image]").count(), 0);
      await page.screenshot({ path: `${output}/${device.width}-${style}.png` });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    results.push({ device, states });
    await context.close();
  }
  await writeFile(
    output + "/results.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    "PASS: Matrix None/Neural/Orbit switching, geometry, status image and image updates",
  );
} finally {
  await browser.close();
}
