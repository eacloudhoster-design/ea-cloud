import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5259";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const output = "work/interactive-portrait";
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
    { width: 1280, height: 900, touch: false },
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
            interfaceStyle: "regular",
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
          ? { id: 7, status: "approved", licenseKey: "VALID" }
          : p.endsWith("/app/dashboard")
            ? {
                mentor: {
                  id: 5,
                  robotName: "Portrait Test EA",
                  backgroundImageUrl: "/portrait-1.jpg",
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
                      images: Array(4).fill(`/portrait-${artwork}.jpg`),
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
    const pause = () => page.waitForTimeout(750);
    const tap = async () => {
      if (device.touch) await frame.tap();
      else await frame.click();
    };
    const double = async (point) => {
      if (point) {
        if (device.touch) {
          await page.touchscreen.tap(point.x, point.y);
          await page.waitForTimeout(70);
          await page.touchscreen.tap(point.x, point.y);
        } else await page.mouse.dblclick(point.x, point.y, { delay: 70 });
      } else {
        const r = await frame.boundingBox();
        await double({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
      }
    };
    const restorePoint = () =>
      slot.evaluate((el) => {
        const r = el.getBoundingClientRect(),
          size = parseFloat(el.style.width),
          inset = size === 260 ? 30 : 0;
        for (
          let y = r.top + inset + 14;
          y < Math.min(r.top + size - inset, innerHeight - 100);
          y += 18
        )
          for (
            let x = r.left + inset + 14;
            x < r.left + size - inset;
            x += 18
          ) {
            const target = document.elementFromPoint(x, y);
            const controls = [
              ...el
                .closest("[data-home-interface]")
                .querySelectorAll(
                  "button,a,input,select,textarea,[role=button],[data-bot-name]",
                ),
            ].filter(
              (n) => n !== el && getComputedStyle(n).visibility !== "hidden",
            );
            const near = controls.some((n) => {
              const b = n.getBoundingClientRect();
              return (
                b.width &&
                b.height &&
                x > b.left - 28 &&
                x < b.right + 28 &&
                y > b.top - 28 &&
                y < b.bottom + 28
              );
            });
            if (
              target &&
              !near &&
              !target.closest(
                "button,a,input,select,textarea,[role=button],[data-bot-name],[data-no-interface-swipe]",
              )
            )
              return { x, y };
          }
        return null;
      });
    const navBox = await nav.boundingBox();
    for (const [style, label] of [
      ["regular", "Regular Interface"],
      ["matrix", "The Matrix Interface"],
      ["s2tone", "S2tone_"],
    ]) {
      if (style !== "regular") {
        await nav
          .getByRole("button", { name: "Settings", exact: true })
          .click();
        const option = page.getByRole("button", { name: label, exact: false });
        if (!(await option.isVisible()))
          await page
            .getByRole("button", { name: "Select Main Interface", exact: true })
            .click();
        await option.click();
        await nav.getByRole("button", { name: "Home", exact: true }).click();
        await pause();
      }
      await page.locator(`[data-home-interface="${style}"]`).waitFor();
      await frame.waitFor();
      await pause();
      assert.equal(
        await frame.getAttribute("data-robot-shape"),
        "neural",
        "mentor default for unsaved interface",
      );
      const geometry = () =>
        page.locator("[data-home-swipe-surface]").evaluate((el) =>
          [
            ...el.querySelectorAll(
              "[data-bot-name], button, [data-matrix-branding], [data-matrix-functions], p",
            ),
          ]
            .filter((node) => !node.closest("[data-portrait-interactive]"))
            .map((node) => {
              const r = node.getBoundingClientRect();
              return {
                text: node.textContent,
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
              };
            }),
        );
      const positions = await geometry();
      const before = await frame.boundingBox(),
        src = await frame.locator("img").getAttribute("src"),
        name = await page.locator("[data-bot-name=primary]").boundingBox();
      assert.ok(
        Math.abs(before.x + before.width / 2 - device.width / 2) < 1,
        "portrait remains centred",
      );
      await frame.evaluate((el) => (el.dataset.identity = "same-frame"));
      if (device.width === 390)
        await page.screenshot({
          path: `${output}/${style}-rounded-square.png`,
        });
      await tap();
      await page.waitForTimeout(335);
      const radius = await frame.evaluate((el) =>
        parseFloat(getComputedStyle(el).borderRadius),
      );
      assert.ok(radius > 20 && radius < 50, "morph has intermediate corners");
      await pause();
      assert.equal(await frame.getAttribute("data-robot-shape"), "orbit");
      if (device.width === 390)
        await page.screenshot({ path: `${output}/${style}-circle.png` });
      assert.equal(await frame.getAttribute("data-identity"), "same-frame");
      assert.equal(await frame.locator("img").getAttribute("src"), src);
      assert.deepEqual(await frame.boundingBox(), before);
      // Hide and restore the circular shape too, preserving all sibling positions.
      await double();
      await pause();
      assert.deepEqual(await geometry(), positions);
      await double(await restorePoint());
      await pause();
      assert.equal(await frame.getAttribute("data-robot-shape"), "orbit");
      await tap();
      await pause();
      assert.equal(await frame.getAttribute("data-robot-shape"), "neural");
      await double();
      await page.waitForTimeout(80);
      assert.equal(
        await frame
          .locator(".robot-frame-outline")
          .evaluate((el) => getComputedStyle(el).animationName),
        "portrait-dismiss-glow",
      );
      await pause();
      assert.equal(await frame.count(), 0);
      assert.equal(
        (await slot.boundingBox()).height,
        style === "regular" ? 290 : style === "matrix" ? 260 : 230,
      );
      assert.deepEqual(
        await page.locator("[data-bot-name=primary]").boundingBox(),
        name,
        "Hiding preserves bot-name geometry",
      );
      assert.deepEqual(
        await geometry(),
        positions,
        "Hiding preserves every sibling's geometry",
      );
      assert.deepEqual(await nav.boundingBox(), navBox);
      if (device.width === 390)
        await page.screenshot({ path: `${output}/${style}-none.png` });
      assert.equal(
        await page
          .locator("[data-home-background]")
          .evaluate((el) => getComputedStyle(el).opacity),
        "1",
      );
      const quotes = page
        .locator("[data-home-interface]")
        .getByText(
          style === "matrix"
            ? "QUOTES"
            : style === "s2tone"
              ? "Symbols"
              : "SYMBOLS",
          { exact: true },
        )
        .locator("..");
      if (await quotes.locator("button").count())
        await quotes.locator("button").click();
      else await quotes.click();
      await page
        .getByRole("button", { name: "SELECTED SYMBOLS", exact: true })
        .waitFor();
      assert.equal(await frame.count(), 0);
      await page.locator("button:has(.lucide-chevron-left)").click();
      await page
        .locator("[data-home-swipe-surface]")
        .evaluate((el) => (el.scrollTop = 0));
      await page.waitForTimeout(400);
      const point = await restorePoint();
      console.log("verified gestures", device.width, style);
      assert.ok(
        point,
        "former image area has non-blocking restore coordinates",
      );
      await double(point);
      await page.waitForTimeout(100);
      const fade = await page
        .locator(".interactive-portrait-visual")
        .evaluate((el) => Number(getComputedStyle(el).opacity));
      assert.ok(fade > 0 && fade < 1, "restore fades in gradually");
      await pause();
      assert.equal(
        await frame.getAttribute("data-robot-shape"),
        "neural",
        "double tap preserves last shape without single-toggle",
      );
      // Movement and long press must not become taps.
      const f = await frame.boundingBox();
      await page.mouse.move(f.x + 50, f.y + 50);
      await page.mouse.down();
      await page.mouse.move(f.x + 90, f.y + 110);
      await page.mouse.up();
      await pause();
      assert.equal(await frame.getAttribute("data-robot-shape"), "neural");
      await page.mouse.move(f.x + 50, f.y + 50);
      await page.mouse.down();
      await page.waitForTimeout(400);
      await page.mouse.up();
      await pause();
      assert.equal(await frame.getAttribute("data-robot-shape"), "neural");
      await double();
      await pause();
      await page.reload();
      await page.locator(".ea-startup").waitFor({ state: "detached" });
      await pause();
      assert.equal(
        await frame.count(),
        0,
        "hidden preference persists on reload",
      );
      const persistedPoint = await restorePoint();
      assert.ok(persistedPoint);
      await double(persistedPoint);
      await pause();
      assert.equal(
        await frame.getAttribute("data-robot-shape"),
        "neural",
        "last shape persists through None reload",
      );
      await slot.focus();
      await page.keyboard.press("Enter");
      await pause();
      assert.equal(await frame.getAttribute("data-robot-shape"), "orbit");
      await slot.focus();
      await page.keyboard.press("Escape");
      await pause();
      assert.equal(await frame.count(), 0);
      await slot.focus();
      await page.keyboard.press("Enter");
      await pause();
      assert.equal(await frame.getAttribute("data-robot-shape"), "orbit");
      await page.screenshot({ path: `${output}/${device.width}-${style}.png` });
      results.push({ device, style, src, before });
    }
    const avatar = page.getByRole("button", {
      name: "Open live trading activity",
      exact: true,
    });
    const originalShape = await frame.getAttribute("data-robot-shape");
    await avatar.click();
    await page
      .getByRole("dialog", {
        name: "Live trading activity monitor",
        exact: true,
      })
      .waitFor();
    assert.equal(await frame.getAttribute("data-robot-shape"), originalShape);
    await page
      .getByRole("button", { name: "Close trading activity", exact: true })
      .click();
    const avatarBox = await avatar.boundingBox();
    await page.mouse.move(
      avatarBox.x + avatarBox.width / 2,
      avatarBox.y + avatarBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      avatarBox.x + avatarBox.width / 2 - 45,
      avatarBox.y + avatarBox.height / 2 - 70,
      { steps: 8 },
    );
    await page.mouse.up();
    await page.waitForTimeout(150);
    const moved = await avatar.boundingBox();
    assert.ok(Math.hypot(moved.x - avatarBox.x, moved.y - avatarBox.y) > 20);
    assert.equal(await frame.getAttribute("data-robot-shape"), originalShape);
    // Shared Settings still controls the current image; the colour/glow comes from context.
    await nav.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Select Shape", exact: true })
      .click();
    await page.getByRole("button", { name: /The Neural Interface/ }).click();
    await pause();
    assert.equal(await frame.getAttribute("data-robot-shape"), "neural");
    await page.getByRole("button", { name: /The Orbit/ }).click();
    await pause();
    await page
      .getByRole("button", { name: "Select Colour", exact: true })
      .click();
    await page.getByRole("button", { name: "Pure Red", exact: true }).click();
    await nav.getByRole("button", { name: "Home", exact: true }).click();
    await pause();
    assert.equal(
      await frame.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--portrait-accent"),
      ),
      "#ef4444",
    );
    artwork = 2;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForFunction(
      () =>
        document
          .querySelector("[data-robot-shape] img")
          ?.getAttribute("src") === "/portrait-2.jpg",
    );
    assert.equal(
      await frame.getAttribute("data-robot-shape"),
      "orbit",
      "new mentor artwork retains user shape",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await tap();
    await page.waitForTimeout(350);
    assert.equal(await frame.getAttribute("data-robot-shape"), "neural");
    assert.equal(
      await frame.evaluate((el) => getComputedStyle(el).transitionDuration),
      "0s",
    );
    assert.ok(
      !writes.some((p) => /trading|mode-images|dashboard|symbol/.test(p)),
      "shape never writes trading or mentor state",
    );
    assert.deepEqual(errors, []);
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(origin + "/ea-app/");
    await reopened.locator(".ea-startup").waitFor({ state: "detached" });
    assert.equal(
      await reopened
        .locator("[data-robot-shape]")
        .getAttribute("data-robot-shape"),
      "neural",
      "selection persists after closing and reopening the app page",
    );
    await context.close();
    console.log("PASS", device.width, device.touch ? "touch" : "desktop");
  }
  await writeFile(output + "/results.json", JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
