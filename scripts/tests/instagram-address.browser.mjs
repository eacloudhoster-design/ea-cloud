import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5220";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const out = "docs/instagram-address-update";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const expected = {
  "/legal/terms": [
    "14. Business contact",
    "Business name: EA Cloud. Country: South Africa. General support and privacy enquiries: eacloudhoster@gmail.com. Business registration details are not yet confirmed.",
  ],
  "/legal/privacy": [
    "Who is responsible",
    "EA Cloud operates from South Africa. For support or privacy enquiries, contact eacloudhoster@gmail.com. Business registration details and formal Information Officer designation are pending confirmation.",
  ],
  "/legal": [
    "Contact EA Cloud",
    "Contact EA Cloud South Africa eacloudhoster@gmail.com Business registration details are pending confirmation. For privacy enquiries, please use the contact email above.",
  ],
};
const results = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      hasTouch: width === 390,
      isMobile: width === 390,
    });
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
    // Observe browser navigation without depending on Instagram availability or sending data.
    await context.route("https://www.instagram.com/**", (route) =>
      route.fulfill({ status: 200, body: "Instagram navigation test fixture" }),
    );
    const page = await context.newPage();
    await page.goto(origin);
    const icons = page.locator("footer .flex.gap-6 > a");
    assert.equal(await icons.count(), 4);
    for (const index of [0, 2, 3])
      assert.equal(await icons.nth(index).getAttribute("href"), "#");
    const instagram = page.getByRole("link", {
      name: "EA Cloud on Instagram (opens in a new tab)",
      exact: true,
    });
    assert.equal(
      await instagram.getAttribute("href"),
      "https://www.instagram.com/ea_cloud_hoster/",
    );
    assert.equal(await instagram.getAttribute("target"), "_blank");
    assert.equal(await instagram.getAttribute("rel"), "noopener noreferrer");
    const popupPromise = context.waitForEvent("page");
    if (width === 390) await instagram.tap();
    else await instagram.click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.equal(popup.url(), "https://www.instagram.com/ea_cloud_hoster/");
    assert.equal(await popup.evaluate(() => window.opener), null);
    await popup.close();
    for (const path of [
      "/",
      "/legal",
      "/legal/terms",
      "/legal/privacy",
      "/legal/cookies",
      "/legal/cookie-settings",
      "/legal/privacy-choices",
    ]) {
      await page.goto(origin + path);
      await page.waitForTimeout(100);
      assert(
        !/albatross|thornton|7460/i.test(
          await page.locator("body").innerText(),
        ),
      );
      assert(
        !(await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )),
      );
      if (expected[path]) {
        const [heading, text] = expected[path];
        const section = page.locator("section").filter({
          has: page.getByRole("heading", { name: heading, exact: true }),
        });
        assert.equal(await section.count(), 1);
        const actual = await (
          path === "/legal" ? section : section.locator("p")
        ).innerText();
        assert.equal(actual.replace(/\s+/g, " ").trim(), text);
        assert.equal(
          await section
            .getByRole("link", { name: "eacloudhoster@gmail.com", exact: true })
            .getAttribute("href"),
          "mailto:eacloudhoster@gmail.com",
        );
        await section.screenshot({
          path: `${out}/${path.split("/").pop()}-${width}.png`,
        });
      }
      if (path.startsWith("/legal")) {
        assert.equal(await page.locator(".legal-nav a").count(), 6);
        assert.equal(await page.locator(".legal-review").count(), 1);
      }
    }
    results.push({
      width,
      instagramPopup: true,
      openerIsNull: true,
      otherSocialDestinationsUnchanged: true,
      legalCopyExact: true,
      addressAbsent: true,
      noOverflow: true,
    });
    await context.close();
  }
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(results);
} finally {
  await browser.close();
}
