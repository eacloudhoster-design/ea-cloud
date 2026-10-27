import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5221";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const out = "docs/login-logo-effects";
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
    const mobile = viewport.width <= 760 || viewport.height <= 500;
    const context = await browser.newContext({
      viewport,
      isMobile: mobile,
      hasTouch: mobile,
      recordVideo:
        viewport.width === 1440
          ? { dir: "work/logo-effects-video", size: viewport }
          : undefined,
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
    await context.route("**/api/auth/me", (r) =>
      r.fulfill({ status: 401, json: { error: "Unauthorized" } }),
    );
    await context.route("**/api/app/me", (r) =>
      r.fulfill({ status: 401, json: { error: "Unauthorized" } }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/admin/login");
    const root = page.locator(
      mobile ? ".mentor-mobile-cloud" : ".mentor-login-emblem",
    );
    const img = root.locator("img");
    await img.evaluate((el) => el.decode());
    const alpha = await img.evaluate((el) => {
      const c = document.createElement("canvas");
      c.width = el.naturalWidth;
      c.height = el.naturalHeight;
      const x = c.getContext("2d");
      x.drawImage(el, 0, 0);
      return {
        width: c.width,
        height: c.height,
        corner: x.getImageData(0, 0, 1, 1).data[3],
        interior: x.getImageData(844, 200, 1, 1).data[3],
        clip: getComputedStyle(el).clipPath,
        mask: getComputedStyle(el).maskImage,
        blend: getComputedStyle(el).mixBlendMode,
      };
    });
    assert.equal(alpha.corner, 0);
    assert(alpha.interior >= 250);
    assert.equal(alpha.clip, "none");
    assert.equal(alpha.mask, "none");
    assert.equal(alpha.blend, "normal");
    assert.deepEqual(
      await img.boundingBox(),
      await root.locator("svg").boundingBox(),
    );
    const box = await root.boundingBox();
    const brand = await page.locator(".mentor-login-brand").boundingBox();
    assert(
      Math.abs(box.x + box.width / 2 - brand.x - brand.width / 2) < 1,
      "logo stays centered",
    );
    const geometry = () =>
      page
        .locator("h1,form input,form button,.mentor-login-support")
        .evaluateAll((nodes) =>
          nodes.map((el) => el.getBoundingClientRect().toJSON()),
        );
    const before = await geometry();
    const eyes = root.locator(".mentor-mobile-eye");
    assert.equal(await eyes.count(), 2);
    const circuits = root.locator(
      ".mentor-mobile-circuit:not(.mentor-mobile-circuit-halo)",
    );
    assert.equal(await circuits.count(), 6);
    const neon = page.locator(
      mobile
        ? ".mentor-mobile-neon .mentor-login-trace"
        : ".mentor-login-neon .mentor-login-trace",
    );
    assert.equal(await neon.count(), 8);
    const sample = async (locator) =>
      locator.evaluateAll((nodes) =>
        nodes.map((el) => ({
          opacity: getComputedStyle(el).opacity,
          offset: getComputedStyle(el).strokeDashoffset,
        })),
      );
    const startCircuit = await sample(circuits),
      startNeon = await sample(neon);
    await page.waitForTimeout(2400);
    assert.notDeepEqual(await sample(circuits), startCircuit);
    assert.notDeepEqual(await sample(neon), startNeon);
    const eyeFrame = async (time) =>
      eyes.evaluateAll((nodes, t) => {
        nodes.forEach((el) =>
          el.getAnimations().forEach((a) => {
            a.pause();
            a.currentTime = t;
          }),
        );
        return nodes.map((el) => ({
          opacity: getComputedStyle(el).opacity,
          duration: getComputedStyle(el).animationDuration,
        }));
      }, time);
    const on = await eyeFrame(1500);
    assert(on.every((e) => +e.opacity > 0.99 && e.duration === "3.6s"));
    if ([1440, 390].includes(viewport.width))
      await page.screenshot({
        path: `${out}/${mobile ? "mobile" : "desktop"}-eyes-on.png`,
        fullPage: true,
      });
    const off = await eyeFrame(3300);
    assert(off.every((e) => +e.opacity === 0));
    if ([1440, 390].includes(viewport.width))
      await page.screenshot({
        path: `${out}/${mobile ? "mobile" : "desktop"}-eyes-off.png`,
        fullPage: true,
      });
    await eyes.evaluateAll((nodes) =>
      nodes.forEach((el) => el.getAnimations().forEach((a) => a.play())),
    );
    await page.waitForTimeout(viewport.width === 1440 ? 8000 : 100);
    assert.deepEqual(await geometry(), before, "animations do not move form");
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (!mobile) {
      const baseline = JSON.parse(
        await readFile(`docs/login-logo-effects/form-baseline.json`, "utf8"),
      );
      assert.deepEqual(
        before,
        baseline[String(viewport.width)],
        "desktop form geometry unchanged from previous PR",
      );
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert(
      await root
        .locator(".mentor-mobile-eye,.mentor-mobile-circuit")
        .evaluateAll((nodes) =>
          nodes.every((el) => getComputedStyle(el).animationName === "none"),
        ),
    );
    assert.deepEqual(errors, []);
    const video = page.video();
    await context.close();
    if (video) await video.saveAs("work/logo-effects-video/desktop.webm");
    results.push({
      viewport,
      transparentAlpha: alpha,
      aligned: true,
      eyeOn: on,
      eyeOff: off,
      circuitTravel: true,
      backgroundTravel: true,
      unchangedFormGeometry: true,
      reducedMotion: true,
    });
  }
  await writeFile(
    `${out}/results.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    "PASS: six viewports; transparent logo, alignment, eyes on/off, circuits, neon, stable form, reduced motion.",
  );
} finally {
  await browser.close();
}
