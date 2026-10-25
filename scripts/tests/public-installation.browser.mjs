import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5212";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const output = process.env.PUBLIC_OUTPUT || "work/public-installation";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    const touch = viewport.width < 500;
    const context = await browser.newContext({
      viewport,
      hasTouch: touch,
      isMobile: touch,
    });
    await context.route("https://fonts.**", (r) => r.abort());
    // Installation-guide tests start with a saved rejection; consent itself has dedicated coverage.
    await context.addInitScript(() =>
      localStorage.setItem(
        "ea-cloud:privacy-consent:v1",
        JSON.stringify({
          version: 1,
          functional: false,
          analytics: false,
          marketing: false,
          expiresAt: Date.now() + 86400000,
        }),
      ),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1700);
    const type = await page.evaluate(() => ({
      titleAsset: document.querySelector("#hero-title img").getAttribute("src"),
      titleFit: getComputedStyle(document.querySelector("#hero-title img"))
        .objectFit,
      paragraph: getComputedStyle(document.querySelector(".hero-description"))
        .fontFamily,
      nav: getComputedStyle(document.querySelector(".public-nav-links a"))
        .fontFamily,
      periodCount: document.querySelectorAll(".hero-title-period").length,
      loaded:
        document.querySelector("#hero-title img").complete &&
        document.querySelector("#hero-title img").naturalWidth > 0,
      headingWidth: document.querySelector("#hero-title").scrollWidth,
      headingClient: document.querySelector("#hero-title").clientWidth,
    }));
    assert.equal(type.titleAsset, "/ea-cloud-wordmark.png");
    assert.equal(type.titleFit, "contain");
    assert(type.loaded);
    assert(!type.paragraph.includes("EA Cloud Hero"));
    assert(!type.nav.includes("EA Cloud Hero"));
    assert.equal(type.periodCount, 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      viewport.width,
    );
    console.log(viewport.width, type);
    await page.screenshot({
      path: `${output}/${viewport.width}-hero-font.png`,
    });
    const activate = (el) => (touch ? el.tap() : el.click());
    for (const platform of ["iOS", "Android"]) {
      const button = page.getByRole("button", {
        name: `Get ${platform} Version`,
        exact: true,
      });
      await button.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await activate(button);
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await page.waitForTimeout(300);
      assert(
        await dialog
          .getByText("EA Cloud installs from your browser.", { exact: false })
          .isVisible(),
      );
      assert.equal(await dialog.locator("a").getAttribute("href"), "/ea-app/");
      assert.equal(await dialog.locator("ol li").count(), 3);
      const text = await dialog.innerText();
      assert(text.includes(platform === "iOS" ? "Safari" : "Install app"));
      assert(
        text.includes(
          platform === "iOS" ? "Add to Home Screen" : "Add to Home screen",
        ),
      );
      assert(
        !(await dialog
          .locator('a[href*="apple.com"],a[href*="play.google"]')
          .count()),
      );
      const b = await dialog.boundingBox();
      assert(b.x >= 0 && b.x + b.width <= viewport.width + 0.1);
      assert(b.y >= 0 && b.y + b.height <= viewport.height + 0.1);
      await page.screenshot({
        path: `${output}/${viewport.width}-${platform.toLowerCase()}-guide.png`,
      });
      await dialog.locator("input[readonly]").scrollIntoViewIfNeeded();
      assert.equal(
        await dialog.locator("input[readonly]").inputValue(),
        origin + "/ea-app/",
      );
      const popupEvent = page.waitForEvent("popup");
      await dialog.getByRole("link", { name: "Open EA Cloud" }).click();
      const popup = await popupEvent;
      await popup.waitForLoadState("domcontentloaded");
      assert.equal(new URL(popup.url()).pathname, "/ea-app/");
      assert.equal(await popup.title(), "EA Cloud App");
      await popup.close();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert(await button.evaluate((el) => el === document.activeElement));
    }
    // Clipboard denial provides a usable manual selection fallback, never a false success.
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw Error("fixture denial");
          },
        },
      }),
    );
    await activate(
      page.getByRole("button", { name: "Get iOS Version", exact: true }),
    );
    await page
      .getByRole("button", { name: "Copy app address", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Copy the address from the field above" })
      .waitFor();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.notEqual(
      await page.evaluate(() => getComputedStyle(document.body).pointerEvents),
      "none",
    );
    await page.locator("#features").scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    assert.equal(await page.locator(".public-feature-card").count(), 6);
    assert.deepEqual(errors, []);
    results.push({
      viewport,
      typography: type,
      iosGuide: true,
      androidGuide: true,
      realAppEntry: true,
      manualCopyFallback: true,
      modalCloseAndFocus: true,
      overflow: false,
      scope: "typography and installation guidance",
    });
    await context.close();
  }
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        results,
        physicalDevices: false,
        nativeInstallPrompt:
          "No handler exists in app; manual browser installation instructions link to existing manifest-scoped app entry.",
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: original hero lettering and real iOS/Android web-app installation guidance.",
  );
} finally {
  await browser.close();
}
