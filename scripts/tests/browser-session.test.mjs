import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionFixture } from "./helpers/browser-session-fixture.mjs";

test(
  "persistent cookie sessions, revocation, expiry, renewal and role isolation",
  {
    skip:
      !process.env.PGLITE_MODULE &&
      "Set PGLITE_MODULE for disposable PostgreSQL tests",
  },
  async () => {
    const { app, engine, api } = await sessionFixture();
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const wss = api.createWsServer(server);
    const { default: WebSocket } =
      await import("../../artifacts/api-server/node_modules/ws/wrapper.mjs");
    const call = (path, options = {}) =>
      fetch(`http://127.0.0.1:${server.address().port}` + path, options);
    const login = async (email, client = false) => {
      const response = await call(
        client ? "/api/app/login" : "/api/auth/login",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password: "Test-only-pass-123!" }),
        },
      );
      assert.equal(response.status, 200, await response.text());
      const setCookie = response.headers.get("set-cookie");
      assert.match(setCookie, /HttpOnly/);
      assert.match(setCookie, /Secure/);
      assert.match(setCookie, /SameSite=Lax/);
      assert.match(setCookie, /Max-Age=2592000/);
      return setCookie.split(";")[0];
    };
    try {
      const forged = Buffer.from("2:superadmin:123").toString("base64");
      assert.equal(
        (
          await call("/api/auth/me", {
            headers: { authorization: `Bearer ${forged}` },
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await call("/api/app/me", {
            headers: {
              authorization: `Bearer ${Buffer.from("10:client:123").toString("base64")}`,
            },
          })
        ).status,
        401,
      );
      let cookie = await login("mentor1@example.invalid");
      assert.equal(
        (await call("/api/auth/me", { headers: { cookie } })).status,
        200,
      );
      assert.equal(
        (
          await call("/api/test/superadmin", {
            headers: { cookie, authorization: `Bearer ${forged}` },
          })
        ).status,
        403,
      );
      assert.equal(
        (await call("/api/app/me", { headers: { cookie } })).status,
        401,
      );
      const query = globalThis.__sessionPool.query;
      globalThis.__sessionPool.query = async () => {
        throw Error("simulated database outage");
      };
      const outage = await call("/api/auth/me", { headers: { cookie } });
      assert.equal(outage.status, 503);
      assert.equal(outage.headers.get("set-cookie"), null);
      globalThis.__sessionPool.query = query;
      assert.equal(
        (await call("/api/auth/me", { headers: { cookie } })).status,
        200,
      );
      const sessionRows = (await engine.query("SELECT * FROM browser_sessions"))
        .rows;
      assert.equal(sessionRows.length, 1);
      assert.notEqual(sessionRows[0].token_hash, cookie.split("=")[1]);
      await engine.exec(
        "UPDATE browser_sessions SET last_seen_at=now()-interval '2 days'",
      );
      assert.match(
        (await call("/api/auth/me", { headers: { cookie } })).headers.get(
          "set-cookie",
        ),
        /Max-Age=/,
      );
      assert.equal(
        (
          await call("/api/auth/logout", {
            method: "POST",
            headers: { cookie, origin: "https://attacker.invalid" },
          })
        ).status,
        403,
      );
      assert.equal(
        (await call("/api/auth/me", { headers: { cookie } })).status,
        200,
      );
      await engine.exec("UPDATE users SET password='changed' WHERE id=1");
      assert.equal(
        (await call("/api/auth/me", { headers: { cookie } })).status,
        401,
      );
      cookie = await login("superadmin2@example.invalid");
      assert.equal(
        (await call("/api/test/superadmin", { headers: { cookie } })).status,
        200,
      );
      const clientCookie = await login("client@example.invalid", true);
      assert.equal((await call("/api/client/session-test", { headers: { cookie: clientCookie } })).status, 200);
      assert.equal((await call("/api/client/session-test", { headers: { cookie } })).status, 401);

      assert.equal(
        (await call("/api/app/me", { headers: { cookie: clientCookie } }))
          .status,
        200,
      );
      assert.equal(
        (
          await call("/api/app/session-test", {
            headers: { cookie: clientCookie },
          })
        ).status,
        200,
      );
      assert.equal(
        (await call("/api/auth/me", { headers: { cookie: clientCookie } }))
          .status,
        401,
      );
      const socket = new WebSocket(
        `ws://127.0.0.1:${server.address().port}/api/ws`,
        { headers: { cookie: clientCookie } },
      );
      const message = await new Promise((resolve, reject) => {
        socket.once("message", (data) => resolve(JSON.parse(data.toString())));
        socket.once("error", reject);
      });
      assert.equal(message.clientId, 10);
      const closed = new Promise((resolve) =>
        socket.once("close", (code) => resolve(code)),
      );
      const forgedSocket = new WebSocket(
        `ws://127.0.0.1:${server.address().port}/api/ws?token=${forged}`,
      );
      assert.equal(
        await new Promise((resolve) =>
          forgedSocket.once("close", (code) => resolve(code)),
        ),
        1008,
      );
      const both = cookie + "; " + clientCookie;
      assert.equal(
        (await call("/api/auth/me", { headers: { cookie: both } })).status,
        200,
      );
      assert.equal(
        (await call("/api/app/me", { headers: { cookie: both } })).status,
        200,
      );
      const logout = await call("/api/auth/logout", {
        method: "POST",
        headers: { cookie: both },
      });
      assert.equal(logout.status, 200);
      assert.equal(await closed, 1008);
      assert.equal(
        (await call("/api/auth/me", { headers: { cookie: both } })).status,
        401,
      );
      assert.equal(
        (await call("/api/app/me", { headers: { cookie: both } })).status,
        401,
      );
      cookie = await login("superadmin2@example.invalid");
      await engine.exec(
        "UPDATE browser_sessions SET expires_at=now()-interval '1 second'",
      );
      assert.equal(
        (await call("/api/auth/me", { headers: { cookie } })).status,
        401,
      );
      cookie = await login("superadmin2@example.invalid");
      await engine.exec(
        "UPDATE browser_sessions SET absolute_expires_at=now()-interval '1 second'",
      );
      assert.equal(
        (await call("/api/auth/me", { headers: { cookie } })).status,
        401,
      );
      cookie = await login("superadmin2@example.invalid");
      await engine.exec(
        "DELETE FROM browser_sessions WHERE kind='portal' AND account_id=2",
      );
      assert.equal(
        (await call("/api/auth/me", { headers: { cookie } })).status,
        401,
      );
      cookie = await login("superadmin2@example.invalid");
      await engine.exec("UPDATE users SET status='suspended' WHERE id=2");
      assert.equal(
        (await call("/api/auth/me", { headers: { cookie } })).status,
        401,
      );
      const pending = await login("pending@example.invalid", true);
      assert.equal(
        (await call("/api/app/me", { headers: { cookie: pending } })).status,
        200,
      );
      assert.equal(
        (await call("/api/app/session-test", { headers: { cookie: pending } }))
          .status,
        401,
      );
    } finally {
      await new Promise((r) => wss.close(r));
      await new Promise((r) => server.close(r));
      await engine.close();
    }
  },
);
