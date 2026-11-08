# Authorized non-trading application release — existing hosting

This is a prepared configuration, not a deployment record. It requires explicit approval of the commits, additive migration and release window. It does not authorize execution, a hosting move, a new Render service, a tunnel installation or a VPS worker change.

## Reviewed topology and scope

Use the existing Cloudflare Pages project and existing Render `ea-cloud-api` service. The new `application-nontrading.mjs` entry wraps the existing application router, retaining the actual auth/session, account, policy and normal application routes. It binds `0.0.0.0:$PORT`, so it resolves the old management entry's loopback-only hosting gap without replacing infrastructure. No migration, seed, backfill, stale-account maintenance, queue reconciliation, signal worker, push scheduler or WebSocket server is started. Push delivery and live WebSocket updates are intentionally not part of this profile; REST reads and session authentication remain available.

The entry requires explicit `EA_RELEASE_MODE=nontrading` and `EA_MT5_MANAGEMENT_ONLY=1`, original-key/schema/privilege preflight and the existing status-only gateway capability response. Financial ingestion/activation writes are denied before routing; direct legacy and observer execution transports also fail closed, and signal worker start/wake is blocked. Financial permission cannot be restored by saving a client preference or mentor policy. Do not use the normal `start`/`index.mjs` entry as a passive canary: it has maintenance, migrations and queue startup behavior.

`deploy/application/nontrading-profile.json` is review metadata for updating an existing service. It is not an applied Render blueprint. `nontrading.env.example` lists variable names, never private values. Node 24.22.1 and pnpm 11.25.0 were tested. Review any existing runtime pin rather than silently changing it. Installation uses the frozen lockfile with package scripts disabled; application builds were verified with that policy.

## Gates before any production write

1. Review PR dependency order: #133 is included in #134; #135 is stacked on #134 and contains both Person 2 follow-ups. Review #134's legacy OPEN disablement and required mentor policy as material compatibility changes. Do not merge all PRs independently and duplicate their commits. Pin the approved final tree; rebase/retarget #135 after parent changes and repeat affected checks.
2. Record the existing Render service ID, build/start/runtime/health settings, Pages variables/bindings and prior artifact. Preserve all unrelated configuration. Keep automatic deployment disabled for the review and keep skip-deploy commit markers. No hosting configuration was inspected through a provider account in this session: Render is not connected and no Cloudflare management connector is available.
3. Privately verify the ORIGINAL `DATABASE_URL`, `SESSION_SECRET`, database/schema/TLS/CA and role. Never replace them with fixture bindings. Verify original ciphertext using the bounded read-only audit (`node infra/linux/check-postgres-encryption.mjs`) when MT5 records exist. Empty MT5 evidence is not successful historical compatibility: the management preflight instead requires valid existing API-key ciphertext/hash evidence for first enrollment.
4. Inspect actual schema and take/verify the normal recoverable backup. #134 reports its policy/audit/mentor-password migration was already applied; this was not independently verified here. Check it, browser-session schema and existing tables before deciding whether any old migration is needed. Preserve existing records, unassigned clients and orphan settings.
5. Review and separately approve **new additive** `migrations/20261108_mt5_enrollment_requests.sql`. It creates the enrollment table and unique account index with bounded transaction/lock timeouts; it does not modify old records. It must exist before this application version handles connection/enrollment calls. With the operator's private libpq service binding already configured (PGSERVICE/PGSERVICEFILE), apply only after approval:

```sh
psql --set ON_ERROR_STOP=1 --file migrations/20261108_mt5_enrollment_requests.sql
```

Do not put connection URLs/passwords in command arguments, logs, tickets or Git. Do not use schema push/force. The migration was tested twice on isolated PostgreSQL; no production migration ran here.

6. Retain the existing application DB role. New enrollment operations require SELECT/INSERT/UPDATE on `mt5_enrollment_requests`; account connection/policy operations require existing table writes plus USAGE on `client_settings`, `mt5_connections` and `mentor_copy_policy_audit` ID sequences. Auth requires existing users/app_access writes and ID sequences plus browser-session SELECT/INSERT/UPDATE/DELETE. Locking owner rows requires UPDATE privilege. Startup now verifies these table/sequence requirements. It does not grant privileges or validate every optional platform feature's permissions. Never use the test superuser as production configuration.
7. Read-only collision review: count identities shared across old client settings and mentor connections before release. New code refuses cross-role/owner claims, including disconnected or pending reservations. It deliberately does not repair or delete historical collisions. Resolve any real collision through owner review and reconciliation, not by changing account IDs or releasing another tenant's reservation.

## Secure Render → existing VPS status gateway

Person 1 must provide the approved HTTPS **status-only** origin and private account/role bindings. A hostname in a template is not a provisioned endpoint. Existing accounts must remain isolated by login/server, role, terminal, upstream token and journal. Do not expose SDK/financial routes or change worker code.

At the existing edge, require a Cloudflare Access service-token policy for the status hostname, then preserve the gateway's separate Bearer authentication. Only `/healthz`, `/observer/capabilities`, `/observer/account-status` and the existing `/connect-mt5` alias belong to this status service. Do not substitute a closed execution worker for the read-only protocol or expose other paths.

Privately configure on Render:

| Variable | Required value / source |
| --- | --- |
| `MT5_VPS_URL` | Approved HTTPS origin, without path/query/fragment or URL credentials |
| `MT5_VPS_TOKEN` | Existing dedicated status-relay bearer credential; preserve the correct binding |
| `MT5_ACCESS_REQUIRED` | `1` |
| `MT5_ACCESS_CLIENT_ID` / `MT5_ACCESS_CLIENT_SECRET` | Paired private Access service token, distinct from the relay/session/origin credentials |
| `EA_APPLICATION_ORIGIN_TOKEN` | Same private value as Pages `BACKEND_PROXY_TOKEN`, 43–128 URL-safe characters; receiving entry enforces it |
| `EA_RELEASE_MODE` / `EA_MT5_MANAGEMENT_ONLY` | `nontrading` / `1` |
| `NODE_ENV` | `production` |
| `PUBLIC_WEBSITE_ORIGIN` | `https://eacloudhoster.online`, with any other approved origins retained in `AUTH_ALLOWED_ORIGINS` |

Preserve original DATABASE_URL/SESSION_SECRET and all unrelated variables. Do not configure observer execution credentials to make status work. Do not set `EA_ENGINE_READ_ONLY=1` on this writable management profile. Render supplies PORT; the entry accepts 1024–65535.

From an authorized Render shell, with private variables already present, run:

```sh
node scripts/check-mt5-status-transport.mjs
```

The script makes four bounded GETs only: missing edge auth must return 401/403; correct edge with missing relay auth must return 401/403; both credentials must return read-only health 200 and the intentional capabilities **503** with execution/journal capability flags false. It sends no broker credentials, follows no redirects, never calls a financial path and emits only fixed safe results. It refuses plaintext remote origins and incomplete authentication. Its code passed a real local TLS-edge → unchanged relay test; actual Cloudflare/Render acceptance remains pending.

## Exact existing-service build and start configuration

After explicit release approval, update the existing service's reviewed settings (no new service/blueprint):

```sh
# Build command, repository root:
npx --yes pnpm@11.25.0 install --frozen-lockfile --prod=false --ignore-scripts && EA_RELEASE_OUTDIR="$PWD/artifacts/api-server/release-nontrading" npx --yes pnpm@11.25.0 --filter @workspace/api-server run build:application-nontrading
# Start command:
npx --yes pnpm@11.25.0 --filter @workspace/api-server run start:application-nontrading
```

The output lives beneath `artifacts/api-server` so external runtime dependencies resolve through the installed package node_modules. Do not copy the binary alone into an arbitrary directory. Build to an isolated path; normal `dist` is rejected. No migration is hidden in the start command.

Render health path: `/api/healthz` (public fixed liveness only). `/api/readyz` requires the origin token and checks the database. Startup must already have passed original-key/schema/grant and status-gateway preflights. Startup errors expose a fixed phase (`configuration`, `database_preflight`, `gateway_preflight`, `application_load`, `origin_binding`, `listen`), never raw DB errors or secrets. Health does not establish broker login or copying readiness.

Cloudflare Pages build: `pnpm run build:pages`; output `artifacts/ea-cloud/dist`. Preserve the Functions, `/ea-app/` bundle, `_headers`, existing R2 `BACKGROUND_IMAGES` bindings and original `BACKEND_ORIGIN`. Set/verify privately that Pages `BACKEND_PROXY_TOKEN` matches Render `EA_APPLICATION_ORIGIN_TOKEN`. Never expose it through VITE variables. The Pages proxy replaces caller-supplied origin tokens, and the new entry enforces the receiving side.

If `MT5_MANAGEMENT_ORIGIN` is already configured, inspect its destination and matching `MT5_MANAGEMENT_PROXY_TOKEN` before release; do not silently clear or overwrite it. This single-service profile can serve all application routes on the original Render backend, so a second hosting service is unnecessary. Any selective management route must target the reviewed receiving profile with the correct token. Enrollment paths are now included in that optional allowlist.

## Independent enrollment / Person 1 handoff

Both frontends now offer **Request demo provisioning** independently of Connect. Existing client/portal cookies determine the owner; caller-supplied owner IDs are rejected. Requests return 202 pending, not a connection claim. The app records role/owner/current mentor, exact broker/login/server and AES-GCM encrypted credentials. Duplicate same-owner requests keep the same request ID; credentials can be corrected without upstream replay. Cross-owner/role/existing/disconnected reservations return 409. Requests are limited to ten submissions/hour and eight pending per owner; this is an application queue limit, not a promise of VPS capacity. No app settings, copying flags, terminals, policies or broker sessions are created by the request.

New APIs: `GET/POST /api/app/mt5-enrollment` and `GET/POST /api/admin/mt5/enrollment`. Client requests require approved session/licence/current mentor; mentor requests require approved portal identity. GET returns only the owner's metadata, never ciphertext/password. The full contract addendum is in `person2-engine-contract.md`.

There is deliberately no invented VPS `/provision` endpoint. An authorized operator can create a private handoff after checking ownership again:

```sh
# Original private DATABASE_URL/SESSION_SECRET and selectors are supplied via the secure shell environment.
# EA_ENROLLMENT_EXPORT=1
# EA_ENROLLMENT_REQUEST_ID=<reviewed pending UUID>
# EA_ENROLLMENT_EXPORT_PATH=<new file inside an existing mode-0700 private directory outside Git>
npx --yes pnpm@11.25.0 --filter @workspace/api-server run export:mt5-enrollment
```

The command uses a read-only transaction, refuses missing/reassigned/unapproved owners, existing files, any destination inside a Git tree, symlinks at the destination or a non-private directory, and writes a new mode-0600 file. It never prints credentials, posts to a VPS, marks a request verified or changes workers. The file contains `EA_APP_DEMO_ENROLLMENT_V1`, the request ID/application owner, requested role/broker/login/server, password, requested demo mode, `brokerIdentityVerified:false` and `executionEnabled:false`. It is sensitive: use only the owner's approved private secret-transfer channel to Person 1, never GitHub/chat/email attachments or public storage. Remove it according to the approved secret-retention procedure after use. Never give Person 1 the app's SESSION_SECRET.

Person 1 must agree to this operator packet/import process, validate actual broker demo identity and provision separate existing status bindings through their established secure process, with all execution controls unchanged. The packet is an application request, not evidence of broker ownership or demo mode. Existing relay capacity and platform support must be checked before provisioning. There is no automated rejection/cancellation/reassignment or capacity allocation in this release; unsuccessful requests remain pending for operator review. Do not delete/reassign reservations to force a successful enrollment.

After provisioning, the owner re-enters credentials and uses existing Connect. Only a fresh exact gateway proof of login/server/broker/role/demo mode can bind the account and mark its owned request verified. That transaction rechecks current ownership under locks, retains existing isolation/reconciliation guards and does not enable execution. No callback status is trusted. A verified request means proof succeeded at that time; current broker connection status always comes from the normal status read.

## Required live acceptance and rollback

After authorized deployment, verify original-user login, existing cookies after reload/restart, CSRF rejection, forged-hint denial, own mentor/client lists and cross-owner 404; pending enrollment persistence and no connection/copying claim; independently provisioned exact-role Connect; read-only status; wrong-account/credential/stale/unavailable evidence; online/foreground recovery; owner-only disconnect retaining reconciliation data; policy/audit persistence without execution. Check missing origin token, missing edge token and missing relay token independently. A deployment health check alone is insufficient. Leave both emergency stops and all worker execution controls untouched.

Rollback restores the previous approved Render/Pages artifacts, build/start settings and only the reviewed configuration changes. Preserve original keys, sessions, users, encrypted credentials, journals, allocations and execution history. Leave additive enrollment/policy tables in place; old code ignores them. Do not DROP tables, restore stale financial state, clear stops, automatically replay submissions or turn on the old normal entry to make a canary green. Reverting from this explicit non-trading profile to an execution-capable profile requires its own approved release review.
