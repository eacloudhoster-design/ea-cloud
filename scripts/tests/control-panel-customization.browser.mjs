import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5234/ea-app/";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const output = "work/custom-controls";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  for (const width of (process.env.CONTROL_WIDTHS || "390,320,1280")
    .split(",")
    .map(Number))
    for (const style of ["matrix"]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        isMobile: width < 600,
        hasTouch: width < 600,
        userAgent:
          width < 600
            ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
            : undefined,
      });
      await context.addInitScript(
        ({ style }) => {
          Object.defineProperty(navigator, "standalone", { value: true });
          window.AudioContext = undefined;
          window.webkitAudioContext = undefined;
          if (!localStorage.getItem("ea-cloud:client:7:home-appearance"))
            localStorage.setItem(
              "ea-cloud:client:7:home-appearance",
              JSON.stringify({
                interfaceStyle: style,
                showBg: true,
                backgroundAnimation: "none",
                accentColor: "#ef4444",
              }),
            );
        },
        { style },
      );
      await context.route("https://fonts.**", (r) => r.abort());
      let signedOut = false,
        running = false;
      const writes = [];
      await context.route("**/api/**", async (r) => {
        const path = new URL(r.request().url()).pathname;
        if (path === "/api/app/logout") {
          signedOut = true;
          return r.fulfill({ json: { ok: true } });
        }
        if (path === "/api/app/me" && signedOut)
          return r.fulfill({ status: 401, json: {} });
        let json = [];
        if (path === "/api/app/me")
          json = {
            id: 7,
            token: btoa("7:client:cookie"),
            status: "approved",
            licenseKey: "TEST",
          };
        if (path === "/api/app/dashboard")
          json = {
            mentor: {
              id: 5,
              robotName: "EA Cloud Pro",
              backgroundImageUrl: "/default-robot.jpg",
            },
            eas: [],
          };
        if (path === "/api/app/ea-mode-images")
          json = {
            eas: [
              {
                id: 1,
                name: "EA Cloud Pro",
                images: Array(4).fill("/default-robot.jpg"),
              },
            ],
          };
        if (path === "/api/app/trading-controls") {
          if (r.request().method() === "PATCH") {
            running = r.request().postDataJSON().copyingEnabled;
            writes.push(running);
          }
          json = { copyingEnabled: running };
        }
        if (path.endsWith("/activity/snapshot"))
          json = {
            observedAt: Date.now(),
            engine: false,
            robotEnabled: running,
            connected: false,
            tradeAllowed: false,
            account: null,
            symbols: [],
          };
        if (path.endsWith("/activity")) json = { events: [] };
        if (path === "/api/app/scanner/history")
          json = { records: [], hasMore: false };
        return r.fulfill({ json });
      });

      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(origin);
      await page.waitForSelector(".ea-startup", {
        state: "detached",
        timeout: 25000,
      });
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      const controls = page.getByRole("group", {
        name: "Robot controls",
        exact: true,
      });
      const settings = page.locator(".ea-settings");
      const selectInterface = async (label) => {
        await nav
          .getByRole("button", { name: "Settings", exact: true })
          .click();
        const option = settings.getByRole("button", {
          name: new RegExp("^" + label),
        });
        if (!(await option.isVisible()))
          await settings
            .getByRole("button", { name: "Select Main Interface", exact: true })
            .click();
        await option.click();
        await nav.getByRole("button", { name: "Home", exact: true }).click();
      };
      const choose = async (label) => {
        await nav
          .getByRole("button", { name: "Settings", exact: true })
          .click();
        const option = settings.getByRole("button", {
          name: label,
          exact: true,
        });
        if (!(await option.isVisible()))
          await settings
            .getByRole("button", { name: "Control Panel", exact: true })
            .click();
        await option.click();
        assert.equal(await option.getAttribute("aria-pressed"), "true");
        await nav.getByRole("button", { name: "Home", exact: true }).click();
      };
      const geometry = () =>
        page.evaluate(() =>
          Object.fromEntries(
            [
              '[data-bot-name="primary"]',
              "[data-portrait-interactive]",
              'nav[aria-label="Main navigation"]',
              "[data-matrix-functions]",
              "[data-matrix-branding]",
            ].map((s) => {
              const r = document.querySelector(s)?.getBoundingClientRect();
              return [
                s,
                r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
              ];
            }),
          ),
        );
      const swipe = async (dx, dy = 0) => {
        await controls.scrollIntoViewIfNeeded();
        // Browser touch input, including compatibility clicks, on the center button.
        const button = controls.locator(".lumo-toggle");
        const b = await button.boundingBox();
        const session = await context.newCDPSession(page);
        const x = b.x + b.width / 2,
          y = b.y + b.height / 2;
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        for (let i = 1; i <= 6; i++)
          await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: x + (dx * i) / 6, y: y + (dy * i) / 6 }],
          });
        await session.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await session.detach();
        await page.waitForTimeout(280);
      };
      await controls.waitFor();
      await controls.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const before = await geometry();
      const box = await controls.boundingBox();
      for (const panel of ["Regular Panel", "Matrix Panel", "Default Panel"]) {
        await choose(panel);
        await controls.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        assert.deepEqual(
          await geometry(),
          before,
          "skin must not move surroundings",
        );
        assert.deepEqual(
          await controls.boundingBox(),
          box,
          "all skins retain original slot",
        );
        await page.screenshot({
          path: `${output}/${width}-${panel.split(" ")[0]}.png`,
        });
      }
      assert.deepEqual(writes, [], "settings must never send robot commands");
      for (const expected of ["regular", "matrix", "default"]) {
        await swipe(-80);
        assert.equal(
          await controls.getAttribute("data-control-panel"),
          expected,
        );
      }
      for (const expected of ["matrix", "regular", "default"]) {
        await swipe(80);
        assert.equal(
          await controls.getAttribute("data-control-panel"),
          expected,
        );
      }
      await swipe(30);
      assert.equal(
        await controls.getAttribute("data-control-panel"),
        "default",
      );
      await swipe(0, 80);
      assert.equal(
        await controls.getAttribute("data-control-panel"),
        "default",
        "vertical scrolling must not select",
      );
      assert.deepEqual(
        writes,
        [],
        "swipes beginning on Start must not activate robot",
      );
      for (const panel of ["Default Panel", "Regular Panel", "Matrix Panel"]) {
        await choose(panel);
        await controls
          .getByRole("button", {
            name: panel === "Matrix Panel" ? "Symbols" : "Quotes",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", { name: "SELECTED SYMBOLS", exact: true })
          .waitFor();
        await page.locator("button:has(.lucide-chevron-left)").click();
        await controls
          .getByRole("button", { name: "Remove", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Remove EA?", exact: true })
          .waitFor();
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
      }
      await controls
        .getByRole("button", { name: "Start", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Close trading activity", exact: true })
        .click();
      await controls
        .getByRole("button", { name: "Stop", exact: true })
        .waitFor();
      await choose("Regular Panel");
      assert(
        await controls
          .getByRole("button", { name: "Stop", exact: true })
          .isVisible(),
      );
      assert.deepEqual(
        writes,
        [true],
        "switching active panel must not stop/restart",
      );
      await controls.getByRole("button", { name: "Stop", exact: true }).click();
      assert.deepEqual(writes, [true, false]);
      await choose("Matrix Panel");
      for (const label of [
        "Regular Interface",
        "Lumo",
        "The Matrix Interface",
      ]) {
        await selectInterface(label);
        assert.equal(
          await controls.getAttribute("data-control-panel"),
          "matrix",
        );
      }
      await selectInterface("S2tone_");
      assert.equal(
        await controls.count(),
        0,
        "S2tone must not mount custom controls",
      );
      await choose("Regular Panel");
      assert.equal(await controls.count(), 0);
      await selectInterface("The Matrix Interface");
      assert.equal(
        await controls.getAttribute("data-control-panel"),
        "regular",
      );
      await page.reload();
      await page.waitForSelector(".ea-startup", {
        state: "detached",
        timeout: 25000,
      });
      assert.equal(
        await controls.getAttribute("data-control-panel"),
        "regular",
      );
      await nav.getByRole("button", { name: "Settings", exact: true }).click();
      await settings
        .getByRole("button", { name: "Control Panel", exact: true })
        .click();
      assert.equal(
        await settings
          .getByRole("button", { name: "Regular Panel", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      await nav.getByRole("button", { name: "Home", exact: true }).click();
      // Existing interface swipe outside controls remains available.
      await page
        .locator("[data-home-swipe-surface]")
        .evaluate((n) => (n.scrollTop = 0));
      await page.locator("[data-home-swipe-surface]").evaluate((n) => {
        for (const [type, x] of [
          ["pointerdown", 250],
          ["pointerup", 140],
        ])
          n.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              pointerType: "touch",
              isPrimary: true,
              pointerId: 9,
              clientX: x,
              clientY: 120,
            }),
          );
      });
      await page.waitForTimeout(350);
      assert.equal(
        await page
          .locator("[data-home-interface]")
          .getAttribute("data-home-interface"),
        "s2tone",
      );
      assert.deepEqual(writes, [true, false]);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.equal(await page.evaluate(() => visualViewport.scale), 1);
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${width}px: variants, stable geometry, touch/vertical gestures, actions, persistence, interfaces, S2tone exclusion`,
      );
      await context.close();
    }
} finally {
  await browser.close();
}
