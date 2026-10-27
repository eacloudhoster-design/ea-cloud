import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const migrationFile = new URL("../docs/migrations/20261026-browser-sessions.sql", import.meta.url);

// Dedicated connection: the existing SQL owns BEGIN/COMMIT. No application pool
// or startup maintenance is imported, and no user/account data is touched.
export async function applyBrowserSessionMigration(client) {
  const sql = await readFile(migrationFile, "utf8");
  if (!sql.startsWith("BEGIN;")) throw new Error("Expected transactional session migration");
  // Neon transaction pooling requires settings and locks in the DDL transaction.
  const migration = sql.replace("BEGIN;", `BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(73261026, 1);`);
  try {
    await client.query(migration);
    await client.query("SELECT token_hash, kind, account_id, credential_hash, expires_at, absolute_expires_at, last_seen_at FROM browser_sessions LIMIT 0");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

export async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Session migration failed: DATABASE_URL is not configured. API was not started.");
    return 1;
  }
  let client;
  try {
    const require = createRequire(new URL("../lib/db/package.json", import.meta.url));
    const { Client } = require("pg");
    client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10000,
    });
    await client.connect();
    await applyBrowserSessionMigration(client);
    console.log("Session migration ready: 20261026-browser-sessions.sql. Starting API is now permitted.");
    return 0;
  } catch {
    // Driver errors can contain connection strings or SQL parameters.
    console.error("Session migration failed. API was not started. Check database connectivity, schema permissions and provider logs privately.");
    return 1;
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
