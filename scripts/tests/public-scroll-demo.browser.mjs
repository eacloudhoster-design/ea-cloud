// Real browser recordings; uses an installed ffmpeg (no application dependency added).
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5220";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
await mkdir("work/public-scroll/video", { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  for (const mobile of [false, true]) {
    const viewport = mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 };
    const context = await browser.newContext({
      viewport,
      isMobile: mobile,
      hasTouch: mobile,
      recordVideo: {
        dir: "work/public-scroll/video",
        size: mobile ? viewport : { width: 960, height: 666 },
      },
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
    await page.waitForTimeout(1800);
    for (const top of [420, 900, 1450, 1950, 1500, 800, 0]) {
      await page.evaluate((top) => scrollTo({ top, behavior: "smooth" }), top);
      await page.waitForTimeout(1150);
    }
    const video = page.video();
    await context.close();
    await video.saveAs(
      `work/public-scroll/${mobile ? "mobile" : "desktop"}-demo.webm`,
    );
    console.log(
      `Recorded ${mobile ? "mobile" : "desktop"} browser scroll demonstration.`,
    );
  }
} finally {
  await browser.close();
}
