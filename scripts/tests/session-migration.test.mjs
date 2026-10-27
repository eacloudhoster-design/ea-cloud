import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { applyBrowserSessionMigration } from "../apply-browser-session-migration.mjs";

const root = new URL("../../", import.meta.url);
const sql = readFileSync(new URL("docs/migrations/20261026-browser-sessions.sql", root), "utf8");

test("runner applies the exact checked-in migration before verifying columns", async () => {
  const queries = [];
  await applyBrowserSessionMigration({ query: async (text) => { queries.push(text); } });
  assert.equal(queries[0].replace(/BEGIN;[\s\S]*?SELECT pg_advisory_xact_lock\(73261026, 1\);/, "BEGIN;"), sql);
  assert.match(queries[0], /BEGIN;\s*SET LOCAL lock_timeout/);
  assert.match(queries[0], /SET LOCAL statement_timeout/);
  assert.match(queries[0], /pg_advisory_xact_lock/);
  assert.match(queries[1], /FROM browser_sessions LIMIT 0/);
});

test("migration and verification failures roll back and propagate", async () => {
  for (const failOn of ["CREATE TABLE IF NOT EXISTS browser_sessions", "FROM browser_sessions LIMIT 0"]) {
    const queries = [];
    const failure = new Error("private driver details");
    await assert.rejects(applyBrowserSessionMigration({
      query: async (text) => {
        queries.push(text);
        if (text.includes(failOn)) throw failure;
      },
    }), (error) => error === failure);
    assert.equal(queries.at(-1), "ROLLBACK");
  }
});

test("start command fails closed on missing configuration or refused database, without leaking secrets", () => {
  const pkg = JSON.parse(readFileSync(new URL("artifacts/api-server/package.json", root), "utf8"));
  for (const databaseUrl of ["", "postgresql://test:PRIVATE_TEST_PASSWORD@127.0.0.1:1/test"]) {
    const result = spawnSync("sh", ["-c", pkg.scripts.start], {
      cwd: new URL("artifacts/api-server/", root),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Session migration failed/);
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_TEST_PASSWORD|postgresql:\/\/|Server listening/);
  }
});

test("existing migration is retryable, preserves accounts/sessions and enforces schema", {
  skip: !process.env.PGLITE_MODULE && "Set PGLITE_MODULE to an isolated PGlite installation",
}, async () => {
  const { PGlite } = await import(pathToFileURL(resolve(process.env.PGLITE_MODULE)));
  const engine = new PGlite();
  try {
    await engine.exec("CREATE TABLE users(id integer PRIMARY KEY, password text); INSERT INTO users VALUES(1,'preserved-test-hash')");
    // Execute the actual runner, substituting only transaction advisory locks which
    // PGlite does not need: this fixture has exactly one in-process connection.
    const client = { query: async (text) => {
      return engine.exec(text.replace("SELECT pg_advisory_xact_lock(73261026, 1);", ""));
    } };
    await applyBrowserSessionMigration(client);
    await engine.exec("INSERT INTO browser_sessions(token_hash,kind,account_id,credential_hash,expires_at,absolute_expires_at) VALUES('fixture','portal',1,'credential',now()+interval '1 day',now()+interval '2 days')");
    await applyBrowserSessionMigration(client);
    assert.deepEqual((await engine.query("SELECT * FROM users")).rows, [{ id: 1, password: "preserved-test-hash" }]);
    assert.equal((await engine.query("SELECT count(*)::int AS n FROM browser_sessions")).rows[0].n, 1);
    const columns = (await engine.query("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='browser_sessions' ORDER BY ordinal_position")).rows;
    assert.deepEqual(columns.map(c => [c.column_name, c.data_type, c.is_nullable]), [
      ["token_hash", "text", "NO"], ["kind", "text", "NO"], ["account_id", "integer", "NO"],
      ["credential_hash", "text", "NO"], ["expires_at", "timestamp with time zone", "NO"],
      ["absolute_expires_at", "timestamp with time zone", "NO"], ["last_seen_at", "timestamp with time zone", "NO"],
    ]);
    assert.match(columns.at(-1).column_default, /now\(\)/);
    const indexes = (await engine.query("SELECT indexdef FROM pg_indexes WHERE tablename='browser_sessions'")).rows.map(r => r.indexdef).join("\n");
    assert.match(indexes, /UNIQUE INDEX browser_sessions_pkey.*\(token_hash\)/);
    assert.match(indexes, /browser_session_account_idx.*\(kind, account_id\)/);
    assert.match(indexes, /browser_session_expiry_idx.*\(expires_at\)/);
    await assert.rejects(engine.exec("INSERT INTO browser_sessions SELECT * FROM browser_sessions"), error => error.code === "23505");
    await assert.rejects(engine.exec("UPDATE browser_sessions SET kind='invalid'"), error => error.code === "23514");
    await assert.rejects(engine.exec("UPDATE browser_sessions SET credential_hash=NULL"), error => error.code === "23502");
    // A late DDL failure must undo earlier index creation in the SQL transaction.
    await engine.exec("CREATE SCHEMA broken; SET search_path TO broken; CREATE TABLE browser_sessions(kind text, account_id integer)");
    await assert.rejects(applyBrowserSessionMigration(client), error => error.code === "42703");
    assert.equal((await engine.query("SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='broken'")).rows[0].n, 0);
    assert.deepEqual((await engine.query("SELECT * FROM public.users")).rows, [{ id: 1, password: "preserved-test-hash" }]);
  } finally { await engine.close(); }
});
