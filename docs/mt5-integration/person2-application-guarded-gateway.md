# Application to guarded gateway: offline integration verification

Base: `e323accff824ba0880bf7884ed9ace449fe25f72`, verified clean on the requested
branch before work. Development branch:
`feature/person2-application-guarded-gateway-20261110`.

## Findings: the complete flow and its boundaries

| Step | Actual repository path and integration status |
| --- | --- |
| 1. Authentication/licence | `browser-session.ts`, `requireAuth`, `requireAppSession` and `app-session-access.ts` validate cookie principals, role and owned active licence/mentor. Verified separately through existing actual Express/session tests. No public identity-hint bearer token becomes worker authority. |
| 2. Enrollment | `routes/mt5-enrollment.ts`, `account-ownership.ts` and `enrollment-export.ts` reserve login/server under an owner, encrypt credentials and provide a private manual operator handoff. Enrollment does not automatically assign a simulation/real worker. Existing enrollment tests remain relevant; no account was connected here. |
| 3–4. Authorization/risk | `runSignal` selects mentor-linked approved followers; `executeObserver` verifies source event/robot/EA, licence, current owner and retained allocation. `effectiveCopySettings`, volume mapping and mentor/client caps constrain the target. Policies/preferences alone do not release worker gates. |
| 5–6. Ingestion/routing | Scoped EA authentication and validated snapshots route through `ea-builder/routing.ts` into durable events/signals. Legacy ingestion and observer activation share existing exclusion rules. The new integration test calls actual validated `routeSnapshot` and `runSignal`; public HTTP authentication is exercised in separate regression suites, not claimed as a single browser-to-SDK test. |
| 7. Request | `executeObserver` creates the absolute-target request and supports an existing injected dispatcher. The default HTTP dispatcher in `observer-vps.ts` expects a non-simulation demo receipt and is blocked in the nontrading release. It was not weakened or enabled. |
| 8. Assignment | Application DB reservations, configured account routes and local authority registration are distinct domains. This offline bridge explicitly registers immutable synthetic bindings and rejects unknown login/server; there is no dynamic request-driven registration or fallback. Production assignment from approved enrollment remains an operator/infrastructure dependency. |
| 9–11. IPC/gateway/SDK | Previously the copier end-to-end fixture reached older `AccountWorkers`, not the newer fenced gateway. The extended fixture now also routes actual application requests to existing `SimulatedHost`/`PipeLink` → a separate existing `SharedAuthority` gateway process → its signed internal `FencedEngine`/`AdapterEngine` → existing `SimulatedBroker`. Assignment, HMAC/correlation, lease/fence and final permit/stop checks run in the existing implementations. No second execution engine or new protocol was introduced. |
| 12. Reconciliation | The absolute-target SDK path retains existing observer allocation/intent/receipt journals and duplicate prevention. The specialized `HistoryAuthority`/`HistoryWorkerSimulation` supports a different order/deal-event contract with partial fills; it is NOT automatically downstream of these absolute targets. Mapping targets to fake fill events would invent execution evidence, so that gap remains explicit. Existing history/process regressions validate its separate recovery behavior. |
| 13. Records/updates | Existing `settleExecution` writes application outcomes and emits owner-specific updates. A confirmed projection defect discarded receipt mode, uncertainty and result code. The correction below preserves those facts in stored and emitted summaries. Notification sinks are captured, not real browser/WebSocket delivery in this new test. `clientEngineStatus` still requires its existing real/demo account proof: this fixture does not make synthetic accounts appear connected/permitted through that endpoint. |
| 14. Stops | Missing/active private synthetic mirrors reach the authority's existing fail-closed stop checker before SDK effects. Recovery does not clear holds. No production stop publisher, OS stop path or preference-to-emergency-stop mapping was added. Actual production propagation remains unverified. |

The default real/demo HTTP adapter still rejects simulation receipts. Test-only
receipt adaptation is explicit and carries simulation identity through to the
application record; no synthetic receipt is disguised as broker acceptance.

## Confirmed defect and minimum correction

`copy-engine.ts:vpsSummary` projected known trade fields but dropped `simulation`,
`financial_execution`, `uncertain` and `code`. The new integration test observed
an actual stopped signed gateway response become a failed application record
without its explicit simulation marker. It failed before the correction; the
expected failure is retained in evidence.

The only application runtime change adds four projected fields:
`simulation`, `financialExecution`, `uncertain`, and a bounded uppercase `code`.
Only exact boolean evidence is retained; missing/invalid values remain `null`,
not an inferred safe state. Existing status/retry decisions, SDK results,
authorization and execution behavior are unchanged. This does not add broker
success claims, automatic retries or hold resolution.

## Test integration changes

- Existing `copier-fixture.mjs` accepts an explicit guarded fixture selection and
  captures the existing owner-specific execution notification sink.
- Existing `copier-simulation-server.py` gains a test-only HTTP-shape adapter. It
  reuses `gateway` and `PipeLink` from existing multiprocess acceptance instead of
  implementing another worker loop. Its immutable synthetic assignments, random
  per-account capabilities and signed IPC remain private to the disposable run.
  Application passwords are removed before IPC. No keys are published in HTTP,
  logs or Git. The existing default pool remains covered by its original test.
- New `guarded-copier-integration.test.mjs` connects actual application routing,
  policy and record functions to that gateway. Test-only controls can change
  fresh synthetic mirrors or stop/restart the test process; they are authenticated
  with the disposable fixture token and are not application/production endpoints.

Coverage includes authorized routing, foreign licensed mentor refusal before
IPC, unknown account rejection, two-account isolation, policy disablement and
volume caps, duplicate source delivery, missing/active stops, independent gateway
termination/restart, retained successful receipts/journals, explicit unknown
outcomes without automatic replay, and matching failed owner notifications.
The new process is the existing fenced gateway itself executing the SDK adapter;
this does not claim the native/Wine stdio launcher was part of this new path.
The new interruption occurs before the next request, not at a broker commit;
existing multiprocess regressions separately cover kill-at-commit, partial fills,
incomplete history and stop-preserving failover.

## Validation scope

Final results: **8 Node integration tests and 160 Python regression tests passed,
0 failed, 0 skipped**. API TypeScript, Python helper compilation and whitespace
checks passed. The new integration is one of the eight Node cases.

Final counts/logs and source hashes are recorded in
`evidence/application-guarded-gateway-20261110/`. Node regressions include the new
integration plus existing five-worker copying, session/auth, enrollment, engine
API, source authentication, follower isolation and risk-policy tests. Python
regressions cover assignment, shared leases, cached evidence, independent-process
coordination, history workers and SDK adapter contracts.

Database tests use disposable PGlite, not a real PostgreSQL server. Live scheduler
polling, production PostgreSQL contention, actual browser delivery, deployment,
native Windows, Wine and official SDK/broker execution are excluded. No unrelated
UI/native suites were rerun. This proves a composed offline path and records, not
an operational launch-ready execution service.

## Remaining blockers and Person 1 dependencies

1. Agree and provision the single authoritative execution domain, private service
   identity/manifest delivery and credential ownership from approved enrollments.
   Local SQLite locks/roots do not exclude independent hosts with copied account
   credentials. No new distributed platform or auto-failover was built.
2. The operator-provisioned simulation assignment used in this test is not an
   automatic enrollment-to-worker service. Production transport wiring, approved
   host lifecycle and secret/stop delivery require an explicit deployment design;
   the nontrading application must remain nontrading until separately authorized.
3. Choose how real order/deal history and partial execution evidence will be
   collected and reconciled with application targets/records. Reuse the existing
   history contracts only with real, authenticated execution evidence; do not
   synthesize fills from source-position targets. No schema or event mapping
   decision was invented here.
4. Person 1 should confirm follower presentation of explicit simulation/unknown
   outcomes, owner-specific failure notifications and operational review states.
   These added receipt fields are evidence, never execution authorization. An application-visible simulation status/profile contract remains a product decision; no real account-status proof was forged to fill that gap.
5. Native Windows and actual MT5 SDK/terminal/account compatibility remain
   unverified. Runtime/dependency approval and subsequent isolated real-terminal
   acceptance remain separate milestones; no current mock result satisfies them.

This local checkpoint is for GitHub code review, not financial execution release.
No push, merge, deployment, production configuration, real SDK calls, broker
connections, real orders, trading activation or emergency-stop removal occurred.
