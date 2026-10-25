import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5220";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/hero-wordmark";
const baseline = process.env.WORDMARK_TEST_MODE === "before";
await mkdir(out, { recursive: true });
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const width of [1440, 820, 390, 320]) {
    const c = await b.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
      isMobile: width < 500,
      hasTouch: width < 500,
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
    const p = await c.newPage();
    await p.goto(origin);
    await p.locator(".hero-showcase[data-ready=true]").waitFor();
    if (baseline) {
      await p.evaluate(() => document.fonts.ready);
      await p.screenshot({ path: `${out}/${width}-before.png` });
      await p.screenshot({
        path: `${out}/${width}-before-masked.png`,
        mask: [p.locator("#hero-title")],
        maskColor: "#ff00ff",
      });
      const geometry = await p
        .locator(
          ".public-header,.public-brand,.hero-copy,#hero-title,.hero-copy h2,.hero-description,.public-cta-row,.hero-showcase",
        )
        .evaluateAll((els) =>
          els.map((el) => ({
            class: el.className,
            id: el.id,
            rect: el.getBoundingClientRect().toJSON(),
          })),
        );
      await writeFile(`${out}/${width}-before.json`, JSON.stringify(geometry));
      await c.close();
      continue;
    }
    const heading = p.getByRole("heading", { name: "EA CLOUD", exact: true });
    assert.equal(await heading.count(), 1);
    const artwork = heading.locator("img");
    await artwork.evaluate((el) => el.decode());
    assert.equal(await artwork.getAttribute("src"), "/ea-cloud-wordmark.png");
    assert.equal(await p.locator(".hero-title-period").count(), 0);
    assert.equal(
      await p.locator(".public-brand img").getAttribute("src"),
      "/ea-cloud-nav-logo.png",
    );
    assert.equal(
      await p.locator("footer img").getAttribute("src"),
      "/ea-cloud-logo.jpeg",
    );
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(100);
    const geometry = await p
      .locator(
        ".public-header,.public-brand,.hero-copy,#hero-title,.hero-copy h2,.hero-description,.public-cta-row,.hero-showcase",
      )
      .evaluateAll((els) =>
        els.map((el) => ({
          class: el.className,
          id: el.id,
          rect: el.getBoundingClientRect().toJSON(),
        })),
      );
    const before = JSON.parse(
      await readFile(`${out}/${width}-before.json`, "utf8"),
    );
    assert.deepEqual(
      geometry,
      before,
      "heading box and all surrounding geometry unchanged",
    );
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.equal(
      await artwork.evaluate((el) => getComputedStyle(el).objectFit),
      "contain",
    );
    await p.screenshot({ path: `${out}/${width}-after.png` });
    await p.screenshot({
      path: `${out}/${width}-after-masked.png`,
      mask: [p.locator("#hero-title")],
      maskColor: "#ff00ff",
    });
    results.push({
      width,
      originalArtworkLoaded: true,
      noPeriod: true,
      navigationCloudOnly: true,
      allGeometryUnchanged: true,
      noOverflow: true,
    });
    await c.close();
  }
  if (baseline) process.exitCode = 0;
  else {
    const c = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await c.newPage();
    await p.goto(origin);
    await p.locator(".hero-wordmark").evaluate((el) => el.decode());
    await p.waitForTimeout(200);
    const names = await p
      .locator("#hero-title")
      .evaluate((el) => el.getAnimations().map((a) => a.animationName));
    assert.ok(names.length > 0, "existing heading entrance animation remains");
    await c.close();
    await writeFile(
      `${out}/browser-results.json`,
      JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify(results));
  }
} finally {
  await b.close();
}
