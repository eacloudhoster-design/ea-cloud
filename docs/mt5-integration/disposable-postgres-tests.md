# Disposable PostgreSQL test setup

Local tests only. Never use production DATABASE_URL, a remote database or an existing user database. Requires Docker, local Node/pnpm dependencies, Python fastapi/uvicorn, openssl, and Playwright/Chromium for the optional browser scripts. Use the exact relevant test list in `person2-release-readiness.md`, not a blind test-directory glob.

This sample creates a NEW loopback-only tmpfs server with password authentication, the required test role and explicit disposable marker. Check that the chosen name/port are free; do not remove or repurpose an existing container/service to make them available. The image digest is the PostgreSQL 16 image used in this session.

```sh
test_dir="$(mktemp -d)"
node --input-type=module -e 'import {randomBytes} from "node:crypto";import {writeFileSync} from "node:fs";writeFileSync(process.argv[1],randomBytes(32).toString("hex"),{mode:0o600});' "$test_dir/password"
docker run --detach --name ea-cloud-pg-test --publish 127.0.0.1:55432:5432 --tmpfs /var/lib/postgresql/data --mount "type=bind,src=$test_dir/password,dst=/run/secrets/test-password,readonly" --env POSTGRES_USER=ea_db_test --env POSTGRES_PASSWORD_FILE=/run/secrets/test-password --env POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 postgres:16-bookworm@sha256:5264710be20f409750ac6dc4e5706dcef929c87e241605463f0f9aefa932a8d9 postgres -c ea_cloud.test_instance=person2-disposable
# Wait until this new server reports ready:
docker exec ea-cloud-pg-test pg_isready -U ea_db_test
# Write the private binding without placing its password in process arguments or stdout:
node --input-type=module -e 'import {readFileSync,writeFileSync} from "node:fs";const password=readFileSync(process.argv[1],"utf8").trim();writeFileSync(process.argv[2],"EA_TEST_PG_URL=postgresql://ea_db_test:"+password+"@127.0.0.1:55432/postgres\n",{mode:0o600});' "$test_dir/password" "$test_dir/fixture.env"
set -a
. "$test_dir/fixture.env"
set +a
```

Helpers validate loopback, role `ea_db_test`, admin database `postgres`, no URL query/fragment and the server-side disposable marker before creating anything. Each fixture uses a fresh random `ea_validation_*` database; teardown drops only that database. Production DATABASE_URL is never used by those helpers. Bootstrap subprocesses receive only that generated fixture binding. Real advisory locks and independently checked-out transaction clients are used; no advisory-lock shim runs on PostgreSQL. Some legacy migration/unit cases may still use `PGLITE_MODULE` when explicitly installed outside the repository.

For browser tests, export the absolute installed `PLAYWRIGHT_MODULE` (`.../playwright/index.mjs`) and optional `CHROMIUM_PATH`. `mt5-enrollment.browser.mjs` serves its own fixture app; `mt5-status-recovery.browser.mjs` expects a separately served built Pages output at the loopback `MT5_PREVIEW_ORIGIN`. Build both frontends first. Enrollment browser fixtures use a loopback-only cookie injection while asserting the actual authentication response retains Secure/HttpOnly; this is not deployed secure-cookie acceptance.

After all clients/tests have exited, remove ONLY the container and private temporary directory created above:

```sh
docker stop ea-cloud-pg-test
docker rm ea-cloud-pg-test
rm -rf "$test_dir"
unset EA_TEST_PG_URL
```

No server restart/persistence result is inferred from tmpfs. Application-process restart and fresh-process decryption are explicitly tested; production database recovery/backup acceptance remains separate.
