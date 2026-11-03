import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const compiled = await build({
  stdin: {
    contents:
      'export * from "./artifacts/ea-cloud/src/lib/portal-login";export * from "./artifacts/api-server/src/lib/portal-auth-diagnostics";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [
    {
      name: "isolated-login",
      setup(b) {
        b.onResolve({ filter: /^@workspace\/api-client-react$/ }, () => ({
          path: "login",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents:
            "export const login=(...args)=>globalThis.__portalLogin(...args);",
          loader: "js",
        }));
      },
    },
  ],
});
const { portalLogin, reportPortalAuthFailure } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
test("login is bounded to 30 seconds, aborts and never automatically replays credentials", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0,
    signal;
  globalThis.__portalLogin = (_data, options) => {
    calls++;
    signal = options.signal;
    return new Promise(() => {});
  };
  try {
    const pending = portalLogin({
      email: "test@example.invalid",
      password: "test-only",
    });
    t.mock.timers.tick(30000);
    await assert.rejects(pending, /timed out/);
    assert.equal(signal.aborted, true);
    t.mock.timers.tick(120000);
    assert.equal(calls, 1);
  } finally {
    delete globalThis.__portalLogin;
  }
});
test("successful login and genuine authentication rejection are unchanged", async () => {
  const value = {
    user: { id: 1, role: "mentor" },
    token: "non-secret-test-hint",
  };
  try {
    globalThis.__portalLogin = async () => value;
    assert.equal(
      await portalLogin({
        email: "test@example.invalid",
        password: "test-only",
      }),
      value,
    );
    const rejected = Object.assign(Error("Invalid credentials"), {
      status: 401,
    });
    globalThis.__portalLogin = async () => {
      throw rejected;
    };
    await assert.rejects(
      portalLogin({ email: "test@example.invalid", password: "test-only" }),
      (e) => e === rejected,
    );
  } finally {
    delete globalThis.__portalLogin;
  }
});
test("portal diagnostics distinguish database failure without exposing errors or changing passwords", () => {
  for (const [code, category] of [
    ["ECONNRESET", "database_connection"],
    ["42P01", "database_schema"],
    ["28P01", "database_credentials"],
  ]) {
    const records = [];
    let status, body;
    reportPortalAuthFailure(
      { log: { error: (r) => records.push(r) } },
      {
        setHeader() {},
        status: (n) => {
          status = n;
          return { json: (v) => (body = v) };
        },
      },
      { cause: { code, message: "PRIVATE password SQL", params: ["PRIVATE"] } },
      "login",
    );
    assert.equal(status, 503);
    assert.equal(records[0].category, category);
    assert.equal(records[0].phase, "login");
    assert.equal(records[0].event, "portal_auth_unavailable");
    assert.ok(!JSON.stringify({ records, body }).includes("PRIVATE"));
  }
});
