import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkDatabase, safePreflightCode } from "../check-api-host.mjs";
const fake = (overrides = {}) => {
  const queries = [];
  let ended = 0;
  return {
    queries,
    get ended() {
      return ended;
    },
    async connect() {
      if (overrides.connectError) throw overrides.connectError;
    },
    async end() {
      ended++;
    },
    async query(sql) {
      queries.push(sql);
      if (sql.includes("current_setting"))
        return { rows: [{ read_only: overrides.mode || "on" }] };
      if (sql.includes("to_regclass"))
        return {
          rows: [
            {
              users: true,
              app_access: true,
              licenses: true,
              browser_sessions: !overrides.missing,
            },
          ],
        };
      if (sql.includes("information_schema")) return { rows: [{ columns: 7 }] };
      return { rows: [] };
    },
  };
};
test("host preflight uses only read-only metadata and always closes its connection", async () => {
  const client = fake();
  const result = await checkDatabase(client);
  assert.equal(result.applicationRecordsRead, 0);
  assert.equal(result.database, "ready");
  assert.equal(client.ended, 1);
  assert.equal(client.queries[0], "BEGIN READ ONLY");
  assert.equal(client.queries.at(-1), "ROLLBACK");
  assert.ok(
    client.queries.every((q) =>
      /^(BEGIN READ ONLY|SET LOCAL|SELECT|ROLLBACK)/.test(q),
    ),
  );
  assert.ok(
    !client.queries.some((q) =>
      /INSERT|DELETE|UPDATE|ALTER|CREATE|TRUNCATE/i.test(q),
    ),
  );
});
test("missing schema and unsafe transaction mode fail closed without migrations", async () => {
  for (const [options, code] of [
    [{ missing: true }, "SCHEMA_NOT_READY"],
    [{ mode: "off" }, "READ_ONLY_REQUIRED"],
  ]) {
    const client = fake(options);
    await assert.rejects(checkDatabase(client), (e) => e.code === code);
    assert.equal(client.ended, 1);
    assert.equal(client.queries.at(-1), "ROLLBACK");
  }
  const client = fake({ connectError: Error("PRIVATE URI password") });
  await assert.rejects(checkDatabase(client));
  assert.equal(client.ended, 1);
  assert.deepEqual(client.queries, []);
  assert.equal(
    safePreflightCode({ message: "PRIVATE URI", code: "PRIVATE_URI_PASSWORD" }),
    "PREFLIGHT_FAILED",
  );
});
test("draft VPS configuration bounds resources and requires an approval marker for cutover", async () => {
  const unit = await readFile("deploy/vps/ea-cloud-api.service", "utf8");
  for (const required of [
    "ConditionPathExists=/etc/ea-cloud/CUTOVER-APPROVED",
    "MemoryMax=512M",
    "CPUQuota=50%",
    "API_LISTEN_HOST=127.0.0.1",
    "check-api-host.mjs --database",
    "WorkingDirectory=/var/lib/ea-cloud",
    "StartLimitBurst=3",
  ])
    assert.ok(unit.includes(required));
  assert.ok(
    !/apply-browser-session-migration|bootstrap-admin|pnpm.*start|db.*push/.test(
      unit
        .split("\n")
        .filter((line) => line.startsWith("ExecStart"))
        .join("\n"),
    ),
  );
  const proxy = await readFile("deploy/vps/nginx-api.conf.example", "utf8");
  assert.match(proxy, /default 0;/);
  assert.match(proxy, /proxy_next_upstream off/);
  assert.match(proxy, /proxy_cache off/);
  assert.match(proxy, /proxy_set_header X-Ea-Cloud-Origin-Token ""/);
  assert.match(proxy, /proxy_set_header Upgrade/);
});
