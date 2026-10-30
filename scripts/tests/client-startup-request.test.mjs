import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { requestStartupJson } from "../../artifacts/ea-app/src/lib/startup-request.ts";
const originalFetch = globalThis.fetch,
  originalWarn = console.warn;
afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
});
const policy = { attempts: 3, timeoutMs: 30, delayMs: 1 };
test("startup recovers from temporary gateway failure without losing cookie credentials", async () => {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/app/me");
    assert.equal(init.cache, "no-store");
    assert.equal(init.credentials, "include");
    return ++calls < 3
      ? new Response("Bad gateway", { status: 502 })
      : Response.json({ status: "approved", token: "identity-only" });
  };
  console.warn = () => {};
  assert.equal(
    (
      await requestStartupJson(
        "/api/app/me",
        { credentials: "include" },
        policy,
      )
    ).status,
    "approved",
  );
  assert.equal(calls, 3);
});
test("authentication rejection and access denial are not retried or misclassified as outages", async () => {
  for (const status of [401, 403]) {
    let calls = 0;
    console.warn = () => {};
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ code: "SESSION_LICENCE_EXPIRED" }, { status });
    };
    await assert.rejects(
      requestStartupJson("/api/app/dashboard", {}, policy),
      (e) =>
        e.status === status &&
        !e.retryable &&
        !e.message.includes("unavailable"),
    );
    assert.equal(calls, 1);
  }
});
test("exhausted outage is bounded and logs contain endpoint/status, never tokens or bodies", async () => {
  const logs = [];
  console.warn = (...args) => logs.push(args);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ error: "private response secret" }, { status: 503 });
  };
  await assert.rejects(
    requestStartupJson(
      "/api/app/me",
      { headers: { Authorization: "Bearer private-token" } },
      policy,
    ),
    (e) => e.status === 503 && e.retryable,
  );
  assert.equal(calls, 3);
  assert.equal(logs[0][1].endpoint, "/api/app/me");
  assert.equal(logs[0][1].status, 503);
  assert(!JSON.stringify(logs).includes("private"));
});
test("retry can be cancelled before further requests and writes are never replayed", async () => {
  console.warn = () => {};
  const controller = new AbortController();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    controller.abort();
    throw TypeError("offline");
  };
  await assert.rejects(
    requestStartupJson("/api/app/me", { signal: controller.signal }, policy),
  );
  assert.equal(calls, 1);
  await assert.rejects(
    requestStartupJson("/api/app/me", { method: "POST" }, policy),
    /restricted/,
  );
  assert.equal(calls, 1);
});
