// Real built app + real cookie/session/licence handlers + disposable PostgreSQL.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { sessionFixture } from "./helpers/browser-session-fixture.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const { app, engine } = await sessionFixture();
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const port = server.address().port,
  origin = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const cases = [];
let tableRenamed = false;
await mkdir("work/startup-recovery", { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
});
let meFailures = 0,
  brandingFailures = 0,
  alwaysUnavailable = false,
  holdFirst = false,
  releaseHold;
const counts = { me: 0, branding: 0, mutations: 0 };
const mutationPaths = [];
await context.addInitScript(() => {
  Object.defineProperty(navigator, "standalone", { value: true });
  Object.defineProperty(window, "AudioContext", { value: undefined });
  Object.defineProperty(window, "webkitAudioContext", { value: undefined });
  localStorage.removeItem("appClientToken");
});
await context.routeWebSocket("**/api/ws?*", () => {});
await context.route("**/*", async (route) => {
  const request = route.request(),
    u = new URL(request.url());
  if (u.origin !== origin) return route.abort();
  if (!u.pathname.startsWith("/api/")) return route.continue();
  if (request.method() !== "GET") {
    counts.mutations++;
    mutationPaths.push(u.pathname);
  }
  if (u.pathname === "/api/app/me") {
    counts.me++;
    if (holdFirst) {
      holdFirst = false;
      await new Promise((r) => (releaseHold = r));
      try {
        return await route.continue();
      } catch {
        return;
      }
    }
    if (alwaysUnavailable || meFailures-- > 0)
      return route.fulfill({
        status: 503,
        json: {
          error: "PRIVATE failure response must not enter diagnostics",
          code: "SESSION_STORAGE_UNAVAILABLE",
        },
      });
    return route.continue();
  }
  if (u.pathname === "/api/app/dashboard") {
    counts.branding++;
    if (brandingFailures-- > 0)
      return route.fulfill({
        status: 502,
        json: { code: "API_UPSTREAM_UNREACHABLE" },
      });
    return route.continue();
  }
  if (u.pathname === "/api/app/login" || u.pathname === "/api/app/logout")
    return route.continue();
  const json = u.pathname.endsWith("/ea-mode-images")
    ? { eas: [] }
    : u.pathname.endsWith("/trading-controls")
      ? { copyingEnabled: false }
      : u.pathname.endsWith("/activity/snapshot")
        ? {
            observedAt: Date.now(),
            connected: false,
            engine: false,
            robotEnabled: false,
            tradeAllowed: false,
            account: null,
            symbols: [],
          }
        : u.pathname.endsWith("/activity")
          ? { events: [] }
          : [];
  return route.fulfill({ json });
});
const login = async () => {
  const response = await context.request.post(origin + "/api/app/login", {
    data: { email: "client@example.invalid", password: "Test-only-pass-123!" },
  });
  assert.equal(response.status(), 200, await response.text());
  const cookie = (await context.cookies()).find(
    (c) => c.name === "ea_client_session",
  );
  assert.ok(cookie?.httpOnly && cookie.secure);
  return cookie;
};
const home = async (page) => {
  await page
    .locator("[data-home-screen]")
    .waitFor({ state: "visible", timeout: 20000 });
  await page
    .locator(".ea-startup")
    .waitFor({ state: "detached", timeout: 20000 });
};
const diagnostics = (page) =>
  page.evaluate(() => window.__eaStartupDiagnostics || []);
let page;
try {
  // First launch: unavailable service must not create authenticated access.
  meFailures = 2;
  page = await context.newPage();
  await page.goto(origin + "/ea-app/");
  await page.locator("input[type=email]").waitFor({ timeout: 20000 });
  assert.equal(await page.locator("[data-home-screen]").count(), 0);
  assert.ok((await diagnostics(page)).some((e) => e.status === 401));
  const stopped = counts.me;
  await pause(1400);
  assert.equal(counts.me, stopped, "401 stops automatic retries");
  cases.push(
    "cold visitor: 503 retries then authoritative 401 sign-in, no access bypass",
  );
  await page.close();
  const originalCookie = await login();
  meFailures = 2;
  brandingFailures = 1;
  page = await context.newPage();
  await page.goto(origin + "/ea-app/");
  await home(page);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("appClientToken")),
    null,
  );
  assert.ok(
    (await diagnostics(page)).some(
      (e) => e.phase === "session" && e.status === 503,
    ),
  );
  assert.ok(
    (await diagnostics(page)).some(
      (e) => e.phase === "branding" && e.status === 502,
    ),
  );
  assert.ok(!JSON.stringify(await diagnostics(page)).includes("PRIVATE"));
  assert.equal(
    (await context.cookies()).find((c) => c.name === "ea_client_session").value,
    originalCookie.value,
  );
  cases.push(
    "returning cookie: session 503 + dashboard 502 automatically recover without login",
  );
  await page.evaluate(
    () =>
      (window.__verifiedHome = document.querySelector("[data-home-screen]")),
  );
  const bounds = await page.locator(".ea-glass-navigation").boundingBox();
  // Reopen while unavailable: keep the already verified interface, never replay the splash.
  alwaysUnavailable = true;
  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    );
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
  });
  await page.waitForFunction(() =>
    window.__eaStartupDiagnostics?.some(
      (e) => e.phase === "session" && e.event === "startup_request_failed",
    ),
  );
  await pause(200);
  assert.equal(
    await page.evaluate(
      () =>
        window.__verifiedHome === document.querySelector("[data-home-screen]"),
    ),
    true,
  );
  assert.equal(await page.locator(".ea-startup").count(), 0);
  assert.deepEqual(
    await page.locator(".ea-glass-navigation").boundingBox(),
    bounds,
  );
  alwaysUnavailable = false;
  const beforeRecovery = counts.me;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  for (let i = 0; i < 60 && counts.me === beforeRecovery; i++) await pause(100);
  assert.ok(counts.me > beforeRecovery);
  await home(page);
  cases.push(
    "PWA pagehide/pageshow during backend outage retains the same verified Home and geometry",
  );
  // Browser network loss and recovery also keep the authenticated app mounted.
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() =>
    window.__eaStartupDiagnostics?.some((e) => e.category === "network"),
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.__verifiedHome === document.querySelector("[data-home-screen]"),
    ),
    true,
  );
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await pause(500);
  cases.push(
    "temporary browser offline/online recovery preserves cookie and Home",
  );
  // Stop and reopen the actual local HTTP listener; its PostgreSQL sessions survive.
  await new Promise((resolve) => server.close(resolve));
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await pause(350);
  assert.equal(
    await page.evaluate(
      () =>
        window.__verifiedHome === document.querySelector("[data-home-screen]"),
    ),
    true,
  );
  server.listen(port, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await home(page);
  assert.equal(
    (await context.cookies()).find((c) => c.name === "ea_client_session").value,
    originalCookie.value,
  );
  cases.push(
    "local backend listener restart preserves the database cookie session and recovers",
  );
  await page.close();
  // Reproduce a migrated-cookie/schema outage against actual session middleware.
  await engine.exec(
    "ALTER TABLE browser_sessions RENAME TO fixture_browser_sessions_saved",
  );
  tableRenamed = true;
  page = await context.newPage();
  await page.goto(origin + "/ea-app/");
  await page.getByRole("alert").waitFor({ timeout: 18000 });
  assert.match(
    await page.getByRole("alert").innerText(),
    /session database schema/i,
  );
  assert.equal(await page.locator("[data-home-screen]").count(), 0);
  assert.equal(
    (await context.cookies()).find((c) => c.name === "ea_client_session").value,
    originalCookie.value,
  );
  await page.screenshot({
    path: "work/startup-recovery/schema-unavailable.png",
  });
  await engine.exec(
    "ALTER TABLE fixture_browser_sessions_saved RENAME TO browser_sessions",
  );
  tableRenamed = false;
  const beforeRetry = counts.me;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await home(page);
  assert.ok(counts.me > beforeRetry);
  assert.equal(await page.locator("input[type=email]").count(), 0);
  cases.push(
    "real missing session schema: precise error, cookie retained, Retry restarts verification after restoration",
  );
  await page.close();
  // Simulate a cold HTTP request outliving the deadline, then restore connectivity.
  holdFirst = true;
  page = await context.newPage();
  await page.clock.install();
  await page.goto(origin + "/ea-app/");
  for (let i = 0; i < 80 && !releaseHold; i++) await pause(50);
  assert.ok(releaseHold);
  await page.clock.fastForward(31000);
  assert.ok((await diagnostics(page)).some((e) => e.code === "API_TIMEOUT"));
  releaseHold();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await home(page);
  cases.push(
    "slow/hung cold request hits the 30-second deadline and recovers without closing the PWA",
  );
  // Real expired credentials still remove protected UI, even after successful recovery.
  await engine.exec(
    "UPDATE browser_sessions SET expires_at=now()-interval '1 second' WHERE kind='client'",
  );
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await page.locator("input[type=email]").waitFor({ timeout: 15000 });
  assert.equal(await page.locator("[data-home-screen]").count(), 0);
  assert.deepEqual(
    mutationPaths.filter((path) => !path.startsWith("/api/app/push/")),
    [],
    "Startup recovery never issues login, logout or trading mutations; existing push cleanup remains allowed",
  );
  cases.push(
    "real expired session fails closed; startup never submits mutations",
  );
  console.log("PASS startup recovery:", cases);
  await writeFile(
    "work/startup-recovery/results.json",
    JSON.stringify(
      {
        cases,
        counts,
        limitations: [
          "Chromium iPhone/PWA emulation, not a physical installed iOS PWA",
          "Render/Pages production access blocked by workspace proxy; no production logs supplied",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (tableRenamed)
    await engine.exec(
      "ALTER TABLE fixture_browser_sessions_saved RENAME TO browser_sessions",
    );
  releaseHold?.();
  await context.close();
  await browser.close();
  await new Promise((r) => server.close(r));
  await engine.close();
}
