# Diagnose and retry Render admin bootstrap

The previous script replaced every caught failure with the same generic message.
Successful schema creation does not validate the admin email/password variables,
the insert permissions, or the connection/schema used by bootstrap. That old
message alone cannot identify which prerequisite failed.

The command now validates configuration before importing the database module,
reports the failing phase, and maps recognized PostgreSQL/network error codes
to safe explanations. Drizzle wraps driver errors, so diagnostics inspect nested
causes and aggregate errors. Unknown failures remain redacted.

Logs never print raw errors/stacks, query parameters, password hashes, passwords,
email values or database connection strings. Do not add `console.error(error)`
to this command: a Drizzle error can embed SQL parameters and connection details.

## Retry on ea-cloud-api

1. Merge this fix into the branch Render deploys (normally `main`).
2. Open Render Dashboard, select **ea-cloud-api**, then **Environment**.
3. Privately verify `DATABASE_URL` is the intended Neon database URI, without
   wrapping quotes. Confirm `BOOTSTRAP_ADMIN_EMAIL` is present and valid, and
   `BOOTSTRAP_ADMIN_PASSWORD` is present with at least 16 characters. Do not
   paste values into support chat, source code or build commands. Preserve
   `SESSION_SECRET`; do not rotate it to troubleshoot this failure.
4. Under **Settings → Build & Deploy**, use the retry build command below.
5. Choose **Manual Deploy → Deploy latest commit** and inspect the sanitized
   bootstrap diagnostic in **Logs**. Dashboard labels may vary slightly.

Since this service already applied the schema, the retry does **not** run a
schema push or delete/reset anything:

```sh
npx --yes pnpm@10.32.1 install --frozen-lockfile --prod=false &&
npx --yes pnpm@10.32.1 --filter @workspace/api-server build &&
npx --yes pnpm@10.32.1 --filter @workspace/scripts bootstrap-admin
```

Keep the existing start command:

```sh
cd artifacts/api-server && node --enable-source-maps dist/index.mjs
```

## Interpret the new diagnostic

| Code | Action |
| --- | --- |
| `BOOTSTRAP_ADMIN_EMAIL_MISSING` / `BOOTSTRAP_ADMIN_EMAIL_INVALID` | Correct that variable on this Render service |
| `BOOTSTRAP_ADMIN_PASSWORD_MISSING` / `BOOTSTRAP_ADMIN_PASSWORD_SHORT` | Supply a unique password of at least 16 characters securely |
| `DATABASE_URL_MISSING` / `DATABASE_URL_INVALID` | Supply the actual PostgreSQL URI, including database name, without wrapping quotes |
| `28P01` / `28000` | Database-role authentication/authorization failed; check Neon credentials and access settings, not the admin password |
| `42P01` / `3F000` | Bootstrap cannot see the expected table/schema; compare its database and search path with the schema command |
| `42703` / `23502` / `23514` | Review actual `users` columns/constraints for schema drift before planning a migration |
| `42P10` | The expected unique email constraint is absent; review a migration rather than dropping tables |
| `42501` / `25006` | Use an authorized writable role with the needed table, sequence and schema permissions |
| `ECONNREFUSED` / `ENOTFOUND` / `ETIMEDOUT` | Check the database endpoint and network/provider availability |
| TLS certificate code | Restore provider-supported trust/certificate configuration; never disable verification |
| `MODULE_NOT_FOUND` / `ERR_MODULE_NOT_FOUND` | Install workspace dependencies from repository root, including build tools |
| `UNCLASSIFIED` | Inspect provider/database logs privately; raw application errors are intentionally withheld |

`Superadmin created.` means a new account was inserted. `Account already
exists; no credentials or permissions changed.` means bootstrap deliberately
did not change that account. It does not establish that an existing account is
approved, is a superadmin, or has the supplied password. Bootstrap is not a
password-reset or privilege-elevation command.

After bootstrap succeeds, first remove its step from the Render Build Command:

```sh
npx --yes pnpm@10.32.1 install --frozen-lockfile --prod=false &&
npx --yes pnpm@10.32.1 --filter @workspace/api-server build
```

Then remove the temporary `BOOTSTRAP_ADMIN_EMAIL` and
`BOOTSTRAP_ADMIN_PASSWORD` variables and redeploy. Keep `DATABASE_URL` and the
existing runtime variables. No Cloudflare build changes are needed for this fix.

Verify `/api/healthz`, then `/api/app/mentor-config` (which also queries the
database), before attempting login at `/superadmin/login`. A successful build
or bootstrap does not itself verify login against the deployed backend.

## Local verification

```sh
node --test scripts/tests/bootstrap.test.mjs
pnpm --filter @workspace/scripts typecheck
```

With `DATABASE_URL` explicitly set to a disposable loopback PostgreSQL database
that already has the repository schema:

```sh
node --test scripts/tests/bootstrap.integration.mjs
```

Integration tests reject remote database hosts. They create random account
fixtures and remove only those fixture rows afterwards, without changing or
dropping tables. They verify creation, idempotence, preservation of existing
accounts, configuration errors, missing-schema errors, read-only connections
and refused connections. Production Neon was not modified or tested.
