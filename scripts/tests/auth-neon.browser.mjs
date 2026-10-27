import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5221";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/auth-neon";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
async function makeContext(viewport, video = false) {
  const c = await browser.newContext({
    viewport,
    reducedMotion: "no-preference",
    ...(video ? { recordVideo: { dir: out, size: viewport } } : {}),
  });
  await c.addInitScript(() => {
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
    window.__decorativeShifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (!entry.hadRecentInput) window.__decorativeShifts.push(entry.value);
    }).observe({ type: "layout-shift", buffered: true });
  });
  await c.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 401, json: { error: "Unauthorized" } }),
  );
  await c.route("**/api/app/me", (r) =>
    r.fulfill({ status: 401, json: { error: "Unauthorized" } }),
  );
  return c;
}
const geometry = (p) =>
  p
    .locator(
      ".mentor-login-main h1,.mentor-login-form input,.mentor-login-form button,.mentor-login-create,.mentor-login-support,.mentor-login-close",
    )
    .evaluateAll((nodes) =>
      nodes.map((el) => ({
        x: el.getBoundingClientRect().x,
        y: el.getBoundingClientRect().y,
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
      })),
    );
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 820, height: 1000 },
    { width: 844, height: 390 },
  ]) {
    const c = await makeContext(viewport, viewport.width === 1440);
    const p = await c.newPage();
    p.setDefaultTimeout(15000);
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin + "/admin/login");
    await p.locator(".mentor-login-logo").waitFor();
    await p.locator(".mentor-login-logo").evaluate((el) => el.decode());
    assert(
      await p.getByRole("button", { name: "LOGIN", exact: true }).isEnabled(),
      "form is available during introduction",
    );
    const before = await geometry(p);
    assert.equal(
      await p
        .locator(".mentor-login-logo")
        .evaluate((el) => getComputedStyle(el).clipPath),
      "none",
      "never hide the missing transparency with a CSS crop",
    );
    assert.equal(
      await p.locator(".mentor-login-logo").getAttribute("src"),
      "/ea-cloud-mobile-cloud.png",
    );
    assert.equal(
      await p.locator(".mentor-login-neon").getAttribute("preserveAspectRatio"),
      "xMidYMid slice",
    );
    assert.equal(
      await p
        .locator(".mentor-login-emblem .mentor-desktop-cloud-effects")
        .getAttribute("viewBox"),
      "0 0 1688 932",
    );
    const image = await p.locator(".mentor-login-logo").boundingBox(),
      eyes = await p
        .locator(".mentor-login-emblem .mentor-desktop-cloud-effects")
        .boundingBox();
    assert.deepEqual(
      image,
      eyes,
      "eye coordinates scale with the unmodified logo",
    );
    assert.equal(
      await p.locator(".mentor-login-neon .mentor-login-trace").count(),
      8,
    );
    const durations = await p
      .locator(".mentor-login-emblem .mentor-desktop-eye")
      .evaluateAll((nodes) =>
        nodes.map((el) => getComputedStyle(el).animationDuration),
      );
    assert.deepEqual(durations, ["3.6s", "3.6s"]);
    const sourceBefore = await p
      .locator(".mentor-login-neon .mentor-login-trace")
      .first()
      .evaluate((el) => getComputedStyle(el).strokeDashoffset);
    await p.waitForTimeout(2000);
    if (viewport.width === 1440)
      await p.screenshot({ path: out + "/desktop-2s.png", fullPage: true });
    const eyeBefore = await p
      .locator(".mentor-login-emblem .mentor-desktop-eye")
      .evaluateAll((nodes) => nodes.map((el) => getComputedStyle(el).opacity));
    await p.waitForTimeout(1800);
    const eyeAfter = await p
      .locator(".mentor-login-emblem .mentor-desktop-eye")
      .evaluateAll((nodes) => nodes.map((el) => getComputedStyle(el).opacity));
    assert.notDeepEqual(eyeBefore, eyeAfter, "the actual eye overlays pulse");
    assert.notEqual(
      await p
        .locator(".mentor-login-neon .mentor-login-trace")
        .first()
        .evaluate((el) => getComputedStyle(el).strokeDashoffset),
      sourceBefore,
      "light travels along the traced strip",
    );
    const after = await geometry(p);
    assert.deepEqual(
      after,
      before,
      "decorative effects never move form controls",
    );
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (viewport.width === 1440) {
      await p.screenshot({ path: out + "/desktop-4s.png", fullPage: true });
      const intervals = await p.evaluate(
        () =>
          new Promise((resolve) => {
            const intervals = [];
            let prior = performance.now();
            const end = prior + 1800;
            function frame(now) {
              intervals.push(now - prior);
              prior = now;
              if (now < end) requestAnimationFrame(frame);
              else resolve(intervals);
            }
            requestAnimationFrame(frame);
          }),
      );
      const sorted = intervals.slice(1).sort((a, b) => a - b);
      results.push({
        frameSample: {
          frames: sorted.length,
          medianMs: sorted[Math.floor(sorted.length * 0.5)],
          p95Ms: sorted[Math.floor(sorted.length * 0.95)],
        },
        note: "Headless Chromium with video recording; not a physical-device benchmark.",
      });
    }
    await p.emulateMedia({ reducedMotion: "reduce" });
    assert(
      await p
        .locator(
          ".mentor-login-emblem,.mentor-desktop-eye,.mentor-login-trace,.mentor-login-trace-reflection,.mentor-login-ambient",
        )
        .evaluateAll((nodes) =>
          nodes.every((el) => getComputedStyle(el).animationName === "none"),
        ),
    );
    assert.equal(
      await p
        .locator(".mentor-login-emblem")
        .evaluate((el) => getComputedStyle(el).opacity),
      "1",
    );
    if (viewport.width === 1440 || viewport.width === 390)
      await p.screenshot({
        path:
          out +
          `/${viewport.width === 1440 ? "desktop" : "mobile"}-reduced.png`,
        fullPage: true,
      });
    const shifts = await p.evaluate(() => window.__decorativeShifts);
    assert.equal(
      shifts.reduce((a, b) => a + b, 0),
      0,
      "no decoration-related layout shifts",
    );
    assert.deepEqual(errors, []);
    results.push({
      viewport,
      eyeAlignment: true,
      independentEyePulse: true,
      tracedNeonMotion: true,
      formGeometryStable: true,
      reducedMotion: true,
      usesExistingPreparedTransparentLogo: true,
    });
    const video = p.video();
    await c.close();
    if (video) await video.saveAs(out + "/desktop-animation.webm");
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
