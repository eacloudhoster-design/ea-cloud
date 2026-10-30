import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5221";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = "work/password-controls/browser";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const device of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844, touch: true },
    { width: 360, height: 800, touch: true },
    { width: 768, height: 1024, touch: true },
  ]) {
    const c = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      hasTouch: !!device.touch,
      isMobile: !!device.touch,
      reducedMotion: "reduce",
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
    const calls = [];
    let registerResult = "error";
    await c.route("**/api/**", (r) => {
      const url = new URL(r.request().url());
      if (r.request().method() === "POST") {
        const body = r.request().postDataJSON();
        calls.push({ path: url.pathname, body });
        assert(
          !Object.keys(body).some((k) => /confirm/i.test(k)),
          "Confirmation must never be transmitted",
        );
        if (
          url.pathname === "/api/auth/register" &&
          registerResult === "success"
        )
          return r.fulfill({ json: { id: 7, status: "pending" } });
        return r.fulfill({ status: 401, json: { error: "Fixture response" } });
      }
      return r.fulfill(
        /\/api\/(auth|app)\/me$/.test(url.pathname)
          ? { status: 401, json: { error: "Unauthorized" } }
          : { json: [] },
      );
    });
    const p = await c.newPage();
    p.setDefaultTimeout(15000);
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const activate = async (locator) => {
      await locator.scrollIntoViewIfNeeded();
      if (device.touch) await locator.tap();
      else await locator.click();
    };
    const toggle = async (field, confirmation = false) => {
      await field.fill("Synthetic-Test-Password-42!");
      const value = await field.inputValue();
      const name = confirmation ? "confirm password" : "password";
      await activate(
        p.getByRole("button", { name: `Show ${name}`, exact: true }),
      );
      assert.equal(await field.getAttribute("type"), "text");
      assert.equal(await field.inputValue(), value);
      await activate(
        p.getByRole("button", { name: `Hide ${name}`, exact: true }),
      );
      assert.equal(await field.getAttribute("type"), "password");
      assert.equal(await field.inputValue(), value);
    };
    await p.goto(origin + "/register");
    const password = p.getByLabel("Password", { exact: true }),
      confirm = p.getByLabel("Confirm Password", { exact: true });
    await password.waitFor();
    assert.equal(await password.getAttribute("type"), "password");
    assert.equal(await confirm.getAttribute("type"), "password");
    const a = await password.boundingBox(),
      b = await confirm.boundingBox();
    assert.equal(a.width, b.width);
    assert.equal(a.height, b.height);
    await toggle(password);
    await toggle(confirm, true);
    assert.equal(calls.length, 0);
    await activate(
      p.getByRole("button", { name: "Show password", exact: true }),
    );
    assert.equal(await confirm.getAttribute("type"), "password");
    await activate(
      p.getByRole("button", { name: "Hide password", exact: true }),
    );
    for (const [id, value] of Object.entries({
      firstName: "Test",
      lastName: "Mentor",
      mentorName: "Test Mentor",
      email: "test@example.invalid",
    }))
      await p.locator("#register-" + id).fill(value);
    await confirm.fill("Different-Test-Value");
    await activate(
      p.getByRole("button", { name: "Create Account", exact: true }),
    );
    await p.getByText("Passwords do not match.", { exact: true }).waitFor();
    assert.equal(calls.length, 0);
    await confirm.fill("");
    await activate(
      p.getByRole("button", { name: "Create Account", exact: true }),
    );
    assert.equal(calls.length, 0);
    await confirm.fill(await password.inputValue());
    registerResult = "success";
    await activate(
      p.getByRole("button", { name: "Create Account", exact: true }),
    );
    await p
      .getByText("Account Created Successfully", { exact: true })
      .waitFor();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/api/auth/register");
    assert.deepEqual(
      Object.keys(calls[0].body).sort(),
      [
        "firstName",
        "lastName",
        "email",
        "password",
        "mentorName",
        "phone",
      ].sort(),
    );
    await p.goto(origin + "/register");
    assert.equal(await password.getAttribute("type"), "password");
    assert.equal(await confirm.getAttribute("type"), "password");
    await p.screenshot({
      path: `${out}/${device.width}-signup.png`,
      fullPage: true,
    });
    for (const route of ["/get-app", "/ea-app/"]) {
      await p.goto(origin + route);
      await p.locator(".ea-startup").waitFor({ state: "detached" });
      const pw = p.getByLabel("PASSWORD", { exact: true }),
        cp = p.getByLabel("Confirm Password", { exact: true });
      await pw.waitFor();
      await toggle(pw);
      await toggle(cp, true);
      await p.getByLabel("EMAIL", { exact: true }).fill("test@example.invalid");
      await p.getByLabel("FIRST NAME", { exact: true }).fill("Test");
      await p.getByLabel("LAST NAME", { exact: true }).fill("Client");
      const count = calls.length;
      await cp.fill("different");
      await activate(
        p.getByRole("button", { name: "Access EA Cloud", exact: true }),
      );
      await p.getByText("Passwords do not match.", { exact: true }).waitFor();
      assert.equal(calls.length, count);
      await cp.fill("");
      await activate(
        p.getByRole("button", { name: "Access EA Cloud", exact: true }),
      );
      await p
        .getByText("Please confirm your password.", { exact: true })
        .waitFor();
      assert.equal(calls.length, count);
      await cp.fill(await pw.inputValue());
      await activate(
        p.getByRole("button", { name: "Access EA Cloud", exact: true }),
      );
      await p.getByText("Fixture response", { exact: true }).waitFor();
      assert.equal(calls.length, count + 1);
      assert.equal(calls.at(-1).path, "/api/app/register");
      assert.deepEqual(
        Object.keys(calls.at(-1).body).sort(),
        ["firstName", "lastName", "email", "password", "plan"].sort(),
      );
      assert.equal(calls.at(-1).body.plan, "monthly");

      await activate(
        p.getByRole("button", { name: "Show password", exact: true }),
      );
      await activate(
        p.getByRole("button", {
          name: "Already have an account? Sign in",
          exact: true,
        }),
      );
      assert.equal(await cp.count(), 0);
      assert.equal(await pw.getAttribute("type"), "password");
      assert.equal(await pw.getAttribute("autocomplete"), "current-password");
      await toggle(pw);
      await p.getByLabel("EMAIL", { exact: true }).fill("test@example.invalid");
      await activate(
        p.getByRole("button", { name: "Access EA Cloud", exact: true }),
      );
      await p.getByText("Fixture response", { exact: true }).waitFor();
      assert.equal(calls.at(-1).path, "/api/app/login");
      assert.deepEqual(Object.keys(calls.at(-1).body).sort(), [
        "email",
        "password",
      ]);
      await activate(
        p.getByRole("button", {
          name: "New to EA Cloud? Create an account",
          exact: true,
        }),
      );
      assert.equal(await pw.getAttribute("type"), "password");
      assert.equal(await cp.getAttribute("type"), "password");
      assert.equal(await cp.inputValue(), "");
    }
    for (const route of ["/admin/login", "/app", "/superadmin/login"]) {
      await p.goto(origin + route);
      const field = p.locator('input[autocomplete="current-password"]');
      await field.waitFor();
      assert.equal(await field.getAttribute("type"), "password");
      const before = calls.length;
      await toggle(field);
      assert.equal(calls.length, before);
      assert.equal(
        await p.locator('input[autocomplete="new-password"]').count(),
        0,
      );
      await p.reload();
      assert.equal(
        await p
          .locator('input[autocomplete="current-password"]')
          .getAttribute("type"),
        "password",
      );
    }
    await p.goto(origin + "/get-app");
    await p.getByLabel("PASSWORD", { exact: true }).waitFor();
    for (const control of await p.locator(".ea-password-field").all()) {
      const input = await control.locator("input").boundingBox(),
        button = await control.getByRole("button").boundingBox();
      assert(
        button.x >= input.x && button.x + button.width <= input.x + input.width,
      );
      assert(
        button.y >= input.y &&
          button.y + button.height <= input.y + input.height,
      );
      assert(button.width >= 44);
      if (device.touch) assert(button.height >= 44);
    }
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    results.push({
      viewport: device,
      registrationConfirmation: true,
      independentVisibility: true,
      missingAndMismatchBlocked: true,
      unchangedPayloads: true,
      signIns: true,
      visibilityReset: true,
      noHorizontalOverflow: true,
    });
    await c.close();
    console.log(`PASS ${device.width}px password controls and confirmation`);
  }
  await writeFile(
    out + "/results.json",
    JSON.stringify(results, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
