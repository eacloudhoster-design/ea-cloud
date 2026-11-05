# MT5 engine read-only release readiness

Post-merge review: PR131_FINAL_DEPLOYMENT_CHECKLIST.md and PR131_HARDENING_VERIFICATION.json supersede this historical release snapshot for the follow-up hardening. PR #131 was merged externally; no deployment is implied.

Continues the existing engine integration. Earlier successful lifecycle/copying/latency simulations are carried forward, not rerun. No broker orders, stop removal, execution activation, merge, production deployment or production secret change occurred.

## Release scope and pass/fail gates

| Check | Status | Evidence / limit |
|---|---|---|
| Exact demo proof, owned client/mentor status | PASS locally | Updated cookie/API integration test; no simulated success marker accepted by production transport |
| Mentor hold/connection display | PASS locally | Owned client uses backend read-only credential proof; no password/ciphertext/balance returned to mentor; previous mentor history remains excluded |
| Client status | PASS locally, existing evidence retained | Active screen calls real verification/status API, not preview; unavailable evidence stays unverified |
| Strict read-only canary | PASS locally | Separate entry point permits only health/status GETs; no queue/startup/backfill/push/login/mutation routes; expired credentials rejected without DELETE/refresh writes |
| Canary startup/restart | PASS in isolation | Refuses a writable DB setting before listening; two synthetic loopback starts, health checks and SIGTERM stops; POST rejected |
| Root publisher / Wine fail-closed | PASS in isolation | Invalid latch entries and unavailable parents stay stopped; malformed timestamps rejected; process exit/stale/restart tests; actual unprivileged Windows/Wine fixture rejects stale/missing metadata and cannot write it; SDK not imported |
| Monitoring/alert preparation | PASS locally | Installed publisher metadata checked for freshness; combined host/engine snapshots, stale alarm, durable dedup/retry/recovery tested with an in-memory sink only |
| Types/build/unit syntax | PASS | API/portal checks, isolated portal/canary builds, prepared systemd verification; no production dist replaced |
| Original DB/encryption compatibility | BLOCKED | Auditor safely refused: UNCHANGED_PRODUCTION_BINDINGS_REQUIRED; zero production rows read/modified |
| Actual external alerts/offsite restore | BLOCKED | Approved destination/access and delivered/restore evidence missing; no external message sent |
| Actual read-only rollout/reboot acceptance | NOT RUN | Requires a separately approved pinned release and environment; existing services were not switched/restarted |
| Broker execution / live deployment | DISABLED | Outside this release; both root latches active; no execution grant |

Build smoke testing found and fixed a real ESM/CommonJS interop problem in the new canary bundle: its build now supplies Node createRequire. Repeated tests were limited to changed code and focused release validation. Large frontend chunks remain a non-blocking build warning.

## Read-only canary design

`artifacts/api-server/src/engine-readonly.ts` is separate from normal API startup. `EA_ENGINE_READ_ONLY=1`, a valid port, the original encryption binding and `SHOW default_transaction_read_only = on` are mandatory before listening on loopback. It imports no normal API startup jobs. `build:engine-readonly` requires an explicit isolated EA_RELEASE_OUTDIR and refuses the normal production dist directory.

Allowed routes: GET/HEAD `/api/healthz`, `/api/readyz`, `/api/app/engine/status`, `/api/admin/engine/clients`, `/api/admin/engine/clients/:id`. Other GETs return 404; mutations return 405 before authentication or database activity. Existing verified cookies are accepted without renewing or deleting session records; this canary cannot issue new sessions. Existing normal authentication behavior is unchanged and passed regression tests.

A canary must receive existing sessions through an approved same-origin proxy path or an explicitly managed staging session fixture. Do not copy live cookies into reports or invent authentication bypasses. It requires SELECT access to browser_sessions, users, app_access, licenses, client_settings, observer_allocations and trade_executions. Worker status is a read-only internal broker query; no SDK execution endpoint is used by the canary.

Mentor status now performs a read-only proof only AFTER checking client ownership. The backend uses the already stored encrypted credential; the portal receives operational status, counts and filtered mappings/history, never the credential. An unavailable worker/key does not become a green connection. Balance/equity are not returned by these status routes.

## Precise missing bindings

- Authorized DATABASE_URL for the original production database, including correct database/schema/role and required TLS/CA/network access. Its value is not present in the current process or known EA Cloud environment files. No placeholder was substituted.
- The ORIGINAL, unchanged SESSION_SECRET capable of decrypting existing AES-GCM client ciphertext. Its value is not available locally. A demo trading password is not this key and must not be used as one.
- For the canary, an authorized SELECT-only binding to that same data with server-enforced default_transaction_read_only=on. Do not change the existing production role or replace its credentials to satisfy this. A separately supplied read-only role/URL is acceptable; no new production credential was generated.
- Accepted private router MT5_VPS_URL / MT5_VPS_TOKEN and explicit account/role mapping for the records being inspected. Reuse original secure provisioning, not the simulation gateway. Current demo terminals/read-only services remain preserved; new general worker/router versions are not deployed.
- Alert endpoint EA_ALERT_WEBHOOK_URL and, if required, EA_ALERT_TOKEN; offsite repository/access/password-file plus restore evidence. Destination values stay private; no alerts were sent during this preparation.

The existing bounded read-only encryption auditor enforces a read-only transaction and returns aggregate counts only. It must pass with nonempty original encrypted samples before claiming compatibility. No production database or secret was changed.

## Controlled rollout and acceptance steps (engineer-operated after approval)

1. Review the focused PR and selected-file manifest. Exclude runtime reports, credentials, account bundles, private keys, backup archives, native IPC traces and XAUUSD execution tooling. Pin the reviewed commit/build hashes; preserve the original staged VPS baseline and backups.
2. Obtain the private original DB/key bindings and complete the non-destructive auditor. Prepare the dedicated read-only binding and verify its grants/TLS/CA and existing schema. No normal API start/migration command is permitted for the canary.
3. Build the canary via its separate build script into an immutable release directory; render the prepared ea-engine-readonly.service ExecStart to that accepted artifact. The service identity and EnvironmentFile are approved provisioning work, not installed by this report.
4. In the approved window, provision the root stop publisher, worker/router and passive inventory dependencies as a read-only canary. The publisher reflects private latches only; it cannot clear a stop or grant trading. Never run two SDK controllers on one terminal/prefix. Preserve current read-only source/receiver services until an explicit handover is ready. Source-role defaults require reviewed provisioning; do not silently rewrite the existing mentor bundle.
5. Keep BOTH stops set and every account execution flag false. Accept current identity/path/demo/role, then verify real connection/copier/hold status through the owned client and mentor APIs with existing cookie auth. Test unauthorized client IDs, expired cookies, offline status and status-body redaction. Fees/order acceptance are NOT prerequisites for this read-only scope.
6. Verify publisher missing/stale/restarted state remains closed. Publication cadence is one second, TTL three seconds; propagation is not instantaneous and cannot undo an in-flight fill. The existing bounded financial coordinator retains direct root latch checks. No financial activation is part of these tests.
7. Install reviewed inventory/alert templates only after approval. Inventory atomically writes sanitized engine-status.json; alerts combine it with host status and flag snapshots older than 180 seconds. Accept local log retention/alarms first, then separately test approved external delivery and receipt. Empty queues do not establish delivery: positive confirmed sends are required.
8. Perform read-only process restart/cold-boot tests in the approved canary scope: service reappearance, stable account identity/journal ownership, existing cookies, no broker orders, fresh/stale gate behavior, preserved holds and no double controller. Never reboot unrelated production services as an unapproved test.
9. Roll back the canary proxy/routes and services to the prior pinned read-only release if any required check fails. Stops remain set. Preserve current ciphertext, DB state, SQLite journals and receipts; do not restore stale financial state over newer evidence. A publisher stop makes its mirror unavailable/stale and workers close their gate. Existing ROLLBACK_PROCEDURE.md principles remain applicable.

## Remaining broker requirements (not authenticated)

| Broker | Exact missing inputs / artifacts |
|---|---|
| Exness | Authorized MT5 DEMO login, exact Personal Area server, MT5 trading/investor password through secure enrollment, account type/entity/currency/margin mode. Existing official preparation binary can be reused. |
| Deriv | Authorized Deriv MT5 DEMO login/server from its dashboard, MT5-specific password, product/account type and entity/currency/margin mode. Existing official preparation binary can be reused. |
| XM Global | Authorized MT5 DEMO account ID, issued server/password, correct entity/region/account details; accepted official Windows MT5 installer from that entity or authenticated broker portal. |
| RCG Markets | Authorized MT5 DEMO ID, exact issued MT5 server/password, correct account/entity and portal context; accepted official Windows MT5 installer from broker/authorized CRM. |

BROKER_AUTH_REQUIREMENTS.md contains previously reviewed official references and the secure provisioning procedure. No server names or download links were guessed. Each new binding needs its own identity/prefix/data/journal/port acceptance with AutoTrading off. These four enrollments are not prerequisites to a JustMarkets-only read-only canary and do not become authenticated because generic profile simulations passed.

## Remaining decisions

Private original DB/key/read-only access; selected client/source account mappings and router provisioning; approved pinned read-only deployment window/scope; approved alert/offsite/recovery acceptance. A later financial test needs separate explicit scope and fresh risk/cost/isolation checks. The existing demo exclusivity commitment remains recorded; no repeated confirmation is requested for code work.

Engineering release preparation can be reviewed. Controlled production read-only deployment is BLOCKED by environment/operational acceptance, not by another trading simulation. EA Cloud is NOT production-ready and this PR does not authorize deployment or orders.
