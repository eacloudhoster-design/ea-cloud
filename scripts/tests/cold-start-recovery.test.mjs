import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../artifacts/api-server/node_modules/esbuild/lib/main.js";
const compiled = await build({
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
const { connectionRecovery, recoveryWindow, ApiRequestError, requestJson } =
  await import(
    "data:text/javascript;base64," +
      Buffer.from(compiled.outputFiles[0].text).toString("base64")
  );
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
const unavailable = () =>
  new ApiRequestError(
    "PRIVATE",
    "API_UPSTREAM_UNREACHABLE",
    "backend",
    true,
    502,
  );
for (const recoveryAt of [30000, 60000, 90000, 120000])
  test(`cold backend recovers after ${recoveryAt / 1000}s, without terminal UI, overlapping attempts or session mutation`, async (t) => {
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
    const progress = [],
      failures = [],
      success = [];
    let calls = 0,
      active = 0,
      maxActive = 0;
    const task = connectionRecovery({
      phase: "session",
      progress: (p) => progress.push(p),
      failure: (e) => failures.push(e),
      success: (v) => success.push(v),
      load: async () => {
        calls++;
        active++;
        maxActive = Math.max(active, maxActive);
        try {
          await new Promise((r) => setTimeout(r, 700));
          if (Date.now() < recoveryAt) throw unavailable();
          return { token: "existing-cookie-identity", status: "approved" };
        } finally {
          active--;
        }
      },
    });
    task.restart();
    await flush();
    for (let time = 0; time < 131000 && success.length === 0; time += 250) {
      t.mock.timers.tick(250);
      await flush();
      if (success.length === 0) {
        task.recheck();
        task.recheck();
      }
    }
    assert.equal(success.length, 1);
    assert.equal(failures.length, 0);
    assert.equal(maxActive, 1);
    assert.ok(calls <= 11);
    assert.ok(progress.some((p) => p.state === "slow"));
    assert.equal(progress.at(-1).state, "ready");
    const completedCalls = calls;
    t.mock.timers.tick(180000);
    await flush();
    assert.equal(calls, completedCalls);
    task.dispose();
  });
test("never recovering reaches bounded Retry state; focus cannot start infinite retry loops; Retry starts a fresh cycle", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  let calls = 0,
    recovered = false;
  const errors = [],
    states = [];
  const task = connectionRecovery({
    phase: "session",
    load: async () => {
      calls++;
      if (recovered) return "same session";
      throw unavailable();
    },
    success: () => {},
    failure: (e) => errors.push(e.code),
    progress: (p) => states.push(p.state),
  });
  task.restart();
  await flush();
  for (let i = 0; i < 132; i++) {
    t.mock.timers.tick(1000);
    await flush();
    task.recheck();
  }
  assert.deepEqual(errors, ["STARTUP_RECOVERY_EXHAUSTED"]);
  assert.equal(states.at(-1), "exhausted");
  const exhausted = calls;
  t.mock.timers.tick(300000);
  task.recheck();
  await flush();
  assert.equal(calls, exhausted);
  recovered = true;
  task.restart();
  await flush();
  assert.equal(calls, exhausted + 1);
  assert.equal(states.at(-1), "ready");
  task.dispose();
});
test("an ignored/hung request is cancelled at the outer ceiling and cannot publish a late success", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  let signal, resolve;
  const success = [],
    errors = [];
  const task = connectionRecovery({
    phase: "session",
    load: (s) => {
      signal = s;
      return new Promise((r) => (resolve = r));
    },
    success: (v) => success.push(v),
    failure: (e) => errors.push(e.code),
  });
  task.restart();
  t.mock.timers.tick(130000);
  await flush();
  assert.equal(signal.aborted, true);
  assert.deepEqual(errors, ["STARTUP_RECOVERY_EXHAUSTED"]);
  resolve("late");
  await flush();
  assert.deepEqual(success, []);
  task.dispose();
});
test("offline/background pause cancels stale work; online/reopen resumes once with a fresh bounded window", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const pending = [],
    saved = [];
  const task = connectionRecovery({
    phase: "branding",
    load: (signal) =>
      new Promise((resolve) => pending.push({ signal, resolve })),
    success: (v) => saved.push(v),
    failure: () => assert.fail("unexpected terminal failure"),
  });
  task.restart();
  task.recheck();
  task.recheck();
  assert.equal(pending.length, 1);
  task.pause();
  assert.equal(pending[0].signal.aborted, true);
  t.mock.timers.tick(300000);
  task.recheck();
  assert.equal(pending.length, 1);
  pending[0].resolve("stale");
  await flush();
  assert.deepEqual(saved, []);
  task.resume();
  task.resume();
  task.recheck();
  assert.equal(pending.length, 2);
  pending[1].resolve("current");
  await flush();
  assert.deepEqual(saved, ["current"]);
  task.dispose();
});
test("confirmed expired session and permanent configuration errors are terminal and never retry on focus", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  for (const [code, category, status] of [
    ["AUTH_REQUIRED", "authentication", 401],
    ["API_BACKEND_NOT_CONFIGURED", "configuration", 503],
  ]) {
    let calls = 0;
    const failures = [];
    const task = connectionRecovery({
      phase: "session",
      load: async () => {
        calls++;
        throw new ApiRequestError("safe", code, category, false, status);
      },
      success: () => assert.fail(),
      failure: (e) => failures.push(e.code),
    });
    task.restart();
    await flush();
    t.mock.timers.tick(300000);
    task.recheck();
    await flush();
    assert.equal(calls, 1);
    assert.deepEqual(failures, [code]);
    task.dispose();
  }
});
test("Cloudflare edge 52x, DB readiness, and gateway failures are retryable; configuration and 401 remain distinct", async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [502, 503, 504, 520, 521, 522, 523, 524, 530]) {
      globalThis.fetch = async () =>
        new Response("<html>upstream unavailable</html>", { status });
      await assert.rejects(
        requestJson("/api/app/me"),
        (e) => e.status === status && e.retryable && e.category === "backend",
      );
    }
    globalThis.fetch = async () =>
      Response.json({ code: "DATABASE_NOT_READY" }, { status: 503 });
    await assert.rejects(
      requestJson("/api/app/me"),
      (e) => e.retryable && e.code === "DATABASE_NOT_READY",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("recovery configuration is bounded with a 120-second default", () => {
  for (const value of [undefined, "", 0, "bad", 29999, 300001])
    assert.equal(recoveryWindow(value), 120000);
  assert.equal(recoveryWindow("180000"), 180000);
});

test("Retry-After beyond the bounded final check exhausts without probing the backend early", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  let calls = 0;
  const failures = [];
  const task = connectionRecovery({
    phase: "session",
    maxWindowMs: 30000,
    load: async () => {
      calls++;
      throw new ApiRequestError(
        "safe",
        "HTTP_429",
        "rate_limit",
        true,
        429,
        60000,
      );
    },
    success: () => assert.fail(),
    failure: (e) => failures.push(e.code),
  });
  task.restart();
  await flush();
  t.mock.timers.tick(35000);
  await flush();
  assert.equal(calls, 1);
  assert.deepEqual(failures, ["STARTUP_RECOVERY_EXHAUSTED"]);
  task.dispose();
});
