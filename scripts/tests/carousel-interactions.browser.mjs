import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5220";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const consent = {
  version: 1,
  functional: false,
  analytics: false,
  marketing: false,
  expiresAt: Date.now() + 86400000,
};
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(
    (c) =>
      localStorage.setItem("ea-cloud:privacy-consent:v1", JSON.stringify(c)),
    consent,
  );
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  await page.goto(origin);
  const root = page.locator(".hero-showcase");
  await root.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => document.querySelector(".hero-showcase")?.dataset.running === "true",
  );
  await page.waitForTimeout(1500);
  const cdp = await context.newCDPSession(page);
  const swipe = async (dx, dy) => {
    const b = await page
      .getByRole("button", { name: "Show Matrix interface", exact: true })
      .boundingBox();
    const x = b.x + b.width / 2,
      y = b.y + b.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8 }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };
  await swipe(-90, 0);
  assert.equal(await root.getAttribute("data-centred"), "regular");
  await page.waitForTimeout(800);
  // Reset centre, then test the opposite physical swipe.
  await page
    .getByRole("button", { name: "Select Matrix interface", exact: true })
    .click();
  await page.waitForTimeout(800);
  await swipe(90, 0);
  assert.equal(await root.getAttribute("data-centred"), "s2tone");
  await page
    .getByRole("button", { name: "Select Matrix interface", exact: true })
    .click();
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => scrollY);
  await swipe(0, -110);
  await page.waitForTimeout(400);
  assert.ok(
    (await page.evaluate(() => scrollY)) > before + 20,
    "native vertical scrolling works",
  );
  assert.equal(await root.getAttribute("data-centred"), "matrix");
  await page.locator("#features").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  assert.equal(await root.getAttribute("data-running"), "false");
  const parked = await root.getAttribute("data-centred");
  await page.waitForTimeout(5200);
  assert.equal(await root.getAttribute("data-centred"), parked);
  await root.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => document.querySelector(".hero-showcase")?.dataset.running === "true",
  );
  // Visibility event is explicitly emulated, not presented as a physical OS/tab test.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(100);
  assert.equal(await root.getAttribute("data-running"), "false");
  await page.waitForTimeout(5200);
  assert.equal(await root.getAttribute("data-centred"), parked);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(
    () => document.querySelector(".hero-showcase")?.dataset.running === "true",
  );
  await context.close();
  console.log(
    "PASS: left/right real CDP touch swipes, native vertical scroll, offscreen pause, emulated hidden-tab pause/resume.",
  );
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await desktop.addInitScript(
    (c) =>
      localStorage.setItem("ea-cloud:privacy-consent:v1", JSON.stringify(c)),
    consent,
  );
  const p = await desktop.newPage();
  await p.goto(origin);
  await p.locator(".hero-showcase[data-ready=true]").waitFor();
  const left = await p.locator(".showcase-phone--left").boundingBox();
  await p.mouse.click(left.x + left.width * 0.2, left.y + left.height * 0.5);
  assert.equal(
    await p.locator(".hero-showcase").getAttribute("data-centred"),
    "s2tone",
  );
  await p
    .getByRole("button", { name: "Select Matrix interface", exact: true })
    .focus();
  await p.keyboard.press("ArrowRight");
  assert.equal(
    await p.locator(".hero-showcase").getAttribute("data-centred"),
    "matrix",
  );
  console.log(
    "PASS: visible side-card pointer click and keyboard arrow controls.",
  );
  // Existing sign-in and registration handlers, with fixtures only (no real accounts).
  await p.goto(`${origin}/admin/login`);
  await p.getByPlaceholder("admin@eacloud.com").fill("test@example.invalid");
  await p.locator("input[type=password]").fill("not-a-real-password");
  let login;
  await p.route("**/api/auth/login", async (r) => {
    login = r.request().postDataJSON();
    await r.fulfill({ status: 401, json: { error: "Invalid credentials" } });
  });
  await p.locator("form button[type=submit]").click();
  await p.getByText("Invalid credentials", { exact: true }).waitFor();
  assert.equal(login.role, "mentor");
  await p.goto(`${origin}/register`);
  await p.getByPlaceholder("John", { exact: true }).fill("Test");
  await p.getByPlaceholder("Doe", { exact: true }).fill("Mentor");
  await p.getByPlaceholder("Your trading handle").fill("Test Mentor");
  await p.getByPlaceholder("you@example.com").fill("test@example.invalid");
  await p.locator("input[type=password]").fill("not-a-real-password");
  let registration;
  await p.route("**/api/auth/register", async (r) => {
    registration = r.request().postDataJSON();
    await r.fulfill({ json: { id: 1, status: "pending" } });
  });
  await p.locator("form button[type=submit]").click();
  await p.getByText("Account Created Successfully", { exact: true }).waitFor();
  assert.equal(registration.mentorName, "Test Mentor");
  await desktop.close();
  console.log(
    "PASS: unchanged mentor sign-in and registration form handlers using isolated API fixtures.",
  );
} finally {
  await browser.close();
}
