import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5221";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/fullscreen-mobile-menu";
await mkdir(out, { recursive: true });
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    const recording = viewport.width === 390;
    const c = await b.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      ...(recording ? { recordVideo: { dir: out, size: viewport } } : {}),
    });
    await c.addInitScript(() =>
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
    await c.route("**/api/**", (r) =>
      r.fulfill(
        /\/api\/(auth|app)\/me$/.test(r.request().url())
          ? { status: 401, json: { error: "Unauthorized" } }
          : { json: [] },
      ),
    );
    const p = await c.newPage();
    p.setDefaultTimeout(15000);
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin + "/legal");
    await p.evaluate(() => (window.__menuDocument = "same"));
    const toggle = p.locator(".public-mobile-toggle"),
      menu = p.getByRole("dialog", { name: "Explore EA Cloud", exact: true });
    const open = async () => {
      await p.evaluate(() => scrollBy({ top: -80, behavior: "instant" }));
      await p.waitForTimeout(350);
      await toggle.tap();
      await menu.waitFor();
      await p.waitForTimeout(330);
    };
    await open();
    assert.equal(
      await menu.evaluate((el) => getComputedStyle(el).animationDuration),
      "0.3s",
    );
    assert.equal(await menu.getByRole("link").count(), 7);
    await p.screenshot({ path: `${out}/${viewport.width}-open.png` });
    await menu
      .getByRole("link", { name: "Become a Mentor", exact: true })
      .scrollIntoViewIfNeeded();
    assert((await menu.evaluate((el) => el.scrollTop)) >= 0);
    if (viewport.width === 320)
      assert((await menu.evaluate((el) => el.scrollTop)) > 0);
    await p.screenshot({ path: `${out}/${viewport.width}-bottom.png` });
    await toggle.tap();
    await menu.waitFor({ state: "hidden" });
    await p.waitForTimeout(330);
    // Cross-page section routing waits for the exit and body/history restoration.
    for (const [name, id] of [
      ["Home", "home"],
      ["App", "download"],
      ["Features", "features"],
      ["FAQ", "help"],
      ["Support", "support"],
    ]) {
      if (new URL(p.url()).pathname !== "/legal") {
        await p.goBack();
        await p.waitForURL("**/legal");
      }
      await open();
      await menu.getByRole("link", { name, exact: true }).tap();
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      await p.waitForURL(
        (url) =>
          url.pathname === "/" && url.hash === (id === "home" ? "" : "#" + id),
      );
      await p.waitForFunction(
        ({ id, height }) => {
          const b = document.getElementById(id)?.getBoundingClientRect();
          return b && b.top < height && b.bottom > 0;
        },
        { id, height: viewport.height },
      );
      assert.equal(await p.evaluate(() => document.body.style.position), "");
      assert.equal(await p.evaluate(() => window.__menuDocument), "same");
      await p.goBack();
      await p.waitForURL("**/legal");
    }
    for (const [name, path, fields] of [
      ["Get App", "/get-app", 4],
      ["Become a Mentor", "/register", 6],
    ]) {
      await open();
      await menu.getByRole("link", { name, exact: true }).tap();
      await p.waitForURL(origin + path);
      await p.locator("input").first().waitFor();
      assert.equal(await p.locator("input").count(), fields);
      assert.equal(await p.evaluate(() => window.__menuDocument), "same");
      await p.goBack();
      await p.waitForURL("**/legal");
    }
    await open();
    await p.goBack();
    await menu.waitFor({ state: "hidden" });
    await p.waitForTimeout(330);
    await p.goForward();
    await menu.waitFor();
    await p.waitForTimeout(330);
    await toggle.tap();
    await menu.waitFor({ state: "hidden" });
    await p.emulateMedia({ reducedMotion: "reduce" });
    await open();
    assert.equal(
      await menu.evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await toggle.tap();
    await menu.waitFor({ state: "hidden" });
    assert.deepEqual(errors, []);
    const video = p.video();
    await c.close();
    if (video) await video.saveAs(out + "/menu-navigation.webm");
    results.push({
      viewport,
      fullscreen: true,
      sevenLinks: true,
      openingAndClosingMs: 300,
      independentScroll: true,
      allSectionsFromLegal: true,
      getApp: true,
      mentorRegistration: true,
      noReload: true,
      backForward: true,
      reducedMotion: true,
    });
  }
  await writeFile(
    out + "/results.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    "PASS: full-screen mobile menu, 300ms animation, scrolling, all seven destinations from another page, Back/Forward and reduced motion",
  );
} finally {
  await b.close();
}
