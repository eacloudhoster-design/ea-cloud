// Read-only deployment check. Uses the configured PostgreSQL target; never applies migrations.
import pg from '../lib/db/node_modules/pg/lib/index.js';
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not configured. Scanner migration state cannot be verified.');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, query_timeout: 10000 });
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    for (const query of [
      'SELECT client_id, status, expires_at, reference, updated_at, credits_remaining FROM scanner_entitlements LIMIT 0',
      'SELECT id, client_id, kind, strategy, report, created_at FROM scanner_reports LIMIT 0',
      'SELECT token_hash, user_id, expires_at FROM scanner_admin_sessions LIMIT 0',
      'SELECT id, actor_id, client_id, changes, created_at FROM scanner_access_audit LIMIT 0',
    ]) await client.query(query);
    await client.query('ROLLBACK');
    console.log('Verified: PostgreSQL scanner tables and required columns are present. No records changed.');
  } finally { client.release(); }
} catch {
  console.error('Scanner migration verification failed. Check PostgreSQL connectivity and apply scanner reports, entitlements and management migrations in order.');
  process.exitCode = 1;
} finally { await pool.end(); }
