import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5220";
const database = process.env.DATABASE_URL;
for (const address of [origin, database])
  assert(
    address && ["localhost", "127.0.0.1"].includes(new URL(address).hostname),
  );
const require = createRequire(
  new URL("../../lib/db/package.json", import.meta.url),
);
const { Pool } = require("pg");
const pool = new Pool({ connectionString: database });
const prefix = "browser-" + randomBytes(8).toString("hex"),
  email = (kind) => `${prefix}-${kind}@example.invalid`;
const password = randomBytes(20).toString("hex"),
  hash = createHash("sha256")
    .update(password + "ea_cloud_salt_2024")
    .digest("hex");
const out = process.env.SCREENSHOT_DIR || "work/signup-session";
await mkdir(out, { recursive: true });
const options = {
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
  reducedMotion: "reduce",
};
const browser = await chromium.launch(options);
const results = [];
let context;
async function fillRegistration(page, mail) {
  for (const [name, value] of Object.entries({
    firstName: "Ava",
    lastName: "Morgan",
    mentorName: "Ava Trades",
    email: mail,
    phone: "+264 81 123 4567",
    password,
  }))
    await page.locator("#register-" + name).fill(value);
}
try {
  for (const [kind, role] of [
    ["mentor", "mentor"],
    ["owner", "superadmin"],
  ])
    await pool.query(
      "INSERT INTO users(email,password,first_name,last_name,role,status) VALUES($1,$2,'Ava','Morgan',$3,'approved')",
      [email(kind), hash, role],
    );
  await pool.query(
    "INSERT INTO app_access(email,password,first_name,last_name,status) VALUES($1,$2,'Ava','Morgan','pending')",
    [email("client"), hash],
  );
  context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
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
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const viewport of [
    { width: 1440, height: 1080 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(origin + "/register");
    await page.locator("#register-firstName").waitFor();
    await page
      .locator(".mentor-register-logo")
      .evaluate((image) => image.decode());
    assert.equal(await page.locator("form input").count(), 6);
    assert.equal(await page.locator(".public-header, nav").count(), 0);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (viewport.width === 1440 || viewport.width === 390)
      await page.screenshot({
        path: `${out}/${viewport.width === 1440 ? "desktop" : "mobile"}.png`,
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "Create Account", exact: true })
      .click();
    assert.equal(await page.locator("input:invalid").count(), 5);
    results.push(
      `Registration layout and required-field validation: ${viewport.width}×${viewport.height}`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  await fillRegistration(page, email("mentor"));
  await page
    .getByRole("button", { name: "Create Account", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Email already registered" })
    .waitFor();
  results.push("Existing duplicate-email API error displayed");
  await fillRegistration(page, email("registered"));
  await page
    .getByRole("button", { name: "Create Account", exact: true })
    .click();
  await page.getByText("Account Created Successfully").waitFor();
  const {
    rows: [registered],
  } = await pool.query(
    "SELECT role,status,mentor_name,phone FROM users WHERE email=$1",
    [email("registered")],
  );
  assert.equal(registered.status, "pending");
  assert.equal(registered.role, "mentor");
  assert.equal(registered.mentor_name, "Ava Trades");
  assert.equal(registered.phone, "+264 81 123 4567");
  results.push(
    "Real Create Account submission preserves mentor role, fields and pending approval",
  );
  await page.goto(origin + "/register");
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/admin/login");
  await page.locator("input[type=email]").fill(email("mentor"));
  await page.locator("input[type=password]").fill(password);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL("**/admin/dashboard");
  await page.reload();
  await page.getByText(email("mentor"), { exact: true }).first().waitFor();
  await page.goto(origin + "/register");
  await page.getByRole("button", { name: "Close registration" }).click();
  const protectedMe = await context.request.get(origin + "/api/auth/me");
  assert.equal(protectedMe.status(), 200);
  results.push(
    "Sign in link, portal login, refresh and close button preserve authenticated session",
  );
  const appLogin = await context.request.post(origin + "/api/app/login", {
    data: { email: email("client"), password },
    headers: { origin },
  });
  assert.equal(appLogin.status(), 200);
  await page.goto(origin + "/admin/dashboard");
  await page
    .getByRole("link", { name: "Back to App", exact: true })
    .first()
    .click();
  await page.waitForURL("**/ea-app/");
  await page.getByRole("button", { name: "Sign Out", exact: true }).waitFor();
  await page.goBack();
  await page.waitForURL("**/admin/dashboard");
  await page.getByText(email("mentor"), { exact: true }).first().waitFor();
  results.push(
    "Admin Portal → Back to App → browser Back restores both authorized sessions",
  );
  const storage = await context.storageState();
  assert(
    storage.cookies
      .filter((x) => /^ea_(client|portal)_session$/.test(x.name))
      .every((x) => x.httpOnly && x.expires > Date.now() / 1000),
  );
  assert.equal(
    await page.evaluate(() =>
      ["token", "app_token", "appClientToken"].some((k) =>
        localStorage.getItem(k),
      ),
    ),
    false,
  );
  // Restart Chromium with a disk profile to verify browser-close persistence.
  const profile = `${out}/profile`;
  const persistent = await chromium.launchPersistentContext(profile, options);
  await persistent.addCookies(storage.cookies);
  await persistent.close();
  const reopened = await chromium.launchPersistentContext(profile, options);
  const restored = await reopened.newPage();
  await restored.goto(origin + "/admin/login");
  await restored.waitForURL("**/admin/dashboard");
  await restored.goto(origin + "/ea-app/");
  await restored
    .getByRole("button", { name: "Sign Out", exact: true })
    .waitFor();
  results.push(
    "Full Chromium close/reopen restores portal and trading-app cookies without credentials",
  );
  await reopened.close();
  await page
    .getByRole("button", { name: "Sign Out", exact: true })
    .first()
    .click();
  await page.waitForURL("**/admin/login");
  await page.goBack();
  if (new URL(page.url()).pathname.startsWith("/ea-app")) await page.locator("input[type=password]").waitFor();
  else if (/^\/(admin|superadmin)\//.test(new URL(page.url()).pathname)) await page.waitForURL("**/admin/login");
  else assert.equal(await page.getByText(email("mentor"), { exact: true }).count(), 0);
  await page.goto(origin + "/admin/dashboard");
  await page.waitForURL("**/admin/login");
  assert.equal(
    (await context.request.get(origin + "/api/auth/me")).status(),
    401,
  );
  assert.equal(
    (await context.request.get(origin + "/api/app/me")).status(),
    401,
  );
  results.push(
    "Sign Out invalidates app and portal; browser Back cannot reopen protected portal",
  );
  assert.deepEqual(errors, []);
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(results.join("\n"));
} finally {
  await context?.close();
  await browser.close();
  await pool.query(
    "DELETE FROM auth_sessions WHERE (kind='portal' AND account_id IN (SELECT id FROM users WHERE email LIKE $1)) OR (kind='client' AND account_id IN (SELECT id FROM app_access WHERE email LIKE $1))",
    [`${prefix}%`],
  );
  await pool.query("DELETE FROM app_access WHERE email LIKE $1", [
    `${prefix}%`,
  ]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`${prefix}%`]);
  await pool.end();
}
