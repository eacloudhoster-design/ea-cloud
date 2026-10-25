import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5220";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/typography-refresh";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const normal = (text) => text.replace(/\s+/g, " ").trim();
const results = [];
const first =
  "EA Cloud connects traders with experienced mentors through intelligent copy trading, AI-powered chart analysis, and seamless trading account management.";
const second =
  "Connect your trading account, explore advanced trading tools, and experience a smarter way to trade—all in one powerful platform.";
try {
  for (const width of [1440, 820, 390, 430, 320]) {
    const mobile = width < 500;
    const height = mobile ? (width === 320 ? 568 : 932) : 1000;
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      if (!sessionStorage.getItem("refresh-seeded")) {
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
        sessionStorage.setItem("refresh-seeded", "yes");
      }
    });
    let fonts = 0;
    await context.route(/https:\/\/fonts\./, (r) => {
      fonts++;
      return r.fulfill({ contentType: "text/css", body: "" });
    });
    const p = await context.newPage();
    p.setDefaultTimeout(12000);
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
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
      await p.evaluate(() => document.fonts.ready);
      assert.equal(
        await p.getByRole("link", { name: /Back to homepage/i }).count(),
        0,
      );
      assert.equal(await p.locator(".public-header").count(), 1);
      assert.equal(
        await p
          .locator(".legal-eyebrow")
          .evaluate((el) => getComputedStyle(el).marginTop),
        "0px",
      );
      assert.equal(
        normal(await p.locator("main").innerText()),
        normal(
          await readFile(
            `${out}/legal-${route || "overview"}-before.txt`,
            "utf8",
          ),
        ),
        "legal text unchanged apart from removed back link",
      );
      const headings = await p
        .locator(".legal-page h1,.legal-page h2")
        .evaluateAll((els) =>
          els.map((el) => ({
            weight: getComputedStyle(el).fontWeight,
            font: getComputedStyle(el).fontFamily,
            overflow: el.scrollWidth > el.clientWidth + 1,
          })),
        );
      assert.ok(
        headings.every(
          (h) =>
            Number(h.weight) >= 700 &&
            h.font.includes("EA Space Grotesk") &&
            !h.overflow,
        ),
      );
      assert.ok(
        await p.evaluate(() =>
          [...document.fonts].some(
            (font) =>
              font.family.includes("EA Space Grotesk") &&
              font.status === "loaded",
          ),
        ),
      );
      const active = p.locator(".legal-nav [aria-current=page]");
      assert.equal(await active.count(), 1);
      assert.equal(
        await active.evaluate((el) => getComputedStyle(el).fontWeight),
        "600",
      );
      assert.equal(
        await active.evaluate((el) => getComputedStyle(el).borderBottomWidth),
        "1px",
      );
      assert.equal(await p.locator(".legal-nav a").count(), 6);
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      if (
        [1440, 390].includes(width) &&
        ["terms", "privacy", "cookie-settings", ""].includes(route)
      )
        await p.screenshot({
          path: `${out}/${width}-legal-${route || "overview"}.png`,
          fullPage: route === "cookie-settings",
        });
    }
    assert.equal(fonts, 0, "no external font request before consent");
    await p.goto(`${origin}/legal/cookie-settings`);
    await p.getByRole("switch", { name: "Functional", exact: true }).check();
    await p
      .getByRole("button", { name: "Save Preferences", exact: true })
      .click();
    await p.waitForFunction(() =>
      document.querySelector("link[data-ea-optional]"),
    );
    await p.reload();
    assert.equal(
      await p
        .getByRole("switch", { name: "Functional", exact: true })
        .isChecked(),
      true,
    );
    await p
      .getByRole("button", { name: "Reject Optional", exact: true })
      .click();
    assert.equal(await p.locator("link[data-ea-optional]").count(), 0);
    // Tabs still navigate through the same route targets.
    await p.locator('.legal-nav a[href="/legal/terms"]').click();
    await p.waitForURL("**/legal/terms");
    await p.locator('.legal-nav a[href="/legal/privacy"]').click();
    await p.waitForURL("**/legal/privacy");
    await p.goto(`${origin}/legal/privacy-choices`);
    await p.route("**/api/privacy/requests", (r) =>
      r.fulfill({
        status: 503,
        json: { error: "Delivery was not confirmed. Please retry." },
      }),
    );
    await p
      .getByLabel("Your email", { exact: true })
      .fill("test@example.invalid");
    await p
      .getByLabel("Message", { exact: true })
      .fill("Please review my privacy request.");
    await p.getByRole("checkbox").check();
    await p
      .getByRole("button", { name: "Send privacy request", exact: true })
      .click();
    await p
      .getByRole("alert")
      .filter({ hasText: "Delivery was not confirmed" })
      .waitFor();
    assert.equal(
      await p.getByLabel("Message", { exact: true }).inputValue(),
      "Please review my privacy request.",
    );
    await p.goto(origin);
    await p.locator(".hero-showcase[data-ready=true]").waitFor();
    await p.evaluate(() => document.fonts.ready);
    assert.equal(
      normal(await p.locator(".hero-copy h2").innerText()),
      "The Future of Automated Trading",
    );
    assert.equal(
      normal(await p.locator(".hero-description p").nth(0).innerText()),
      first,
    );
    assert.equal(
      normal(await p.locator(".hero-description p").nth(1).innerText()),
      second,
    );
    assert.equal(
      await p
        .locator(".hero-copy h2")
        .evaluate((el) => getComputedStyle(el).fontWeight),
      "700",
    );
    assert.ok(
      await p
        .locator(".hero-copy h2")
        .evaluate((el) =>
          getComputedStyle(el).fontFamily.includes("EA Space Grotesk"),
        ),
    );
    assert.equal(
      await p
        .locator(".hero-description")
        .evaluate((el) => getComputedStyle(el).fontWeight),
      "500",
    );
    assert.equal(
      await p
        .locator(".hero-description")
        .evaluate((el) => getComputedStyle(el).color),
      "rgb(190, 193, 203)",
    );
    assert.equal(await p.locator(".hero-text-accent").count(), 2);
    assert.ok(
      await p
        .locator(".hero-headline-metal")
        .evaluate((el) =>
          getComputedStyle(el).backgroundImage.includes("linear-gradient"),
        ),
    );
    assert.equal(
      await p.locator("#hero-title img").getAttribute("src"),
      "/ea-cloud-wordmark.png",
    );
    assert.equal(await p.locator(".hero-showcase img").count(), 3);
    assert.equal(
      await p.locator(".public-brand img").getAttribute("src"),
      "/ea-cloud-nav-logo.png",
    );
    assert.equal(
      await p.locator(".hero-copy a").nth(0).getAttribute("href"),
      "/ea-app/",
    );
    assert.equal(
      await p.locator(".hero-copy a").nth(1).getAttribute("href"),
      "/register",
    );
    assert.ok(
      (
        await p
          .locator(".hero-copy h2,.hero-headline-metal,.hero-description")
          .evaluateAll((els) =>
            els.map((el) => el.scrollWidth <= el.clientWidth + 1),
          )
      ).every(Boolean),
    );
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    if ([1440, 390].includes(width))
      await p.screenshot({ path: `${out}/${width}-homepage.png` });
    assert.equal(
      await p
        .locator("#help h2")
        .evaluate((el) => getComputedStyle(el).fontWeight),
      "700",
    );
    assert.ok(
      await p
        .locator("#help h2")
        .evaluate((el) =>
          getComputedStyle(el).fontFamily.includes("EA Space Grotesk"),
        ),
    );
    await p
      .getByRole("button", {
        name: "Is EA Cloud a trading robot?",
        exact: true,
      })
      .click();
    await p
      .getByText("No, EA Cloud is not a trading robot.", { exact: false })
      .waitFor();
    // Existing navigation is preserved outside Sign Up.
    await p.goto(`${origin}/register`);
    await p.locator("form").waitFor();
    await p.addStyleTag({
      content:
        '[style*="transform"]{transform:none!important}[style*="opacity"]{opacity:1!important}',
    });
    await p.waitForTimeout(100);
    assert.equal(
      await p.locator(".public-header,.public-mobile-backdrop").count(),
      0,
    );
    const logo = p.locator("img.ring-2");
    assert.equal(await logo.getAttribute("src"), "/ea-cloud-nav-logo.png");
    const rect = await logo.boundingBox();
    assert.equal(rect.width, 80);
    assert.equal(rect.height, 80);
    if (!mobile) assert.equal(rect.y, 24);
    if ([1440, 390, 430].includes(width)) {
      await p.screenshot({ path: `${out}/${width}-register-after.png` });
      const geometry = await p
        .locator("h1,form,input,form button[type=submit],img.ring-2")
        .evaluateAll((els) =>
          els.map((el) => ({
            tag: el.tagName,
            rect: el.getBoundingClientRect().toJSON(),
          })),
        );
      const old = JSON.parse(
        await readFile(`${out}/${width}-register-before.json`, "utf8"),
      );
      if (mobile)
        assert.deepEqual(
          geometry,
          old,
          "mobile registration geometry unchanged",
        );
      else {
        const shift = geometry[0].rect.top - old[0].rect.top;
        geometry.forEach((entry, i) => {
          assert.equal(entry.rect.width, old[i].rect.width);
          assert.equal(entry.rect.height, old[i].rect.height);
          assert.equal(entry.rect.left, old[i].rect.left);
          assert.ok(Math.abs(entry.rect.top - old[i].rect.top - shift) < 0.1);
        });
      }
    }
    let submitted;
    await p.route("**/api/auth/register", async (r) => {
      submitted = r.request().postDataJSON();
      await r.fulfill({ json: { id: 1, status: "pending" } });
    });
    await p.getByPlaceholder("John", { exact: true }).fill("Test");
    await p.getByPlaceholder("Doe", { exact: true }).fill("Mentor");
    await p.getByPlaceholder("Your trading handle").fill("Test Mentor");
    await p.getByPlaceholder("you@example.com").fill("test@example.invalid");
    await p.locator("input[type=password]").fill("not-a-real-password");
    await p.locator("form button[type=submit]").click();
    await p
      .getByText("Account Created Successfully", { exact: true })
      .waitFor();
    assert.equal(submitted.mentorName, "Test Mentor");
    assert.equal(await p.locator(".public-header").count(), 0);
    await p.goto(`${origin}/register/`);
    await p.locator("form").waitFor();
    assert.equal(await p.locator(".public-header").count(), 0);
    assert.deepEqual(errors, []);
    results.push({
      width,
      legalContentUnchanged: true,
      noBackLink: true,
      headingFontAndWeight: true,
      tabsAndPrivacyControls: true,
      exactHomepageCopy: true,
      responsive: true,
      headerlessSignup: true,
      mobileSignupBaselineCompared: mobile && [390, 430].includes(width),
      registrationFixturePassed: true,
    });
    await context.close();
  }
  const c = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const p = await c.newPage();
  await p.goto(origin);
  const heading = p.locator(".hero-copy h2"),
    description = p.locator(".hero-description");
  await heading.waitFor();
  const timing = await heading.evaluate((el) => ({
    name: getComputedStyle(el).animationName,
    delay: parseFloat(getComputedStyle(el).animationDelay),
  }));
  const later = await description.evaluate((el) =>
    parseFloat(getComputedStyle(el).animationDelay),
  );
  assert.ok(timing.name.includes("public-copy-enter"));
  assert.ok(later > timing.delay);
  await c.close();
  await writeFile(
    `${out}/results.json`,
    JSON.stringify(
      {
        results,
        staggeredEntrance: true,
        limitations: [
          "Chromium desktop and touch emulation; no physical Android/iPhone Safari testing.",
          "Registration/privacy API fixtures only; no live account created or privacy email sent.",
        ],
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
