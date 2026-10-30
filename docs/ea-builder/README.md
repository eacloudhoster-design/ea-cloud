# Mentor Setup Methods and Intelligence EA V3+ generator

This redesign builds on merged PRs #123 and #124. **No deployment, production migration, credential change, or original-strategy change is performed.**

## Setup Methods and the supplied Intelligence strategy

The portal is one vertical page: **CREATE YOUR TRADING EA**, then **COPY TRADING**. Saved profile branding is displayed with a link to the existing Profile editor. EA selection, optional MT5-only background preview/removal, generation errors, independent ready/download actions, connection history and existing source verification remain available. There is no competing mode selector or repeated branding form.

Create EA now generates the entire user-supplied 934-line **Intelligence EA V3+** template under `lib/ea-builder/templates/intelligence-ea-v3.mq5`. The original source is retained in full with normalized line endings, including original attribution (normalized SHA256 `3c0ceb54954ae5f243271b14154811d791ad9942269d0e961e3093a851279e61`). Generated trading inputs and the bodies of `DetectQuasimodoSignal`, `OpenBuy`, `OpenSell`, `CalculateStops`, `ManageTrailingStop`, `OnTick` and original initialization/deinitialization logic are unchanged. Only display metadata/comments and wrapper lifecycle integration are added. Startup trading/ForceSignal behavior is preserved and may place a strategy trade immediately; no additional trade is created for broadcasting. This is a source package, not a compiled EX5 or a claim of verified broker operation.

Names come from the authenticated mentor's saved profile and selected owned EA; forged request branding cannot override them. The ZIP contains `<EA>/<EA>.mq5`, `<EA>/<EA>_Relay.mq5`, optional `<EA>/MT5_Background.bmp`, and a guide with exactly ten numbered steps. The BMP is embedded from beside the main source before compilation and resized behind the information panels. No client app background is touched.

### Nonblocking network delivery

MQL5 WebRequest is synchronous. It must not run in the strategy's event loop. The generated trading EA itself reconciles and queues confirmed events; a bundled **native MT5 background Service** performs HTTPS using that queue. It is not a second observer/trading EA, DLL or paid service. Compile the relay, copy it into `MQL5/Services` and start it in the same terminal/account. Without the relay, original strategy trading is unchanged but trade sharing remains waiting/disconnected.

The chart EA writes a bounded durable outbox, reconciliation state and heartbeat under MT5 Common/Files; the service reads the outbox, validates actual API acknowledgements and writes a matching receipt. Only then does the chart EA remove the queue head. The service holds a per-robot/account local lock to reject duplicate relay instances and performs timeout/backoff outside the chart event loop. Retain both local state and the existing VPS journal across restarts. The installed package contains a private, revocable robot token, never the unrestricted mentor/admin key.

The actual authenticated endpoints remain `/api/robots/heartbeat` and `/api/robots/events` at `https://eacloudhoster.online`. First heartbeat binds the integrated robot's actual original `MagicNumber`; later account/server/magic changes are rejected. Explicit, verified trade-sharing activation remains required and cannot be bypassed by generation. Start flat: trades opened before activation, including immediate startup trades, are not copied retroactively.

### Standalone copier

`/api/admin/copier/download?format=zip` packages the existing standalone copier and ten-step guide. The default raw MQ5 download is preserved. This is a separate product and does not contain the Intelligence strategy. Its existing credential/verification/trade logic is unchanged; the new ZIP uses the verified production API origin. Its existing partial-close, netting, SL/TP and offline-delivery limitations are documented. Do not enable both routes for the same mentor: the existing observer/integrated activation gate blocks legacy webhook ingestion.

### Verification and rollout

Automated checks compare every original trading input and critical function body, verify original initialization/deinitialization, confirm no additional trade calls, ensure HTTPS appears only in the Service, validate image/resource paths and test real authenticated package generation. MetaEditor is unavailable here, so compilation remains unverified; the mentor will perform native/demo-broker acceptance. Source package readiness does not mean broker verification.

No new database migration is introduced by this redesign. The robot-builds/observer routing migration from PR124 must already be present before using those endpoints. No production SQL, service restart, credential/configuration change, merge or deployment is authorized or performed. Production backup and the earlier exposed-credential incident still require operator attention before rollout. After approval, rebuild/deploy complete API dist and Pages output through existing mechanisms; no VPS execution changes are needed for this PR beyond the previously introduced authenticated bridge. Install/compile the generated main EA and relay as described by its ten-step guide.

The sections below document the reused routing/recovery gates, including compatibility with older separate-chart registrations.

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

1. Review the generator redesign and existing migration/code. Resolve the previously unverified production database backup/recovery point and exposed-credential incident before any production rollout. Do not print or copy secrets into reports.
2. Validate additive `docs/migrations/20261030-robot-builds.sql` against a restored disposable database first. It creates new metadata tables/columns/indexes and adds nullable `trade_signals.observer_event_id`; it does not reset accounts, passwords, trades or the database. Apply only after explicit migration approval; the API startup runner does not apply it automatically.
3. Prepare a DEMO Windows MT5 execution service with this code, persistent writable journal storage and authenticated TLS termination. Configure a new private `OBSERVER_MT5_VPS_TOKEN` of at least 32 characters in that service. Do not reuse the read-only Chart Scanner token.
4. After approval, configure API `OBSERVER_MT5_VPS_URL` as that HTTPS origin and `OBSERVER_MT5_VPS_TOKEN` as the matching private service credential. These names are documented requirements; no production variables have been changed here. No new paid service is introduced.
5. After approval, deploy complete API dist and Pages output using existing build commands. Preserve the browser-session migration startup runner and all existing variables. No observer copying starts merely because code is deployed.
6. Download and compile the generated trading EA plus its native relay Service, and install on DEMO using the ten-step guide. Previously issued separate-chart registrations remain compatible. Verify actual magic, source connection, old external broadcast behavior, healthy flat heartbeat and authorized demo clients; explicitly enable copying only after these pass.
7. Validate BUY/SELL, SL/TP, partial/full closes, reversals, partial fills, distinct client sizing/symbols, unrelated manual trades, HTTP duplicates, broker rejections, pause/licence expiry, disconnect/restart and uncertain-outcome recovery. Inspect actual broker tickets plus portal execution records. Live rollout requires separate approval after DEMO evidence.

## Verification limits

Automated tests use disposable PostgreSQL and a simulated broker. MetaEditor, original EX5 network traffic, real broker execution, production data/provider settings and live connectivity are unavailable here. Passing TypeScript/builds or simulated broker tests does not establish end-to-end MT5 readiness. Keep this generator redesign PR draft until review; native compilation and demo acceptance remain operator verification steps.
