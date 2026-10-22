// Real client UI with isolated local API fixtures. No production writes.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const origin = process.env.S2TONE_ORIGIN || "http://127.0.0.1:5180";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
mkdirSync("work/s2tone-buttons", { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = [];
const baseline = process.env.S2TONE_BASELINE === "1";
const baselineFile = "work/s2tone-buttons/baseline.json";
const before = baseline
  ? []
  : JSON.parse(
      readFileSync(
        "scripts/tests/fixtures/s2tone-buttons-baseline.json",
        "utf8",
      ),
    );
const writes = [];
let rejectToggle = false;
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 800 },
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
    await context.addInitScript(() => {
      if (!localStorage.getItem("appClientToken"))
        localStorage.setItem(
          "appClientToken",
          btoa("7:client:isolated-font-test"),
        );
    });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      // Existing global Inter link stays unchanged; selected bot fonts must still
      // render authentically with every external website deliberately blocked.
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/_fixture/mentor.jpg")
        return route.fulfill({
          contentType: "image/jpeg",
          body: readFileSync("artifacts/ea-cloud/public/default-robot.jpg"),
        });
      if (!url.pathname.startsWith("/api/")) return route.continue();
      let data = {};
      if (
        url.pathname === "/api/app/trading-controls" &&
        route.request().method() === "PATCH"
      ) {
        writes.push(JSON.parse(route.request().postData()));
        return route.fulfill({
          status: rejectToggle ? 503 : 200,
          json: { ok: !rejectToggle },
        });
      }
      if (url.pathname === "/api/app/symbol-configs") data = [];
      if (url.pathname === "/api/app/me")
        data = { status: "approved", licenseKey: "ISOLATED" };
      if (url.pathname === "/api/app/dashboard")
        data = {
          mentor: {
            robotName: "SMC BLUEPRINT EA V3+",
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
    await page.locator('[data-bot-name="primary"]').waitFor();
    const activate = (control) =>
      viewport.width < 500 ? control.tap() : control.click();
    const settings = async () => {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
    };
    for (const [layout, label] of [
      ["regular", "Regular Interface"],
      ["matrix", "The Matrix Interface"],
      ["s2tone", "S2tone_"],
    ]) {
      await settings();
      if (!(await page.getByText(label, { exact: true }).isVisible()))
        await page
          .getByRole("button", { name: "Select Main Interface", exact: true })
          .click();
      await page
        .getByRole("button")
        .filter({ has: page.getByText(label, { exact: true }) })
        .click();
      await page.getByRole("button", { name: "Home", exact: true }).click();
      await page.waitForTimeout(500);
      const marker = await page
        .locator('[data-bot-name="primary"]')
        .evaluate((el) => ({
          text: el.textContent,
          font: getComputedStyle(el).fontFamily,
        }));
      const names =
        layout === "s2tone"
          ? ["Remove", "Start", "Symbols"]
          : layout === "regular"
            ? ["Remove", "Start", "Symbols"]
            : ["Remove", "Start", "Quotes"];
      const controls = names.map((name) =>
        layout === "regular"
          ? page
              .getByText(name.toUpperCase(), { exact: true })
              .locator("..")
              .getByRole("button")
          : page.getByRole("button", {
              name: new RegExp("^" + name + "$", "i"),
            }),
      );
      const signatures = [];
      for (const control of controls)
        signatures.push(
          await control.evaluate((el) => ({
            html: el.outerHTML,
            height: el.getBoundingClientRect().height,
            width: el.getBoundingClientRect().width,
            background: getComputedStyle(el).background,
            shadow: getComputedStyle(el).boxShadow,
          })),
        );
      const record = { viewport, layout, marker, signatures };
      if (baseline) {
        results.push(record);
        if (viewport.width === 390)
          await page.screenshot({
            path: "work/s2tone-buttons/before-" + layout + ".png",
          });
        continue;
      }
      const original = before.find(
        (item) =>
          item.layout === layout && item.viewport.width === viewport.width,
      );
      assert.deepEqual(
        marker,
        original.marker,
        "Bot-name content/font changed",
      );
      if (layout !== "s2tone") {
        assert.deepEqual(
          signatures,
          original.signatures,
          "Other layout controls changed",
        );
        continue;
      }
      for (let i = 0; i < 3; i++) {
        assert.equal(signatures[i].height, 58);
        assert.equal(signatures[i].width, original.signatures[i].width);
      }
      for (const [colour, rgb] of [
        ["Pure Red", "239,68,68"],
        ["Electric Blue", "59,130,246"],
        ["Emerald Green", "34,197,94"],
      ]) {
        await settings();
        if (
          !(await page
            .getByRole("button", { name: "Pure Red", exact: true })
            .isVisible())
        )
          await page
            .getByRole("button", { name: "Select Colour", exact: true })
            .click();
        await page
          .getByRole("button", { name: new RegExp("^" + colour + "$") })
          .click();
        await page.getByRole("button", { name: "Home", exact: true }).click();
        await page.waitForTimeout(400);
        assert.equal(await page.locator(".s2tone-action-button").count(), 3);
        const styles = await page
          .locator(".s2tone-action-button")
          .evaluateAll((elements) =>
            elements.map((el) => {
              const s = getComputedStyle(el),
                p = getComputedStyle(el, "::before");
              return {
                accent: s.getPropertyValue("--s2tone-accent-rgb"),
                shadow: s.boxShadow,
                background: s.backgroundImage,
                highlight: p.backgroundImage,
                pointer: p.pointerEvents,
                duration: s.transitionDuration,
                radius: s.borderRadius,
              };
            }),
          );
        for (const style of styles) {
          assert.equal(style.accent.trim(), rgb);
          assert.match(style.shadow, /inset/);
          assert.match(style.background, /gradient/);
          assert.match(style.highlight, /gradient/);
          assert.equal(style.pointer, "none");
          assert.ok(
            style.duration.split(", ").every((value) => value === "0.18s"),
          );
          assert.equal(style.radius, "16px");
        }
        await activate(
          page.getByRole("button", { name: "Symbols", exact: true }),
        );
        await page.getByText("SELECTED SYMBOLS", { exact: true }).waitFor();
        await page
          .getByRole("heading", {
            name: "SMC BLUEPRINT EA V3+",
            exact: true,
            level: 2,
          })
          .locator("..")
          .getByRole("button")
          .click();
        await activate(
          page.getByRole("button", { name: "Remove", exact: true }),
        );
        await page
          .getByRole("heading", { name: "Remove EA?", exact: true })
          .waitFor();
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        const start = page.getByRole("button", { name: "Start", exact: true });
        assert.equal(await start.locator("svg.lucide-play").count(), 1);
        await activate(start);
        const stop = page.getByRole("button", { name: "Stop", exact: true });
        await stop.waitFor();
        assert.equal(await stop.locator("svg.lucide-pause").count(), 1);
        assert.equal(await stop.locator("svg.lucide-play").count(), 0);
        await page.waitForTimeout(200);
        assert.deepEqual(writes.at(-1), { copyingEnabled: true });
        if (viewport.width === 390)
          await page.screenshot({
            path:
              "work/s2tone-buttons/stop-" +
              colour.toLowerCase().replaceAll(" ", "-") +
              ".png",
          });
        await activate(stop);
        await start.waitFor();
        await page.waitForTimeout(200);
        assert.deepEqual(writes.at(-1), { copyingEnabled: false });
        // Exercise actual pointer-down visual feedback without submitting an action.
        for (const control of [
          page.getByRole("button", { name: "Remove", exact: true }),
          start,
          page.getByRole("button", { name: "Symbols", exact: true }),
        ]) {
          await control.scrollIntoViewIfNeeded();
          const normal = await control.evaluate((el) => ({
            shadow: getComputedStyle(el).boxShadow,
            transform: getComputedStyle(el).transform,
          }));
          const rect = await control.boundingBox();
          await page.mouse.move(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          );
          await page.mouse.down();
          await page.waitForTimeout(220);
          const pressed = await control.evaluate((el) => ({
            shadow: getComputedStyle(el).boxShadow,
            transform: getComputedStyle(el).transform,
          }));
          assert.notEqual(pressed.transform, normal.transform);
          assert.notEqual(pressed.shadow, normal.shadow);
          if (
            viewport.width === 390 &&
            colour === "Pure Red" &&
            (await control.textContent()).trim() === "Remove"
          )
            await page.screenshot({
              path: "work/s2tone-buttons/pressed-remove.png",
            });
          await page.mouse.move(1, 1);
          await page.mouse.up();
          await page.waitForTimeout(220);
          assert.equal(
            await control.evaluate((el) => getComputedStyle(el).transform),
            "none",
          );
        }
        if (viewport.width === 390)
          await page.screenshot({
            path:
              "work/s2tone-buttons/after-" +
              colour.toLowerCase().replaceAll(" ", "-") +
              ".png",
          });
        results.push({
          viewport,
          colour,
          styles,
          originalDimensions: original.signatures.map(({ width, height }) => ({
            width,
            height,
          })),
        });
      }
      // Existing failed PATCH rollback must restore Start + Play, not leave Stop.
      rejectToggle = true;
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await page.waitForTimeout(300);
      assert.equal(
        await page
          .getByRole("button", { name: "Start", exact: true })
          .locator("svg.lucide-play")
          .count(),
        1,
      );
      rejectToggle = false;
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  writeFileSync(
    baseline ? baselineFile : "work/s2tone-buttons/browser-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(
    baseline
      ? "Baseline captured"
      : "S2tone colours, icons, callbacks, rollback and press/release passed at mobile/desktop sizes; Regular/Matrix controls unchanged.",
  );
} finally {
  await browser.close();
}
