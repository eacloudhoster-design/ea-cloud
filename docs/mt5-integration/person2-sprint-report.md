# Person 2 application integration review — 2026-11-08

Historical first-sprint report. See [release-readiness follow-up](person2-release-readiness.md) for subsequent PostgreSQL, provisioning and deployment-profile work.

## Scope and repository audit

Main is `e3076477fcdf4a687a019f96f9d9a70b23801815` (merge #132); preceding integration commits are #131 and #130. Remote main was fetched at sprint start. No existing worktree changes or AGENTS.md instructions were present. No merge, deployment, production database access, secret rotation or trading activation occurred.

PR #133 (`9cfd9ce`) is an open draft credential-bound read-only relay. Its application changes correctly keep unknown journal/stop values null and distinguish `read_only` from copying permission. PR #134 (`72bd2de`) is open, includes #133, and implements demo onboarding, mentor policy/audit schema, non-trading management entry, frontend status/control integration and paired HTTPS Access authentication. Both PRs have no discussion/review comments returned by GitHub. Existing code and their tests were inspected and reused. Their claims of prior production migration/broker checks are author-reported evidence, not checks independently repeated in this environment.

This branch is **stacked on PR #134**, with the draft PR targeting `feature/mt5-broker-app-sprint-20261106`. Only this sprint's changes appear in that diff. It must not be merged into or deployed from the unmerged parent automatically. If #134 changes or merges, rebase/retarget and repeat affected checks. Existing pending worker/infra changes are not copied or rewritten by this sprint.

Other open PRs: #127 startup recovery (conflicted/older main), #126 password controls, #121 artwork persistence, #103 viewport work. Their unrelated changes were not pulled into this branch. Main already has newer session/startup diagnostics. There is no checked-in `.github/workflows` tree or Render blueprint on the audited main/parent; do not invent CI or deployment evidence.

| Component | Status | Evidence and limits |
| --- | --- | --- |
| Persistent sessions / authentication | PASS | Fixture uses actual cookie-session middleware, expiry/revocation/renewal and role checks; forged identity hints denied |
| MT5 connection/disconnection | PASS | Reused owned credential-bound demo enrollment; AES-GCM encryption based on unchanged SESSION_SECRET; disconnect retains ciphertext/history |
| Mentor/client isolation | PASS | Owned status/policy and account reservation fixtures; different mentor is denied before engine probe; real PostgreSQL concurrency remains unverified |
| Status-only safety | PASS | Malformed/contradictory/live/simulated evidence denied; read-only evidence cannot permit copying; null journal metadata retained |
| Copy preferences and allocation controls | PASS | Client limits plus explicit current-mentor policy, audit insert, management route allowlist/CSRF checks; configuration is not execution activation |
| Event ingestion/history/idempotency | PASS | Existing robot-scoped event capture, source binding, unique event key, conflict detection; this sprint repairs duplicate acknowledgement reporting |
| Frontend backend integration / recovery | PASS | Built client uses backend status and exact connect identity; serialized visible-tab refresh, online recovery, cancellation and stale-state invalidation |
| Production enrollment / original identity mapping | NOT VERIFIED | Only separately provisioned demo bindings can work; arbitrary-account provisioning is absent |
| Live broker copying / latency | NOT VERIFIED | Synthetic five-worker test passes; no real broker orders or execution changes |
| Production readiness | FAIL | Review/deployment, secure route, original bindings and live browser/operational acceptance remain open |

Important behavior inherited from #134: legacy OPEN copying is deliberately disabled in favor of authenticated observer lifecycle; policies are required for dispatch. This is a material parent-PR compatibility change that reviewers must accept. This follow-up does not independently enable, remove or restore that path. Mentor disconnect is application source disconnection, not a worker emergency stop; client disconnect pauses app copying intent, does not flatten positions. Existing in-flight financial outcomes still require reconciliation.

## Changes made in this sprint

- Client MT5 status now refreshes every 30 seconds while visible, on reconnect and on foreground return. Only one read is in flight. Hidden/offline state or a failed status read invalidates verified evidence; late aborted responses cannot overwrite a new observation. Tab/session changes remove listeners/timer and cancel pending work. No connect/disconnect/trading write is retried.
- Duplicate robot-event acknowledgements return stored copyState and signal linkage instead of falsely claiming capture-only; duplicates neither route again nor wake a worker again. Changed-payload conflicts remain 409.
- Added deterministic refresh/race/offline tests and a built-client Chromium recovery scenario. Expanded existing ingestion regression to assert stable duplicate outcomes.
- Added additive migration replay/data-preservation/risk-constraint coverage. Corrected an outdated auth test to assert the existing safe 503 schema-unavailable response and no cookie; auth implementation is unchanged.
- Synthetic copier fixture now uses `EA_TEST_PYTHON` or `python3`, replacing a hardcoded VPS interpreter path. No execution worker file changed.
- Prepared [Person 1 contract](person2-engine-contract.md) covering actual routes/schemas/auth/errors/idempotency, account isolation and agreement points.

## Database and secrets

**PASS (isolated migration verification); NOT VERIFIED (production state).** No new migration is introduced or applied to any production database. The inherited `migrations/20261106_mentor_copy_policies.sql` creates `mentor_copy_policies`, `mentor_copy_policy_audit` and nullable `mt5_connections.encrypted_mt5_password`. PR #134 reports it was already committed in production. Before release, inspect schema on the intended database with read-only access; do not blindly reapply it based on this report. Existing browser-session/robot/observer schema migrations also remain prerequisites.

The isolated test applies the policy SQL twice, preserves a pre-existing connection row, verifies disabled defaults and rejects invalid risk limits. PGlite does not establish real PostgreSQL advisory-lock concurrency, managed-role grants, original ciphertext compatibility or production migration status. Existing real-PostgreSQL binding/encryption tests require a dedicated disposable server absent here. No destructive migration, schema push, production restore or key replacement was run. Preserve original DATABASE_URL, SESSION_SECRET, session cookies, encrypted rows, orphan settings and unassigned clients.

## Test evidence

Commands and results are recorded in the draft PR and final report. Tests use isolated PGlite or explicit loopback synthetic fixtures. No production credentials or broker connections are used.

- Full workspace `pnpm run typecheck`: PASS.
- Full `pnpm run build:pages`: PASS; both site and `/ea-app/` bundles verified. Existing sourcemap/chunk-size warnings remain.
- Normal API production bundle and isolated management/read-only builds: PASS. Only bundled; normal startup was not run.
- Session, authentication, account authorization, ingestion/replay, policies, management preflight, transport, migration, queue ordering, status cancellation and frontend helper suites: PASS, with explicit bootstrap fixture skip requiring real PostgreSQL.
- Pages routing/proxy/output suite: 14 PASS after building output. Initial 3 missing-dist failures were setup-order errors and passed after the build.
- Five synthetic HTTP account workers: PASS, including account mapping, disconnect recovery, restart replay, lost acknowledgements, uncertain submissions, symbols/lots/risk limits and cross-client progress. Synthetic performance is not broker latency acceptance.
- Built mobile Chromium frontend recovery: PASS; API fixtures, actual bundled client, zero API writes. Physical devices and deployed original-user browser acceptance: NOT VERIFIED.
- Lint: NOT VERIFIED — no configured lint script/configuration. `git diff --check`: PASS. No remote CI success claimed.

## Cloudflare / Render release requirements (not executed)

Cloudflare Pages retains `wrangler.jsonc`, R2 `BACKGROUND_IMAGES` bindings, build `pnpm run build:pages`, output `artifacts/ea-cloud/dist`, Functions and `/ea-app/` assets. Preserve existing `BACKEND_ORIGIN`/`BACKEND_PROXY_TOKEN` for authentication and other routes. Optional `MT5_MANAGEMENT_ORIGIN`/`MT5_MANAGEMENT_PROXY_TOKEN` apply only to the selective MT5/control/policy allowlist. Proxy tokens must be enforced at the receiving origin; adding a header alone is not protection.

Render must retain original session/database/encryption bindings and the existing authentication backend. `MT5_VPS_URL` and token must target the approved status-only gateway over authenticated HTTPS/private routing; Access credentials are paired and server-only. The isolated management entry requires `EA_MT5_MANAGEMENT_ONLY=1`, original-key/schema/privilege preflight, a valid PORT and a verified status-only gateway. It currently listens on **127.0.0.1**, so it needs an explicitly reviewed ingress/start/health arrangement; it cannot simply replace the full Render public backend. Read-only canary and management entry have different DB privileges and must not share an inferred configuration.

Normal `start` applies browser-session migration; normal `index.ts` also runs maintenance, reconciliation and queue/push processes. It is not a passive non-trading deployment path. Do not start it as a canary. No new Render/Cloudflare infrastructure, hosting move, tunnel or VPS work was done. Existing secure transport release instructions remain in `infra/linux/SECURE_RENDER_VPS_RELEASE.md`.

Release procedure after independent approval: pin reviewed parent/follow-up commits; verify backup and original-key/schema/session compatibility using private read-only evidence; resolve transport/ingress; build matched API/frontend/proxy artifacts; review deployment commands and migration necessity before rollout; test original-user sign-in, both roles' ownership, status, failure/foreground/reconnect, preferences/audit and disconnect in the deployed browser. Keep execution permissions/stops unchanged. Production release is outside this sprint's authorization.

Rollback: restore previous approved app/proxy artifact and only changed routing/transport configuration; leave original keys, session/user/account records, additive policy tables, journals and execution history intact. No DROP, stale database restore or stop clearing. Failed status reads should remain visibly unverified. If a financial outcome is ambiguous, retain the journal hold for Person 1 reconciliation.

## Remaining dependencies

Person 1: confirm exact private account/role provisioning, status origin and dedicated service auth; agree broker freshness timestamps and structured gateway errors; verify journal semantics and any future execution transport independently. General provisioning, callback/status API and remote start/stop endpoints are not assumed to exist. Application/deployment owner: validate original DB/schema/keys, real PostgreSQL locks, secure Render ingress/health and Pages routing, parent PR compatibility, browser acceptance and deployment approval. No blocker requires modifying VPS/Wine/MT5 workers in this branch.

## Reproduction and final run counts

Final suite: **28 passed, 0 failed, 1 skipped** (29 total). Pages suite: **14 passed**. Synthetic copier: **1 passed**. Built mobile recovery browser: **PASS**, zero API writes. Total: **43 automated test cases passed**, plus browser scenario; one explicit bootstrap skip. Separate original-encryption PostgreSQL test was not run against a server; its read-only refusal unit passed. Builds/typechecks completed on this branch after implementation. No lint configuration or remote CI result is available.

Use an external test-tools prefix for `@electric-sql/pglite` and Playwright; do not add production dependencies just for fixtures. Set `PGLITE_MODULE` to its absolute `dist/index.js` path and `PLAYWRIGHT_MODULE` to Playwright's `index.mjs`. Synthetic worker requires Python fastapi/uvicorn, with optional `EA_TEST_PYTHON`. Builds require the repository's frozen lockfile. This environment's pnpm 11 required a writable external store/XDG data path and `pnpm_config_verify_deps_before_run=false` after install; no package/lock/build-policy change is committed.

```sh
pnpm run typecheck
pnpm run build:pages
node artifacts/api-server/build.mjs
EA_RELEASE_OUTDIR=/absolute/isolated-management node artifacts/api-server/build-engine-management.mjs
EA_RELEASE_OUTDIR=/absolute/isolated-readonly node artifacts/api-server/build-engine-readonly.mjs
# With PGLITE_MODULE exported:
node --test --test-concurrency=1 scripts/tests/engine-integration.test.mjs scripts/tests/ea-builder-api.test.mjs scripts/tests/browser-session.test.mjs scripts/tests/management-preflight.test.mjs scripts/tests/mt5-edge-transport.test.mjs scripts/tests/mt5-engine-client.test.mjs scripts/tests/session-migration.test.mjs scripts/tests/copy-policy.test.mjs scripts/tests/mentor-policy-migration.test.mjs scripts/tests/auth.integration.mjs scripts/tests/signal-ordering.test.mjs scripts/tests/engine-readonly-boot.test.mjs scripts/tests/mt5-status-refresh.test.mjs scripts/tests/mt5-preview.test.mjs scripts/tests/mentor-status-identity.test.mjs
node --test scripts/tests/pages.test.mjs
node --test scripts/tests/copier-end-to-end.test.mjs
# Serve built Pages output on loopback :5174, export PLAYWRIGHT_MODULE:
node scripts/tests/mt5-status-recovery.browser.mjs
git diff --check
```

Initial setup issues were corrected without production changes: pnpm default user-store path was unwritable, Pages tests initially preceded their output build, isolated backend builds needed explicit external EA_RELEASE_OUTDIR, and the new browser fixture needed the current `/app/me` identity-hint field. A pre-existing authentication assertion expected generic 500 even though main already emits classified 503; the updated test preserves no-cookie/no-secret checks. Final relevant runs have no failures.
