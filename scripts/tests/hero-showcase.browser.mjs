import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5214";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const output = process.env.PUBLIC_OUTPUT || "work/completed-showcase/animation";
await mkdir(output, { recursive: true });
const manifest = JSON.parse(
  await readFile("artifacts/ea-cloud/public/showcase/manifest.json", "utf8"),
);
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width < 500,
      isMobile: viewport.width < 500,
    });
    await context.route("https://fonts.**", (r) => r.abort());
    await context.addInitScript(() => {
      window.showcaseFrames = [];
      let start,
        last = -100;
      const sample = (time) => {
        const root = document.querySelector(".hero-showcase");
        if (root?.dataset.ready === "true") {
          start ??= time;
          if (time - last >= 70) {
            last = time;
            window.showcaseFrames.push({
              time: time - start,
              phones: [...root.querySelectorAll(".showcase-phone")].map(
                (el) => ({
                  id: el.dataset.interface,
                  opacity: Number(
                    getComputedStyle(el.querySelector(".showcase-entrance"))
                      .opacity,
                  ),
                  transform: getComputedStyle(
                    el.querySelector(".showcase-entrance"),
                  ).transform,
                  loaded:
                    el.querySelector("img").complete &&
                    el.querySelector("img").naturalWidth > 0,
                }),
              ),
            });
          }
        }
        if (start === undefined || time - start < 2100)
          requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const page = await context.newPage();
    await page.goto(origin);
    await page.waitForFunction(
      () => window.showcaseFrames?.at(-1)?.time >= 2000,
    );
    await page.evaluate(() => document.fonts.ready);
    const frames = await page.evaluate(() => window.showcaseFrames);
    assert(
      frames.some((f) => {
        const m = f.phones.find((p) => p.id === "matrix"),
          l = f.phones.find((p) => p.id === "s2tone");
        return (
          m.loaded &&
          m.opacity > 0.1 &&
          m.opacity < 0.95 &&
          m.opacity > l.opacity
        );
      }),
      "Matrix visibly enters before side screenshots",
    );
    assert(
      frames.some((f) => {
        const l = f.phones.find((p) => p.id === "s2tone"),
          r = f.phones.find((p) => p.id === "regular");
        return l.opacity > 0.1 && l.opacity > r.opacity;
      }),
      "left then right stagger",
    );
    assert(
      frames.at(-1).phones.every((p) => p.opacity === 1 && p.loaded),
      "all real images visibly settle",
    );
    const hero = page.locator(".cinematic-hero");
    await hero.screenshot({ path: `${output}/${viewport.width}-homepage.png` });
    const sources = await page
      .locator(".hero-showcase img")
      .evaluateAll((imgs) =>
        imgs.map((img) => ({
          src: img.getAttribute("src"),
          selected: img.currentSrc,
          loaded: img.complete,
          naturalWidth: img.naturalWidth,
          clientWidth: img.clientWidth,
          clientHeight: img.clientHeight,
          fit: getComputedStyle(img).objectFit,
          filter: getComputedStyle(img).filter,
          blend: getComputedStyle(img).mixBlendMode,
        })),
      );
    for (const img of sources) {
      assert(img.loaded && img.naturalWidth > 0);
      assert(
        Math.abs(img.clientWidth / img.clientHeight - 739 / 1600) < 0.004,
        "proportional full screenshot",
      );
      assert.equal(img.fit, "contain");
      assert.equal(img.filter, "none");
      assert.equal(img.blend, "normal");
      assert.equal((await page.request.get(img.selected)).status(), 200);
    }
    const before = await page
      .locator(".showcase-phone--centre .showcase-phone-frame")
      .evaluate((el) => getComputedStyle(el).transform);
    await page.waitForTimeout(800);
    const later = await page
      .locator(".showcase-phone--centre .showcase-phone-frame")
      .evaluate((el) => getComputedStyle(el).transform);
    assert.notEqual(before, later, "gentle floating movement runs");
    // Verify originals over HTTP against their uploaded-byte hashes, plus all responsive assets.
    if (viewport.width === 1440) {
      for (const image of manifest.images) {
        const original = await page.request.get(
          origin + "/showcase/" + image.original,
        );
        assert.equal(original.status(), 200);
        assert.equal(
          createHash("sha256")
            .update(await original.body())
            .digest("hex"),
          image.sha256,
        );
        for (const variant of image.variants)
          assert.equal(
            (
              await page.request.get(origin + "/showcase/" + variant.file)
            ).status(),
            200,
          );
      }
    }
    results.push({
      viewport,
      frames,
      sources,
      fullHeroScreenshot: `${viewport.width}-homepage.png`,
      floatRuns: true,
    });
    await context.close();
  }
  // Delay cold image responses: the entrance must wait without disabling text or navigation.
  const cold = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await cold.route("https://fonts.**", (r) => r.abort());
  await cold.route("**/showcase/*.webp", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 650));
    await r.continue();
  });
  const p = await cold.newPage();
  await p.goto(origin, { waitUntil: "domcontentloaded" });
  await p.locator(".hero-showcase").waitFor();
  assert.equal(
    await p.locator(".hero-showcase").getAttribute("data-ready"),
    "false",
  );
  assert.equal(
    await p
      .locator(".showcase-entrance")
      .first()
      .evaluate((el) => getComputedStyle(el).animationPlayState),
    "paused",
  );
  assert(await p.getByRole("button", { name: "Account menu" }).isEnabled());
  await p.waitForFunction(
    () => document.querySelector(".hero-showcase")?.dataset.ready === "true",
  );
  await p.waitForTimeout(1800);
  assert.equal(
    await p
      .locator(".showcase-phone--centre .showcase-entrance")
      .evaluate((el) => getComputedStyle(el).opacity),
    "1",
  );
  await cold.close();
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        assetManifest: manifest,
        viewports: results,
        coldImageGate: true,
        physicalDevices: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: exact original bytes, responsive assets, visible staggered entrance, gentle float, cold-cache gate and full desktop/mobile homepage captures.",
  );
} finally {
  await browser.close();
}
