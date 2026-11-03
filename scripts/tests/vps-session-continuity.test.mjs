import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionFixture } from "./helpers/browser-session-fixture.mjs";
import { checkDatabase } from "../check-api-host.mjs";

test(
  "same database and cookie survive API listener replacement; outages do not become invalid credentials",
  {
    skip:
      !process.env.PGLITE_MODULE &&
      "Requires disposable PGlite, never production",
  },
  async () => {
    const { app, engine } = await sessionFixture();
    let server;
    const listen = async () => {
      const s = app.listen(0, "127.0.0.1");
      await new Promise((r) => s.once("listening", r));
      return s;
    };
    const close = async () => {
      if (server) {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
        server = undefined;
      }
    };
    const call = (path, options = {}) =>
      fetch(`http://127.0.0.1:${server.address().port}` + path, options);
    const credentials = {
      email: "mentor1@example.invalid",
      password: "Test-only-pass-123!",
    };
    const post = (body) =>
      call("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const originalSelect = globalThis.__sessionDb.select,
      originalQuery = globalThis.__sessionPool.query;
    try {
      const preflight = await checkDatabase({connect:async()=>{},query:(q)=>engine.query(q),end:async()=>{}});
      assert.equal(preflight.minimumSchema, "ready");
      assert.equal(preflight.applicationRecordsRead, 0);
      const before = await engine.query(
        "SELECT id,password FROM users ORDER BY id",
      );
      server = await listen();
      const logged = await post(credentials);
      assert.equal(logged.status, 200);
      const cookie = logged.headers.get("set-cookie").split(";")[0];
      assert.match(cookie, /^ea_portal_session=/);
      globalThis.__sessionDb.select = () => {
        throw Object.assign(Error("PRIVATE database parameters"), {
          code: "ECONNRESET",
        });
      };
      const failed = await post(credentials);
      assert.equal(failed.status, 503);
      assert.equal(failed.headers.get("set-cookie"), null);
      const failure = await failed.json();
      assert.equal(failure.code, "SESSION_STORAGE_UNAVAILABLE");
      assert.ok(!JSON.stringify(failure).includes("PRIVATE"));
      globalThis.__sessionDb.select = originalSelect;
      globalThis.__sessionPool.query = async () => {
        throw Object.assign(Error("PRIVATE"), { code: "ETIMEDOUT" });
      };
      const outage = await call("/api/auth/me", { headers: { cookie } });
      assert.equal(outage.status, 503);
      assert.equal(outage.headers.get("set-cookie"), null);
      globalThis.__sessionPool.query = originalQuery;
      await close();
      server = await listen();
      const restored = await call("/api/auth/me", { headers: { cookie } });
      assert.equal(restored.status, 200);
      assert.equal((await restored.json()).id, 1);
      assert.equal(
        (await post({ ...credentials, password: "wrong-test-only" })).status,
        401,
      );
      assert.equal(
        (await post({ ...credentials, email: "mentor3@example.invalid" }))
          .status,
        403,
      );
      assert.deepEqual(
        (await engine.query("SELECT id,password FROM users ORDER BY id")).rows,
        before.rows,
      );
    } finally {
      globalThis.__sessionDb.select = originalSelect;
      globalThis.__sessionPool.query = originalQuery;
      await close();
      await engine.close();
    }
  },
);
