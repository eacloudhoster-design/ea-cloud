// Read-only host/database preflight. Never import the API, jobs or migrations.
import os from "node:os";
import { statfs } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export function safePreflightCode(error) {
  const code = error?.code;
  return typeof code === "string" &&
    /^(?:[0-9A-Z]{5}|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|SCHEMA_NOT_READY|READ_ONLY_REQUIRED)$/.test(
      code,
    )
    ? code
    : "PREFLIGHT_FAILED";
}
export async function checkDatabase(client) {
  let transaction = false;
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    transaction = true;
    await client.query("SET LOCAL statement_timeout = '5s'");
    const mode = await client.query(
      "SELECT current_setting('transaction_read_only') AS read_only",
    );
    if (mode.rows[0]?.read_only !== "on")
      throw Object.assign(Error(), { code: "READ_ONLY_REQUIRED" });
    const tables = await client.query(`SELECT
      to_regclass('public.users') IS NOT NULL AS users,
      to_regclass('public.app_access') IS NOT NULL AS app_access,
      to_regclass('public.licenses') IS NOT NULL AS licenses,
      to_regclass('public.browser_sessions') IS NOT NULL AS browser_sessions`);
    const session =
      await client.query(`SELECT COUNT(*)::int AS columns FROM information_schema.columns
      WHERE table_schema='public' AND table_name='browser_sessions'
      AND column_name IN ('token_hash','kind','account_id','credential_hash','expires_at','absolute_expires_at','last_seen_at')`);
    const ready =
      Object.values(tables.rows[0] || {}).length === 4 &&
      Object.values(tables.rows[0]).every((v) => v === true) &&
      Number(session.rows[0]?.columns) === 7;
    if (!ready) throw Object.assign(Error(), { code: "SCHEMA_NOT_READY" });
    return {
      database: "ready",
      minimumSchema: "ready",
      mode: "read-only",
      applicationRecordsRead: 0,
    };
  } finally {
    if (transaction) await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}
export async function main(args = process.argv.slice(2)) {
  if (args.some((v) => v !== "--database")) {
    console.error(
      JSON.stringify({
        event: "api_host_preflight_failed",
        code: "UNKNOWN_ARGUMENT",
      }),
    );
    return 1;
  }
  const disk = await statfs(process.cwd());
  console.log(
    JSON.stringify({
      event: "api_host_resources",
      platform: process.platform,
      nodeMajor: Number(process.versions.node.split(".")[0]),
      cpuAvailable: os.availableParallelism(),
      hostMemoryMiB: Math.round(os.totalmem() / 1048576),
      freeMemoryMiB: Math.round(os.freemem() / 1048576),
      processMemoryLimitMiB: Math.round(process.constrainedMemory() / 1048576),
      diskFreeMiB: Math.round(
        (Number(disk.bavail) * Number(disk.bsize)) / 1048576,
      ),
    }),
  );
  if (!args.includes("--database")) return 0;
  if (
    !process.env.DATABASE_URL ||
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 16
  ) {
    console.error(
      JSON.stringify({
        event: "api_host_preflight_failed",
        code: "REQUIRED_CONFIGURATION_MISSING",
      }),
    );
    return 1;
  }
  let client;
  try {
    const require = createRequire(
      new URL("../lib/db/package.json", import.meta.url),
    );
    const { Client } = require("pg");
    client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10000,
      query_timeout: 10000,
      application_name: "ea-cloud-readonly-preflight",
    });
    console.log(
      JSON.stringify({
        event: "api_host_database_preflight",
        ...(await checkDatabase(client)),
      }),
    );
    return 0;
  } catch (error) {
    if (client) await client.end().catch(() => {});
    console.error(
      JSON.stringify({
        event: "api_host_preflight_failed",
        code: safePreflightCode(error),
      }),
    );
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main();
