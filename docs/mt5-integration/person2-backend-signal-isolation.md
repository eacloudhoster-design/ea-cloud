# Backend integration inspection and follower signal isolation

Base: `f7c05e6020f62a3ba73fba85d16650770e345261`, verified on the expected
native-acceptance branch with a clean tree before work.
Development branch: `feature/person2-follower-signal-isolation-20261110`.
No native Windows preparation or new simulation framework was added.

## What is connected

| Component | Repository connection and practical limit |
| --- | --- |
| API/authentication | `app.ts` mounts `browserSessionMiddleware` before routes. Incoming identity bearer hints are removed; verified cookie sessions generate internal identity hints. `requireAuth` consumes the portal principal, while `/app` entitlement middleware validates the client and licence association. Browser-session regressions exercise expiry/revocation and role isolation. This is repository/test evidence, not a production session audit. |
| Enrollment and identity | `routes/mt5-enrollment.ts` checks current owner/mentor, reserves login/server via `account-ownership.ts` and encrypts credentials. Pending enrollment is not terminal verification or worker activation. `enrollment-export.ts` is a private operator handoff with execution disabled. Client/mentor connection routes call authenticated `readBoundAccount`, then share durable ownership checks. Tests mock account proof; actual SDK identity remains unverified. |
| Mentor/follower relationship | `resolveAppSessionAccess` resolves an owned, active, unexpired licence and mentor association. Engine status/policy endpoints scope queries to the requesting mentor/client. `executeObserver` validates the authenticated source event/robot/EA, licence, current owner and allocation before dispatch. |
| Copy configuration | Mentor policy and client settings feed effective sizing/risk caps in `copy-engine.ts`; policies/preferences alone do not provision a worker or release its gates. Legacy OPEN handling is disabled in that engine. |
| Ingestion and execution queue | Scoped EA events route through `ea-builder/routing.ts` into durable signals. `signal-worker.ts` claims queued signals and calls `runSignal`/`executeObserver`; per-client executions and retained allocations record outcomes. The existing nontrading application profile blocks ingestion/activation and dispatch and does not start this scheduler. The generic legacy entry is not an approved execution-enabled launch profile. Neither was started here. |
| Application-to-worker transport | `observer-vps.ts` uses authenticated HTTP to an explicitly configured private origin. Its production contract rejects simulation receipts. The end-to-end regression deliberately injects a test-only synthetic receipt adapter over authenticated loopback HTTP to real isolated mock workers. That is not a deployed official SDK path. |
| Private IPC and fencing | Existing native/Wine candidate workers use authenticated framed IPC, account binding, leases/fencing and journals. Shared lease/history authorities and their serialized gateways are simulated local execution domains, not the application's production distributed service. No new connection between those candidates and real accounts was invented. |
| Assignment and startup | Application reservations serialize enrollment/binding in PostgreSQL; disconnected/pending identities remain reserved. Account router manifests select exact account-bound origins; simulation pool assignments retain immutable identity across aliases/restarts. Private operator provisioning is still needed. Independent hosts/authority roots require deployment exclusion, not local SQLite locks. |
| History/recovery | Application pending/outcome records and observer allocations connect to absolute-target dispatch. Existing worker journals preserve intent, receipts, duplicate prevention and uncertain-outcome holds. Synthetic partial-fill/history processing is connected to the guarded mock worker/IPC and tested across restarts. Official broker history collection/reconciliation is not accepted end to end with these candidates. |
| Emergency stops | Existing final worker guards, stop mirrors, ownership gates and sticky transport/history recovery holds remain intact. Application preferences are not an emergency-stop release or execution grant. Relevant recovery/stop regressions were rerun. Actual deployment-wide stop propagation has not been demonstrated against native Windows/MT5. |

## Confirmed defects

1. `/api/app/signals` selected rows using the caller's `mentorId` query, despite
   an authorized follower session already identifying the permitted mentor. A
   fixture using real cookie authentication and the production `/app` entitlement
   middleware reproduced HTTP **200 instead of 403** for mentor 2 while the
   follower belonged to mentor 1. This was cross-mentor data access, not missing
   future functionality. The before-fix failure is retained as evidence.
2. The follower history endpoint selected whole signal rows, including
   `rawPayload` and internal `lastError`. The legacy webhook also broadcast the
   whole saved row to followers. These fields can contain private ingestion/source
   metadata or queue diagnostics. The regression seeds synthetic private markers
   and verifies they do not reach HTTP responses or the notification sink after
   the fix; the original ingestion row remains intact for backend processing.

## Exact corrections

Only existing `routes/trade-signals.ts` changes runtime behavior:

- Require the existing app-session middleware on the feed itself and derive the
  mentor from `req.appSession.mentorId`.
- Keep explicit matching mentor queries compatible; reject foreign queries with
  403, malformed/ambiguous/out-of-range values with 422. Omitting the query now
  selects the session's authorized feed. Foreign/nonexistent mentor IDs receive
  the same refusal, with no mentor-existence disclosure.
- Reuse one explicit trade-field projection for HTTP history and webhook follower
  notifications. Exclude raw ingestion, queue errors and other internal fields.
  Mentor-owned administrative history and private durable records are unchanged.

One targeted test file uses the existing PGlite/browser-session/Express fixture,
actual route and hashed webhook authentication. It covers own/foreign/default
feeds, malformed/repeated IDs, missing/forged/wrong-role sessions, licence
revocation, private field exclusion and retained private ingestion. Only scheduler
and broadcast sinks are captured for this new test; no execution worker starts.
Existing end-to-end regression separately exercises actual synthetic subprocesses.
No schema, migration, credential handling, execution gateway, IPC, worker,
dependency, fencing, stop or recovery implementation changed.

## Validation

Final results: **7 Node integration tests and 59 Python regression tests passed,
0 failed, 0 skipped**. API TypeScript and whitespace checks passed. The new test
is included in the seven Node tests.

Final logs/counts and source hashes are under
`evidence/follower-signal-isolation-20261110/`.
The selected Node tests cover browser sessions, account enrollment/binding,
mentor policies, scoped EA ingestion, synthetic end-to-end routing/replay/crash
recovery, and the new follower isolation regression. Python regressions cover
assignment, cached gateway evidence, worker history/stop/recovery and independent
process coordination. API TypeScript and whitespace checks are included.

Database tests used disposable PGlite, not a real PostgreSQL server. This does
not newly prove cross-process PostgreSQL advisory locks, production scheduler
latency or database deployment durability. The synthetic end-to-end fixture uses
real loopback HTTP and mock worker processes, never brokers or official MT5 calls.
An initial Python invocation from stdin could not support multiprocessing spawn;
it was stopped and rerun successfully from a guarded script file. This was a test
invocation failure, not evidence of a product recovery defect.

Browser UI, Wine, native Windows and unrelated suites were not rerun for this
backend read/notification change. Prior 486-test Python results remain historical;
this task reports only the relevant newly run checks.

## Remaining launch blockers and dependencies

- **Person 1/product:** confirm follower-facing trade-field presentation and
  licence/mentor assignment UX. No repository consumer of `/app/signals` was
  found; matching mentor queries remain supported. Intentional authorized trade
  fields such as comments remain visible; this is not general content redaction.
- **Person 1/hosting:** agree the application origin, session/database continuity,
  migrations, secrets delivery and nontrading release profile; independently
  verify the deployed auth boundary. This task inspected source, not production.
- **Execution infrastructure:** provision one authoritative account gateway and
  protected durable state per physical account, prohibit credential distribution
  to competing executors, and define operator-only reassignment/hold review.
  No independent-host ownership guarantee follows from local locks/journals.
- **Real execution milestone:** approved terminal/account identity proof, a
  compatible official Python SDK/NumPy/terminal runtime, real order/deal/history
  mapping and an authenticated safety-gateway integration remain unimplemented
  or unverified end to end. No mock success is represented as real integration.
- Native Windows and real MT5 acceptance remain explicitly unverified and deferred.
  Do not expose legacy SDK/service entry points or activate financial execution
  based on these API/synthetic results.

This is a targeted isolation fix ready for GitHub review once local validation
is recorded and committed. It is not a launch or trading authorization. No push,
merge, deployment, production configuration changes, real SDK calls, broker
connections, real orders, stop removal or trading activation occurred.
