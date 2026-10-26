const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
for (const width of [1440, 820, 390, 320]) {
  const page = await browser.newPage({
    viewport: { width, height: 1000 },
    isMobile: width < 500,
    hasTouch: width < 500,
  });
  await page.addInitScript(() =>
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
  await page.goto("http://127.0.0.1:5220/#support");
  await page.waitForTimeout(1600);
  const section = page.locator("#support");
  const result = await section.evaluate((el) => {
    const r = el.getBoundingClientRect(),
      content = el.querySelector(".support-content").getBoundingClientRect(),
      button = el.querySelector(".support-button");
    return {
      width: r.width,
      viewport: innerWidth,
      contentCenter: content.x + content.width / 2,
      buttonColor: getComputedStyle(button).backgroundColor,
      href: button.getAttribute("href"),
      last: el === el.parentElement.lastElementChild,
      bg: getComputedStyle(el.querySelector(".support-backdrop"))
        .backgroundImage,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert.equal(result.width, width);
  assert(Math.abs(result.contentCenter - width / 2) < 1);
  assert.equal(result.buttonColor, "rgb(255, 255, 255)");
  assert(result.last);
  assert(!result.overflow);
  assert.equal(result.href, "mailto:eacloudhoster@gmail.com");
  assert(result.bg.includes("default-robot.jpg"));
  assert.equal(await page.locator("#support .public-eyebrow").count(), 0);
  assert.equal(
    (
      await page.request.get("http://127.0.0.1:5220/default-robot.jpg")
    ).status(),
    200,
  );
  await section.screenshot({
    path: `docs/support-redesign/support-${width}.png`,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await section
      .locator(".support-button")
      .evaluate((e) => getComputedStyle(e).transitionDuration),
    "0s",
  );
  console.log("PASS", width, result);
  await page.close();
}
await browser.close();
