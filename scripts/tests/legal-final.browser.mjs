import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5220";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/carousel-legal-evidence";
await mkdir(out, { recursive: true });
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  for (const mobile of [false, true]) {
    const c = await b.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      hasTouch: mobile,
      isMobile: mobile,
      reducedMotion: "reduce",
    });
    await c.addInitScript(() => {
      if (!sessionStorage.getItem("privacy-test-seeded")) {
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
        sessionStorage.setItem("privacy-test-seeded", "yes");
      }
    });
    const p = await c.newPage();
    let fonts = 0;
    await c.route(/https:\/\/fonts\./, (r) => {
      fonts++;
      return r.fulfill({ contentType: "text/css", body: "" });
    });
    for (const route of [
      "",
      "terms",
      "privacy",
      "cookies",
      "cookie-settings",
      "privacy-choices",
    ]) {
      await p.goto(`${origin}/legal${route ? "/" + route : ""}`);
      await p.locator(".legal-page").waitFor();
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await p.screenshot({
        path: `${out}/${route || "legal-centre"}-${mobile ? "mobile" : "desktop"}.png`,
        fullPage: !route || route === "cookie-settings",
      });
    }
    await p.goto(`${origin}/legal/cookie-settings`);
    await p.getByRole("button", { name: "Accept All", exact: true }).click();
    await p.waitForFunction(() =>
      document.querySelector("link[data-ea-optional]"),
    );
    await p.waitForTimeout(200);
    assert.ok(fonts > 0);
    await p
      .getByRole("button", { name: "Reject Optional", exact: true })
      .click();
    assert.equal(await p.locator("link[data-ea-optional]").count(), 0);
    // A failed persistence operation must retain the banner and block optional loading.
    await p.evaluate(() => {
      localStorage.removeItem("ea-cloud:privacy-consent:v1");
    });
    await p.goto(origin);
    await p.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error("fixture storage failure");
      };
    });
    await p.getByRole("button", { name: "Accept All", exact: true }).click();
    await p
      .getByRole("alert")
      .filter({ hasText: "could not be saved" })
      .waitFor();
    assert.equal(await p.locator("link[data-ea-optional]").count(), 0);
    assert.equal(await p.locator(".privacy-banner").count(), 1);
    await p.reload();
    await p
      .getByRole("button", { name: "Reject Optional", exact: true })
      .click();
    await p.getByRole("button", { name: "Account menu", exact: true }).click();
    await p
      .getByRole(mobile ? "button" : "menuitem", { name: "Help", exact: true })
      .click();
    const menu = p.locator(
      mobile ? "#mobile-public-help" : "#public-help-menu",
    );
    await menu.waitFor({ state: "visible" });
    assert.equal(await menu.locator("a").count(), 6);
    await p.waitForTimeout(300);
    await p.screenshot({
      path: `${out}/help-${mobile ? "mobile" : "desktop"}.png`,
    });
    await p
      .getByRole(mobile ? "button" : "menuitem", { name: "Help", exact: true })
      .click();
    await p.waitForTimeout(300);
    assert.equal(
      await menu
        .locator("a")
        .first()
        .evaluate((el) => el.closest("[inert]") !== null),
      true,
    );
    await p
      .getByRole(mobile ? "button" : "menuitem", { name: "Help", exact: true })
      .click();
    await menu.locator('a[href="/legal/privacy"]').click();
    await p.waitForURL("**/legal/privacy");
    await c.close();
  }
  console.log(
    "PASS: final desktop/mobile legal screenshots, actual font consent requests, storage failure visible and fail-closed, animated Help expand/collapse and legal navigation.",
  );
} finally {
  await b.close();
}
