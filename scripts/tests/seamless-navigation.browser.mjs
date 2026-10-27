import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5221";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/seamless-navigation";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
const mentor = {
  id: 1,
  firstName: "Ava",
  lastName: "Morgan",
  email: "mentor@example.invalid",
  role: "mentor",
  status: "approved",
};
async function context() {
  const c = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
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
  return c;
}
try {
  // Public pages must work while both real session checks are still pending, including failures.
  const publicContext = await context();
  let release;
  const held = new Promise((r) => (release = r));
  let portalRequests = 0,
    clientRequests = 0;
  await publicContext.route("**/api/auth/me", async (r) => {
    portalRequests++;
    await held;
    await r.fulfill({ status: 503, json: { error: "Test outage" } });
  });
  await publicContext.route("**/api/app/me", async (r) => {
    clientRequests++;
    await held;
    await r.fulfill({ status: 401, json: { error: "Unauthorized" } });
  });
  const p = await publicContext.newPage();
  await p.goto(origin);
  await p.evaluate(() => (window.__documentIdentity = "public"));
  await p.locator(".public-get-app").click();
  await p.waitForURL("**/get-app");
  await p.getByLabel("EMAIL", { exact: true }).waitFor();
  assert.equal(
    await p.getByText("Verifying session", { exact: false }).count(),
    0,
  );
  // Links on Home now use the existing router, including mentor registration.
  await p.goBack();
  await p.locator(".public-cta-secondary").first().click();
  await p.waitForURL("**/register");
  await p.getByRole("link", { name: "Sign in", exact: true }).click();
  await p.waitForURL("**/admin/login");
  await p.getByRole("button", { name: "LOGIN", exact: true }).waitFor();
  await p.getByRole("link", { name: "Create one", exact: true }).click();
  await p.waitForURL("**/register");
  assert.equal(await p.evaluate(() => window.__documentIdentity), "public");
  assert.equal(portalRequests, 1);
  assert.equal(clientRequests, 1);
  // Focus events that arrive while initial verification is pending coalesce with it.
  await p.evaluate(() => {
    dispatchEvent(new Event("focus"));
    dispatchEvent(new Event("focus"));
    dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
  });
  await p.waitForTimeout(100);
  assert.equal(portalRequests, 1);
  assert.equal(clientRequests, 1);
  release();
  await p
    .getByRole("alert")
    .filter({ hasText: "Unable to check your session" })
    .waitFor();
  await p.getByRole("link", { name: "Sign in", exact: true }).click();
  await p.getByRole("button", { name: "LOGIN", exact: true }).waitFor();
  assert.equal(
    await p.getByText("Verifying session", { exact: false }).count(),
    0,
  );
  results.push({
    publicFormsAvailableBeforeVerification: true,
    publicFailuresReportedWithoutBlocking: true,
    inFlightChecksCoalesced: true,
    clientRoutingPreservesDocument: true,
  });
  await publicContext.close();
  // Unknown and denied portal sessions never mount protected content or fetch protected data.
  for (const response of ["guest", "pending", "wrong-role"]) {
    const c = await context();
    let release;
    const gate = new Promise((r) => (release = r));
    let privateRequests = 0;
    await c.route("**/api/**", async (r) => {
      const path = new URL(r.request().url()).pathname;
      if (path === "/api/auth/me") {
        await gate;
        return r.fulfill(
          response === "guest"
            ? { status: 401, json: { error: "Unauthorized" } }
            : {
                json: {
                  ...mentor,
                  status: response === "pending" ? "pending" : "approved",
                },
              },
        );
      }
      if (path === "/api/app/me")
        return r.fulfill({ status: 401, json: { error: "Unauthorized" } });
      privateRequests++;
      return r.fulfill({
        json: path.endsWith("/activity") || path === "/api/eas" ? [] : {},
      });
    });
    const p = await c.newPage();
    await p.goto(
      origin +
        (response === "wrong-role"
          ? "/superadmin/dashboard"
          : "/admin/dashboard"),
    );
    await p.getByRole("region", { name: "Portal loading" }).waitFor();
    assert.equal(
      await p.getByRole("heading", { name: "Dashboard", exact: true }).count(),
      0,
    );
    assert.equal(privateRequests, 0);
    release();
    if (response === "wrong-role") {
      await p.waitForURL("**/admin/dashboard");
      await p
        .getByRole("heading", { name: "Dashboard", exact: true })
        .waitFor();
      assert.equal(await p.locator(".superadmin-sidebar").count(), 0);
    } else {
      await p.waitForURL("**/admin/login");
      await p.getByRole("button", { name: "LOGIN", exact: true }).waitFor();
      assert.equal(privateRequests, 0);
    }
    await c.close();
    results.push({
      scenario: response,
      protectedContentBlockedUntilAuthorized: true,
    });
  }
  // A public login may complete while the initial restore is still in flight.
  const race = await context();
  let finishRestore;
  const restoring = new Promise((resolve) => (finishRestore = resolve));
  await race.route("**/api/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === "/api/auth/me") {
      await restoring;
      return r.fulfill({
        status: 401,
        json: { error: "Old anonymous response" },
      });
    }
    if (path === "/api/auth/login")
      return r.fulfill({ json: { user: mentor, token: "1:mentor:cookie" } });
    if (path === "/api/app/me")
      return r.fulfill({ status: 401, json: { error: "Unauthorized" } });
    return r.fulfill({ json: path.endsWith("/activity") ? [] : {} });
  });
  const racingPage = await race.newPage();
  await racingPage.goto(origin + "/admin/login");
  await racingPage
    .getByLabel("Email Address", { exact: true })
    .fill(mentor.email);
  await racingPage
    .getByLabel("Password", { exact: true })
    .fill("Test-only-password");
  await racingPage.getByRole("button", { name: "LOGIN", exact: true }).click();
  await racingPage
    .getByRole("heading", { name: "Dashboard", exact: true })
    .waitFor();
  finishRestore();
  await racingPage.waitForTimeout(150);
  assert.equal(
    await racingPage
      .getByRole("heading", { name: "Dashboard", exact: true })
      .count(),
    1,
  );
  await race.close();
  results.push({ lateAnonymousRestoreCannotOverwriteNewLogin: true });

  // Network errors in a protected client route expose Retry without mounting private content.
  const failedClient = await context();
  let recovered = false;
  await failedClient.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 401, json: { error: "Unauthorized" } }),
  );
  await failedClient.route("**/api/app/me", (r) =>
    r.fulfill(
      recovered
        ? { status: 401, json: { error: "Expired" } }
        : { status: 503, json: { error: "Offline" } },
    ),
  );
  const clientPage = await failedClient.newPage();
  await clientPage.goto(origin + "/app/dashboard");
  await clientPage
    .getByRole("alert")
    .filter({ hasText: "Unable to check your session" })
    .waitFor();
  assert.equal(await clientPage.locator('input[type="password"]').count(), 0);
  recovered = true;
  await clientPage.getByRole("button", { name: "Retry", exact: true }).click();
  await clientPage.waitForURL("**/app");
  await clientPage.locator('input[type="password"]').waitFor();
  await failedClient.close();
  results.push({
    protectedClientFailureHasRetry: true,
    clientUnauthorizedDenied: true,
  });

  // Reuse an existing verified session across portal/public/back/forward transitions.
  const c = await context();
  let verified = true,
    requests = 0,
    logout = 0;
  await c.route("**/api/**", (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === "/api/auth/me") {
      requests++;
      return r.fulfill(
        verified
          ? { json: mentor }
          : { status: 401, json: { error: "Expired" } },
      );
    }
    if (path === "/api/app/me")
      return r.fulfill({ status: 401, json: { error: "Unauthorized" } });
    if (path === "/api/auth/logout") {
      logout++;
      verified = false;
      return r.fulfill({ json: { success: true } });
    }
    return r.fulfill({
      json: path.endsWith("/activity") || path === "/api/eas" ? [] : {},
    });
  });
  const page = await c.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(origin);
  await page.evaluate(() => (window.__protectedNavigation = "same"));
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Sign In", exact: false }).click();
  await page.waitForURL("**/admin/dashboard");
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  const count = requests;
  await page
    .getByRole("link", { name: "Profile", exact: true })
    .first()
    .click();
  await page.waitForURL("**/admin/profile");
  assert.equal(
    await page.getByText("Verifying session", { exact: false }).count(),
    0,
  );
  await page.goBack();
  await page.waitForURL("**/admin/dashboard");
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await page.goBack();
  await page.waitForURL(origin + "/");
  await page.goForward();
  await page.waitForURL("**/admin/dashboard");
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  assert.equal(requests, count);
  assert.equal(await page.evaluate(() => window.__protectedNavigation), "same");
  // A BFCache-style pageshow explicitly blocks private content until fresh validation.
  let unblock;
  const resumed = new Promise((r) => (unblock = r));
  await c.route("**/api/auth/me", async (r) => {
    await resumed;
    await r.fulfill({ json: mentor });
  });
  await page.evaluate(() =>
    dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  await page.getByRole("region", { name: "Portal loading" }).waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "Dashboard", exact: true }).count(),
    0,
  );
  unblock();
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await c.unroute("**/api/auth/me");
  verified = false;
  await page.evaluate(() => dispatchEvent(new Event("focus")));
  await page.waitForURL("**/admin/login");
  assert.equal(
    await page.getByRole("heading", { name: "Dashboard", exact: true }).count(),
    0,
  );
  results.push({
    existingSessionReused: true,
    backForward: true,
    noVerificationOnRouteChanges: true,
    bfcacheRevalidatesBeforePrivateContent: true,
    expiredSessionRedirect: true,
  });
  assert.deepEqual(pageErrors, []);
  await c.close();
  // Explicit logout continues to call the existing server endpoint and rejects protected Back.
  const d = await context();
  let signedIn = true;
  await d.route("**/api/**", (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === "/api/auth/logout") {
      logout++;
      signedIn = false;
      return r.fulfill({ json: { success: true } });
    }
    if (path === "/api/auth/me")
      return r.fulfill(
        signedIn
          ? { json: mentor }
          : { status: 401, json: { error: "Unauthorized" } },
      );
    if (path === "/api/app/me")
      return r.fulfill({ status: 401, json: { error: "Unauthorized" } });
    return r.fulfill({
      json: path.endsWith("/activity") || path === "/api/eas" ? [] : {},
    });
  });
  const q = await d.newPage();
  await q.goto(origin + "/admin/dashboard");
  await q.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await q
    .getByRole("button", { name: "Sign Out", exact: true })
    .first()
    .click();
  await q.waitForURL("**/admin/login");
  assert(logout > 0);
  await q.goBack();
  await q.waitForTimeout(400);
  assert.equal(
    await q.getByRole("heading", { name: "Dashboard", exact: true }).count(),
    0,
  );
  await d.close();
  results.push({ explicitLogout: true, protectedBackDenied: true });
  await writeFile(
    out + "/results.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    "PASS: immediate public pages, coalesced checks, cached portal navigation, unknown/denied/expired sessions, BFCache, logout and history",
  );
} finally {
  await browser.close();
}
