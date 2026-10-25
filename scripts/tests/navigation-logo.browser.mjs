import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5220";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const mode = process.env.LOGO_TEST_MODE || "after";
assert(["before", "after"].includes(mode));
const output = "work/navigation-logo";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const width of [1440, 820, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      isMobile: width < 500,
      hasTouch: width < 500,
      reducedMotion: "reduce",
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
    const page = await context.newPage();
    await page.goto(origin);
    await page.locator(".hero-showcase[data-ready=true]").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const image = page.locator(".public-brand img");
    assert.ok(await image.evaluate((el) => el.complete && el.naturalWidth > 0));
    const geometry = await page
      .locator(
        ".public-header,.public-nav-shell,.public-brand,.public-brand img,.public-nav-actions,.public-nav-links,.hero-copy,.hero-showcase",
      )
      .evaluateAll((els) =>
        els.map((el) => ({
          selector: el.className,
          rect: el.getBoundingClientRect().toJSON(),
        })),
      );
    if (width === 390) {
      const box = await image.boundingBox();
      assert.ok(Math.abs(box.x + box.width / 2 - width / 2) < 0.5);
    }
    await page.screenshot({ path: `${output}/${width}-${mode}.png` });
    await page.screenshot({
      path: `${output}/${width}-${mode}-masked.png`,
      mask: [image],
      maskColor: "#ff00ff",
    });
    if (mode === "after") {
      const baseline = JSON.parse(
        await readFile(`${output}/${width}-before.json`, "utf8"),
      );
      assert.deepEqual(
        geometry,
        baseline,
        "all measured header and hero geometry preserved",
      );
      assert.equal(await image.getAttribute("src"), "/ea-cloud-nav-logo.png");
      assert.equal(
        await page.locator("footer img").getAttribute("src"),
        "/ea-cloud-logo.jpeg",
      );
      await page.goto(`${origin}/legal`);
      await page.locator(".public-brand").click();
      await page.waitForURL(origin + "/");
      await page.locator("#hero-title").waitFor();
    }
    await writeFile(
      `${output}/${width}-${mode}.json`,
      JSON.stringify(geometry, null, 2),
    );
    results.push({
      width,
      mode,
      logoLoaded: true,
      geometryUnchanged: mode === "after",
      homepageLinkWorks: mode === "after",
    });
    await context.close();
  }
  await writeFile(
    `${output}/${mode}-results.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
