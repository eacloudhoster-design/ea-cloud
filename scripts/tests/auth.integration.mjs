// Run only against the disposable/local development database and API.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

let databaseUrl = process.env.DATABASE_URL;
let origin = process.env.API_TEST_ORIGIN;
let pool, fixture, server;
if (process.env.PGLITE_MODULE) {
  const { sessionFixture } =
    await import("./helpers/browser-session-fixture.mjs");
  fixture = await sessionFixture();
  server = fixture.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  origin = `http://127.0.0.1:${server.address().port}`;
  pool = {
    query: (...args) => fixture.engine.query(...args),
    end: async () => {
      await new Promise((r) => server.close(r));
      await fixture.engine.close();
    },
  };
} else {
  for (const address of [databaseUrl, origin])
    assert.ok(
      address && ["127.0.0.1", "localhost"].includes(new URL(address).hostname),
      "Tests require explicit loopback database and API URLs",
    );
  const require = createRequire(
    new URL("../../lib/db/package.json", import.meta.url),
  );
  const { Pool } = require("pg");
  pool = new Pool({ connectionString: databaseUrl });
}
const prefix = `test-${randomBytes(8).toString("hex")}`;
const password = randomBytes(24).toString("base64url");
const hash = createHash("sha256")
  .update(password + "ea_cloud_salt_2024")
  .digest("hex");
const email = (kind) => `${prefix}-${kind}@example.invalid`;

before(async () => {
  for (const [kind, role, status] of [
    ["mentor", "mentor", "approved"],
    ["owner", "superadmin", "approved"],
    ["pending", "mentor", "pending"],
  ]) {
    await pool.query(
      "INSERT INTO users (email, password, role, status) VALUES ($1, $2, $3, $4)",
      [email(kind), hash, role, status],
    );
  }
  await pool.query(
    "INSERT INTO app_access (email, password, first_name, last_name, status, plan) VALUES ($1, $2, 'Test', 'Fixture', 'pending', 'monthly')",
    [email("client"), hash],
  );
});
after(async () => {
  await pool.query("DELETE FROM app_access WHERE email LIKE $1", [
    `${prefix}-%@example.invalid`,
  ]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [
    `${prefix}-%@example.invalid`,
  ]);
  await pool.end();
});
const post = (path, body) =>
  fetch(origin + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("mentor and superadmin credentials authenticate and read their identity", async () => {
  for (const [kind, role] of [
    ["mentor", "mentor"],
    ["owner", "superadmin"],
  ]) {
    const result = await post("/api/auth/login", {
      email: email(kind),
      password,
    });
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.user.role, role);
    const me = await fetch(origin + "/api/auth/me", {
      headers: { cookie: result.headers.get("set-cookie").split(";")[0] },
    });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).email, email(kind));
  }
});
test("incorrect passwords and pending accounts stay denied", async () => {
  assert.equal(
    (
      await post("/api/auth/login", {
        email: email("mentor"),
        password: randomBytes(24).toString("hex"),
      })
    ).status,
    401,
  );
  const pending = await post("/api/auth/login", {
    email: email("pending"),
    password,
  });
  assert.equal(pending.status, 403);
  assert.equal((await pending.json()).error, "pending_approval");
});
test("session storage failure returns a server error without issuing a cookie", {
  skip: !fixture && "Fault injection runs only against the isolated in-memory database",
}, async () => {
  await pool.query("ALTER TABLE browser_sessions RENAME TO unavailable_test_sessions");
  try {
    const result = await post("/api/auth/login", { email: email("mentor"), password });
    assert.equal(result.status, 500);
    assert.deepEqual(await result.json(), { error: "Internal server error" });
    assert.equal(result.headers.get("set-cookie"), null);
  } finally {
    await pool.query("ALTER TABLE unavailable_test_sessions RENAME TO browser_sessions");
  }
});
test("both client login URLs require the correct password", async () => {
  for (const path of ["/api/app/login", "/api/app/login-by-email"]) {
    assert.equal((await post(path, { email: email("client") })).status, 400);
    assert.equal(
      (
        await post(path, {
          email: email("client"),
          password: randomBytes(24).toString("hex"),
        })
      ).status,
      401,
    );
    const result = await post(path, { email: email("client"), password });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).client.status, "pending");
  }
});
test(
  "admin bootstrap creates once and never replaces an existing password or role",
  {
    skip:
      !!process.env.PGLITE_MODULE &&
      "CLI bootstrap requires a disposable PostgreSQL TCP endpoint; unit coverage runs separately",
  },
  async () => {
    const run = (kind) =>
      spawnSync("pnpm", ["--filter", "@workspace/scripts", "bootstrap-admin"], {
        cwd: new URL("../../", import.meta.url),
        env: {
          ...process.env,
          BOOTSTRAP_ADMIN_EMAIL: email(kind),
          BOOTSTRAP_ADMIN_PASSWORD: password,
        },
        encoding: "utf8",
      });
    assert.equal(run("bootstrap").status, 0);
    const created = await pool.query(
      "SELECT role, password FROM users WHERE email=$1",
      [email("bootstrap")],
    );
    assert.equal(created.rows[0].role, "superadmin");
    assert.equal(created.rows[0].password, hash);
    await pool.query("UPDATE users SET password=$1 WHERE email=$2", [
      "test-preserved-hash",
      email("bootstrap"),
    ]);
    assert.equal(run("bootstrap").status, 0);
    assert.equal(
      (
        await pool.query("SELECT password FROM users WHERE email=$1", [
          email("bootstrap"),
        ])
      ).rows[0].password,
      "test-preserved-hash",
    );
    assert.equal(run("mentor").status, 0);
    assert.equal(
      (
        await pool.query("SELECT role FROM users WHERE email=$1", [
          email("mentor"),
        ])
      ).rows[0].role,
      "mentor",
    );
  },
);
