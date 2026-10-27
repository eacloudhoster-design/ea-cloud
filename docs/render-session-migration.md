# Repair missing browser_sessions on Render Free

Production logs report PostgreSQL 42P01 in issueBrowserSession: the API reaches
PostgreSQL but cannot insert the persistent session. The existing migration is
`docs/migrations/20261026-browser-sessions.sql`. It matches
`lib/db/src/schema/browser-sessions.ts`: text token-hash primary key; required
portal/client kind constraint, integer account ID, text credential hash; required
timestamptz expiry/absolute-expiry/last-seen columns; last-seen default now();
indexes on (kind, account_id) and expires_at. No foreign key is added because
account_id refers to either users or app_access, according to kind.

## Backup prerequisite — not verified from this workspace

No Render or database-provider credentials or backup inventory are available to
this workspace. A production backup has NOT been confirmed. Earlier deployment
documentation mentions Neon; verify the actual provider in your existing setup.
Do not infer backup availability from Render's API service plan.

Before deploying this change, privately check the database provider's dashboard
for a recent usable backup/recovery point for the exact database used by the API.
Record its time and the provider's supported restoration procedure. If no usable
recovery point exists, create a backup using the existing provider's supported
export process or pg_dump from an authorized local machine, storing credentials
and the dump securely. Neither requires purchasing Render Shell. Do not proceed
until recovery is available; do not paste a connection string or dump into chat.

The production database password was exposed in chat. Before deployment approval,
an authorized operator must rotate that database credential privately in Neon and
update the existing DATABASE_URL binding in Render. Coordinate this with the
running service: the old credential may stop working. Updating Render settings
can initiate a deployment, so control auto-deploy and any save/redeploy action
until approval. Never commit the new value or print it in logs. This repair does
not rotate credentials itself. Leave SESSION_SECRET and application user passwords
unchanged. Backup confirmation and database-credential remediation are both
outstanding production prerequisites.

## Existing mechanisms and selected approach

The project has additive SQL under docs/migrations, a read-only scanner schema
checker, and broad Drizzle push/push-force commands. There is no automatic SQL
migration runner or committed Render blueprint. The previous bootstrap guide
documents a temporary build-time bootstrap and a direct Node start command.
Bootstrap creates accounts and is unrelated to this repair; broad schema push
could affect other tables. Neither is used.

The new narrow Node script reads the existing session SQL unchanged, uses the
existing pg dependency through lib/db, and runs before the API process in the
package start command using &&. This avoids a paid Shell or pre-deploy hook,
public endpoints, dependencies, schema ledgers, or application/auth changes.
File paths resolve relative to the script, not the shell working directory.

The SQL owns BEGIN/COMMIT and uses IF NOT EXISTS for its table and indexes.
Retries preserve existing rows; an advisory lock serializes simultaneous script
runs. The runner inserts a transaction-level advisory lock and SET LOCAL timeouts
after the file's BEGIN, preserving all original migration statements. This is
compatible with Neon's transaction pooling; the migration file is unchanged.
Lock/statement/connection waits are bounded. A failed migration rolls back
and exits nonzero; && prevents the new API process from opening a port. The
transaction releases its lock and the connection closes before API startup. A column-read
check rejects missing columns, but IF NOT EXISTS does not repair incompatible
existing schema: investigate failures rather than dropping a table.

## Deployment instructions — only after backup confirmation and approval

1. Review and merge this change into the branch deployed by the existing
   **ea-cloud-api** Render service. If auto-deploy is enabled, prevent an
   unintended deployment until the backup prerequisite and approval are met.
2. Keep the service at Free and its repository root unchanged. Keep DATABASE_URL
   pointing at the same production database, using the privately rotated database
   credential described above. Preserve SESSION_SECRET, PUBLIC_WEBSITE_ORIGIN and
   other unrelated runtime bindings. Do not paste secret values into commands.
3. Under Settings → Build & Deploy, build from repository root with:

   ```sh
   npx --yes pnpm@10.32.1 install --frozen-lockfile --prod=false && npx --yes pnpm@10.32.1 --filter @workspace/api-server build
   ```

   Remove any temporary bootstrap-admin, seed, push or push-force step from that
   command. This build does not connect to or change the production database.
4. Replace the documented direct Node Start Command with:

   ```sh
   cd artifacts/api-server && node ../../scripts/apply-browser-session-migration.mjs && node --enable-source-maps dist/index.mjs
   ```

   Alternatively, when using the repository-root package command, the updated
   script supplies the same sequencing:

   ```sh
   npx --yes pnpm@10.32.1 --filter @workspace/api-server start
   ```

   Use ONE start command. Keeping the previous direct Node command would bypass
   the migration. Keep the migration in the start command so cold starts and
   future deployments safely verify the prerequisite too.
5. After explicit deployment approval, choose Manual Deploy → Deploy latest
   commit. Expect “Session migration ready: 20261026-browser-sessions.sql” before
   the API's “Server listening” message. A migration failure exits the new
   process before listening and prevents it becoming healthy; Render can retry
   it. Existing older instances may still serve traffic during rollout.
6. Verify service health, sign in with an existing approved account, refresh to
   check persistent login, and confirm incorrect credentials still return 401.
   Inspect Render logs for absence of 42P01. Do not log cookies, password bodies,
   tokens or database URLs. Healthz alone does not test database connectivity.

Only the Render backend needs this deployment; no Cloudflare deployment is
needed for the missing-table repair. No production action was performed while
preparing this change, and production login resolution remains unverified.

## Review validation

- Workspace TypeScript validation, backend production build and combined Pages
  production build passed. Existing nonfatal frontend build warnings remain.
- Four migration tests passed: original SQL preservation, failure propagation,
  blocked API startup/redacted errors, and isolated PostgreSQL-compatible schema,
  retry, existing-account/session preservation and transaction rollback checks.
- Four login integration tests and the persistent-session security test passed;
  one CLI bootstrap integration test was skipped because no disposable PostgreSQL
  TCP endpoint was used. Eight existing Pages/proxy regression tests passed.
- PGlite replaces the advisory-lock statement in its single-connection fixture;
  live PostgreSQL concurrency, Neon pooling and production login were not tested.
- No frontend, authentication handler, password algorithm, account policy or
  migration SQL file changes are included.

Render's [Free service documentation](https://render.com/docs/free) confirms that
Free web services run applications but lack Shell access. The startup approach
uses no Shell, one-off job or paid pre-deploy hook. See also
[deployment controls](https://render.com/docs/deploys) and
[Neon transaction pooling](https://neon.com/docs/connect/connection-pooling).
