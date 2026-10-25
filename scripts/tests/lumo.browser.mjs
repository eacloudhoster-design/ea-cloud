// Actual built app with local-only API fixtures; no production writes or live orders.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5190";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
await mkdir("work/lumo", { recursive: true });
const image = await readFile("artifacts/ea-cloud/public/default-robot.jpg");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = [];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 430, height: 932 },
    { width: 1280, height: 900 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: true,
      isMobile: viewport.width < 500,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [],
      writes = [],
      events = [];
    let running = false,
      failStart = false,
      artwork = 1;
    const fallback = viewport.width === 320;
    const name =
      viewport.width === 1280
        ? "A very long mentor configured trading robot name that must wrap naturally in Lumo"
        : "SMC BLUEPRINT EA V3+";
    page.on("pageerror", (e) => errors.push(e.message));
    await context.routeWebSocket("**/api/ws?*", () => {});
    await context.addInitScript(() => {
      localStorage.setItem("appClientToken", btoa("7:client:lumo-fixture"));
      if (!localStorage.getItem("ea-cloud:client:7:home-appearance"))
        localStorage.setItem(
          "ea-cloud:client:7:home-appearance",
          JSON.stringify({
            interfaceStyle: "regular",
            accentColor: "#ef4444",
            showBg: true,
            backgroundAnimation: "none",
          }),
        );
      Object.defineProperty(window, "AudioContext", { value: undefined });
      Object.defineProperty(window, "webkitAudioContext", { value: undefined });
      window.__lumoEvents = [];
      window.addEventListener("ea:assistant", (e) =>
        window.__lumoEvents.push(e.detail),
      );
    });
    await context.route("**/*", async (route) => {
      const req = route.request(),
        u = new URL(req.url());
      if (u.origin !== origin) return route.abort();
      if (u.pathname.startsWith("/lumo-image-"))
        return route.fulfill({ body: image, contentType: "image/jpeg" });
      if (!u.pathname.startsWith("/api/")) return route.continue();
      let json = {};
      if (req.method() !== "GET")
        writes.push({ path: u.pathname, body: req.postDataJSON() });
      if (u.pathname.endsWith("/trading-controls")) {
        if (req.method() === "PATCH") {
          if (failStart)
            return route.fulfill({
              status: 500,
              json: { error: "fixture failed" },
            });
          running = req.postDataJSON().copyingEnabled;
        }
        json = { copyingEnabled: running };
      } else if (u.pathname.endsWith("/app/me"))
        json = { id: 7, status: "approved", licenseKey: "FIXTURE" };
      else if (u.pathname.endsWith("/app/dashboard"))
        json = {
          mentor: {
            id: 5,
            robotName: name,
            robotTagline: "Mentor strategy",
            backgroundImageUrl: fallback ? null : "/lumo-image-1.jpg",
          },
          eas: [{ name, symbol: "XAUUSD,EURUSD" }],
        };
      else if (u.pathname.endsWith("/ea-mode-images"))
        json = {
          eas: [
            {
              id: 11,
              name,
              images: Array(4).fill(
                fallback && artwork === 1 ? null : `/lumo-image-${artwork}.jpg`,
              ),
            },
          ],
        };
      else if (u.pathname.endsWith("/activity/snapshot"))
        json = {
          observedAt: Date.now(),
          engine: false,
          robotEnabled: running,
          connected: false,
          tradeAllowed: false,
          account: null,
          symbols: [],
        };
      else if (u.pathname.endsWith("/activity")) json = { events: [] };
      else if (
        u.pathname.endsWith("/executions") ||
        u.pathname.endsWith("/symbol-configs")
      )
        json = [];
      return route.fulfill({ json });
    });
    await page.goto(origin + "/ea-app/");
    await page.locator(".ea-startup").waitFor({ state: "detached" });
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const surface = page.locator("[data-home-swipe-surface]");
    const choose = async (label) => {
      await nav.getByRole("button", { name: "Settings", exact: true }).click();
      const opt = page
        .getByRole("button")
        .filter({ has: page.getByText(label, { exact: true }) });
      if (!(await opt.isVisible()))
        await page
          .getByRole("button", { name: "Select Main Interface", exact: true })
          .click();
      await opt.click();
      await nav.getByRole("button", { name: "Home", exact: true }).click();
      await page.waitForTimeout(400);
    };
    const beforeDock = await nav.boundingBox();
    await choose("Lumo");
    await page.locator("[data-lumo]").waitFor();
    assert.equal(
      await page
        .locator("[data-home-interface]")
        .getAttribute("data-home-interface"),
      "lumo",
    );
    assert.equal(await page.locator(".lumo-name").textContent(), name);
    assert.ok(
      (await page.locator(".lumo-portrait-image").getAttribute("src")).includes(
        fallback ? "default-robot" : "lumo-image-1",
      ),
    );
    assert.equal(
      await page.locator(".lumo-identity img").getAttribute("src"),
      await page.locator(".lumo-portrait-image").getAttribute("src"),
    );
    assert.deepEqual(await nav.boundingBox(), beforeDock);
    assert.ok(
      Math.abs(beforeDock.y + beforeDock.height - viewport.height) < 1,
      "shared dock remains at viewport bottom",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: `work/lumo/${viewport.width}-lumo.png` });
    const beforeName = await page.locator(".lumo-name").boundingBox();
    const portraitBox = await page.locator(".lumo-portrait").boundingBox();
    await page.locator(".lumo-name").click();
    await page.waitForTimeout(300);
    assert.equal(
      await page
        .locator("[data-home-background]")
        .evaluate((e) => getComputedStyle(e).opacity),
      "0",
    );
    assert.deepEqual(
      await page.locator(".lumo-name").boundingBox(),
      beforeName,
    );
    assert.deepEqual(
      await page.locator(".lumo-portrait").boundingBox(),
      portraitBox,
    );
    await page.locator(".lumo-name").click();
    // Controls use the real existing hooks and panels, with only the API fixture substituted.
    await page.getByRole("button", { name: "Quotes", exact: true }).click();
    await page
      .getByRole("button", { name: "SELECTED SYMBOLS", exact: true })
      .waitFor();
    await page.locator("button:has(.lucide-chevron-left)").click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await page
      .getByRole("heading", { name: "Remove EA?", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(
      writes.length,
      0,
      "Quotes and removal confirmation never issue trading commands",
    );
    failStart = true;
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.waitForFunction(() =>
      window.__lumoEvents.some((e) => e.type === "bot-failed"),
    );
    await page
      .getByRole("button", { name: "Close trading activity", exact: true })
      .click();
    assert.equal(
      await page.locator(".lumo-status").textContent(),
      "Status unconfirmed",
    );
    failStart = false;
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.waitForFunction(() =>
      window.__lumoEvents.some((e) => e.type === "bot-saved" && e.enabled),
    );
    await page
      .getByRole("button", { name: "Close trading activity", exact: true })
      .click();
    assert.equal(
      await page.locator(".lumo-status").textContent(),
      "Robot active",
    );
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await page.waitForFunction(() =>
      window.__lumoEvents.some((e) => e.type === "bot-saved" && !e.enabled),
    );
    const commandCount = writes.length;
    // Upper-middle touch swipes traverse and reverse the new fourth slot.
    const cdp = await context.newCDPSession(page);
    const swipe = async (dx) => {
      await surface.evaluate((e) => (e.scrollTop = 0));
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: viewport.width / 2, y: 180, id: 1 }],
      });
      for (let i = 1; i <= 6; i++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: viewport.width / 2 + (dx * i) / 6, y: 180, id: 1 },
          ],
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await page.waitForTimeout(420);
    };
    const style = () =>
      page.locator("[data-home-interface]").getAttribute("data-home-interface");
    await swipe(-90);
    assert.equal(await style(), "regular");
    await swipe(90);
    assert.equal(await style(), "lumo");
    await swipe(90);
    assert.equal(await style(), "s2tone");
    await swipe(-90);
    assert.equal(await style(), "lumo");
    assert.equal(
      writes.length,
      commandCount,
      "switching interfaces never submits trading commands",
    );
    // Menu follows the existing Settings route, and theme colours update Lumo/dock together.
    await page
      .getByRole("button", { name: "Open Settings", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Select Colour", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Royal Purple", exact: true })
      .click();
    await nav.getByRole("button", { name: "Home", exact: true }).click();
    assert.equal(
      await page
        .locator("[data-lumo]")
        .evaluate((e) => getComputedStyle(e).getPropertyValue("--lumo-accent")),
      "#a855f7",
    );
    assert.equal(
      await nav.evaluate((e) =>
        getComputedStyle(e).getPropertyValue("--nav-accent").trim(),
      ),
      "rgb(168, 85, 247)",
    );
    artwork = 2;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForFunction(() =>
      document
        .querySelector(".lumo-portrait-image")
        ?.getAttribute("src")
        ?.includes("lumo-image-2"),
    );
    assert.equal(
      await page.locator(".lumo-identity img").getAttribute("src"),
      await page.locator(".lumo-portrait-image").getAttribute("src"),
    );
    // Lower information scrolls above the existing dock and exposes only actual context data.
    await page.locator(".lumo-information").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `work/lumo/${viewport.width}-lumo-information.png`,
    });
    await page
      .getByRole("button", { name: "Live trading activity", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Live trading activity monitor" })
      .waitFor();
    await page
      .getByRole("button", { name: "Close trading activity", exact: true })
      .click();
    await surface.evaluate((e) => (e.scrollTop = 0));
    await page.reload();
    await page.locator(".ea-startup").waitFor({ state: "detached" });
    assert.equal(await style(), "lumo");
    assert.equal(
      await page
        .locator("[data-lumo]")
        .evaluate((e) => getComputedStyle(e).getPropertyValue("--lumo-accent")),
      "#a855f7",
    );
    assert.deepEqual(await nav.boundingBox(), beforeDock);
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `work/lumo/${viewport.width}-lumo-purple.png`,
    });
    results.push({ viewport, name, portraitBox, dock: beforeDock, writes });
    console.log("PASS Lumo", viewport.width);
    await context.close();
  }
  await writeFile("work/lumo/results.json", JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
