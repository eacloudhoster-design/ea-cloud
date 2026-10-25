import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5212";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const output = process.env.PUBLIC_OUTPUT || "work/cinematic-website/verified";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    const touch = viewport.width < 761;
    const context = await browser.newContext({
      viewport,
      hasTouch: touch,
      isMobile: touch,
    });
    await context.route("https://fonts.**", (r) => r.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await context.route("**/api/**", (r) => r.fulfill({ json: [] }));
    await page.goto(origin);
    await page.locator(".hero-showcase img").first().waitFor();
    await page
      .locator(".hero-showcase img")
      .evaluateAll((images) =>
        Promise.all(images.map((image) => image.decode())),
      );
    const initial = await page.locator(".hero-copy").boundingBox();
    await page.waitForTimeout(1800);
    const settled = await page.locator(".hero-copy").boundingBox();
    assert.deepEqual(
      initial,
      settled,
      "entrance transforms must not shift layout",
    );
    assert.equal(await page.locator(".public-brand").getAttribute("href"), "/");
    assert.equal(
      await page.locator(".public-brand img").getAttribute("src"),
      "/ea-cloud-logo.jpeg",
    );
    assert.equal(
      await page.locator(".public-header .lucide-search").count(),
      0,
    );
    assert.equal(
      await page
        .locator(".public-header a")
        .filter({ hasText: "Get Started" })
        .count(),
      0,
    );
    assert.equal(
      await page.locator(".public-get-app").getAttribute("href"),
      "/ea-app/",
    );
    assert.equal(
      await page.locator(".cinematic-logo,.hero-art").count(),
      0,
      "large hero logo is removed",
    );
    assert.equal(
      await page.locator(".hero-showcase").count(),
      1,
      "one showcase, no lower duplicate",
    );
    assert.equal(await page.locator(".hero-showcase img").count(), 3);
    const hero = await page.locator(".cinematic-hero").boundingBox();
    assert(hero.height >= viewport.height);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      viewport.width,
    );
    const nav = await page.locator(".public-header").boundingBox(),
      art = await page.locator(".hero-showcase").boundingBox(),
      cta = await page.locator(".hero-copy .public-cta-row").boundingBox();
    assert(art.y >= nav.height - 1, "showcase does not overlap navigation");
    if (viewport.width <= 1100)
      assert(
        art.y >= cta.y + cta.height,
        "mobile introduction and CTAs come before showcase",
      );
    await page.screenshot({ path: `${output}/${viewport.width}-hero.png` });
    const composition = await page
      .locator(".showcase-phone")
      .evaluateAll((els) =>
        els.map((el) => ({
          id: el.dataset.interface,
          rect: el.getBoundingClientRect().toJSON(),
          z: Number(getComputedStyle(el).zIndex),
          image: el.querySelector("img").currentSrc,
          fit: getComputedStyle(el.querySelector("img")).objectFit,
          filter: getComputedStyle(el.querySelector("img")).filter,
        })),
      );
    const left = composition.find((s) => s.id === "s2tone"),
      centre = composition.find((s) => s.id === "matrix"),
      right = composition.find((s) => s.id === "regular");
    assert(
      left.rect.x < centre.rect.x && centre.rect.x < right.rect.x,
      "left to right order",
    );
    assert(
      centre.rect.width > left.rect.width &&
        centre.rect.width > right.rect.width,
      "Matrix largest",
    );
    assert(centre.z > left.z && centre.z > right.z, "Matrix in foreground");
    assert(
      left.rect.right > centre.rect.left && centre.rect.right > right.rect.left,
      "slight overlap",
    );
    for (const screen of composition) {
      assert.equal(screen.fit, "contain");
      assert.equal(screen.filter, "none");
      assert(
        screen.rect.x >= -1 && screen.rect.right <= viewport.width + 1,
        "all screenshots in viewport",
      );
    }
    const typography = await page
      .locator("#hero-title")
      .evaluate((el) => getComputedStyle(el).fontFamily);
    assert(typography.includes("EA Cloud Hero"));
    const entrance = await page
      .locator(".showcase-entrance")
      .evaluateAll((els) =>
        els.map((el) => ({
          opacity: getComputedStyle(el).opacity,
          delay: getComputedStyle(el).animationDelay,
        })),
      );
    assert(entrance.every((e) => e.opacity === "1"));
    assert(entrance[1].delay !== entrance[0].delay, "staggered entrance");
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `${output}/${viewport.width}-showcase-later.png`,
    });
    const activate = (locator) => (touch ? locator.tap() : locator.click());
    const account = page.getByRole("button", { name: "Account menu" });
    await activate(account);
    const menu = page.getByRole("menu");
    await menu.waitFor();
    const mr = await menu.boundingBox();
    assert(
      mr.x >= 0 && mr.x + mr.width <= viewport.width,
      "account menu stays in viewport",
    );
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${output}/${viewport.width}-account.png` });
    await activate(account);
    await menu.waitFor({ state: "hidden" });
    await activate(account);
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
    assert(await account.evaluate((el) => el === document.activeElement));
    await activate(account);
    await activate(page.locator(".hero-description p").last());
    await menu.waitFor({ state: "hidden" });
    await activate(account);
    await activate(page.getByRole("menuitem", { name: "Help", exact: true }));
    await page.getByRole("group", { name: "Help options" }).waitFor();
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `${output}/${viewport.width}-help-menu.png`,
    });
    await activate(
      page.getByRole("menuitem", { name: "Frequently asked questions" }),
    );
    await menu.waitFor({ state: "hidden" });
    await page.waitForTimeout(1000);
    assert((await page.locator("#help").boundingBox()).y < 200);
    await page
      .getByRole("button", { name: "Is EA Cloud a trading robot?" })
      .click();
    await page
      .getByText("No, EA Cloud is not a trading robot.", { exact: false })
      .waitFor();
    await activate(account);
    await activate(page.getByRole("menuitem", { name: "Help", exact: true }));
    await activate(
      page.getByRole("menuitem", { name: "License & access help" }),
    );
    await page.waitForTimeout(1000);
    assert(
      (await page.locator("#access-help").boundingBox()).y >= nav.height - 1,
    );
    const jump = async (name) => {
      if (touch)
        await activate(
          page.getByRole("button", { name: "Open navigation", exact: true }),
        );
      await activate(
        page
          .getByRole("navigation", {
            name: touch ? "Mobile website navigation" : "Website navigation",
            exact: true,
          })
          .getByRole("link", { name, exact: true }),
      );
      await page.waitForTimeout(1000);
    };
    await jump("Features");
    assert((await page.locator("#features").boundingBox()).y < 200);
    await page.waitForTimeout(800);
    assert.equal(
      await page.locator(".public-feature-card.is-revealed").count(),
      6,
    );
    assert.equal(
      await page.locator(".public-nav-links a[aria-current]").innerText(),
      "Features",
    );
    await page.screenshot({ path: `${output}/${viewport.width}-features.png` });
    await jump("App");
    assert((await page.locator("#download").boundingBox()).y < 200);
    assert.notEqual(
      await page
        .locator(".hero-atmosphere")
        .evaluate((el) => el.style.transform),
      "none",
      "parallax responds to scrolling",
    );
    await jump("Home");
    assert.equal(await page.evaluate(() => scrollY), 0);
    // Existing account routes and real form handlers, with rejected credentials/registration isolated by fixtures.
    await activate(account);
    await activate(
      page.getByRole("menuitem", { name: "Sign In", exact: true }),
    );
    await page.waitForURL("**/admin/login");
    await page.getByPlaceholder("admin@eacloud.com").fill("test@example.com");
    await page.locator("input[type=password]").fill("not-a-real-password");
    let loginBody;
    await page.route("**/api/auth/login", async (r) => {
      loginBody = r.request().postDataJSON();
      await r.fulfill({ status: 401, json: { error: "Invalid credentials" } });
    });
    await page.locator("form button[type=submit]").click();
    await page.getByText("Invalid credentials", { exact: true }).waitFor();
    assert.equal(loginBody.role, "mentor");
    await page.goto(origin);
    await page.waitForTimeout(1200);
    await activate(account);
    await activate(
      page.getByRole("menuitem", { name: "Sign Up", exact: true }),
    );
    await page.waitForURL("**/register");
    await page.getByPlaceholder("John", { exact: true }).fill("Test");
    await page.getByPlaceholder("Doe", { exact: true }).fill("Mentor");
    await page.getByPlaceholder("Your trading handle").fill("Test Mentor");
    await page.getByPlaceholder("you@example.com").fill("test@example.com");
    await page.locator("input[type=password]").fill("not-a-real-password");
    let registration;
    await page.route("**/api/auth/register", async (r) => {
      registration = r.request().postDataJSON();
      await r.fulfill({ json: { id: 1, status: "pending" } });
    });
    await page.locator("form button[type=submit]").click();
    await page
      .getByText("Account Created Successfully", { exact: true })
      .waitFor();
    assert.equal(registration.mentorName, "Test Mentor");
    // Returning via brand from another public route also preserves section destinations.
    await page.locator(".public-brand").click();
    await page.waitForURL(origin + "/");
    await page.waitForTimeout(1200);
    await page
      .locator(".hero-copy a")
      .filter({ hasText: "Become a Mentor" })
      .click();
    await page.waitForURL("**/register");
    await page.getByPlaceholder("John", { exact: true }).waitFor();
    await page.locator(".public-brand").click();
    await page.waitForURL(origin + "/");
    await page.waitForTimeout(1200);
    const getApp = page.locator(".hero-copy a").filter({ hasText: "Get App" });
    await getApp.click();
    await page.waitForURL("**/ea-app/");
    assert.equal(await page.title(), "EA Cloud App");
    await page
      .locator(".ea-startup")
      .waitFor({ state: "detached", timeout: 20000 });
    assert.equal(
      await page.getByText("404 Page Not Found", { exact: true }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    results.push({
      viewport,
      hero,
      accountBounds: mr,
      composition,
      staggeredEntrance: entrance,
      dropdownToggleOutsideEscapeHelp: true,
      navigationAndCTAs: true,
      loginAndRegistrationHandlers: true,
      existingAppEntry: true,
      horizontalOverflow: false,
    });
    await context.close();
  }
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.route("https://fonts.**", (r) => r.abort());
  await page.goto(origin);
  await page.waitForTimeout(300);
  const animations = await page
    .locator(".showcase-entrance,.showcase-phone-frame,.hero-enter")
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
  assert(animations.every((name) => name === "none"));
  await page.locator("#features").scrollIntoViewIfNeeded();
  assert.equal(
    await page
      .locator(".hero-atmosphere")
      .evaluate((el) => getComputedStyle(el).transform),
    "none",
  );
  await page.screenshot({ path: `${output}/reduced-motion.png` });
  await context.close();
  // An already authenticated public visitor keeps their existing session untouched.
  const session = await browser.newContext();
  await session.addInitScript(() => {
    localStorage.setItem("token", "fixture-existing-mentor");
    localStorage.setItem("app_token", "fixture-existing-client");
  });
  await session.route("**/api/**", (r) =>
    r.fulfill({
      json: r.request().url().includes("/app/me")
        ? { id: 7, status: "approved", licenseKey: "fixture" }
        : { id: 1, role: "mentor", status: "approved" },
    }),
  );
  const p = await session.newPage();
  await p.goto(origin);
  await p.waitForTimeout(500);
  assert.equal(
    await p.evaluate(() => localStorage.getItem("token")),
    "fixture-existing-mentor",
  );
  assert.equal(
    await p.evaluate(() => localStorage.getItem("app_token")),
    "fixture-existing-client",
  );
  await p.getByRole("button", { name: "Account menu" }).click();
  await p.keyboard.press("Escape");
  assert.equal(
    await p.evaluate(() => localStorage.getItem("token")),
    "fixture-existing-mentor",
  );
  await session.close();
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        viewports: results,
        reducedMotion: true,
        sessionPreserved: true,
        backend: "API fixtures; no real accounts created",
        physicalDevices: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: public website desktop/mobile, layered screenshot showcase, account menu, navigation, form routes, app entry, reduced motion and session preservation.",
  );
} finally {
  await browser.close();
}
