import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5221";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = process.env.AUTH_SCREENSHOT_DIR || "work/premium-auth";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1920, height: 1080 },
    { width: 820, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
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
    await context.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } }),
    );
    await context.route("**/api/app/me", (route) =>
      route.fulfill({ status: 401, json: { error: "Unauthorized" } }),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let requests = 0,
      payload,
      release;
    const responseReady = new Promise((resolve) => (release = resolve));
    let response = "invalid";
    await context.route("**/api/auth/login", async (route) => {
      requests++;
      payload = route.request().postDataJSON();
      await responseReady;
      await route.fulfill({
        status: response === "pending" ? 403 : 401,
        json: {
          error:
            response === "pending" ? "pending_approval" : "Invalid credentials",
        },
      });
    });
    let logoutRequests = 0;
    page.on("request", (request) => {
      if (/\/api\/(auth|app)\/logout$/.test(request.url())) logoutRequests++;
    });
    await page.goto(origin + "/admin/login");
    await page
      .getByRole("heading", {
        name:
          viewport.width <= 760
            ? "EA Cloud Admin Portal"
            : "Sign in to EA Cloud",
        exact: true,
      })
      .waitFor();
    await page
      .locator(".mentor-login-logo")
      .evaluate((image) => image.decode());
    assert.equal(await page.locator("form input").count(), 2);
    assert.equal(await page.locator(".public-header").count(), 0);
    assert.equal(
      await page.locator(".mentor-login-support").getAttribute("href"),
      "mailto:eacloudhoster@gmail.com",
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const brand = await page.locator(".mentor-login-brand").boundingBox(),
      main = await page.locator(".mentor-login-main").boundingBox();
    if (viewport.width >= 900) {
      assert.equal(brand.width, viewport.width / 2);
      assert.equal(main.x, viewport.width / 2);
    } else if (viewport.width <= 760) assert(main.y < brand.y + brand.height);
    else assert(main.y >= brand.height - 1);
    assert.equal(
      await page
        .locator(".mentor-login-eyes-left")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    assert.equal(
      await page
        .locator(".mentor-login-brand")
        .evaluate((el) => getComputedStyle(el, "::after").animationName),
      "none",
    );
    if ([1440, 390].includes(viewport.width))
      await page.screenshot({
        path: `${out}/signin-${viewport.width === 1440 ? "desktop" : "mobile"}.png`,
        fullPage: true,
      });
    const submit = page.getByRole("button", { name: "LOGIN", exact: true });
    await submit.click();
    assert.equal(requests, 0, "HTML required rules block submission");
    await page
      .getByLabel("Email Address", { exact: true })
      .fill("mentor@example.invalid");
    await page
      .getByLabel("Password", { exact: true })
      .fill("Test-only-password");
    await page
      .getByRole("button", { name: "Show password", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Password", { exact: true }).getAttribute("type"),
      "text",
    );
    assert.equal(
      await page.getByLabel("Password", { exact: true }).inputValue(),
      "Test-only-password",
    );
    await page
      .getByRole("button", { name: "Hide password", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Password", { exact: true }).getAttribute("type"),
      "password",
    );
    assert.equal(requests, 0);
    await submit.click();
    await page
      .getByRole("button", { name: "Signing in…", exact: true })
      .waitFor();
    assert(
      await page
        .getByRole("button", { name: "Signing in…", exact: true })
        .isDisabled(),
    );
    release();
    await page
      .getByRole("alert")
      .filter({ hasText: "Invalid credentials" })
      .waitFor();
    assert.deepEqual(payload, {
      email: "mentor@example.invalid",
      password: "Test-only-password",
      role: "mentor",
    });
    response = "pending";
    await submit.click();
    await page
      .getByText("Pending Super Admin Approval", { exact: true })
      .waitFor();
    assert.equal(requests, 2);
    await page.goto(origin + "/admin/login?approved=1");
    await page.getByText("Account Approved!", { exact: true }).waitFor();
    await page.getByRole("link", { name: "Create one", exact: true }).click();
    await page.waitForURL("**/register");
    assert.equal(await page.locator("form input").count(), 6);
    assert.equal(await page.locator(".public-header").count(), 0);
    assert.match(
      await page
        .locator(".mentor-register-page")
        .evaluate((el) => getComputedStyle(el).backgroundImage),
      /ea-cloud-auth-background\.png/,
    );
    await page
      .locator(".mentor-register-logo")
      .evaluate((image) => image.decode());
    if ([1440, 390].includes(viewport.width))
      await page.screenshot({
        path: `${out}/signup-${viewport.width === 1440 ? "desktop" : "mobile"}.png`,
        fullPage: true,
      });
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/admin/login");
    if (viewport.width === 390) {
      await page.setViewportSize({ width: 390, height: 480 });
      await page.getByLabel("Password", { exact: true }).focus();
      await page
        .getByRole("button", { name: "LOGIN", exact: true })
        .scrollIntoViewIfNeeded();
      const button = await page
        .getByRole("button", { name: "LOGIN", exact: true })
        .boundingBox();
      assert(button.y >= 0 && button.y + button.height <= 480);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      results.push(
        "Short mobile viewport: password and LOGIN remain reachable by scrolling",
      );
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    assert.equal(
      await page
        .locator(".mentor-login-eyes-left")
        .evaluate((el) => getComputedStyle(el).animationName),
      "mentor-login-eyes",
    );
    assert.equal(
      await page
        .locator(".mentor-login-eyes-left")
        .evaluate((el) => getComputedStyle(el).animationDuration),
      "6.4s",
    );
    assert.equal(
      await page
        .locator(".mentor-login-trace")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
      "mentor-neon-travel",
    );
    await page
      .getByRole("link", { name: "Close sign in", exact: true })
      .click();
    await page.waitForURL(origin + "/");
    assert.equal(logoutRequests, 0);
    assert.deepEqual(errors, []);
    results.push(
      `${viewport.width}×${viewport.height}: layout, required fields, password toggle, submission/loading/error/pending/approved states, links, close and reduced motion passed`,
    );
    await context.close();
  }
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(results.join("\n"));
} finally {
  await browser.close();
}
