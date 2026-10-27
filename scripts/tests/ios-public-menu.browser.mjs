import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5221";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/ios-public-menu";
await mkdir(out, { recursive: true });
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const device of [
    {
      name: "iPhone Safari UA",
      width: 390,
      height: 844,
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    },
    {
      name: "iPhone Chrome UA",
      width: 390,
      height: 844,
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0.0.0 Mobile/15E148 Safari/604.1",
    },
    {
      name: "Android Chrome UA",
      width: 412,
      height: 915,
      ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36",
    },
    { name: "small phone", width: 320, height: 568 },
    { name: "touch landscape", width: 844, height: 390 },
    {
      name: "standalone simulation",
      width: 390,
      height: 844,
      standalone: true,
    },
  ]) {
    const c = await b.newContext({
      viewport: { width: device.width, height: device.height },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
      ...(device.ua ? { userAgent: device.ua } : {}),
    });
    await c.addInitScript((standalone) => {
      localStorage.setItem(
        "ea-cloud:privacy-consent:v1",
        JSON.stringify({
          version: 1,
          functional: false,
          analytics: false,
          marketing: false,
          expiresAt: Date.now() + 86400000,
        }),
      );
      if (standalone)
        Object.defineProperty(navigator, "standalone", { value: true });
    }, !!device.standalone);
    let authRequests = 0;
    await c.route("**/api/**", (r) => {
      if (/\/api\/(auth|app)\/me$/.test(r.request().url())) {
        authRequests++;
        return r.fulfill({ status: 401, json: { error: "Unauthorized" } });
      }
      return r.fulfill({ json: [] });
    });
    const p = await c.newPage();
    p.setDefaultTimeout(12000);
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin);
    await p.locator(".public-mobile-toggle").waitFor();
    await p.waitForTimeout(400);
    await p.evaluate(() => (window.__menuDocument = "same-document"));
    const authCount = authRequests;
    const logo = await p.locator(".public-brand img").boundingBox();
    assert(Math.abs(logo.x + logo.width / 2 - device.width / 2) < 0.5);
    const header = p.locator(".public-header"),
      toggle = p.locator(".public-mobile-toggle"),
      menu = p.getByRole("dialog", { name: "Explore EA Cloud", exact: true });
    const reveal = async () => {
      await p.evaluate(() => scrollBy({ top: -70, behavior: "instant" }));
      await p.waitForTimeout(350);
    };
    const open = async () => {
      await reveal();
      await toggle.tap();
      await menu.waitFor();
      assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      assert.equal(await header.getAttribute("data-scroll-hidden"), "false");
      const box = await menu.boundingBox();
      assert(box.y >= 71 && box.y <= 74);
      assert.equal(await menu.getByRole("link").count(), 6);
    };
    await open();
    if (device.name === "iPhone Safari UA")
      await p.screenshot({ path: out + "/menu-open.png" });
    await toggle.tap();
    await menu.waitFor({ state: "hidden" });
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await open();
    const box = await menu.boundingBox();
    if (box.y + box.height < device.height - 10)
      await p.touchscreen.tap(5, device.height - 5);
    else await p.touchscreen.tap(90, 36);
    await menu.waitFor({ state: "hidden" });
    await open();
    await p.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
    await open();
    await p.goBack();
    await menu.waitFor({ state: "hidden" });
    await p.locator(".public-navigation-layer").waitFor({ state: "detached" });
    assert.equal(new URL(p.url()).pathname, "/");
    // Native-like scroll events preserve hide-down/show-up; an open menu pins the bar.
    await p.evaluate(() => scrollTo({ top: 750, behavior: "instant" }));
    await p.waitForTimeout(400);
    assert.equal(await header.getAttribute("data-scroll-hidden"), "true");
    await reveal();
    assert.equal(await header.getAttribute("data-scroll-hidden"), "false");
    const y = await p.evaluate(() => scrollY);
    await toggle.tap();
    await menu.waitFor();
    assert.equal(await p.evaluate(() => document.body.style.position), "fixed");
    await p.mouse.wheel(0, 250);
    await p.waitForTimeout(150);
    assert.equal(await header.getAttribute("data-scroll-hidden"), "false");
    await toggle.tap();
    await menu.waitFor({ state: "hidden" });
    assert(Math.abs((await p.evaluate(() => scrollY)) - y) < 2);
    assert.equal(await p.evaluate(() => document.body.style.position), "");
    for (const [name, id] of [
      ["Home", "home"],
      ["App", "download"],
      ["Features", "features"],
      ["FAQ", "help"],
      ["Support", "support"],
    ]) {
      await open();
      await menu.getByRole("link", { name, exact: true }).tap();
      await menu.waitFor({ state: "hidden" });
      await p.waitForFunction(
        (id) => location.hash === (id === "home" ? "" : "#" + id),
        id,
      );
      const r = await p.locator("#" + id).boundingBox();
      assert(
        r.y < device.height && r.y + r.height > 0,
        name + " section is visible",
      );
    }
    assert.equal(
      await p.evaluate(() => window.__menuDocument),
      "same-document",
    );
    assert.equal(authRequests, authCount);
    await open();
    await p.getByRole("button", { name: "Account menu", exact: true }).tap();
    const account = p.getByRole("dialog", {
      name: "Your EA Cloud account",
      exact: true,
    });
    await account.waitFor();
    await account.getByRole("link", { name: "Sign In", exact: true }).tap();
    await p.waitForURL("**/admin/login");
    await p.getByRole("button", { name: "LOGIN", exact: true }).waitFor();
    await p.getByRole("link", { name: "Create one", exact: true }).click();
    await p.waitForURL("**/register");
    await p.getByRole("link", { name: "Sign in", exact: true }).click();
    await p.waitForURL("**/admin/login");
    assert.equal(
      await p.evaluate(() => window.__menuDocument),
      "same-document",
    );
    assert.equal(authRequests, authCount);
    assert.equal(
      await p.getByText("Verifying session", { exact: false }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    results.push({
      device: device.name,
      engine: "Chromium touch emulation; not actual iOS WebKit",
      firstTap: true,
      secondTap: true,
      outside: true,
      escape: true,
      nativeBack: true,
      allFiveDestinations: true,
      scrollHideShow: true,
      pinnedWhileOpen: true,
      scrollRestored: true,
      profile: true,
      centeredLogo: true,
      noReload: true,
      noRepeatedVerification: true,
    });
    await c.close();
  }
  await writeFile(
    out + "/results.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    "PASS: six mobile configurations, tap toggle/outside/Back, all destinations, scrolling and profile",
  );
} finally {
  await b.close();
}
