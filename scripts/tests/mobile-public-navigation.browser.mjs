import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5216",
  before = process.env.BEFORE_ORIGIN || "http://127.0.0.1:5217";
for (const url of [origin, before])
  assert(["localhost", "127.0.0.1"].includes(new URL(url).hostname));
const output = process.env.PUBLIC_OUTPUT || "work/mobile-nav/verified";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
  ].filter(
    (v) =>
      !process.env.MOBILE_WIDTH || v.width === Number(process.env.MOBILE_WIDTH),
  )) {
    const context = await browser.newContext({
      viewport,
      hasTouch: true,
      isMobile: true,
    });
    await context.route("https://fonts.**", (r) => r.abort());
    await context.route("**/api/**", (r) => r.fulfill({ json: [] }));
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await page
      .locator(".hero-showcase img")
      .evaluateAll((imgs) => Promise.all(imgs.map((i) => i.decode())));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1900);
    const nav = page.locator(".public-header");
    const logo = await nav.locator(".public-brand img").boundingBox(),
      hamburger = await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .boundingBox(),
      account = page.getByRole("button", { name: "Account menu", exact: true });
    const ar = await account.boundingBox();
    assert(Math.abs(logo.x + logo.width / 2 - viewport.width / 2) < 0.5);
    assert(hamburger.x < logo.x && ar.x > logo.x + logo.width);
    assert.equal(await nav.locator(".public-brand>span").isVisible(), false);
    assert.equal(await nav.locator(".public-get-app").isVisible(), false);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      viewport.width,
    );
    await page.screenshot({ path: `${output}/${viewport.width}-home.png` });
    const epoch = await page.evaluate(() => performance.timeOrigin);
    const dialog = page.getByRole("dialog", {
      name: "Your EA Cloud account",
      exact: true,
    });
    let openingFrames = null;
    const open = async () => {
      await account.tap();
      await dialog.waitFor();
      if (!openingFrames) {
        openingFrames = [];
        for (const wait of [0, 80, 120, 160]) {
          await page.waitForTimeout(wait);
          openingFrames.push({ wait, ...(await dialog.boundingBox()) });
        }
        assert(
          openingFrames[0].y > openingFrames.at(-1).y + 10,
          "real sheet frames travel upward",
        );
        assert(
          openingFrames.every(
            (frame, index) =>
              index === 0 || frame.y <= openingFrames[index - 1].y + 0.5,
          ),
          "opening movement progresses smoothly upward",
        );
      } else await page.waitForTimeout(400);
    };
    const closed = async () => {
      await page.locator(".public-mobile-sheet").waitFor({ state: "hidden" });
      await page.waitForTimeout(90);
      assert.equal(await page.locator(".public-mobile-backdrop").count(), 0);
      assert.notEqual(
        await page.evaluate(
          () => getComputedStyle(document.body).pointerEvents,
        ),
        "none",
      );
    };
    const outside = async () => {
      await page.touchscreen.tap(8, 80);
      await closed();
    };
    await page.evaluate(() => scrollTo(0, 260));
    await page.waitForTimeout(120);
    const scrollBefore = await page.evaluate(() => scrollY);
    await open();
    const bounds = await dialog.boundingBox();
    assert(
      bounds.y >= 90 &&
        Math.abs(bounds.y + bounds.height - viewport.height) < 1,
    );
    assert.equal(await page.locator(".public-mobile-backdrop").count(), 1);
    await page.mouse.wheel(0, 240);
    assert.equal(
      await page.evaluate(() => scrollY),
      scrollBefore,
      "background scroll is locked",
    );
    await page.screenshot({ path: `${output}/${viewport.width}-account.png` });
    await outside();
    assert.equal(
      await page.evaluate(() => scrollY),
      scrollBefore,
      "outside dismissal preserves position",
    );
    await open();
    await page.goBack();
    await closed();
    assert.equal(await page.evaluate(() => scrollY), scrollBefore);
    assert.equal(
      await page.evaluate(() => performance.timeOrigin),
      epoch,
      "Back does not reload",
    );
    await page.goForward();
    await dialog.waitFor();
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await closed();
    const cdp = await context.newCDPSession(page);
    const swipe = async (locator, dy, steps = 8, pause = 18) => {
      const b = await locator.boundingBox();
      const x = b.x + b.width / 2,
        y = b.y + b.height / 2;
      const delta = Math.min(dy, viewport.height - y - 4);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 1 }],
      });
      for (let i = 1; i <= steps; i++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: y + (delta * i) / steps, id: 1 }],
        });
        await page.waitForTimeout(pause);
      }
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    };
    await open();
    await swipe(dialog.locator("[data-sheet-handle]"), 24, 8, 40);
    await page.waitForTimeout(300);
    assert(await dialog.isVisible(), "small pull snaps back");
    assert.equal(
      await dialog.evaluate((el) => el.style.getPropertyValue("--sheet-drag")),
      "0px",
    );
    // An immediate intentional tap after a cancelled pull must not be swallowed.
    await dialog.getByRole("button", { name: "Help", exact: true }).tap();
    await dialog.getByRole("group", { name: "Help options" }).waitFor();
    await dialog.getByRole("button", { name: "Help", exact: true }).tap();
    await swipe(dialog.locator("[data-sheet-handle]"), 180);
    await closed();
    assert.equal(await page.evaluate(() => scrollY), scrollBefore);
    await open();
    const url = page.url();
    await swipe(
      dialog.getByRole("link", { name: "Sign In", exact: true }),
      150,
    );
    await closed();
    assert.equal(page.url(), url, "swipe on a row never activates its link");
    await open();
    await dialog.getByRole("button", { name: "Help", exact: true }).tap();
    await page.waitForTimeout(250);
    await dialog.getByRole("group", { name: "Help options" }).waitFor();
    await page.screenshot({ path: `${output}/${viewport.width}-help.png` });
    await dialog.getByRole("button", { name: "Help", exact: true }).tap();
    await dialog.getByRole("button", { name: "English", exact: true }).tap();
    await page.waitForTimeout(250);
    const languages = dialog.getByRole("group", { name: "Website languages" });
    await languages.waitFor();
    assert(
      await languages
        .getByRole("button", { name: "Português Not yet available" })
        .isDisabled(),
    );
    assert(
      await languages
        .getByRole("button", { name: "Español Not yet available" })
        .isDisabled(),
    );
    await page.screenshot({
      path: `${output}/${viewport.width}-languages.png`,
    });
    if (viewport.height < 600) {
      await dialog.getByRole("button", { name: "Help", exact: true }).tap();
      const content = dialog.locator(".public-sheet-scroll");
      await content.evaluate((el) => (el.scrollTop = 0));
      await swipe(content, -100);
      await page.waitForTimeout(250);
      assert(
        await content.evaluate((el) => el.scrollTop > 15),
        "expanded content scrolls with a native upward gesture",
      );
      assert(await dialog.isVisible());
      await swipe(content, 95);
      await page.waitForTimeout(250);
      assert(
        await dialog.isVisible(),
        "scrolling content downward does not dismiss the sheet while it is scrolled",
      );
      await dialog.getByRole("button", { name: "Help", exact: true }).tap();
    }
    await languages.getByRole("button", { name: "English", exact: true }).tap();
    assert.equal(await languages.count(), 0);
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    await outside();
    // Help navigation removes its history marker before scrolling the existing page.
    await open();
    await dialog.getByRole("button", { name: "Help", exact: true }).tap();
    await dialog
      .getByRole("link", { name: "Frequently asked questions", exact: true })
      .tap();
    await closed();
    await page.waitForTimeout(1100);
    assert((await page.locator("#help").boundingBox()).y < 180);
    assert.equal(
      await page.evaluate(() => history.state?.eaPublicMobilePanel || null),
      null,
    );
    // Existing sign-in/signup routes remain interactive, and selecting a section on Register returns to Home.
    await open();
    await dialog.getByRole("link", { name: "Sign In", exact: true }).tap();
    await page.waitForURL("**/admin/login");
    await page.getByPlaceholder("admin@eacloud.com").fill("test@example.com");
    assert.equal(await page.locator(".public-mobile-backdrop").count(), 0);
    await page.goto(origin);
    await page.waitForTimeout(1200);
    await open();
    await dialog.getByRole("link", { name: "Sign Up", exact: true }).tap();
    await page.waitForURL("**/register");
    await page.getByPlaceholder("John", { exact: true }).fill("Test");
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .tap();
    const mobileNav = page.getByRole("navigation", {
      name: "Mobile website navigation",
      exact: true,
    });
    await mobileNav.getByRole("link", { name: "Features", exact: true }).tap();
    await page.waitForURL("**/#features");
    await page.waitForTimeout(1100);
    assert((await page.locator("#features").boundingBox()).y < 180);
    for (const [name, id] of [
      ["App", "download"],
      ["Home", "home"],
    ]) {
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .tap();
      await mobileNav.getByRole("link", { name, exact: true }).tap();
      await closed();
      await page.waitForTimeout(1000);
      assert((await page.locator("#" + id).boundingBox()).y < 180);
    }
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .tap();
    await mobileNav.getByRole("link", { name: "Get App", exact: true }).tap();
    await page.waitForURL("**/ea-app/");
    assert.equal(await page.title(), "EA Cloud App");
    await page.goBack();
    await page.waitForURL("**/");
    await closed();
    // Resize while open must release modal state when desktop navigation takes over.
    await open();
    await page.setViewportSize({ width: 1280, height: 900 });
    await closed();
    await page
      .getByRole("navigation", { name: "Website navigation", exact: true })
      .waitFor();
    assert(await page.locator(".public-brand>span").isVisible());
    assert.deepEqual(errors, []);
    results.push({
      viewport,
      logoCentre: true,
      headerOnlyThreeElements: true,
      accountBounds: bounds,
      openingFrames,
      scrollPreserved: true,
      backForwardAndEscape: true,
      touchHandleAndPanelSwipe: true,
      smallPullSnapback: true,
      helpLinks: true,
      englishOnlyTrueAvailability: true,
      hamburgerAllDestinations: true,
      signInSignUp: true,
      responsiveCleanup: true,
    });
    await context.close();
  }
  // Reduced-motion desktop renders must be pixel-identical to the saved pre-change build.
  const desktop = [];
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1024, height: 900 },
    { width: 768, height: 1024 },
  ]) {
    const captures = [];
    for (const [label, site] of [
      ["before", before],
      ["after", origin],
    ]) {
      const context = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
      });
      await context.route("https://fonts.**", (r) => r.abort());
      const p = await context.newPage();
      await p.goto(site);
      await p
        .locator(".hero-showcase img")
        .evaluateAll((imgs) => Promise.all(imgs.map((i) => i.decode())));
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(300);
      const png = await p.screenshot({
        path: `${output}/desktop-${viewport.width}-${label}.png`,
      });
      const geometry = await p
        .locator(
          ".public-nav-shell,.public-brand,.public-nav-links,.public-nav-actions,.hero-copy",
        )
        .evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect().toJSON()),
        );
      captures.push({
        sha: createHash("sha256").update(png).digest("hex"),
        geometry,
      });
      await p
        .getByRole("button", { name: "Account menu", exact: true })
        .click();
      await p.getByRole("menu").waitFor();
      assert.equal(await p.locator(".public-mobile-sheet").count(), 0);
      await p.keyboard.press("Escape");
      await context.close();
    }
    assert.deepEqual(
      captures[1],
      captures[0],
      "desktop screenshot and geometry remain identical",
    );
    desktop.push({ viewport, pixelIdentical: true, sha256: captures[1].sha });
  }
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        mobile: results,
        desktop,
        physicalDevices: false,
        translations:
          "English implemented; Portuguese/Spanish explicitly unavailable, not fake selections.",
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: mobile header, sheets, native touch swipes, Back/Forward, scroll/focus, real navigation, language availability and pixel-identical desktop.",
  );
} finally {
  await browser.close();
}
