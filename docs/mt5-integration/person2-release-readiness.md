# Person 2 release-readiness follow-up

Baseline: #135 / `44c62207c3cbc277dc89f3717ab0d477923a6e01`. Work continues on an isolated follow-up branch and updates #135. Main remains `e307647`; #133 (`9cfd9ce`) is already included in #134 (`72bd2de`); #135 is stacked on #134. No merge, deployment, production database write, secret replacement or VPS-worker modification occurred.

## Completed application blockers

- Added an explicitly non-trading full-application entry for the **existing Render service**. It keeps existing auth/session and application routers, binds 0.0.0.0/PORT, enforces the receiving Pages origin token, performs original-key/schema/grant and status-only gateway preflights, and skips automatic migration/maintenance/queue/push/WS startup. Financial ingress, direct legacy/observer dispatch and signal worker start/wake are blocked in this profile. Copier diagnostics also force executionPermitted=false if a later upstream snapshot claims worker permission. Normal startup is unchanged for separately reviewed releases.
- Added independent mentor/client pending enrollment from both frontends. Sessions derive ownership; credentials are encrypted; requests are bounded/idempotent and never claim connection or enable copying. Secure operator export checks ownership again and writes an exclusive private file; actual broker provisioning remains Person 1's responsibility. Existing Connect verifies dedicated role/account/demo evidence before binding or marking a request verified.
- Closed the cross-role account reservation gap: clients, mentors and pending requests now share the same account lock and cross-table ownership checks. Disconnected reservations remain protected; allocation rebinding protections remain intact. Current owners are locked and rechecked during connection binding.
- Made existing fixtures portable to an explicitly marked disposable PostgreSQL server. Real TCP/SCRAM PostgreSQL tests cover concurrent claims, sessions, API auth/ownership, policy/enrollment migrations, serial grants, event ingestion/replay, encryption compatibility and the synthetic five-worker copier.
- Verified the actual release binary against Person 1's unchanged relay module behind a real certificate-verified TLS edge. Negative edge/service authentication, exact role/account status, cross-owner denial, disconnect retention and application-restart session continuity pass. Upstream broker snapshots are synthetic; no SDK/broker trade was invoked.
- Prepared the existing-hosting profile, read-only transport acceptance probe, environment-key template, API contract addendum and exact deployment/rollback runbook. The probe never sends broker credentials or financial calls.

## Current status

| Component | Result | Practical limit |
| --- | --- | --- |
| PR dependency review | PASS | #135 remains stacked; parent merge/compatibility approval still required |
| Existing engine API compatibility | PASS | Actual checked-in relay + TLS/HTTP integration with synthetic upstream data; live VPS commit/broker evidence NOT VERIFIED |
| Secure transport implementation | PASS | Access + independent relay bearer auth and receiving Pages token tested; real provider policy/routing NOT VERIFIED |
| Independent app enrollment | PASS | Separate owned pending requests, encrypted storage, private handoff and proof-based completion; actual VPS provisioning BLOCKED pending Person 1 |
| Ownership / isolation | PASS | Real PostgreSQL concurrency, cross-role/client/pending/disconnected reservations and current-owner checks |
| Existing auth / persistent sessions | PASS | Real middleware/API and real release process restart against PostgreSQL; deployed original-user acceptance NOT VERIFIED |
| Database compatibility / migrations | PASS in isolation | New additive enrollment migration required; production schema/role/original ciphertext NOT VERIFIED here |
| Same-hosting deployment configuration | PASS in repository | No service replacement/new hosting; provider settings and authorized rollout NOT VERIFIED |
| Production readiness | NOT VERIFIED / BLOCKED | Needs Person 1 provisioning agreement, original production bindings, live transport/provider/browser acceptance and explicit release approval |

## Production dependencies, not bypasses

Render plugin discovery found an unconnected Render integration; it had already been suggested recently, so it was not suggested again. No Cloudflare hosting-management tool or provider credential binding is available. No missing connection was treated as permission to deploy using another service. The exact original Render/Pages settings therefore remain unverified. These are external acceptance gates, not a reason to change hosting.

Person 1 must confirm the deployed status origin/version, Access/relay credentials, supported private bindings and capacity; agree to the operator enrollment packet and provision independent demo identities through their existing process. No `/provision`, execution callback or remote start/stop API is assumed. New unknown account identities cannot be connected merely by entering credentials in the app. Keep all existing execution flags/emergency stops unchanged. General automatic provisioning is not claimed.

New DB migration: `migrations/20261108_mt5_enrollment_requests.sql`, additive only. It was applied repeatedly to isolated test databases; **not production**. Its table/index must precede this application version because connection ownership checks include pending reservations. Old policy migration status comes from #134's author report and still needs live schema inspection. Rollback retains additive tables and all old credentials/sessions/financial state. See [runbook](person2-release-runbook.md).

## Test reproduction and scope

The test server is a disposable Docker PostgreSQL 16 instance, bound only to loopback, with SCRAM password authentication and the explicit server marker `ea_cloud.test_instance=person2-disposable`. Helpers refuse non-loopback URLs, the wrong test role/admin DB or a missing marker, and never read production DATABASE_URL. Each fixture creates a random `ea_validation_*` DB and drops only that DB on teardown. Private test connection values stay outside Git. Source and worker simulation data are synthetic.

With the private `EA_TEST_PG_URL` for that marked server, optional `PGLITE_MODULE` for legacy in-memory cases, and local Python fastapi/uvicorn installed, run the relevant Node suites with `--test-concurrency=1` (the session bundler uses shared scratch filenames). Dedicated tests include `engine-postgres-binding`, `management-grants-postgres`, `mt5-enrollment`, `engine-api-compatibility`, `nontrading-release`, `postgres-encryption-compat`, `release-profile`, `mt5-transport-probe` and the existing account/session/event/policy/proxy/copier regressions. The compatibility test requires openssl to create a short-lived local CA fixture and preserves inherited CA trust.

Built frontend checks: `scripts/tests/mt5-enrollment.browser.mjs` uses actual cookie-authenticated enrollment routes and PostgreSQL for both mentor/client requests, verifies encrypted storage/reload persistence and makes no connection/execution call; unrelated dashboard/status reads are fixtures. `mt5-status-recovery.browser.mjs` checks the existing recovery flow with API fixtures. Chromium device emulation is not native-device or deployed-browser acceptance.

Workspace TypeScript, complete Pages builds, normal API build, isolated management/read-only builds and the new non-trading build are required. The normal build is not started. Frozen install with scripts disabled passes. No configured lint command exists; whitespace checks run. Remote CI success is not claimed.

## Final verification results

- **53 distinct automated cases passed, no remaining skips in the relevant set**: 39 core/real-PostgreSQL/transport/copier/frontend-unit cases plus 14 Pages cases. The initial core run had 38 pass/one bootstrap skip; the actual bootstrap CLI was then connected to the isolated TCP server and its five-case auth suite passed, resolving that skip. It verifies create-once behavior and preservation of existing password/role. Affected export/preflight/TLS tests were rerun after the final hardening and passed.
- **Two built-frontend browser scripts pass**: mentor/client enrollment persists through reload against real cookie sessions/PostgreSQL; client status becomes unverified on failure/offline and recovers online without replaying writes. A stale old preview listener was replaced with a fresh loopback static server before the recovery rerun.
- **PASS**: workspace TypeScript; frozen install with package scripts disabled; complete Pages production build; normal API bundle; isolated management/read-only builds; new non-trading runtime and private-export build. Existing Pages sourcemap/chunk warnings remain. `git diff --check` passes. Lint is not configured; live provider/browser/MT5 acceptance and remote CI remain NOT VERIFIED.
- **PASS**: actual certificate validation and independent edge/Bearer negative tests, unchanged relay module, role/account binding and application-process restart with the same PostgreSQL session cookie. Encrypted legacy-format fixtures decrypt with the same key after fresh module/process loads and fail with changed/missing/tampered keys; production ciphertext was not accessed.
- **PASS**: actual PostgreSQL table/sequence grants under a restricted role, cross-role/client/pending/disconnected claim races, additive migration replay and event idempotency. The five-account copier runs only synthetic authenticated HTTP workers; zero broker orders. Its timing is not live latency acceptance.
- VPS/infra files are unchanged. Relay source SHA-256 reviewed: `1a505826730a0d6b7dceca943b138408387094b880bc1ab430dc45b63d901b39`.

Exact relevant automated set (export the private marked-server `EA_TEST_PG_URL` and optional legacy `PGLITE_MODULE` first):

```sh
node --test --test-concurrency=1 scripts/tests/auth.integration.mjs scripts/tests/browser-session.test.mjs scripts/tests/copy-policy.test.mjs scripts/tests/ea-builder-api.test.mjs scripts/tests/engine-api-compatibility.test.mjs scripts/tests/engine-integration.test.mjs scripts/tests/engine-postgres-binding.test.mjs scripts/tests/engine-readonly-boot.test.mjs scripts/tests/management-preflight.test.mjs scripts/tests/management-grants-postgres.test.mjs scripts/tests/mentor-policy-migration.test.mjs scripts/tests/mentor-status-identity.test.mjs scripts/tests/mt5-edge-transport.test.mjs scripts/tests/mt5-engine-client.test.mjs scripts/tests/mt5-enrollment.test.mjs scripts/tests/mt5-preview.test.mjs scripts/tests/mt5-status-refresh.test.mjs scripts/tests/mt5-transport-probe.test.mjs scripts/tests/nontrading-release.test.mjs scripts/tests/postgres-encryption-compat.test.mjs scripts/tests/release-profile.test.mjs scripts/tests/session-migration.test.mjs scripts/tests/signal-ordering.test.mjs scripts/tests/copier-end-to-end.test.mjs scripts/tests/pages.test.mjs
```

No production schema/key/credential values, private account manifests or backups are included in these artifacts. The final release remains blocked on the external acceptance/approval gates, not on the local regression set.

Final status hardening: a non-trading API now reports `applicationExecutionBlocked:true` and `executionPermitted:false` even if a later upstream snapshot claims worker permission; otherwise permissible proof reports `release_blocked`. The owned-API regression was rerun with the isolated PGlite fixture, and API TypeScript/non-trading builds passed. This did not add a new distinct case to the 53-case count or change the VPS protocol.
