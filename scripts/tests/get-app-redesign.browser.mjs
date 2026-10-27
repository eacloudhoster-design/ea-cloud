import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5221";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/get-app-redesign";
await mkdir(out, { recursive: true });
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1920, height: 1080 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 412, height: 915 },
    { width: 844, height: 390 },
  ]) {
    const c = await b.newContext({
      viewport,
      isMobile: viewport.width < 900,
      hasTouch: viewport.width < 900,
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
    let payload,
      mode = "error",
      release;
    let gate = new Promise((r) => (release = r));
    await c.route("**/api/app/register", async (r) => {
      payload = r.request().postDataJSON();
      await gate;
      await r.fulfill(
        mode === "error"
          ? { status: 400, json: { error: "Registration rejected for test" } }
          : {
              status: 201,
              json: {
                token: "1:client:cookie",
                client: { status: "pending", licenseKey: null },
              },
            },
      );
    });
    let loginPayload;
    await c.route("**/api/app/login", (r) => {
      loginPayload = r.request().postDataJSON();
      return r.fulfill({ status: 401, json: { error: "Account not found" } });
    });
    await c.route("**/ea-app/", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: "<h1>Trading app handoff</h1>",
      }),
    );
    const p = await c.newPage();
    p.setDefaultTimeout(15000);
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin + "/get-app");
    await p.getByRole("heading", { name: "EA Cloud", exact: true }).waitFor();
    const logo = p.locator(".get-app-brand img");
    await logo.evaluate((el) => el.decode());
    assert.equal(await p.locator(".get-app-field input").count(), 4);
    assert.equal(await p.locator("button[aria-label*=Close]").count(), 0);
    const cloud = await p.locator(".get-app-brand").boundingBox(),
      panel = await p.locator(".get-app-panel").boundingBox();
    assert(Math.abs(cloud.x + cloud.width / 2 - viewport.width / 2) < 1);
    assert(Math.abs(cloud.y + cloud.height - panel.y - 30) < 1);
    assert.match(
      await p
        .locator(".mentor-mobile-backdrop")
        .evaluate((n) => getComputedStyle(n).backgroundImage),
      /ea-cloud-auth-background/,
    );
    const alpha = await logo.evaluate((el) => {
      const c = document.createElement("canvas");
      c.width = el.naturalWidth;
      c.height = el.naturalHeight;
      const x = c.getContext("2d");
      x.drawImage(el, 0, 0);
      return x.getImageData(0, 0, 1, 1).data[3];
    });
    assert.equal(alpha, 0);
    assert.deepEqual(
      await logo.boundingBox(),
      await p.locator(".mentor-mobile-cloud-effects").boundingBox(),
    );
    const eye = p.locator(".mentor-mobile-eye");
    const frame = async (t) =>
      eye.evaluateAll((ns, t) => {
        ns.forEach((n) =>
          n.getAnimations().forEach((a) => {
            a.pause();
            a.currentTime = t;
          }),
        );
        return ns.map((n) => getComputedStyle(n).opacity);
      }, t);
    assert((await frame(1600)).every((x) => +x === 1));
    await p.screenshot({ path: `${out}/${viewport.width}.png` });
    assert((await frame(3300)).every((x) => +x === 0));
    const motion = async (selector) =>
      p
        .locator(selector)
        .evaluateAll((ns) =>
          ns.map((n) => getComputedStyle(n).strokeDashoffset),
        );
    const before = await motion(".mentor-mobile-circuit,.mentor-login-trace");
    await p.waitForTimeout(1800);
    assert.notDeepEqual(
      await motion(".mentor-mobile-circuit,.mentor-login-trace"),
      before,
    );
    assert.equal(
      await p
        .locator(".mentor-mobile-circuit:not(.mentor-mobile-circuit-halo)")
        .count(),
      6,
    );
    const submit = p.getByRole("button", {
      name: "Access EA Cloud",
      exact: true,
    });
    await submit.click();
    await p
      .getByRole("alert")
      .filter({ hasText: "All fields are required" })
      .waitFor();
    assert.equal(payload, undefined);
    for (const [label, value] of [
      ["EMAIL", " Signup@Example.Invalid "],
      ["FIRST NAME", " Ava "],
      ["LAST NAME", " Morgan "],
      ["PASSWORD", "Test-only-password"],
    ])
      await p.getByLabel(label, { exact: true }).fill(value);
    await submit.click();
    await p.waitForFunction(
      () => document.querySelector(".get-app-submit").disabled,
    );
    release();
    await p
      .getByRole("alert")
      .filter({ hasText: "Registration rejected for test" })
      .waitFor();
    assert.deepEqual(payload, {
      firstName: "Ava",
      lastName: "Morgan",
      email: "signup@example.invalid",
      password: "Test-only-password",
      plan: "monthly",
    });
    await p
      .getByRole("button", {
        name: "Already have an account? Sign in",
        exact: true,
      })
      .click();
    assert.equal(await p.locator(".get-app-field input").count(), 2);
    await p
      .getByLabel("EMAIL", { exact: true })
      .fill("existing@example.invalid");
    await p.getByLabel("PASSWORD", { exact: true }).fill("Test-only-password");
    await submit.click();
    await p
      .getByRole("alert")
      .filter({ hasText: "Account not found" })
      .waitFor();
    assert.deepEqual(loginPayload, {
      email: "existing@example.invalid",
      password: "Test-only-password",
    });
    await p
      .getByRole("button", {
        name: "New to EA Cloud? Create an account",
        exact: true,
      })
      .click();
    assert.equal(await p.locator(".get-app-field input").count(), 4);
    await p.emulateMedia({ reducedMotion: "reduce" });
    assert(
      await eye.evaluateAll((ns) =>
        ns.every((n) => getComputedStyle(n).animationName === "none"),
      ),
    );
    await p
      .getByLabel("PASSWORD", { exact: true })
      .evaluate((n) =>
        n.scrollIntoView({ behavior: "instant", block: "center" }),
      );
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (viewport.width === 390) {
      await p.setViewportSize({ width: 390, height: 420 });
      await p.getByLabel("PASSWORD", { exact: true }).focus();
      await p
        .getByLabel("PASSWORD", { exact: true })
        .evaluate((n) =>
          n.scrollIntoView({ behavior: "instant", block: "center" }),
        );
      const r = await p.getByLabel("PASSWORD", { exact: true }).boundingBox();
      assert(r.y >= 0 && r.y + r.height <= 420);
      await p.setViewportSize(viewport);
    }
    mode = "success";
    for (const [label, value] of [
      ["EMAIL", "signup@example.invalid"],
      ["FIRST NAME", "Ava"],
      ["LAST NAME", "Morgan"],
      ["PASSWORD", "Test-only-password"],
    ])
      await p.getByLabel(label, { exact: true }).fill(value);
    await submit.click();
    await p.waitForURL("**/ea-app/");
    await p.getByRole("heading", { name: "Trading app handoff" }).waitFor();
    assert.deepEqual(errors, []);
    results.push({
      viewport,
      fourOriginalFields: true,
      originalPayloadAndHandlers: true,
      loginModePreserved: true,
      successHandoff: true,
      transparentCloud: true,
      eyesOnOff: true,
      circuitAndBackgroundMotion: true,
      redTheme: true,
      scrolling: true,
      reducedMotion: true,
    });
    await c.close();
  }
  await writeFile(
    out + "/results.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    "PASS: six Get App viewports, original registration/login behavior, artwork and scrolling",
  );
} finally {
  await b.close();
}
