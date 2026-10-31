import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionFailureInfo,
  reportSessionFailure,
} from "../../artifacts/api-server/src/lib/session-diagnostics.ts";
test("session diagnostics distinguish missing schema from connection/credential failures and never expose SQL or secrets", () => {
  for (const [code, category] of [
    ["42P01", "database_schema"],
    ["42703", "database_schema"],
    ["ECONNRESET", "database_connection"],
    ["28P01", "database_credentials"],
  ]) {
    const err = {
      message: "PRIVATE SQL password user@example.invalid",
      cause: { code, query: "PRIVATE" },
    };
    const result = sessionFailureInfo(err);
    assert.equal(result.category, category);
    assert.equal(result.driverCode, code);
    assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  }
  const cyclic = { message: "PRIVATE" };
  cyclic.cause = cyclic;
  assert.equal(sessionFailureInfo(cyclic).code, "SESSION_BACKEND_FAILURE");
  const records = [];
  let status, body;
  reportSessionFailure(
    { log: { error: (value) => records.push(value) } },
    {
      setHeader() {},
      status(value) {
        status = value;
        return this;
      },
      json(value) {
        body = value;
      },
    },
    { code: "42P01", message: "PRIVATE" },
    "session",
  );
  assert.equal(status, 503);
  assert.equal(body.code, "SESSION_STORAGE_SCHEMA_UNAVAILABLE");
  assert.equal(records[0].event, "app_startup_backend_failed");
  assert.ok(!JSON.stringify(records).includes("PRIVATE"));
});
