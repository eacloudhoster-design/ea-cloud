import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const b = await build({
  stdin: {
    contents:
      'export * from "./artifacts/ea-app/src/lib/connection-recovery";export * from "./artifacts/ea-app/src/lib/request";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { connectionRecovery, recoveryDelay, ApiRequestError } = await import(
  "data:text/javascript;base64," +
    Buffer.from(b.outputFiles[0].text).toString("base64")
);
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
test("startup backoff is exponential, jittered, bounded and honors Retry-After", () => {
  assert.equal(recoveryDelay(1, 0, 0), 1000);
  assert.equal(recoveryDelay(2, 0, 0), 2000);
  assert.equal(recoveryDelay(4, 0, 0), 8000);
  assert.ok(recoveryDelay(30, 0, 1) <= 34500);
  assert.equal(recoveryDelay(1, 60000, 0), 60000);
});
test("temporary startup failures automatically recover, then stop polling", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const failed = [],
    saved = [];
  const task = connectionRecovery({
    phase: "session",
    load: async () => {
      if (++calls < 3)
        throw new ApiRequestError("private", "HTTP_503", "backend", true, 503);
      return "verified";
    },
    success: (v) => saved.push(v),
    failure: (e) => failed.push(e.code),
  });
  task.restart();
  await flush();
  assert.equal(calls, 1);
  t.mock.timers.tick(1200);
  await flush();
  assert.equal(calls, 2);
  t.mock.timers.tick(2400);
  await flush();
  assert.deepEqual(saved, ["verified"]);
  assert.equal(failed.length, 2);
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(calls, 3);
  task.dispose();
});
test("authentication rejection never retries automatically; explicit Retry remains usable", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0,
    accepted = 0;
  const task = connectionRecovery({
    phase: "session",
    load: async () => {
      calls++;
      throw new ApiRequestError(
        "private",
        "AUTH_REQUIRED",
        "authentication",
        false,
        401,
      );
    },
    success: () => accepted++,
    failure: () => {},
  });
  task.restart();
  await flush();
  t.mock.timers.tick(120000);
  await flush();
  assert.equal(calls, 1);
  assert.equal(accepted, 0);
  task.restart();
  await flush();
  assert.equal(calls, 2);
  task.dispose();
});
test("retry cancels stale initialization and lifecycle rechecks remain single-flight", async () => {
  const pending = [],
    accepted = [];
  const task = connectionRecovery({
    phase: "branding",
    load: (signal) =>
      new Promise((resolve) => pending.push({ signal, resolve })),
    success: (v) => accepted.push(v),
    failure: () => {},
  });
  task.restart();
  task.recheck();
  assert.equal(pending.length, 1);
  task.restart();
  assert.equal(pending[0].signal.aborted, true);
  pending[0].resolve("stale-account");
  pending[1].resolve("current-account");
  await flush();
  assert.deepEqual(accepted, ["current-account"]);
  task.recheck();
  task.cancel();
  assert.equal(pending[2].signal.aborted, true);
  pending[2].resolve("revoked");
  await flush();
  assert.equal(accepted.length, 1);
  task.recheck();
  pending[3].resolve("reopened");
  await flush();
  assert.deepEqual(accepted, ["current-account", "reopened"]);
  task.dispose();
});
