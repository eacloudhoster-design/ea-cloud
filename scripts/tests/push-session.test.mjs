import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const b = await build({
  entryPoints: ["artifacts/api-server/src/lib/push-session.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { issuePushSession, requirePushSession } = await import(
  "data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64")
);
test("push proof is login-bound, HttpOnly/Secure and rejects cross-account, token alteration and expiry", () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET =
    "local-test-signing-secret-never-used-in-production";
  try {
    let cookie, options;
    const token = Buffer.from("7:client:fixture").toString("base64"),
      res = {
        cookie(name, value, opts) {
          cookie = name + "=" + value;
          options = opts;
        },
      };
    assert.equal(issuePushSession(res, 7, token), true);
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, "strict");
    assert.equal(options.path, "/api/app/push");
    const verify = (c, id = 7, t = token) => {
      let status = 200,
        ok = false;
      requirePushSession(
        { clientId: id, headers: { cookie: c, authorization: "Bearer " + t } },
        {
          status(n) {
            status = n;
            return this;
          },
          json() {
            return this;
          },
        },
        () => (ok = true),
      );
      return { status, ok };
    };
    assert.equal(verify(cookie).ok, true);
    assert.equal(verify("", 7).status, 401);
    assert.equal(
      verify(cookie, 9, Buffer.from("9:client:fixture").toString("base64"))
        .status,
      401,
    );
    assert.equal(
      verify(cookie, 7, Buffer.from("7:client:changed").toString("base64"))
        .status,
      401,
    );
    assert.equal(verify(cookie + "x").status, 401);
    issuePushSession(res, 7, token, Date.now() - 31 * 86400000);
    assert.equal(verify(cookie).status, 401);
    delete process.env.SESSION_SECRET;
    assert.equal(issuePushSession(res, 7, token), false);
    assert.equal(verify(cookie).status, 503);
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});
