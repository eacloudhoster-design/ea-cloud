import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5221";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/mobile-signup";
await mkdir(out, { recursive: true });
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 430, height: 932 },
    { width: 412, height: 915 },
    { width: 760, height: 1024 },
    { width: 844, height: 390 },
    { width: 960, height: 440 },
  ]) {
    const recording = viewport.width === 390;
    const c = await b.newContext({
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
    let verifyRequests = 0,
      requests = 0,
      payload,
      release,
      response = "duplicate";
    let gate = new Promise((r) => (release = r));
    await c.route("**/api/auth/me", (r) => {
      verifyRequests++;
      return r.fulfill({ status: 401, json: { error: "Unauthorized" } });
    });
    await c.route("**/api/app/me", (r) =>
      r.fulfill({ status: 401, json: { error: "Unauthorized" } }),
    );
    await c.route("**/api/auth/register", async (r) => {
      requests++;
      payload = r.request().postDataJSON();
      await gate;
      await r.fulfill(
        response === "duplicate"
          ? { status: 409, json: { error: "Email already registered" } }
          : {
              status: 201,
              json: { message: "Account created, pending approval" },
            },
      );
    });
    await c.route("**/api/auth/status?*", (r) =>
      r.fulfill({ status: 200, json: { status: "pending" } }),
    );
    const p = await c.newPage();
    p.setDefaultTimeout(15000);
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin + "/admin/login");
    await p.getByRole("button", { name: "LOGIN", exact: true }).waitFor();
    const signIn = await p.locator(".mentor-login-main").evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        width: el.getBoundingClientRect().width,
        border: s.border,
        color: s.backgroundColor,
        radius: s.borderRadius,
      };
    });
    const logoSize = await p.locator(".mentor-mobile-cloud").boundingBox();
    const logoSource = await p
      .locator(".mentor-login-mobile-logo")
      .getAttribute("src");
    await p.evaluate(() => {
      window.__publicNavigationMarker = "same-document";
      window.__verificationFlashes = [];
      new MutationObserver(() => {
        if (document.body.innerText.includes("Verifying session"))
          window.__verificationFlashes.push(true);
      }).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
    const count = verifyRequests;
    await p.getByRole("link", { name: "Create one", exact: true }).click();
    await p.waitForURL("**/register");
    await p
      .getByRole("heading", { name: "Create Mentor Account", exact: true })
      .waitFor();
    const cloud = p.locator(
      ".mentor-register-mobile-brand .mentor-mobile-cloud",
    );
    await cloud.locator("img").evaluate((el) => el.decode());
    assert.equal(await cloud.locator("img").getAttribute("src"), logoSource);
    assert.equal(await p.locator(".mentor-register-logo").isVisible(), false);
    assert.equal(await p.locator("form input").count(), 6);
    const cb = await cloud.boundingBox(),
      panel = await p.locator(".mentor-register-panel").boundingBox(),
      heading = await p.locator("h1").boundingBox();
    assert.equal(cb.width, logoSize.width);
    assert(Math.abs(cb.x + cb.width / 2 - viewport.width / 2) < 1);
    assert(Math.abs(cb.y + cb.height - panel.y - 30) < 1);
    assert(heading.y > cb.y + cb.height + 20);
    const signup = await p.locator(".mentor-register-panel").evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        width: el.getBoundingClientRect().width,
        border: s.border,
        color: s.backgroundColor,
        radius: s.borderRadius,
        overflow: s.overflowY,
        maxHeight: s.maxHeight,
      };
    });
    assert.equal(signup.width, signIn.width);
    assert.equal(signup.border, signIn.border);
    assert.equal(signup.color, signIn.color);
    assert.equal(signup.radius, signIn.radius);
    assert.equal(signup.overflow, "visible");
    assert.equal(signup.maxHeight, "none");
    assert.equal(
      await cloud.locator("svg").getAttribute("viewBox"),
      "0 0 1688 932",
    );
    assert.deepEqual(
      await cloud.locator("svg").boundingBox(),
      await cloud.locator("img").boundingBox(),
    );
    const alpha = await cloud.locator("img").evaluate((el) => {
      const c = document.createElement("canvas");
      c.width = el.naturalWidth;
      c.height = el.naturalHeight;
      const x = c.getContext("2d");
      x.drawImage(el, 0, 0);
      return x.getImageData(0, 0, 1, 1).data[3];
    });
    assert.equal(alpha, 0);
    const eyes = cloud.locator(".mentor-mobile-eye");
    assert.equal(await eyes.count(), 2);
    const circuits = cloud.locator(
      ".mentor-mobile-circuit:not(.mentor-mobile-circuit-halo)",
    );
    assert.equal(await circuits.count(), 6);
    const neon = p.locator(".mentor-mobile-neon .mentor-login-trace");
    assert.equal(await neon.count(), 8);
    const offsets = async (l) =>
      l.evaluateAll((nodes) =>
        nodes.map((n) => getComputedStyle(n).strokeDashoffset),
      );
    const beforeC = await offsets(circuits),
      beforeN = await offsets(neon);
    await p.waitForTimeout(recording ? 7800 : 1800);
    assert.notDeepEqual(await offsets(circuits), beforeC);
    assert.notDeepEqual(await offsets(neon), beforeN);
    const eyeFrame = async (t) =>
      eyes.evaluateAll((nodes, t) => {
        nodes.forEach((n) =>
          n.getAnimations().forEach((a) => {
            a.pause();
            a.currentTime = t;
          }),
        );
        return nodes.map((n) => ({
          opacity: getComputedStyle(n).opacity,
          duration: getComputedStyle(n).animationDuration,
        }));
      }, t);
    assert(
      (await eyeFrame(1600)).every(
        (x) => +x.opacity === 1 && x.duration === "3.6s",
      ),
    );
    await p.evaluate(() => scrollTo(0, 0));
    await p.screenshot({ path: `${out}/${viewport.width}-top.png` });
    assert((await eyeFrame(3300)).every((x) => +x.opacity === 0));
    if (recording) await p.screenshot({ path: `${out}/eyes-off.png` });
    await eyes.evaluateAll((nodes) =>
      nodes.forEach((n) => n.getAnimations().forEach((a) => a.play())),
    );
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const submit = p.getByRole("button", {
      name: "Create Account",
      exact: true,
    });
    await submit.scrollIntoViewIfNeeded();
    await submit.click();
    assert.equal(requests, 0);
    assert.equal(await p.locator("input:invalid").count(), 5);
    for (const name of [
      "firstName",
      "lastName",
      "mentorName",
      "email",
      "phone",
      "password",
    ]) {
      await p
        .locator("#register-" + name)
        .evaluate((el) =>
          el.scrollIntoView({ block: "center", behavior: "instant" }),
        );
      const box = await p.locator("#register-" + name).boundingBox();
      assert(
        box.y >= -1 && box.y + box.height <= viewport.height + 1,
        JSON.stringify({ name, box, viewport }),
      );
    }
    await p
      .getByRole("link", { name: "Sign in", exact: true })
      .scrollIntoViewIfNeeded();
    if (recording) await p.screenshot({ path: `${out}/bottom.png` });
    assert((await p.evaluate(() => scrollY)) > 0);
    await p.evaluate(() => scrollTo(0, 0));
    assert.equal(await p.evaluate(() => scrollY), 0);
    // Repeated navigation preserves the document and does not restart verification.
    for (let i = 0; i < 2; i++) {
      await p.getByRole("link", { name: "Sign in", exact: true }).click();
      await p.waitForURL("**/admin/login");
      await p.getByRole("button", { name: "LOGIN", exact: true }).waitFor();
      await p.getByRole("link", { name: "Create one", exact: true }).click();
      await p.waitForURL("**/register");
    }
    assert.equal(verifyRequests, count);
    assert.equal(
      await p.evaluate(() => window.__publicNavigationMarker),
      "same-document",
    );
    assert.deepEqual(await p.evaluate(() => window.__verificationFlashes), []);
    await p.emulateMedia({ reducedMotion: "reduce" });
    assert(
      await p
        .locator(
          ".mentor-mobile-eye,.mentor-mobile-circuit,.mentor-login-trace",
        )
        .evaluateAll((nodes) =>
          nodes.every((n) => getComputedStyle(n).animationName === "none"),
        ),
    );
    if (recording) {
      await p.setViewportSize({ width: 390, height: 420 });
      await p.locator("#register-password").focus();
      await p.locator("#register-password").scrollIntoViewIfNeeded();
      const box = await p.locator("#register-password").boundingBox();
      assert(box.y >= 0 && box.y + box.height <= 420);
      await submit.scrollIntoViewIfNeeded();
      await p.setViewportSize(viewport);
    }
    const data = {
      firstName: "Ava",
      lastName: "Morgan",
      mentorName: "Ava Trades",
      email: "signup@example.invalid",
      phone: "+264 81 123 4567",
      password: "Test-only-password",
    };
    for (const [key, value] of Object.entries(data))
      await p.locator("#register-" + key).fill(value);
    await submit.click();
    await p.waitForFunction(
      () => document.querySelector('button[type="submit"]')?.disabled,
    );
    release();
    await p
      .getByRole("alert")
      .filter({ hasText: "Email already registered" })
      .waitFor();
    assert.deepEqual(payload, data);
    response = "success";
    await submit.click();
    await p
      .getByText("Account Created Successfully", { exact: true })
      .waitFor();
    await p
      .getByText("Pending Super Admin Approval", { exact: true })
      .waitFor();
    await p.getByRole("button", { name: "Check Status", exact: true }).click();
    await p.getByRole("link", { name: "Back to Login", exact: true }).click();
    await p.waitForURL("**/admin/login");
    assert.deepEqual(errors, []);
    const video = p.video();
    await c.close();
    if (video) await video.saveAs(out + "/animation-and-scroll.webm");
    results.push({
      viewport,
      sameLogoAndSize: true,
      transparent: true,
      panelMatches: true,
      overlap: 30,
      eyesOnOffSeconds: 3.6,
      circuitMotion: true,
      backgroundMotion: true,
      allFieldsAccessible: true,
      documentScroll: true,
      publicNavigationWithoutReloadOrVerificationFlash: true,
      registrationPayload: true,
      errorLoadingPendingApproval: true,
      reducedMotion: true,
    });
  }
  await writeFile(
    out + "/results.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    "PASS: seven mobile viewports, animations, scrolling, navigation, six fields and registration states",
  );
} finally {
  await b.close();
}
