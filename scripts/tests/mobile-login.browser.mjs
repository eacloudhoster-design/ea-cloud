import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5221";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/mobile-floating-login";
await mkdir(out, { recursive: true });
const results = [];
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 430, height: 932 },
    { width: 760, height: 1024 },
    { width: 844, height: 390 },
    { width: 960, height: 440 },
  ]) {
    const recording = viewport.width === 390;
    const c = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      reducedMotion: "no-preference",
      ...(recording ? { recordVideo: { dir: out, size: viewport } } : {}),
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
    p.setDefaultTimeout(15000);
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin + "/admin/login");
    await p
      .getByRole("heading", { name: "EA Cloud Admin Portal", exact: true })
      .waitFor();
    const logo = p.locator(".mentor-login-mobile-logo");
    await logo.evaluate((el) => el.decode());
    assert.equal(await p.locator(".mentor-login-logo:visible").count(), 0);
    assert.equal(
      await p
        .getByText("Welcome — Login to access your dashboard", { exact: true })
        .isVisible(),
      true,
    );
    const panel = await p.locator(".mentor-login-main").boundingBox(),
      cloud = await logo.boundingBox(),
      heading = await p.locator("h1").boundingBox();
    assert(
      Math.abs(cloud.x + cloud.width / 2 - viewport.width / 2) < 1,
      "cloud is centered",
    );
    assert(
      cloud.y + cloud.height > panel.y &&
        cloud.y + cloud.height < heading.y - 12,
      "cloud overlaps panel but clears the heading",
    );
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const asset = await logo.evaluate((el) => {
      const canvas = document.createElement("canvas");
      canvas.width = el.naturalWidth;
      canvas.height = el.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(el, 0, 0);
      return {
        width: el.naturalWidth,
        height: el.naturalHeight,
        corners: [
          [0, 0],
          [canvas.width - 1, 0],
          [0, canvas.height - 1],
          [canvas.width - 1, canvas.height - 1],
        ].map(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3]),
        interior: ctx.getImageData(844, 200, 1, 1).data[3],
      };
    });
    assert.deepEqual(
      { width: asset.width, height: asset.height, corners: asset.corners },
      { width: 1688, height: 932, corners: [0, 0, 0, 0] },
    );
    assert(
      asset.interior >= 250,
      "black logo interior remains essentially opaque",
    );
    const imageStyle = await logo.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        clip: s.clipPath,
        mask: s.maskImage,
        radius: s.borderRadius,
        fit: s.objectFit,
      };
    });
    assert.deepEqual(imageStyle, {
      clip: "none",
      mask: "none",
      radius: "0px",
      fit: "contain",
    });
    assert.equal(
      await p
        .locator(".mentor-mobile-cloud")
        .evaluate((el) => getComputedStyle(el).borderTopWidth),
      "0px",
    );
    assert.deepEqual(
      await p.locator(".mentor-mobile-cloud-effects").boundingBox(),
      cloud,
      "circuits and eyes align with image",
    );
    const circuit = p
      .locator(".mentor-mobile-circuit:not(.mentor-mobile-circuit-halo)")
      .first();
    const offset = await circuit.evaluate(
      (el) => getComputedStyle(el).strokeDashoffset,
    );
    await p.waitForTimeout(300);
    assert.notEqual(
      await circuit.evaluate((el) => getComputedStyle(el).strokeDashoffset),
      offset,
    );
    assert.equal(
      await p
        .locator(".mentor-mobile-circuit:not(.mentor-mobile-circuit-halo)")
        .count(),
      6,
    );
    assert(
      await p.locator(".mentor-mobile-circuit").evaluateAll((nodes) =>
        nodes.every((el) => {
          const b = el.getBBox();
          return (
            b.x >= 0 &&
            b.y >= 0 &&
            b.x + b.width <= 1688 &&
            b.y + b.height <= 932
          );
        }),
      ),
    );
    if (recording) await p.waitForTimeout(7400); // Record two real 3.6-second eye power cycles.
    async function eyePhase(time) {
      await p.locator(".mentor-mobile-eye").evaluateAll((nodes, t) => {
        for (const el of nodes)
          for (const animation of el.getAnimations()) {
            animation.pause();
            animation.currentTime = t;
          }
      }, time);
      await p.waitForTimeout(50);
    }
    await eyePhase(1500);
    assert(
      (await p
        .locator(".mentor-mobile-eye")
        .first()
        .evaluate((el) => Number(getComputedStyle(el).opacity))) > 0.95,
    );
    await p.screenshot({
      path: `${out}/${viewport.width}-on.png`,
      fullPage: true,
    });
    await eyePhase(3300);
    assert.equal(
      await p
        .locator(".mentor-mobile-eye")
        .first()
        .evaluate((el) => getComputedStyle(el).opacity),
      "0",
    );
    if (recording)
      await p.screenshot({ path: out + "/390-off.png", fullPage: true });
    const submit = p.getByRole("button", { name: "LOGIN", exact: true });
    let requests = 0;
    await c.route("**/api/auth/login", async (r) => {
      requests++;
      assert.deepEqual(r.request().postDataJSON(), {
        email: "mobile@example.invalid",
        password: "Test-only-pass",
        role: "mentor",
      });
      await r.fulfill({ status: 401, json: { error: "Invalid credentials" } });
    });
    await submit.click();
    assert.equal(requests, 0);
    await p
      .getByLabel("Email Address", { exact: true })
      .fill("mobile@example.invalid");
    await p.getByLabel("Password", { exact: true }).fill("Test-only-pass");
    await p.getByRole("button", { name: "Show password", exact: true }).click();
    assert.equal(
      await p.getByLabel("Password", { exact: true }).getAttribute("type"),
      "text",
    );
    await p.getByRole("button", { name: "Hide password", exact: true }).click();
    await submit.click();
    await p
      .getByRole("alert")
      .filter({ hasText: "Invalid credentials" })
      .waitFor();
    assert.equal(requests, 1);
    await p.emulateMedia({ reducedMotion: "reduce" });
    assert(
      await p
        .locator(
          ".mentor-mobile-eye,.mentor-mobile-circuit,.mentor-mobile-neon .mentor-login-trace",
        )
        .evaluateAll((nodes) =>
          nodes.every((el) => getComputedStyle(el).animationName === "none"),
        ),
    );
    assert.equal(
      await p.locator(".mentor-login-support").getAttribute("href"),
      "mailto:eacloudhoster@gmail.com",
    );
    if (viewport.width === 390) {
      await p.setViewportSize({ width: 390, height: 480 });
      await p.getByLabel("Password", { exact: true }).focus();
      await p.getByLabel("Password", { exact: true }).scrollIntoViewIfNeeded();
      const field = await p
        .getByLabel("Password", { exact: true })
        .boundingBox();
      assert(field.y >= 0 && field.y + field.height <= 480);
      await submit.scrollIntoViewIfNeeded();
      const button = await submit.boundingBox();
      assert(button.y >= 0 && button.y + button.height <= 480);
    }
    await p.getByRole("link", { name: "Create one", exact: true }).click();
    await p.waitForURL("**/register");
    assert.equal(await p.locator("form input").count(), 6);
    await p.getByRole("link", { name: "Sign in", exact: true }).click();
    await p.waitForURL("**/admin/login");
    await p.getByRole("link", { name: "Close sign in", exact: true }).click();
    await p.waitForURL(origin + "/");
    assert.deepEqual(errors, []);
    results.push({
      viewport,
      transparentCloud: true,
      panelOverlap: true,
      noCircleOrCssMask: true,
      powerCycleSeconds: 3.6,
      eyeOffState: true,
      alignedCircuitMotion: true,
      formAndNavigation: true,
      reducedMotion: true,
    });
    const video = p.video();
    await c.close();
    if (video) await video.saveAs(out + "/mobile-animation.webm");
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
