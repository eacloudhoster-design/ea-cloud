import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  bootstrapConfiguration,
  bootstrapFailure,
} from "../src/lib/bootstrap-diagnostics.ts";

const secret = randomBytes(24).toString("base64url");
const valid = {
  BOOTSTRAP_ADMIN_EMAIL: " Owner@Example.Invalid ",
  BOOTSTRAP_ADMIN_PASSWORD: secret,
  DATABASE_URL: `postgresql://role:${secret}@db.example.invalid/ea_cloud`,
};

test("valid configuration normalizes email and preserves the exact password", () => {
  assert.deepEqual(bootstrapConfiguration(valid), {
    email: "owner@example.invalid",
    password: secret,
  });
});
test("configuration failures name the exact variable without exposing its value", () => {
  for (const [name, value, code] of [
    ["BOOTSTRAP_ADMIN_EMAIL", "", "BOOTSTRAP_ADMIN_EMAIL_MISSING"],
    [
      "BOOTSTRAP_ADMIN_EMAIL",
      '"owner@example.invalid"',
      "BOOTSTRAP_ADMIN_EMAIL_INVALID",
    ],
    ["BOOTSTRAP_ADMIN_PASSWORD", "", "BOOTSTRAP_ADMIN_PASSWORD_MISSING"],
    [
      "BOOTSTRAP_ADMIN_PASSWORD",
      secret.slice(0, 8),
      "BOOTSTRAP_ADMIN_PASSWORD_SHORT",
    ],
    ["DATABASE_URL", "", "DATABASE_URL_MISSING"],
    ["DATABASE_URL", `invalid:${secret}`, "DATABASE_URL_INVALID"],
  ]) {
    assert.throws(
      () => bootstrapConfiguration({ ...valid, [name]: value }),
      (error) => {
        const output = bootstrapFailure(error, "configuration validation");
        assert.ok(output.includes(`[${code}]`));
        assert.ok(!output.includes(secret));
        assert.ok(!output.includes(secret.slice(0, 8)));
        return true;
      },
    );
  }
});
test("nested Drizzle errors expose only allowlisted driver codes and explanations", () => {
  for (const code of [
    "28P01",
    "42P01",
    "42703",
    "42P10",
    "42501",
    "25006",
    "23502",
    "ECONNREFUSED",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  ]) {
    const output = bootstrapFailure(
      {
        message: secret,
        query: secret,
        params: [secret],
        cause: { code, detail: secret, stack: secret },
      },
      "administrator insert",
    );
    assert.ok(output.includes(`[${code}]`));
    assert.ok(!output.includes(secret));
  }
});
test("aggregate, cyclic and unknown errors cannot leak raw provider messages", () => {
  const cycle = { message: secret, code: secret };
  cycle.cause = cycle;
  assert.match(bootstrapFailure(cycle, "administrator insert"), /UNCLASSIFIED/);
  assert.ok(!bootstrapFailure(cycle, "administrator insert").includes(secret));
  const aggregate = new AggregateError(
    [{ code: "ENOTFOUND", message: secret }],
    secret,
  );
  assert.match(
    bootstrapFailure(aggregate, "administrator insert"),
    /\[ENOTFOUND\]/,
  );
  assert.ok(
    !bootstrapFailure(aggregate, "administrator insert").includes(secret),
  );
});
