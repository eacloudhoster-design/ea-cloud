import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sessionFixture } from "./helpers/browser-session-fixture.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const { app, engine } = await sessionFixture();
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const out = "docs/persistent-login";
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "ea-cookie-profile-"));
let context;
const launch = () =>
  chromium.launchPersistentContext(profile, {
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
    viewport: { width: 1440, height: 1000 },
  });
const password = "Test-only-pass-123!";
try {
  context = await launch();
  let page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(origin + "/admin/login");
  await page.locator("input[type=email]").fill("mentor1@example.invalid");
  await page.locator("input[type=password]").fill(password);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL("**/admin/dashboard");
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  let cookies = await context.cookies();
  const portal = cookies.find((c) => c.name === "ea_portal_session");
  assert(
    portal?.httpOnly && portal.secure && portal.expires > Date.now() / 1000,
  );
  assert.equal(await page.evaluate(() => localStorage.getItem("token")), null);
  await page.reload();
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await context.close();
  context = await launch();
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(origin + "/admin/login");
  await page.waitForURL("**/admin/dashboard");
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await page.getByRole("link", { name: "Back to App" }).first().click();
  await page.waitForURL("**/ea-app/");
  assert.equal(
    await page.evaluate(async () => (await fetch("/api/auth/me")).status),
    200,
  );
  // Client authentication is separate; an actual client password creates its own cookie.
  assert.equal(
    (
      await context.request.post(origin + "/api/app/login", {
        data: { email: "client@example.invalid", password },
      })
    ).status(),
    200,
  );
  await page.reload();
  await page.getByRole("navigation", { name: "Main navigation" }).waitFor();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.getByRole("link", { name: "Admin Portal", exact: true }).click();
  await page.waitForURL("**/admin/dashboard");
  assert.equal(
    await page.evaluate(async () => (await fetch("/api/app/me")).status),
    200,
  );
  await page.goBack();
  await page.waitForURL("**/ea-app/");
  await page.getByRole("navigation", { name: "Main navigation" }).waitFor();
  await page.goto(origin + "/admin/dashboard");
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  // An outage must not delete a valid credential or display a fresh login form.
  await context.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 503, json: { error: "Temporary outage" } }),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Unable to verify your session. Retry" })
    .waitFor();
  assert.equal(await page.locator("input[type=password]").count(), 0);
  assert((await context.cookies()).some((c) => c.name === "ea_portal_session"));
  await context.unroute("**/api/auth/me");
  await page
    .getByRole("button", { name: "Unable to verify your session. Retry" })
    .click();
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await page.screenshot({ path: out + "/portal-desktop.png" });
  await page
    .getByRole("button", { name: "Sign Out", exact: true })
    .first()
    .click();
  await page.waitForURL("**/admin/login");
  await page.locator("input[type=password]").waitFor();
  assert.equal(
    await page.evaluate(async () => (await fetch("/api/auth/me")).status),
    401,
  );
  assert.equal(
    await page.evaluate(async () => (await fetch("/api/app/me")).status),
    401,
  );
  await page.goBack();
  await page.waitForTimeout(1200);
  assert.equal(
    await page.getByRole("heading", { name: "Dashboard", exact: true }).count(),
    0,
  );
  await context.close();
  context = await chromium.launchPersistentContext(profile, {
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  page = await context.newPage();
  await context.request.post(origin + "/api/app/login", {
    data: { email: "client@example.invalid", password },
  });
  await page.goto(origin + "/ea-app/");
  await page.getByRole("navigation", { name: "Main navigation" }).waitFor();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Settings", exact: true })
    .tap();
  await page.getByRole("button", { name: "Sign Out", exact: true }).tap();
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(async () => (await fetch("/api/app/me")).status),
    401,
  );
  await page.screenshot({ path: out + "/signed-out-mobile.png" });
  await writeFile(
    out + "/browser-results.json",
    JSON.stringify(
      {
        portalLogin: true,
        refresh: true,
        browserProcessRestart: true,
        backToApp: true,
        returnToPortal: true,
        browserBack: true,
        temporaryFailurePreservesCookie: true,
        logoutRevokesBoth: true,
        protectedBackDenied: true,
        mobileTouchLogout: true,
        limitations: [
          "Chromium desktop/touch emulation, not physical iOS/Android or actual installed-PWA lifecycle.",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS browser login/refresh/restart/app/portal/back/outage/logout/mobile",
  );
} finally {
  await context?.close();
  await new Promise((r) => server.close(r));
  await engine.close();
  await rm(profile, { recursive: true, force: true });
}
