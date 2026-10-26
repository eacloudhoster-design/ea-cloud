// Run against an explicitly configured disposable loopback database and API only.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
const origin = process.env.API_TEST_ORIGIN,
  database = process.env.DATABASE_URL;
for (const address of [origin, database])
  assert.ok(
    address && ["localhost", "127.0.0.1"].includes(new URL(address).hostname),
  );
const require = createRequire(
  new URL("../../lib/db/package.json", import.meta.url),
);
const { Pool } = require("pg");
const pool = new Pool({ connectionString: database });
const prefix = "session-" + randomBytes(8).toString("hex");
const password = randomBytes(20).toString("hex");
const hash = createHash("sha256")
  .update(password + "ea_cloud_salt_2024")
  .digest("hex");
const email = (kind) => `${prefix}-${kind}@example.invalid`;
let mentorId, clientId;
before(async () => {
  for (const [kind, role] of [
    ["mentor", "mentor"],
    ["owner", "superadmin"],
  ]) {
    const {
      rows: [row],
    } = await pool.query(
      "INSERT INTO users (email,password,first_name,role,status) VALUES ($1,$2,'Test',$3,'approved') RETURNING id",
      [email(kind), hash, role],
    );
    if (kind === "mentor") mentorId = row.id;
  }
  const key = prefix + "-license";
  await pool.query(
    "INSERT INTO licenses (key,mentor_id,client_name,client_email,duration,status) VALUES ($1,$2,'Test',$3,'1year','active')",
    [key, mentorId, email("client")],
  );
  const {
    rows: [row],
  } = await pool.query(
    "INSERT INTO app_access (email,password,first_name,last_name,status,mentor_id,license_key) VALUES ($1,$2,'Test','Fixture','approved',$3,$4) RETURNING id",
    [email("client"), hash, mentorId, key],
  );
  clientId = row.id;
});
after(async () => {
  await pool.query(
    "DELETE FROM auth_sessions WHERE (kind='client' AND account_id=$1) OR (kind='portal' AND account_id IN (SELECT id FROM users WHERE email LIKE $2))",
    [clientId, `${prefix}%`],
  );
  await pool.query("DELETE FROM app_access WHERE email LIKE $1", [
    `${prefix}%`,
  ]);
  await pool.query("DELETE FROM licenses WHERE key LIKE $1", [`${prefix}%`]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`${prefix}%`]);
  await pool.end();
});
const request = (path, init = {}) => fetch(origin + path, init);
async function login(kind = "mentor") {
  const response = await request(
    kind === "client" ? "/api/app/login" : "/api/auth/login",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "127.0.0.23",
      },
      body: JSON.stringify({ email: email(kind), password }),
    },
  );
  assert.equal(response.status, 200);
  const cookies = response.headers.getSetCookie();
  const cookie = cookies.find((x) =>
    x.startsWith(
      kind === "client" ? "ea_client_session=" : "ea_portal_session=",
    ),
  );
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Max-Age=2592000/);
  assert.match(cookie, /Path=\//);
  return { cookie: cookie.split(";")[0], token: (await response.json()).token };
}
const me = (cookie, client = false) =>
  request(client ? "/api/app/me" : "/api/auth/me", { headers: { cookie } });
test("persistent cookies restore both identities across independent requests without bearer storage", async () => {
  for (const kind of ["mentor", "client"]) {
    const session = await login(kind);
    if (kind === "mentor") assert.equal((await request("/api/admin/mt5/accounts", { headers: { cookie: session.cookie, authorization: "Bearer cookie-portal" } })).status, 200);
    assert.equal((await me(session.cookie, kind === "client")).status, 200);
    if (kind === "client") assert.equal((await request("/api/client/mt5/connections", { headers: { cookie: session.cookie } })).status, 200);
    assert.equal((await me(session.cookie, kind === "client")).status, 200);
    const {
      rows: [row],
    } = await pool.query(
      "SELECT token_hash FROM auth_sessions WHERE token_hash=$1",
      [createHash("sha256").update(session.token).digest("hex")],
    );
    assert.ok(row);
    assert.notEqual(row.token_hash, session.token);
  }
});
test("app and portal navigation preserves separate cookies and enforces backend roles", async () => {
  const portal = await login(),
    app = await login("client");
  const both = portal.cookie + "; " + app.cookie;
  assert.equal((await me(both)).status, 200);
  assert.equal((await me(both, true)).status, 200);
  assert.equal(
    (await request("/api/superadmin/mentors", { headers: { cookie: both } }))
      .status,
    403,
  );
  assert.equal((await me(app.cookie)).status, 401); // Client credentials cannot become a portal role.
  const forged = Buffer.from(`${mentorId}:superadmin:${Date.now()}`).toString(
    "base64",
  );
  assert.equal(
    (
      await request("/api/auth/me", {
        headers: { authorization: `Bearer ${forged}` },
      })
    ).status,
    401,
  );
});
test("logout revokes both sessions, clears cookies, and rejects replay", async () => {
  const portal = await login(),
    app = await login("client");
  const response = await request("/api/auth/logout", {
    method: "POST",
    headers: { cookie: portal.cookie + "; " + app.cookie, origin },
  });
  assert.equal(response.status, 200);
  assert.ok(
    response.headers
      .getSetCookie()
      .filter((x) => /ea_(client|portal)_session=;/.test(x)).length === 2,
  );
  assert.equal((await me(portal.cookie)).status, 401);
  assert.equal((await me(app.cookie, true)).status, 401);
  assert.equal(
    (
      await request("/api/auth/me", {
        headers: { authorization: `Bearer ${portal.token}` },
      })
    ).status,
    401,
  );
});
test("expired, administratively revoked, password-changed and suspended accounts are denied", async () => {
  for (const mode of ["expired", "revoked", "password", "suspended"]) {
    const session = await login();
    const fingerprint = createHash("sha256")
      .update(session.token)
      .digest("hex");
    if (mode === "expired")
      await pool.query(
        "UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
        [fingerprint],
      );
    if (mode === "revoked")
      await pool.query(
        "UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1",
        [fingerprint],
      );
    if (mode === "password")
      await pool.query("UPDATE users SET password='changed' WHERE id=$1", [
        mentorId,
      ]);
    if (mode === "suspended")
      await pool.query("UPDATE users SET status='suspended' WHERE id=$1", [
        mentorId,
      ]);
    assert.equal((await me(session.cookie)).status, 401, mode);
    await pool.query(
      "UPDATE users SET status='approved',password=$2 WHERE id=$1",
      [mentorId, hash],
    );
  }
});
test("unsafe cross-origin requests cannot mutate or terminate a cookie session", async () => {
  const session = await login();
  assert.equal(
    (
      await request("/api/auth/logout", {
        method: "POST",
        headers: { cookie: session.cookie, origin: "https://attacker.invalid" },
      })
    ).status,
    403,
  );
  assert.equal((await me(session.cookie)).status, 200);
});
test("a forged public identity marker never authenticates without the HttpOnly session", async () => {
  const marker = Buffer.from(`${clientId}:client:cookie`).toString("base64");
  assert.equal(
    (
      await request("/api/app/me", {
        headers: { authorization: `Bearer ${marker}` },
      })
    ).status,
    401,
  );
  const session = await login("client");
  assert.equal(
    (
      await request("/api/app/me", {
        headers: { cookie: session.cookie, authorization: `Bearer ${marker}` },
      })
    ).status,
    200,
  );
  await pool.query("UPDATE licenses SET status='revoked' WHERE key=$1", [
    prefix + "-license",
  ]);
  assert.equal((await me(session.cookie, true)).status, 401);
});
