// Explicit loopback database only; never run these fixtures against Neon/production.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const url = new URL(process.env.DATABASE_URL ?? "invalid:");
assert.ok(
  ["127.0.0.1", "localhost"].includes(url.hostname),
  "An explicit loopback DATABASE_URL is required",
);
const require = createRequire(
  new URL("../../lib/db/package.json", import.meta.url),
);
const { Pool } = require("pg");
const pool = new Pool({ connectionString: url.href });
const prefix = `bootstrap-${randomBytes(12).toString("hex")}`;
const password = randomBytes(32).toString("base64url");
const email = `${prefix}@example.invalid`;
const existingEmail = `${prefix}-existing@example.invalid`;
const hash = createHash("sha256")
  .update(password + "ea_cloud_salt_2024")
  .digest("hex");
const run = (overrides = {}) =>
  spawnSync("pnpm", ["--filter", "@workspace/scripts", "bootstrap-admin"], {
    cwd: new URL("../../", import.meta.url),
    encoding: "utf8",
    timeout: 15000,
    env: {
      ...process.env,
      DATABASE_URL: url.href,
      BOOTSTRAP_ADMIN_EMAIL: email,
      BOOTSTRAP_ADMIN_PASSWORD: password,
      ...overrides,
    },
  });
const output = (result) => `${result.stdout ?? ""}${result.stderr ?? ""}`;
function privateOutput(result) {
  const text = output(result);
  assert.ok(!text.includes(password), "Bootstrap must not log passwords");
  assert.ok(!text.includes(hash), "Bootstrap must not log password hashes");
  assert.ok(
    !text.includes(url.href),
    "Bootstrap must not log connection strings",
  );
  assert.ok(
    !text.includes(email),
    "Bootstrap must not log the supplied account email",
  );
}
after(async () => {
  // Remove only this run's uniquely named disposable account fixtures; no DDL.
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [
    [email, existingEmail],
  ]);
  await pool.end();
});

test("real bootstrap creates once and preserves every existing field on rerun", async () => {
  const first = run();
  privateOutput(first);
  assert.equal(first.status, 0);
  const before = (
    await pool.query("SELECT * FROM users WHERE email=$1", [email])
  ).rows[0];
  assert.equal(before.role, "superadmin");
  assert.equal(before.status, "approved");
  assert.equal(before.password, hash);
  const again = run({
    BOOTSTRAP_ADMIN_PASSWORD: randomBytes(32).toString("hex"),
  });
  privateOutput(again);
  assert.equal(again.status, 0);
  assert.deepEqual(
    (await pool.query("SELECT * FROM users WHERE email=$1", [email])).rows[0],
    before,
  );
});
test("an existing pending mentor is neither elevated nor reset", async () => {
  await pool.query(
    "INSERT INTO users(email,password,role,status) VALUES($1,$2,'mentor','pending')",
    [existingEmail, hash],
  );
  const before = (
    await pool.query("SELECT * FROM users WHERE email=$1", [existingEmail])
  ).rows[0];
  const result = run({ BOOTSTRAP_ADMIN_EMAIL: existingEmail });
  privateOutput(result);
  assert.equal(result.status, 0);
  assert.deepEqual(
    (await pool.query("SELECT * FROM users WHERE email=$1", [existingEmail]))
      .rows[0],
    before,
  );
});
test("CLI configuration errors are specific even before the database module loads", () => {
  for (const [overrides, code] of [
    [{ BOOTSTRAP_ADMIN_PASSWORD: "" }, "BOOTSTRAP_ADMIN_PASSWORD_MISSING"],
    [
      { BOOTSTRAP_ADMIN_PASSWORD: password.slice(0, 8) },
      "BOOTSTRAP_ADMIN_PASSWORD_SHORT",
    ],
    [{ DATABASE_URL: "" }, "DATABASE_URL_MISSING"],
  ]) {
    const result = run(overrides);
    privateOutput(result);
    assert.equal(result.status, 1);
    assert.ok(output(result).includes(`[${code}]`));
  }
});
test("real missing-schema and read-only errors surface their wrapped SQLSTATE safely", () => {
  for (const [options, code] of [
    ["-c search_path=bootstrap_nonexistent_schema", "42P01"],
    ["-c default_transaction_read_only=on", "25006"],
  ]) {
    const target = new URL(url);
    target.searchParams.set("options", options);
    const result = run({ DATABASE_URL: target.href });
    privateOutput(result);
    assert.equal(result.status, 1);
    assert.ok(output(result).includes(`[${code}]`));
    assert.ok(!output(result).includes(target.href));
  }
});
test("a refused local endpoint surfaces a safe connection diagnosis", () => {
  const target = new URL(url);
  target.port = "1";
  const result = run({ DATABASE_URL: target.href });
  privateOutput(result);
  assert.equal(result.status, 1);
  assert.ok(output(result).includes("[ECONNREFUSED]"));
});
