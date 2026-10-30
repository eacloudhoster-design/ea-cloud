# Mentor Setup Methods and compiled-EA account observer

This continues the foundation introduced by already-merged PR #123. The observer follow-up remains draft pending native verification. **No deployment, production migration, credential change, or original-strategy change is performed.**

## Two distinct modes

**Connect Existing EA** packages a separate-chart account observer. The original compiled SMC Blueprint V3 EX5 stays unchanged on Chart 1. Chart 2 holds the observer, branding panel and optional embedded BMP. Renaming the observer does not rename the original robot. Source strategy files are not needed to observe an existing EX5.

**Create Custom EA** remains blocked server-side with `409 ORIGINAL_STRATEGY_REQUIRED`. The supplied fragment ends inside `CreateLabel()` and is not a complete strategy. No strategy reconstruction, fire-on-load trade, replacement entry rule or original EX5 is included. Full original MQ5/includes and MetaEditor verification are needed to enable that mode.

## Account-wide observation and routing

The generated observer scans account history and current positions on its timer; it does not depend on Chart 1 delivering `OnTradeTransaction` to Chart 2. Confirmed deal receipts provide an audit trail. Opening/addition/reversal deal magic establishes ownership; manual closes of an owned position remain observable. Mixed-magic netting positions are flagged and cannot dispatch. Comments alone are insufficient. `12345` is only a reference: the mentor must verify a unique nonzero magic on actual opening deals. Magic 0 cannot enable copying.

The observer persists a bounded 256-event outbox, history cursor and known position identifiers under `MQL5/Files`, plus a flushed monotonic terminal global variable. Do not delete these files/global variables on restart. Disk/history failures prevent healthy status. One observer instance per source account is supported; independent terminals do not share local state. Very large history/inventory requires manual review; queues and inventory are bounded rather than silently evicting older pending events.

Snapshots represent **current absolute exposure**, not an executable interpretation of an individual OUT/INOUT deal. Short-lived round trips completed while disconnected are audited but not replayed as stale client trades. No tick-exact copying, guaranteed latency, or matching broker fills is promised. WebRequest runs on the observer timer with a two-second synchronous timeout and bounded backoff.

After explicit activation, snapshots enter existing durable `trade_signals` as registered `SYNC` records linked to a unique authenticated receipt. Stale sequences, duplicate receipts and mixed ownership cannot enqueue new dispatches. The existing mentor-ordered worker resolves each authorized client, current licence/mentor, enabled-copying and MT5 credentials. Existing fixed/multiplier/custom pair sizing initializes a persistent source-position/client scale; broker symbols remain fixed for that allocation. Subsequent partial reductions and reversals use that scale with the current client lot cap. OPEN/CLOSE/MODIFY legacy behavior remains separate.

The new VPS endpoint reconciles absolute exposure under the existing MT5 process lock, supports partial fills/closes, SL/TP and reversals, and refuses unrelated netting exposure. Broker min/step/max constraints, configured open-trade/volume caps and daily equity drawdown checks block increases; closure/reduction remains possible. Its daily UTC equity baseline is persisted at the first observer request that day, not reconstructed from pre-install history. A client SL/TP/manual reduction cannot be automatically reopened by later unchanged snapshots; manual reconciliation or a source-flat state is required.

## Activation gates and legacy duplication

Copying is disabled by default. Enablement requires:

1. An approved, owning mentor with an `existing-observer` package and explicit consent to block legacy ingestion.
2. A successful existing MT5 connection for the **exact source login/server within 24 hours**. Heartbeat account strings alone are not verification. The existing source schema uses signed 32-bit login IDs; larger accounts are blocked until that existing schema is separately reviewed.
3. Recent healthy reconciliation heartbeat, empty outbox, flat eligible source inventory, no newer event, and no pending/executing mentor signals. Start flat; no retroactive copying of pre-activation positions.
4. Nonzero configured source magic, matching authenticated heartbeat/snapshots, and no other active observer for the same mentor/account/server.
5. A separately authenticated HTTPS VPS bridge whose capability check confirms protocol v2, persistent journal and absolute targets.

While `copy_enabled` is true, EA Cloud rejects **all** legacy `/api/signals/webhook` ingestion for that mentor with `409 OBSERVER_ROUTE_ACTIVE`. This intentionally includes other legacy sources: old payloads do not reliably identify source accounts. Mentor-row locking serializes activation, observer routing and legacy ingestion.

The compiled EX5's possible traffic to `https://lumo-edge.replit.app/api/admin/trades` cannot be inspected here. That URL is not an EA Cloud ingestion route. No claim is made that a separate external platform has stopped executing. Before demo/live activation, the operator must establish the old destination's behavior and avoid running two independent execution systems. Do not blindly alter unknown original inputs/WebRequest configuration that may affect strategy startup.

Revocation stops future observer events and queued dispatches. It does **not** close client positions. Legacy ingestion intentionally stays blocked for enabled-then-revoked observers; a safe return to legacy ingestion needs a separately reviewed, flat-account handover. There is no public migration or reset endpoint.

## Durable execution and operational recovery

`vps-mt5-service/observer_sync.py` uses a persistent SQLite journal at `observer-journal.sqlite3` beside the service. The journal commits `dispatching` **before** broker submission. Successful HTTP retries return the cached revision without another fill. If the process dies in the submission window or the broker returns no result, the allocation fails closed on restart. Do not delete/reset the journal to make it retry. An operator must reconcile broker history and actual exposure before any reviewed recovery. Preserve the journal across code/service replacements, restrict filesystem permissions, and back it up alongside operational state.

Stable per-source magic allocation is scoped to client login/server; collisions are rejected. Netting refuses symbols with unrelated exposure. External/manual reductions are held instead of silently re-expanded. Rejected, uncertain, paused, expired-licence, disconnected and superseded outcomes are not claimed as successful broker fills.

Portal statuses distinguish recent heartbeat, waiting enablement and disconnected/reconciliation failure. Event `copyState` shows receipt/routing outcome; `queueStatus`/`queueError` shows worker state. `enqueued`/HTTP receipt is not broker success. Existing per-client `trade_executions` remains the execution audit.

## Packaging and files

- `routes/ea-builder.ts`: cookie authentication, approved owner, owned EA, scoped token issuance/revocation, package, heartbeat/event capture, explicit enablement and history.
- `lib/ea-builder/{contracts,image,worker,package,mql,reconcile,routing}.ts`: bounded image/ZIP worker, safe filename/literal escaping, read-only observer and authenticated queue routing.
- `lib/observer-{execution,vps}.ts`: licence/source checks, position allocations and HTTPS bridge.
- `lib/{copy-engine,signal-worker}.ts`, `routes/trade-signals.ts`: existing queue reuse, isolated SYNC handling and activation-time legacy gate.
- `lib/db/src/schema/{robot-builds,observer-routing,trade_signals}.ts` and reviewed additive migration.
- `vps-mt5-service/observer_sync.py`: authenticated, locked, journaled target synchronization. Existing execution endpoints stay intact.
- `artifacts/ea-cloud/src/pages/admin/SetupMethod.{tsx,css}`: two modes, existing verification panel and truthful status/actions.

Names are display metadata, never identity or authorization. The ZIP contains a private robot-scoped token; never share it. It does not contain the mentor API key. Tokens are hashed in PostgreSQL and redacted from request logs. Existing legacy copier download remains available but cannot ingest for an activated observer's mentor.

PNG/JPEG/uncompressed BMP input is bounded to 10MiB, 12MP and 8192px dimensions, converted to an opaque 24-bit BMP no larger than 1920px per side. CPU work uses a bounded worker thread. Keep complete output `dist/ea-builder-worker.mjs` beside the API bundle. Resource BMP goes under `MQL5/Images/EACloud/<UUID>/MT5_Background.bmp` before compilation. No image changes affect client layouts.

## Manual activation sequence — requires separate approval

1. Review the observer follow-up PR, migration and code. Resolve the previously unverified production database backup/recovery point and exposed-credential incident before any production rollout. Do not print or copy secrets into reports.
2. Validate additive `docs/migrations/20261030-robot-builds.sql` against a restored disposable database first. It creates new metadata tables/columns/indexes and adds nullable `trade_signals.observer_event_id`; it does not reset accounts, passwords, trades or the database. Apply only after explicit migration approval; the API startup runner does not apply it automatically.
3. Prepare a DEMO Windows MT5 execution service with this code, persistent writable journal storage and authenticated TLS termination. Configure a new private `OBSERVER_MT5_VPS_TOKEN` of at least 32 characters in that service. Do not reuse the read-only Chart Scanner token.
4. After approval, configure API `OBSERVER_MT5_VPS_URL` as that HTTPS origin and `OBSERVER_MT5_VPS_TOKEN` as the matching private service credential. These names are documented requirements; no production variables have been changed here. No new paid service is introduced.
5. After approval, deploy complete API dist and Pages output using existing build commands. Preserve the browser-session migration startup runner and all existing variables. No observer copying starts merely because code is deployed.
6. Download observer, compile with MetaEditor, retain original EX5 on Chart 1 and install observer on Chart 2 of DEMO. Verify actual magic, source connection, old external broadcast behavior, healthy flat heartbeat and authorized demo clients; explicitly enable copying only after these pass.
7. Validate BUY/SELL, SL/TP, partial/full closes, reversals, partial fills, distinct client sizing/symbols, unrelated manual trades, HTTP duplicates, broker rejections, pause/licence expiry, disconnect/restart and uncertain-outcome recovery. Inspect actual broker tickets plus portal execution records. Live rollout requires separate approval after DEMO evidence.

## Verification limits

Automated tests use disposable PostgreSQL and a simulated broker. MetaEditor, original EX5 network traffic, real broker execution, production data/provider settings and live connectivity are unavailable here. Passing TypeScript/builds or simulated broker tests does not establish end-to-end MT5 readiness. Keep the observer follow-up PR draft until native compilation and demo acceptance are recorded.
