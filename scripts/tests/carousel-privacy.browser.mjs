import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5220";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const output = process.env.PUBLIC_OUTPUT || "work/carousel-legal-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
const key = "ea-cloud:privacy-consent:v1";
const assertNoOverflow = async (page) =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "no page horizontal overflow",
  );
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  let fonts = 0;
  await context.route(/https:\/\/fonts\./, (route) => {
    fonts++;
    return route.fulfill({ contentType: "text/css", body: "" });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.locator(".hero-showcase[data-ready=true]").waitFor();
  assert.equal(fonts, 0);
  assert.equal(await page.locator(".public-brand").innerText(), "");
  assert.equal(await page.locator(".public-brand img").count(), 1);
  await page
    .getByRole("button", { name: "Reject Optional", exact: true })
    .click();
  assert.equal(await page.locator(".privacy-banner").count(), 0);
  const root = page.locator(".hero-showcase");
  assert.equal(await root.getAttribute("data-centred"), "matrix");
  const imageElements = await root.locator("img").elementHandles();
  assert.equal(imageElements.length, 3);
  const started = Date.now();
  await page.waitForFunction(
    () =>
      document.querySelector(".hero-showcase")?.dataset.centred === "regular",
  );
  assert.ok(Date.now() - started >= 4300);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${output}/carousel-regular-desktop.png` });
  await page.waitForFunction(
    () =>
      document.querySelector(".hero-showcase")?.dataset.centred === "s2tone",
    {},
    { timeout: 6500 },
  );
  await page.waitForFunction(
    () =>
      document.querySelector(".hero-showcase")?.dataset.centred === "matrix",
    {},
    { timeout: 6500 },
  );
  for (let i = 0; i < 3; i++)
    assert.ok(
      await imageElements[i].evaluate(
        (node) => node.isConnected && node.complete && node.naturalWidth > 0,
      ),
    );
  // Manual selection grants a full new five-second interval.
  await page
    .getByRole("button", { name: "Select Regular interface", exact: true })
    .click();
  await page.waitForTimeout(4600);
  assert.equal(await root.getAttribute("data-centred"), "regular");
  await page.waitForFunction(
    () =>
      document.querySelector(".hero-showcase")?.dataset.centred === "s2tone",
    {},
    { timeout: 1200 },
  );
  await page
    .getByRole("button", { name: "Pause automatic rotation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select Matrix interface", exact: true })
    .click();
  await page.waitForTimeout(800);
  const centre = await page
    .getByRole("button", { name: "Show Matrix interface", exact: true })
    .boundingBox();
  await page.mouse.move(
    centre.x + centre.width / 2,
    centre.y + centre.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    centre.x + centre.width / 2 - 100,
    centre.y + centre.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  assert.equal(await root.getAttribute("data-centred"), "regular");
  await page
    .getByRole("button", { name: "Select Matrix interface", exact: true })
    .click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${output}/homepage-desktop.png` });
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Help", exact: true }).click();
  assert.equal(await page.locator("#public-help-menu a").count(), 6);
  await page.screenshot({ path: `${output}/help-desktop.png` });
  await page.keyboard.press("Escape");
  for (const route of [
    "",
    "terms",
    "privacy",
    "cookies",
    "cookie-settings",
    "privacy-choices",
  ]) {
    await page.goto(`${origin}/legal${route ? "/" + route : ""}`);
    await page.locator(".legal-page h1").waitFor();
    assert.ok((await page.locator("main").innerText()).length > 600);
    await assertNoOverflow(page);
    assert.equal(await page.locator(".legal-date").count(), 1);
    if (!route)
      await page.screenshot({
        path: `${output}/legal-centre-desktop.png`,
        fullPage: true,
      });
  }
  await page.goto(`${origin}/legal/cookie-settings`);
  assert.equal(
    await page
      .getByRole("switch", { name: "Functional", exact: true })
      .isChecked(),
    false,
  );
  await page.getByRole("switch", { name: "Functional", exact: true }).check();
  await page
    .getByRole("button", { name: "Save Preferences", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.querySelector("link[data-ea-optional]"),
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(fonts > 0);
  await page.reload();
  assert.equal(
    await page
      .getByRole("switch", { name: "Functional", exact: true })
      .isChecked(),
    true,
  );
  await page
    .getByRole("button", { name: "Reject Optional", exact: true })
    .click();
  assert.equal(await page.locator("link[data-ea-optional]").count(), 0);
  const fontCount = fonts;
  await page.reload();
  await page.waitForTimeout(200);
  assert.equal(fonts, fontCount);
  assert.equal(
    await page
      .getByRole("switch", { name: "Analytics", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole("switch", { name: "Marketing", exact: true })
      .isChecked(),
    false,
  );
  await page.screenshot({
    path: `${output}/cookie-settings-desktop.png`,
    fullPage: true,
  });
  // Error keeps the user's message; success appears only after a successful response.
  let accepted = false,
    submitted;
  await page.route("**/api/privacy/requests", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      status: accepted ? 201 : 503,
      contentType: "application/json",
      body: JSON.stringify(
        accepted
          ? {
              id: "local-test-reference",
              message: "Accepted for administrator review.",
            }
          : {
              error:
                "Delivery was not confirmed. Your message remains in the form.",
            },
      ),
    });
  });
  await page.goto(`${origin}/legal/privacy-choices`);
  await page
    .getByLabel("Your email", { exact: true })
    .fill("test@example.invalid");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Please review my privacy request.");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Send privacy request", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Delivery was not confirmed" })
    .waitFor();
  assert.equal(
    await page.getByLabel("Message", { exact: true }).inputValue(),
    "Please review my privacy request.",
  );
  accepted = true;
  await page
    .getByRole("button", { name: "Send privacy request", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "local-test-reference" })
    .waitFor();
  assert.equal(submitted.acknowledged, true);
  assert.equal(submitted.email, "test@example.invalid");
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          functional: true,
          analytics: false,
          marketing: false,
          expiresAt: 1,
        }),
      ),
    key,
  );
  await page.goto(`${origin}/legal`);
  await page.locator(".privacy-banner").waitFor();
  assert.equal(await page.locator("link[data-ea-optional]").count(), 0);
  assert.deepEqual(errors, []);
  results.push(
    "Desktop: 5s autoplay complete loop, stable image DOM, manual timer reset, mouse drag, original assets loaded, Help links, direct legal routes, font consent/persistence/withdrawal/expiry, privacy form error and success contract.",
  );
  await context.close();
  for (const width of [390, 320, 768]) {
    const mobile = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    await mobile.route(/https:\/\/fonts\./, (r) => r.abort());
    await mobile.addInitScript(
      (key) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            functional: false,
            analytics: false,
            marketing: false,
            doNotSellShare: true,
            expiresAt: Date.now() + 86400000,
          }),
        ),
      key,
    );
    const p = await mobile.newPage();
    await p.goto(origin);
    await p.locator(".hero-showcase[data-ready=true]").waitFor();
    await p.locator(".hero-showcase").scrollIntoViewIfNeeded();
    await assertNoOverflow(p);
    assert.equal(
      await p.locator(".hero-showcase").getAttribute("data-centred"),
      "matrix",
    );
    await p.waitForTimeout(5200);
    assert.equal(
      await p.locator(".hero-showcase").getAttribute("data-centred"),
      "matrix",
    );
    if (width < 500) {
      const box = await p
        .getByRole("button", { name: "Show Matrix interface", exact: true })
        .boundingBox();
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      const cdp = await mobile.newCDPSession(p);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - 70, y }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      assert.equal(
        await p.locator(".hero-showcase").getAttribute("data-centred"),
        "regular",
      );
      await p
        .getByRole("button", { name: "Select Matrix interface", exact: true })
        .click();
      await p.screenshot({ path: `${output}/carousel-mobile-${width}.png` });
      await p
        .getByRole("button", { name: "Account menu", exact: true })
        .click();
      await p.getByRole("button", { name: "Help", exact: true }).click();
      assert.equal(await p.locator("#mobile-public-help a").count(), 6);
      if (width === 390)
        await p.screenshot({ path: `${output}/help-mobile.png` });
      await p.locator('#mobile-public-help a[href="/legal/privacy"]').click();
      await p.waitForURL("**/legal/privacy");
      assert.equal(await p.locator(".public-mobile-backdrop").count(), 0);
    }
    for (const route of [
      "",
      "terms",
      "privacy",
      "cookies",
      "cookie-settings",
      "privacy-choices",
    ]) {
      await p.goto(`${origin}/legal${route ? "/" + route : ""}`);
      await p.locator(".legal-page h1").waitFor();
      await assertNoOverflow(p);
      if (width === 390 && ["", "cookie-settings"].includes(route))
        await p.screenshot({
          path: `${output}/${route || "legal-centre"}-mobile.png`,
          fullPage: true,
        });
    }
    await mobile.close();
    results.push(
      `${width}px touch viewport: legal routes without overflow; ${width < 500 ? "actual CDP swipe, mobile Help navigation; " : ""}reduced motion disables autoplay.`,
    );
  }
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        origin,
        results,
        limitations: [
          "Chromium touch emulation, not physical Safari/iOS.",
          "Browser privacy delivery uses fixture responses; actual server/SMTP acceptance contract tested separately with local test transport. No live email or deployment tested.",
        ],
      },
      null,
      2,
    ),
  );
  console.log(results.join("\n"));
} finally {
  await browser.close();
}
