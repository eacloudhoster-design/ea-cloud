# Final read-only deployment checklist after PR #131 review

PR #131 was merged externally by the repository owner at 2026-11-05T18:31:36Z into ddd864ee769d0878f1e7cc1dea02602bbb4f3b39. This review did not perform that merge. The original VPS checkout remains preserved; reviewing a GitHub merge does not deploy its code.

The follow-up branch is review/mt5-readonly-hardening-20261105 in /var/lib/ea-cloud/validation/engine-review-hardening. Its changes require review and a separately approved deployment. No broker orders, trading activation, stop removal, production credential changes, service restart or deployment occurred.

## Code findings resolved

| Finding | Resolution |
|---|---|
| Mentor-only router returned readiness without a receiver | Requires a receiving worker; only receivers count toward readiness. Mentors remain status-only. |
| Workers could advertise protocol readiness while permissions/holds blocked execution | Worker checks current account/path/terminal, trade/API permissions, holds and stop; router/API require explicit enabled, stop-clear and zero-hold markers. No missing flag implies permission. |
| Status sampled the stop twice and trusted the initial connection check | One stop sample drives both flags; second account/terminal snapshot must still match and remain connected. Contradictory flags are rejected by router/API. |
| Stored disconnected state could display worker-permitted | Copier state and executionPermitted now both respect the stored connection flag as well as current safety evidence. |
| Registry accepted ambiguous IDs/shared credentials | Positive integer IDs/exact server strings and distinct worker endpoints/tokens are required; worker tokens cannot equal the router credential. |
| Late portal response could display the wrong selected client | Cancelled and wrong-client replies are rejected; rendering is scoped to the current selected ID. |
| Root inventory could follow a journal path into another account | Resolved paths must remain inside that exact account's subtree; cross-account traversal/symlinks are rejected. |
| Alert corruption/destination changes could yield a crash or false proof | Invalid/overflow timestamps produce alarms; delivery receipts are scoped to the endpoint/token configuration. Historic delivery elsewhere does not certify current delivery. |
| Relocated launcher still loaded the mutable primary checkout | Worker path is derived from the launcher release. A missing reviewed worker fails closed; private credentials still cross stdin only. |
| Static routing checks could appear cutover-ready before runtime credentials | Static identity/role checks are distinct from loaded-credential acceptance; no cutover-ready result without the latter. |

## Targeted evidence

PASS: 31 Python checks (20 worker/router/mapping, 9 monitoring/alerts, 2 release-launcher checks); 3 Node checks (owned cookie/API safety snapshots, delayed/wrong-client portal response, explicit receiver capability); API/portal TypeScript checks; isolated portal and read-only API builds; Git whitespace checks. Prior passing copier simulations, latency measurements, Wine stop-mirror tests, DB fixture tests and service syntax checks were not repeated. These tests used mocks/isolated data and placed no orders. The former PR's historical manifests apply to their original commit; PR131_HARDENING_MANIFEST.json identifies this reviewed delta over that merged base.

## Production binding discovery — BLOCKED

Authorized read-only discovery inspected EA Cloud process environments, project environment stores, systemd configuration, the project PM2 store when present, additional explicit root/project helper stores, and connected owned Sites metadata. Nine project-related processes and ten project env files were inspected; no original DATABASE_URL/SESSION_SECRET pair was found. Docker is unavailable. Connected owned Sites contained no EA Cloud site; no Render/Replit runtime-secret connector is available. Test/helper values were not substituted. No secret value was printed or replaced.

Required private values/access:

- Original production DATABASE_URL, correct database/schema/role and any required TLS/CA/network access.
- Original unchanged SESSION_SECRET matching nonempty existing encrypted client records.
- Authorized SELECT-only canary binding to that original data with default_transaction_read_only=on. Do not change the current production role/secret to make the check pass.

Production compatibility is NOT VERIFIED. No production records were read or modified in this review. The existing bounded encryption auditor must pass in an explicit read-only transaction once the original bindings are available; valid fixtures do not certify production ciphertext.

## Actual local mapping findings — BLOCKED

- The two private demo identities are distinct; their service credentials are strong and distinct; both execution flags remain false. No values are exported.
- The source bundle defaults to client in the general worker; the required canary mentor role is not provisioned. Preserve the existing working logical source connection; do not overwrite its credential bundle to fix this.
- /etc/ea-cloud/router/registry.json is absent. Registry identity/role/endpoint and loaded token-credential acceptance remain incomplete.
- Both existing account endpoints intentionally return 503 on execution capabilities with explicit read-only/execution-disabled markers. This is expected safety behavior, not a broker login failure. Neither is the newly reviewed general-worker V2 contract.
- Original production mentor/client/licence/settings rows cannot be matched to these private bindings until the authorized production read-only connection exists. No rows were invented or changed.

The engineer must prepare a separate approved mentor-role canary manifest, exact receiver mapping and private registry, keeping both execution flags false. Avoid simultaneous controllers on one terminal/prefix; the old read-only endpoints remain running until an approved handover. Require exact account/demo/path/role plus loaded credential checks, not only a syntactically valid registry.

## Exact rollout gates

- [ ] Review the follow-up PR and pin its final commit/manifest; no merge or deploy is implied.
- [ ] Securely bind the original DB/key and complete the bounded non-destructive compatibility audit with nonempty original samples. Confirm the dedicated canary role/default read-only setting and TLS/access.
- [ ] Prepare and review private source/client/router mapping plus existing database ownership/licence associations. Verify service account, separate prefix/data/journal/port and loaded token identities; neither account may be silently reassigned.
- [ ] Render EVERY unit ExecStart/WorkingDirectory/module path to an immutable approved release; reject mutable-primary code paths. The corrected launcher loads its own release. Preserve account data/credential paths and verified existing connections.
- [ ] Use only the status-only canary entry point, never the normal API startup/migration path. Accept existing authorized cookies without session renewal/deletion; verify unavailable/wrong-client/blocked/held states are not shown as ready.
- [ ] Keep BOTH stops set and all account execution flags false. Accept publisher freshness, missing/stale fail-closed behavior, current permissions and zero broker execution capability. Prior Wine/gate evidence is retained; actual installed-unit acceptance still needs the approved window.
- [ ] Configure approved EA_ALERT_WEBHOOK_URL / EA_ALERT_TOKEN as needed, verify receipt for THAT configuration, log retention and stale/hold alarms. No external alert was sent during this review.
- [ ] Verify consistent backups and approved off-VPS restore/access. Do not execute retention/deletion jobs or overwrite current DB/journal state to prepare rollback.
- [ ] In the approved canary scope, perform process restart/cold-boot/proxy rollback acceptance, preserving identity, journal ownership/holds, existing cookies and no duplicate controller. Do not restart unrelated services as a test.
- [ ] Obtain explicit read-only deployment approval for that pinned release/window. Financial execution remains a separate future approval, not a flag set during rollout.

Rollback: quiesce status-only canary/proxy changes and return to the prior pinned read-only route/services. Keep both stops set. Preserve ciphertext, private account bundles, current DB rows, journals, receipts and alert outboxes. Never restore stale financial state over newer evidence or clear a hold to force startup. If any submission ever becomes uncertain in a later authorized phase, freeze new dispatches and reconcile; do not auto-retry or erase intent records.

Exness, Deriv, XM Global and RCG Markets remain unauthenticated; the existing BROKER_AUTH_REQUIREMENTS.md remains authoritative for secure demo enrollment, with XM/RCG installer acceptance additionally required. Their credentials and broker fees are not prerequisites to this JustMarkets-only read-only rollout.

Current result: code hardening and local checks PASS; production compatibility, router handover, external operations acceptance and deployment approval remain BLOCKED/NOT RUN. EA Cloud is NOT production-ready.
