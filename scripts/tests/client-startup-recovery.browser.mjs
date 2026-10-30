import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5234";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  for (const scenario of [
    "fresh",
    "valid",
    "transient-session",
    "retry-session",
    "retry-dashboard",
    "online",
    "foreground",
    "expired-dashboard",
    "forbidden",
  ]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", { value: true });
      window.AudioContext = undefined;
      window.webkitAudioContext = undefined;
    });
    await context.addCookies([
      {
        name: "ea_client_session",
        value: "test-cookie-only",
        url: origin,
        httpOnly: true,
      },
    ]);
    let me = 0,
      dashboard = 0,
      restored = false;
    const mutations = [];
    await context.route("https://fonts.**", (r) => r.abort());
    await context.route("**/api/**", async (r) => {
      const request = r.request(),
        path = new URL(request.url()).pathname;
      if (request.method() !== "GET") mutations.push(path);
      if (path === "/api/app/me") {
        me++;
        if (scenario === "fresh")
          return r.fulfill({ status: 401, json: { code: "SESSION_REQUIRED" } });
        if (scenario === "forbidden")
          return r.fulfill({
            status: 403,
            json: { code: "ACCOUNT_NOT_APPROVED" },
          });
        if (
          (scenario === "transient-session" && me === 1) ||
          (["retry-session", "online", "foreground"].includes(scenario) &&
            !restored)
        )
          return r.fulfill({
            status: 503,
            json: { code: "SESSION_CHECK_UNAVAILABLE" },
          });
        return r.fulfill({
          json: {
            id: 7,
            token: btoa("7:client:cookie"),
            status: "approved",
            licenseKey: "TEST",
          },
        });
      }
      if (path === "/api/app/dashboard") {
        dashboard++;
        if (scenario === "expired-dashboard")
          return r.fulfill({
            status: 401,
            json: { code: "SESSION_LICENCE_EXPIRED" },
          });
        if (scenario === "retry-dashboard" && !restored)
          return r.fulfill({ status: 502, body: "Bad Gateway" });
        return r.fulfill({
          json: {
            mentor: {
              id: 5,
              robotName: "Startup fixture",
              backgroundImageUrl: "/default-robot.jpg",
            },
            eas: [],
          },
        });
      }
      if (path === "/api/app/ea-mode-images")
        return r.fulfill({
          json: {
            eas: [
              {
                id: 1,
                name: "Startup fixture",
                images: Array(4).fill("/default-robot.jpg"),
              },
            ],
          },
        });
      if (path === "/api/app/trading-controls")
        return r.fulfill({ json: { copyingEnabled: false } });
      return r.fulfill({ json: [] });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/ea-app/");
    if (
      [
        "retry-session",
        "retry-dashboard",
        "online",
        "foreground",
        "forbidden",
      ].includes(scenario)
    ) {
      await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
      await page.locator(".ea-startup").waitFor({ state: "detached" });
      assert.equal(
        await page.locator("[data-home-screen]").count(),
        0,
        "failure must not grant app access",
      );
      if (scenario === "forbidden") {
        assert.equal(me, 1);
        assert.match(
          await page.getByRole("alert").innerText(),
          /does not have access/,
        );
      } else {
        restored = true;
        if (scenario === "online")
          await page.evaluate(() => window.dispatchEvent(new Event("online")));
        else if (scenario === "foreground")
          await page.evaluate(() =>
            document.dispatchEvent(new Event("visibilitychange")),
          );
        else
          await page
            .getByRole("button", { name: "Retry", exact: true })
            .click();
      }
    }
    if (scenario === "fresh" || scenario === "expired-dashboard") {
      await page.locator('input[type="email"]').waitFor();
      assert.equal(await page.locator("[data-home-screen]").count(), 0);
      assert.equal(dashboard, scenario === "fresh" ? 0 : 1);
    } else if (scenario !== "forbidden") {
      await page.locator("[data-home-screen]").waitFor();
      await page.locator(".ea-startup").waitFor({ state: "detached" });
      assert.equal(
        (await context.cookies()).find((c) => c.name === "ea_client_session")
          ?.value,
        "test-cookie-only",
        "valid session cookie survives recovery",
      );
      if (scenario === "transient-session") assert.equal(me, 2);
      if (scenario === "retry-dashboard") assert.equal(dashboard, 4);
      if (scenario === "valid") {
        await page.reload();
        await page.locator("[data-home-screen]").waitFor();
        await page.locator(".ea-startup").waitFor({ state: "detached" });
      }
    }
    assert(!mutations.includes("/api/app/logout"));
    assert.deepEqual(errors, []);
    console.log("PASS iOS standalone: " + scenario);
    await context.close();
  }
} finally {
  await browser.close();
}
