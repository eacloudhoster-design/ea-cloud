# Real MT5 driver and application integration candidate

Base: `918b00714b41782f680e13aeec124873d1001dd0`.
Branch: `feature/person2-real-mt5-integration-20261110`.
The base contains the earlier Windows runner and all preceding Person 2 work.
No deployment, real SDK import/call, broker connection, actual credential use,
order, production configuration change, push, or merge occurred.

## Implemented code

`vps-mt5-service/real_mt5_adapter.py` is an official-SDK driver, not a synthetic
backend. The default loader lazily imports `MetaTrader5` on Windows x64 only.
Only tests inject an existing offline broker double. It implements the SDK
operations already consumed by `observer_sync.synchronize` and
`history_reconcile`: initialize/shutdown, terminal/account identity, symbol/tick
information, MarketWatch selection, positions, active orders, deal/order history,
version, order preflight, DEAL and SLTP submission. No second execution engine
or strategy is introduced. Legacy `main.py` now refuses startup before importing
the SDK or creating logs; its archived implementation is preserved. This closes
an otherwise runnable multi-account execution bypass. The existing demo-only, hedging-account restriction
is retained; live-money accounts and pending-order creation/modification/
cancellation are not enabled by this change.

The driver validates the exact configured login/server, portable terminal and
private data directory before/after queries and submissions. All direct order
calls need the worker's final execution scope plus an explicit execution grant.
It validates request keys, operation comment, side, position reference, allocation
magic, finite quantities, volume grid, advertised filling policy, SDK preflight
and terminal/account trading permissions. Broker comments and raw requests/errors
never enter execution responses. Successful DEAL receipts need valid order/deal
IDs and matching executed volume. Unknown/placed/timeout/broken receipts stay
uncertain. A confirmed receipt also requires the observed signed/gross position
delta (or requested SL/TP) to match; a lagging snapshot holds execution instead
of allowing the reconciliation loop to duplicate an open. Partial receipts are journaled and held; the remainder is never
blindly retried. Successful SLTP receipts may legitimately have zero order/deal
IDs. Large ticket IDs are strings at browser boundaries.

The existing worker journal owns session fences too: a local exclusive StateLease,
monotonic epoch, assignment/key fingerprint, consumed authorization hashes,
acceptance metadata, wall-clock highwater and monotonic session expiry. A separate
installation witness detects loss of the journal. Holds have both durable DB and
sidecar representations, plus an in-process latch. Fresh authorization never clears
a hold. Restart with any unresolved allocation holds the entire account. These
are **local durability/ownership controls**, not cross-host locks or proof that
another separately provisioned gateway cannot operate the physical account.

`demo_worker.py` now constructs this driver from private credential references.
Neither launcher stdin nor an execution request supplies terminal credentials.
The native default checks existing private NTFS paths/ACLs without repairing them.
The existing Linux launcher now passes metadata only; it does not start anything
during these tests. SDK initialization remains bounded to 15 seconds; the HTTP
worker's 15-second monotonic request budget is checked immediately before sending
and after preflight. Broker calls cannot be safely cancelled by Python: an already
submitted native SDK call may outlive the HTTP deadline. Its intent remains held;
no automatic resend or ownership handover is permitted. Approved process/terminal
quiescence supervision is still necessary.

## Authorization and credentials

The preceding `mt5-bootstrap-preparation-v1` grant still authorizes metadata only.
It is deliberately NOT upgraded to broker/trading authority. The real-session
consumer reuses its strict HMAC frame primitive and opaque credential-reference
convention, using a separate explicit `ea-mt5-demo-session-v1` grant. There is no
public grant issuer, secret manager, automatic approval, or automatic activation.

Private startup inputs: `engine=real-sdk-v1`, the existing `DemoAccount` metadata,
explicit `expected_sdk_version`, opaque `credential_ref` (default
`broker-password`), `gateway-id`, separate 32-byte hex `mt5-session-verifier-key`,
`mt5-session-authorization` frame, and distinct account `api-token`.
The grant binds the gateway and complete configuration digest, unique 32-hex ID,
issue/expiry times (maximum one hour), and either `connect-read` or
`connect-execute-demo`. Execution scope also needs client role plus existing
`enabled`/`execution_approved` controls. Preparation grants, missing pins, wrong
bindings, stale/replayed grants, unknown safety state, and wrong SDK versions fail
closed. The verifier key/authorization and credential files must be delivered by
the approved private operator boundary; browser and execution requests cannot
choose them. Key separation, approval issuance/revocation and rotation are
operator trust requirements, not a new production service provided here.

## Actual application flow

1. Existing licensed browser sessions, enrollment, ownership checks and encrypted
   account storage remain in use. Enrollment requests do not provision terminals.
2. Account connection/status goes through `readBoundAccount`, the authenticated
   private account router and the fixed account worker. New static error codes
   distinguish missing assignment, failed account proof and unavailable session.
3. Existing observer package source capture (`ea-builder/reconcile.ts` and
   `package.ts`) feeds the authenticated/signed `routes/ea-builder.ts` ingestion.
   Existing `routeSnapshot` and `observer-execution.ts` enforce source binding,
   current mentor/license authorization, retained allocation, risk and symbol
   policy. No replacement mentor polling agent or event transport was created.
4. `observer-vps.ts` checks the explicit assignment and pinned router capability
   snapshot, then the router selects exactly one account-bound worker. Its private
   credential provider is independent of the execution payload's password field.
5. That worker serializes `observer_sync.synchronize`, durably records its intent
   before send, and invokes the real driver only in the final guarded scope.
   The reconciler handles market opens, position-specific partial/full closes,
   reversals and position SL/TP changes. Existing source snapshots drive absolute
   exposure; historical completed round trips are not replayed as new trades.
6. Existing execution records and follower-specific WebSocket notifications still
   receive success/rejection/uncertainty through the existing copier. No retry of
   uncertain orders, auto-clearing holds, or legacy direct-order bypass was added.
7. New owned `GET /app/engine/history` calls the pinned router's account-snapshot
   path and the worker's bound SDK reads. Only the saved account selected by the
   verified session is used, never browser login/client query parameters. The
   existing MT5 screen renders positions, pending orders, trade deals and order
   history, with observation time, a 24-hour history window, 200-row limits and
   truncation indicators. Cash-only deals are excluded (balance/equity are in
   status). Broker comments, credentials and diagnostic metadata are projected
   away. Balance/equity are returned to the owning follower, not mentor status.
8. `history_reconcile` continues read-only assessment of ambiguous real history;
   its offline record operation can only preserve a hold. SLTP ambiguities,
   conflicting/absent history and partial residuals still require operator review.

Existing simulation workers, authenticated framed simulation IPC, and synthetic
SDK/journal implementations are preserved. The real demo path uses the repository's
existing authenticated, pinned loopback HTTP router/worker interface; it does not
relax simulation-only IPC bindings or claim their shared-lease simulator is a
production cross-host authority. The management allowlist/edge path recognize the
new read-only history URL; no environment, service, credentials, routing assignment
or production configuration was changed. The strictly read-only canary continues
to expose its original allowlist only.

## Remaining Person 1 / runtime dependencies

- Approve real-demo authorization scope/issuer/key custody, account/gateway ID to
  pinned origin mapping, credential export/delivery/rotation, and private NTFS
  service identities. The current service templates do not deliver the new grant
  files and must not be enabled unchanged. No real grant or secret was used here.
- Enforce one executor/terminal/session per physical account in deployment and
  inventory, including aliases, backup copies and failover. No independent roots
  or copied journals may be activated. Old processes/terminals must be quiescent
  before handover; local SQLite/file locks do not exclude another host.
- Select and approve native Windows x64, a matching CPython/official MT5 wheel/
  NumPy ABI and isolated portable terminal profile. Repository profiles conflict:
  legacy `requirements.txt` pins SDK 5.0.45, while the existing hashed Wine profile
  pins 5.0.6231/Python 3.13.17. The driver requires an explicit installed-version
  pin and refuses mismatch; it does not resolve this deployment decision by
  silently changing a production dependency profile.
- Provide persistent private journals/witnesses/stop mirror, approved HTTPS/private
  ingress and process supervision. Bound account worker capacity remains two per
  existing router pending load acceptance. Missing acceptance directory/mirror
  still blocks execution and connection; no emergency latch was cleared.
- Provision/review the existing mentor observer package and account registration
  for source ingestion. Backend event routing already exists, but compilation,
  native terminal operation, source latency and broker delivery remain unverified.
- Obtain explicit approval for native terminal/demo SDK calls and later controlled
  demo orders. Verify broker-specific filling/stops/price constraints, multi-deal
  receipts, history completeness and crash quiescence with actual terminal evidence.
  Pending-order copying, netting accounts, auto-release of reconciliation holds,
  and live-money support need separately reviewed requirements/implementation.

## Validation / review status

See `evidence/real-mt5-integration-20261110/verification.json`, source hashes and
logs for final counts/commands. The new tests inject an offline SDK into the real
driver and existing worker/router, not the production loader. The offline guard
rejects vendor imports and non-loopback connections. Application integration uses
existing PGlite and worker fixtures; the browser exercises the current built app.
Native Windows, Wine, real terminal/SDK/broker execution and production PostgreSQL
acceptance are not implied by these tests.

This is a local code-review candidate. It is not an execution-enabled release,
not a completed live launch, and has not been pushed. Deployment/runtime manifest
hashes for previous releases do not approve this new source tree.

## Changed source/test files

- `artifacts/api-server/src/engine-management-app.ts`
- `artifacts/api-server/src/lib/engine-status.ts`
- `artifacts/api-server/src/lib/mt5-account-status.ts`
- `artifacts/api-server/src/routes/client-settings.ts`
- `artifacts/api-server/src/routes/engine.ts`
- `artifacts/api-server/src/routes/mt5-connect.ts`
- `artifacts/ea-app/src/lib/request.ts`
- `artifacts/ea-app/src/pages/MetaTraderTab.tsx`
- `functions/api/[[path]].js`
- `infra/linux/wine-account-worker.py`
- `scripts/tests/engine-integration.test.mjs`
- `scripts/tests/mt5-status-recovery.browser.mjs`
- `vps-mt5-service/account_dispatch.py`
- `vps-mt5-service/demo_worker.py`
- `vps-mt5-service/main.py`
- `vps-mt5-service/observer_sync.py`
- `vps-mt5-service/real_mt5_adapter.py`
- `vps-mt5-service/tests/test_real_mt5_adapter.py`
- `vps-mt5-service/tests/test_wine_account_launcher.py`

Final offline results: 549 Python passed (32 new cases included), 0 failed, 0 skipped; 6 Node passed, 0 failed, 1 PostgreSQL-only test skipped; 1 existing-browser scenario passed. TypeScript (API and UI), production UI build, Python compilation, Node syntax and whitespace passed.
