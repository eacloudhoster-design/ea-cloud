import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5220";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/public-scroll";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
const consent = {
  version: 1,
  functional: false,
  analytics: false,
  marketing: false,
  expiresAt: Date.now() + 86400000,
};
const settle = async (p) => {
  await p.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await p.waitForTimeout(40);
};
const scroll = async (p, y) => {
  await p.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
  await settle(p);
};
const opacity = async (el) =>
  el.evaluate((el) => {
    const filter = getComputedStyle(el).filter;
    return {
      filter,
      opacity:
        filter === "none" ? 1 : Number(/opacity\(([\d.]+)\)/.exec(filter)?.[1]),
      translate: getComputedStyle(el).translate,
    };
  });
try {
  for (const width of [1440, 390, 320]) {
    const mobile = width < 500;
    const c = await browser.newContext({
      viewport: { width, height: mobile ? 844 : 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await c.addInitScript(
      (v) =>
        localStorage.setItem("ea-cloud:privacy-consent:v1", JSON.stringify(v)),
      consent,
    );
    const p = await c.newPage();
    p.setDefaultTimeout(12000);
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin);
    await p.locator(".hero-showcase[data-ready=true]").waitFor();
    await p.waitForTimeout(1800);
    const header = p.locator(".public-header");
    assert.equal(await header.getAttribute("data-scroll-hidden"), "false");
    assert.equal(
      await header.evaluate((el) => getComputedStyle(el).transitionDuration),
      "0.3s",
    );
    assert.equal((await opacity(p.locator(".hero-copy"))).filter, "none");
    await scroll(p, 180);
    await p.waitForTimeout(340);
    assert.equal(await header.getAttribute("data-scroll-hidden"), "true");
    assert.ok(
      (await header.boundingBox()).y + (await header.boundingBox()).height < 1,
    );
    assert.equal(
      await header.evaluate((el) => getComputedStyle(el).pointerEvents),
      "none",
    );
    await p.screenshot({ path: `${out}/${width}-navigation-hidden.png` });
    for (const delta of [-3, 2, -4]) {
      await p.evaluate((delta) => window.scrollBy(0, delta), delta);
      await settle(p);
    }
    assert.equal(
      await header.getAttribute("data-scroll-hidden"),
      "true",
      "small jitter does not reveal header",
    );
    await p.evaluate(() => window.dispatchEvent(new Event("resize")));
    await settle(p);
    assert.equal(
      await header.getAttribute("data-scroll-hidden"),
      "true",
      "height-only resize does not reveal header",
    );
    await p.evaluate(() => window.scrollBy(0, -60));
    await settle(p);
    await p.waitForTimeout(340);
    assert.equal(await header.getAttribute("data-scroll-hidden"), "false");
    assert.ok(Math.abs((await header.boundingBox()).y) < 1);
    await p.screenshot({ path: `${out}/${width}-navigation-returned.png` });
    await scroll(p, 0);
    const hero = p.locator(".hero-copy");
    const heroBottom = await hero.evaluate(
      (el) => el.getBoundingClientRect().bottom + scrollY,
    );
    const height = mobile ? 844 : 1000;
    const samples = [];
    for (const t of [1, 0.7, 0.3]) {
      await scroll(p, heroBottom - height * 0.18 * t);
      samples.push((await opacity(hero)).opacity);
    }
    assert.ok(samples[0] > 0.99);
    assert.ok(samples[1] > 0.2 && samples[1] < 0.95);
    assert.ok(samples[2] < samples[1]);
    await scroll(p, heroBottom - height * 0.18 * 0.7);
    assert.ok(
      Math.abs((await opacity(hero)).opacity - samples[1]) < 0.015,
      "reverse scroll restores same progress",
    );
    // Get App's incoming group fades at the lower edge, stays clear in the reading band.
    const group = p.locator("#download > [data-reveal]").first();
    await group.scrollIntoViewIfNeeded();
    await p.waitForTimeout(850);
    const docTop = await group.evaluate(
      (el) => el.getBoundingClientRect().top + scrollY,
    );
    await scroll(p, docTop - height + height * 0.16 * 0.55);
    const entering = await opacity(group);
    assert.ok(entering.opacity > 0 && entering.opacity < 1);
    await p.screenshot({ path: `${out}/${width}-section-entering.png` });
    await scroll(p, docTop - height * 0.38);
    assert.equal((await opacity(group)).filter, "none");
    // Opening an installation modal pins the header, despite subsequent scroll events.
    await p
      .getByRole("button", { name: "Get iOS Version", exact: true })
      .click();
    await p.getByRole("dialog").waitFor();
    await settle(p);
    assert.equal(await header.getAttribute("data-scroll-hidden"), "false");
    await p.evaluate(() => window.scrollBy(0, 90));
    await settle(p);
    assert.equal(await header.getAttribute("data-scroll-hidden"), "false");
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    // Menu interactions stay pinned; real mobile history-based navigation still works.
    await p.evaluate(() => window.scrollBy(0, -80));
    await settle(p);
    await p.waitForTimeout(340);
    await p.getByRole("button", { name: "Account menu", exact: true }).click();
    const account = p.getByRole(mobile ? "dialog" : "menu");
    await account.waitFor();
    await p.evaluate(() => window.scrollBy(0, 100));
    await settle(p);
    assert.equal(await header.getAttribute("data-scroll-hidden"), "false");
    await p
      .getByRole(mobile ? "button" : "menuitem", { name: "Help", exact: true })
      .click();
    assert.equal(
      await p
        .locator(mobile ? "#mobile-public-help a" : "#public-help-menu a")
        .count(),
      6,
    );
    if (mobile)
      await account
        .getByRole("button", { name: "Close account panel", exact: true })
        .click();
    else await p.keyboard.press("Escape");
    await account.waitFor({ state: "hidden" });
    if (mobile) {
      await p
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await p
        .getByRole("dialog", { name: "Explore EA Cloud", exact: true })
        .waitFor();
      await p.evaluate(() => window.scrollBy(0, 70));
      await settle(p);
      assert.equal(await header.getAttribute("data-scroll-hidden"), "false");
      await p
        .getByRole("dialog")
        .getByRole("link", { name: "App", exact: true })
        .click();
      await p.waitForFunction(() => location.hash === "#download");
      await p.waitForTimeout(1000);
      assert.equal(await p.locator(".public-mobile-backdrop").count(), 0);
      assert.ok((await p.locator("#download").boundingBox()).y < 150);
      // Actual touch swipe still switches the original carousel image.
      await p.locator(".hero-showcase").scrollIntoViewIfNeeded();
      await p.waitForTimeout(800);
      await p
        .getByRole("button", { name: "Select Matrix interface", exact: true })
        .click();
      await p.waitForTimeout(800);
      const box = await p
        .getByRole("button", { name: "Show Matrix interface", exact: true })
        .boundingBox();
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      const session = await c.newCDPSession(p);
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let i = 1; i <= 7; i++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x - i * 12, y }],
        });
        await p.waitForTimeout(16);
      }
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      assert.equal(
        await p.locator(".hero-showcase").getAttribute("data-centred"),
        "regular",
      );
      await scroll(p, 0);
      const fingerScroll = async (start, distance) => {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: 12, y: start }],
        });
        for (let i = 1; i <= 10; i++) {
          await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: 12, y: start + (distance * i) / 10 }],
          });
          await p.waitForTimeout(35);
        }
        await session.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await p.waitForTimeout(450);
      };
      await fingerScroll(680, -260);
      assert.ok((await p.evaluate(() => scrollY)) > 100);
      assert.equal(await header.getAttribute("data-scroll-hidden"), "true");
      await fingerScroll(250, 160);
      assert.equal(await header.getAttribute("data-scroll-hidden"), "false");
    } else {
      await p.getByRole("link", { name: "Features", exact: true }).click();
      await p.waitForTimeout(1100);
      assert.ok((await p.locator("#features").boundingBox()).y < 150);
      await p.evaluate(() => window.scrollBy(0, -80));
      await settle(p);
      await p.waitForTimeout(340);
      await p.getByRole("link", { name: "Home", exact: true }).click();
      await p.waitForTimeout(1100);
      assert.equal(await p.evaluate(() => scrollY), 0);
    }
    // Tall sections animate independent content groups, not their entire container.
    const card = p.locator(".public-feature-card").nth(2);
    await card.scrollIntoViewIfNeeded();
    await p.waitForTimeout(800);
    assert.equal((await opacity(card)).filter, "none");
    assert.equal(
      await p
        .locator("#features")
        .evaluate((el) => getComputedStyle(el).filter),
      "none",
    );
    const question = p.getByRole("button", {
      name: "Is EA Cloud a trading robot?",
      exact: true,
    });
    await question.click();
    await p
      .getByText("No, EA Cloud is not a trading robot.", { exact: false })
      .waitFor();
    const closing = p.locator(".public-closing");
    await closing.scrollIntoViewIfNeeded();
    await p.waitForTimeout(800);
    assert.equal((await opacity(closing)).filter, "none");
    assert.equal(
      await closing
        .getByRole("link", { name: "Get App", exact: true })
        .getAttribute("href"),
      "/ea-app/",
    );
    await p.goto(`${origin}/register`);
    await p.locator("form").waitFor();
    assert.equal(await p.locator(".public-header").count(), 0);
    await p.goto(`${origin}/admin/login`);
    await p.locator("form").waitFor();
    assert.equal(await p.locator(".public-header").count(), 0);
    assert.deepEqual(errors, []);
    results.push({
      width,
      headerDirectionAndJitter: true,
      headerDurationMs: 300,
      fadeSamples: samples,
      reverseProgress: true,
      readingBandClear: true,
      installationAndMenuPin: true,
      mobileAuthHeaderless: true,
      touchSwipe: mobile,
      nativeTouchScroll: mobile,
      featureReadabilityAndFaq: true,
    });
    await c.close();
  }
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await c.addInitScript(
    (v) =>
      localStorage.setItem("ea-cloud:privacy-consent:v1", JSON.stringify(v)),
    consent,
  );
  const p = await c.newPage();
  await p.goto(origin);
  await p.locator("[data-scroll-motion]").first().waitFor();
  await scroll(p, 400);
  assert.equal(
    await p
      .locator(".public-header")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );
  assert.ok(
    (
      await p.locator("[data-scroll-motion]").evaluateAll((els) =>
        els.map((el) => ({
          filter: getComputedStyle(el).filter,
          translate: getComputedStyle(el).translate,
        })),
      )
    ).every((v) => v.filter === "none" && v.translate === "none"),
  );
  await p.emulateMedia({ reducedMotion: "no-preference" });
  await settle(p);
  await p.emulateMedia({ reducedMotion: "reduce" });
  await settle(p);
  assert.equal(
    await p.locator(".hero-copy").evaluate((el) => getComputedStyle(el).filter),
    "none",
  );
  await c.close();
  // Simulated capability fallback is not a Safari engine/device test.
  const legacy = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await legacy.addInitScript((v) => {
    localStorage.setItem("ea-cloud:privacy-consent:v1", JSON.stringify(v));
    const original = CSS.supports.bind(CSS);
    CSS.supports = (...args) =>
      ["translate", "selector(:focus-visible)"].includes(args[0])
        ? false
        : original(...args);
  }, consent);
  const fallback = await legacy.newPage();
  const fallbackErrors = [];
  fallback.on("pageerror", (error) => fallbackErrors.push(error.message));
  await fallback.goto(origin);
  await fallback.locator(".hero-showcase[data-ready=true]").waitFor();
  const copy = fallback.locator(".hero-copy");
  const bottom = await copy.evaluate(
    (el) => el.getBoundingClientRect().bottom + scrollY,
  );
  await copy.locator("a").first().focus();
  await scroll(fallback, bottom - 90);
  assert.equal((await opacity(copy)).filter, "none");
  await copy
    .locator("a")
    .first()
    .evaluate((el) => el.blur());
  await settle(fallback);
  assert.ok((await opacity(copy)).filter.includes("opacity"));
  assert.ok(
    Math.abs(
      (await copy.evaluate(
        (el) => el.getBoundingClientRect().bottom + scrollY,
      )) - bottom,
    ) < 0.5,
  );
  assert.deepEqual(fallbackErrors, []);
  await legacy.close();
  await writeFile(
    `${out}/results.json`,
    JSON.stringify(
      {
        results,
        reducedMotion: true,
        simulatedCapabilityFallback: true,
        limitations: [
          "Chromium desktop/touch emulation; physical Android Chrome and iPhone Safari unavailable.",
        ],
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
