# Explicit authoritative dispatch preparation

Base: `655e383e57925f6a651831a82d36c3967664c5b6`, verified on its expected branch
with a clean working tree. Development branch:
`feature/person2-authoritative-dispatch-20261110`.

## Verified findings

- `executeObserver` validates source event/robot/EA, follower licence/current
  mentor, retained allocation and policy limits. Its default `observer-vps.ts`
  transport previously used a global URL/token without an account allowlist or
  router identity/assignment check. Pointing it accidentally at a direct worker
  could bypass the configured account router.
- The same transport treated a thrown request/lost response as retryable with no
  uncertainty evidence, and accepted positive demo markers even alongside
  `uncertain:true`. A baseline-only offline reproduction confirms both results
  in `before.json`. No actual remote service or SDK was contacted.
- Legacy CLOSE/MODIFY handling in the copy engine called a separate MT5 URL using
  retained OPEN tickets. It could avoid the assigned absolute-target path. This
  was source-traced; the new regression seeds a legacy ticket and verifies these
  requests stop without any direct transport call.
- Existing `account_dispatch.py` already pins exact login/server to one dedicated
  loopback worker and rejects duplicate account/endpoint/credential assignments.
  Its successful capability response did not advertise the exact receiving
  assignments or a router-specific service marker. Its sync response checks also
  admitted contradictory success/uncertainty and queued success acknowledgements.
- Existing local assignment bindings, StateLease locks, gateway fence witnesses,
  durable command/SDK journals, final stop checks and recovery holds remain the
  enforceable single-domain safety controls. They do not coordinate independent
  roots/hosts, copied credentials or cloned services.

## Exact changes

`artifacts/api-server/src/lib/observer-vps.ts`:

1. Require an explicit bounded account-to-origin allowlist. Reject missing,
   empty, malformed, duplicate, conflicting or unknown assignments before any
   execution POST; no per-request destination override or fallback exists.
2. Authenticate a readiness GET to the pinned origin before every POST. Require
   the router-specific service marker, an exact receiving login/server/broker/role
   set matching the configuration and the existing journal/demo/stop/hold flags.
   Direct/generic worker capabilities cannot satisfy this contract accidentally.
3. Separate unverified/preflight rejection (zero submissions, attempts zero) from
   post-send transport uncertainty. Lost/non-JSON/malformed/contradictory or
   queued-success outcomes fail closed with uncertainty and no automatic retry.
   Retry is allowed only for an explicit authenticated 503 response asserting
   failed execution, `submission_started:false`, and `retriable:true` without
   uncertainty. HTTP status alone is never retry permission.

`artifacts/api-server/src/lib/copy-engine.ts`:

Legacy ticket CLOSE/MODIFY now record a skipped/manual-reconciliation reason;
there is no fallback to the separate MT5 URL. Existing legacy positions are not
closed, modified, adopted or silently converted to absolute targets. Operator
reconciliation is required for them. Queue processing/skip status is not a broker
execution receipt. Existing absolute-target, risk and owner checks are unchanged.
The old transport utility remains in source for separately reviewed callers; no
application copy-engine branch calls it for financial execution.

`vps-mt5-service/account_dispatch.py`:

The existing authenticated capability response now includes
`service:'ea-cloud-account-router-v1'` and receiving-only
`assignments:[{login,server,broker,role:'client'}]`. No upstream URL, service token,
password or credential selector is exposed. Malformed, contradictory or
non-200 positive worker receipts are returned as uncertain failures. Worker
selection, credential-bound forwarding, journals, leases and emergency stops were
not rewritten.

Tests add two focused application transport cases and two router cases. Existing
transport fixtures now provide the required assignment/readiness contract; they
still exercise real classification rather than passing through missing config.
The existing guarded integration adds legacy-ticket bypass refusal, retaining
its worker interruption/restart, duplicate, risk, owner and stop assertions.
No new execution engine, SDK implementation, database, broker or distributed lock.

## Prepared configuration contract — not applied

`OBSERVER_MT5_ACCOUNT_ASSIGNMENTS` is a JSON array of exactly these fields per
receiving account: numeric positive `login` (within the current 32-bit schema),
exact nonempty `server`, supported `broker`, and canonical `gatewayOrigin` equal
to the origin of the existing `OBSERVER_MT5_VPS_URL`. All entries currently use
that one configured router; multi-origin selection/failover is not implemented.
The account identity is login/server; changing broker does not evade duplicate
checks. The list must exactly match the router's receiving-account set.

Keep actual account identities/configuration private and obtain Person 1's
approval before choosing or applying any origin, credential or manifest. This
change does not populate that variable or alter any production configuration.
Missing configuration and older routers lacking the contract are intentionally
refused. Any future rollout requires coordinated review of both sides; no
fallback to the old behavior is supported. The nontrading release still rejects
financial dispatch before any assignment/network work, and no configuration here
grants trading permission.

The capability snapshot is a readiness check, not an execution grant. Existing
worker stop/hold/ownership guards must still recheck immediately before effects.
No root, journal, lease, request ID or recovery hold is reset by this change.

## Validation and evidence

Final results: **18 Node integration/transport tests and 172 Python regressions
passed, 0 failed, 0 skipped**. API TypeScript, Python source compilation and
whitespace checks passed. New top-level cases: two Node and two Python router
tests; existing guarded integration also gained the legacy-bypass assertions.

See `evidence/authoritative-dispatch-20261110/` for final counts, source hashes,
baseline reproduction and logs. Tests use mocked fetch responses, disposable
PGlite, synthetic SDK workers and authenticated loopback HTTP/private IPC only.
Mocked `simulation:false`/demo wire markers test the existing future-demo contract;
they are not evidence of actual demo/MT5 operation.

Coverage: valid/missing/duplicate/conflicting/unknown assignments; wrong router
or broker manifest; active stops/holds; credential redirect refusal; lost,
malformed and contradictory receipts; explicit safe pre-submission retry;
nontrading release refusal; legacy bypass refusal; licensed routing/isolation,
risk policies, duplicates, worker restarts, fencing and durable recovery.

Native Windows, Wine acceptance, real PostgreSQL contention, production hosting,
actual terminal/SDK operation and unrelated UI suites were not rerun or claimed.
Existing comprehensive synthetic history regressions remain separate from real
trade-history acceptance.

## Remaining Person 1 decisions and infrastructure dependencies

1. Approve the authoritative origin/service identity, private credentials,
   receiving-account manifest ownership and enrollment-to-worker provisioning.
   The application still validates licence/owner separately; this allowlist is
   not a replacement for those checks or automatic enrollment provisioning.
2. Ensure that origin resolves to one durable execution domain. The service
   marker identifies a protocol implementation, **not a unique durable authority
   instance**. Two independent hosts/roots can advertise the same manifest.
   DNS/load balancing/cloned services must not silently fan an account out to
   independent authorities. No cross-host exclusion guarantee is made.
3. Define a quiesced, operator-reviewed reassignment procedure preserving account
   binding, journals, deduplication receipts, stop state and unresolved holds.
   Existing workers reject mismatched local bindings on restart, but copied
   credentials, fresh roots or changed deployment manifests cannot be globally
   prevented by local files. No automatic handover/recovery reassignment exists.
4. Agree handling/display of legacy-ticket reconciliation, failed preflight and
   uncertain results. No legacy position was changed by this safety preparation.
5. Official SDK/native Windows/terminal acceptance, real history mapping and
   deployment acceptance remain unverified. The simulation IPC candidates are
   not thereby an approved production service; hosting selection and production
   connection require separate decisions and authorization.

Ready for GitHub review after local verification/commit, not deployment or
execution release. No push, merge, deploy, production configuration changes,
real SDK calls, broker connections, real orders, trading activation or removal
of emergency-stop protections occurred.
