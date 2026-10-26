import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5220";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/mentor-auth";
await mkdir(out, { recursive: true });
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 820, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    const mobile = viewport.width < 500 || viewport.height < 500;
    const c = await b.newContext({
      viewport,
      isMobile: mobile,
      hasTouch: mobile,
      reducedMotion: "reduce",
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
    await c.route("**/api/auth/me", (r) =>
      r.fulfill({ status: 401, json: { error: "Unauthorized" } }),
    );
    await c.route("**/api/app/me", (r) =>
      r.fulfill({ status: 401, json: { error: "Unauthorized" } }),
    );
    const p = await c.newPage();
    p.setDefaultTimeout(12000);
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    for (const route of ["register", "admin/login"]) {
      await p.goto(`${origin}/${route}`);
      await p.locator("form").waitFor();
      await p.addStyleTag({
        content:
          '[style*="transform"]{transform:none!important}[style*="opacity"]{opacity:1!important}',
      });
      await p.waitForTimeout(150);
      const name = route === "register" ? "register" : "signin";
      const image = p.locator(
        route === "register" ? ".mentor-register-logo" : ".mentor-login-logo",
      );
      assert.equal(await image.count(), 1);
      assert.equal(await image.getAttribute("src"), "/ea-cloud-nav-logo.png");
      await image.evaluate((el) => el.decode());
      const size = await image.boundingBox();
      if (route === "register") {
        assert.equal(size.width, viewport.width <= 600 ? 52 : 64);
        assert.equal(size.height, size.width);
      } else {
        assert.ok(size.width > 140 && size.width <= 460);
        assert.ok(Math.abs(size.width / size.height - 1254 / 692) < 0.01);
      }
      assert.equal(
        await image.evaluate((el) => getComputedStyle(el).objectFit),
        "contain",
      );
      assert.equal(await p.locator(".public-header").count(), 0);
      assert.equal(
        await p.locator(".public-mobile-sheet,.public-mobile-backdrop").count(),
        0,
      );
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "no horizontal overflow",
      );
      if (mobile && route === "register") {
        const padding = await p
          .locator(".mentor-register-page")
          .evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
        assert.ok(padding <= 32, "no reserved header gap");
      }
      if (route === "register") {
        assert.equal(await p.locator("form input").count(), 6);
        assert.equal(
          await p.getByRole("button", { name: "Close registration" }).count(),
          1,
        );
        const panel = await p.locator(".mentor-register-panel").boundingBox();
        assert.ok(panel.width <= viewport.width);
      }
      if ([1440, 390].includes(viewport.width))
        await p.screenshot({
          path: `${out}/${viewport.width}-${name}-after.png`,
        });
      let requests = 0,
        submitted;
      const url =
        route === "register" ? "**/api/auth/register" : "**/api/auth/login";
      await p.route(url, async (r) => {
        requests++;
        submitted = r.request().postDataJSON();
        await r.fulfill(
          route === "register"
            ? { json: { id: 1, status: "pending" } }
            : { status: 401, json: { error: "Invalid credentials" } },
        );
      });
      await p.locator("form button[type=submit]").click();
      assert.equal(requests, 0, "required fields still prevent submission");
      if (route === "register") {
        await p.getByPlaceholder("John", { exact: true }).fill("Test");
        await p.getByPlaceholder("Doe", { exact: true }).fill("Mentor");
        await p.getByPlaceholder("Your trading handle").fill("Test Mentor");
        await p
          .getByPlaceholder("you@example.com")
          .fill("test@example.invalid");
        await p.locator("input[type=password]").fill("not-a-real-password");
        await p.locator("form button[type=submit]").click();
        await p
          .getByText("Account Created Successfully", { exact: true })
          .waitFor();
        assert.equal(submitted.mentorName, "Test Mentor");
        assert.equal(await p.locator(".public-header").count(), 0);
      } else {
        await p
          .getByPlaceholder("admin@eacloud.com")
          .fill("test@example.invalid");
        await p.locator("input[type=password]").fill("not-a-real-password");
        await p.locator("form button[type=submit]").click();
        await p.getByText("Invalid credentials", { exact: true }).waitFor();
        assert.equal(submitted.role, "mentor");
        assert.equal(submitted.email, "test@example.invalid");
      }
      assert.equal(requests, 1);
      await p.unroute(url);
    }
    // Other public routes retain their header, including after authentication navigation.
    for (const route of ["/", "/legal"]) {
      await p.goto(origin + route);
      await p.locator(".public-header").waitFor();
      assert.equal(await p.locator(".public-header").count(), 1);
    }
    if (mobile) {
      await p.goto(origin);
      await p
        .getByRole("button", { name: "Account menu", exact: true })
        .click();
      await p.getByRole("link", { name: "Sign Up", exact: true }).click();
      await p.waitForURL("**/register");
      await p.locator("form").waitFor();
      assert.equal(
        await p
          .locator(
            ".public-header,.public-mobile-backdrop,.public-mobile-sheet",
          )
          .count(),
        0,
      );
      assert.notEqual(
        await p.evaluate(() => getComputedStyle(document.body).pointerEvents),
        "none",
      );
    }
    assert.deepEqual(errors, []);
    results.push({
      viewport,
      mobile,
      headerScopeCorrect: true,
      cloudOnlyBothPages: true,
      validationAndSubmissionContract: true,
      publicHeadersPreserved: true,
    });
    await c.close();
  }
  await writeFile(
    `${out}/results.json`,
    JSON.stringify(
      {
        results,
        limitations: [
          "Chromium touch emulation; no physical iPhone/Safari test.",
          "Isolated API fixtures; no real account created or live credentials used.",
        ],
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
