# Read-only release follow-up

PR #132 was merged externally on 2026-11-05 at commit e3076477fcdf4a687a019f96f9d9a70b23801815. Its hardening is already on main; this follow-up does not restart that work.

## Reviewed change

The credential-bound status relay reuses the two working read-only account APIs. It never imports the MT5 SDK, starts a Wine controller, creates a trading journal, changes account manifests or offers financial routes. Incoming credentials and exact account/demo/path evidence are mandatory. Every upstream query is an authenticated GET to a distinct configured loopback endpoint. Execution capabilities return 503.

The API distinguishes this explicit status-only protocol from execution-worker evidence. A verified connection is not copying permission. Missing journal holds and stop metadata remain null, never fabricated zero/false. Existing strict execution-worker proof remains required for that separate mode. Logical mentor/client roles are explicit relay bindings; the old source manifest remains untouched.

## Verification

- Four relay security/identity/route isolation tests pass.
- Account-owned API contract regression passes, including valid read-only proof and malformed/contradictory proof rejection.
- Shared library and API TypeScript checks pass; isolated read-only API build passes.
- New unit template passes systemd syntax verification; it has NOT been installed or started.
- Both actual existing demo APIs returned authenticated read-only evidence through the new relay with source/client role bindings.
- Actual receiver evidence passed through an ephemeral loopback relay and real account-owned Node API routes to both frontend status consumers. Database ownership/session context was an isolated PGlite fixture; production database, original encryption compatibility, browser DOM and deployed UI acceptance were NOT tested. The temporary relay was stopped afterward.
- No new SDK controller, broker orders, production writes, secret replacement or deployment. Existing 15 services remain active and both emergency stops remain set.

Private account values and credentials are excluded from this document and Git. Private verification evidence lives on the VPS in READONLY_RELAY_*_VERIFICATION.json and READONLY_RELAY_SAFETY.json.

## Exact remaining deployment gates

1. Securely locate the ORIGINAL production DATABASE_URL and unchanged SESSION_SECRET, database/schema/role, TLS/CA and network access. Prior authorized discovery found no usable pair. Do not substitute fixture keys. Run the existing bounded compatibility audit against nonempty original ciphertext in a SELECT-only transaction. Confirm default_transaction_read_only=on for the separate canary binding.
2. Match actual production client, mentor, licence and encrypted account settings rows to the two private relay bindings without writing rows. Fixture ownership does not establish these associations.
3. Approve a pinned immutable release path; replace the illustrative `readonly-relay` release alias in the proposed unit with the approved commit directory. Review Python environment/dependency provenance and create the least-privilege relay user only in the approved rollout. Do not install the proposed unit during review.
4. Review root-only readonly-relay registry, selected LoadCredential bindings and a dedicated strong relay token distinct from both upstream tokens. Registry schema: accounts[{broker,login,server,role,url,password_credential,api_credential}]. The source and receiver selectors are source-password/source-api and client-password/client-api. Keep actual identities, tokens and registry outside Git. Bind only loopback; API MT5_VPS_URL/TOKEN must target this relay. No general-worker router handover or source-manifest rewrite is required for this status-only option.
5. Configure the separate read-only canary entry point, existing authorized cookie handling and limited proxy routes. Never run normal API startup/migrations for this canary. Verify real deployed client/mentor ownership, stale/unavailable/wrong-account/held status and cache behavior using production read-only bindings.
6. Configure approved external alert destination/token; test receipt and stale/hold/unavailable alarms for that exact configuration. alerts.env remains absent. Verify log retention, off-VPS backup restore access and redacted operational output. Existing monitor/receipt tooling remains prepared; external delivery has not passed acceptance.
7. In an explicitly approved window, accept canary restart/reboot behavior, loss of upstream/credentials, isolated Wine stop-metadata freshness gates, proxy rollback and unchanged account identities. Do not restart production services merely to complete this review. Both emergency stops stay active and all execution flags false throughout.
8. Obtain explicit read-only deployment approval for the pinned release/configuration/window. Merge, deployment and financial execution are separate approvals.

## Monitoring and recovery

Probe loopback relay health plus credential-bound account status through the API; HTTP health alone is not broker login proof. Alert on verification failure, stale observations, unavailable/unknown journal evidence and any unexpected financial capability. Do not interpret read_only or unknown holds as healthy execution readiness. Keep authentication/access logs free of request bodies and bearer credentials. The proposed service restarts on failure without spawning another SDK controller.

Rollback only the new canary proxy routes and new status-only services to the prior pinned route. Preserve current database records, original key, private account bundles, journals, holds, receipts and backups. Never restore stale financial state, clear a stop or rewrite an account identity to make health pass.

Exness, Deriv, XM Global and RCG Markets remain unauthenticated. Their existing BROKER_AUTH_REQUIREMENTS.md lists secure enrollment requirements; XM/RCG installer acceptance is additionally outstanding. These are not prerequisites for a JustMarkets-only read-only rollout.

Result: local read-only integration PASS; production binding/ownership and operational rollout acceptance BLOCKED/NOT RUN. EA Cloud is not production-ready. No external CI result is claimed.
