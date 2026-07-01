---
name: Copy-trading execution engine
description: Design decisions and known limitations for the mentor-signal → client-execution copy engine
---

# Copy-trading execution engine

The webhook (`POST /api/signals/webhook`) persists the signal as `status='pending'`
then calls `wakeWorker()` — it does NOT fan out inline. A durable background worker
(`signal-worker.ts`) claims pending signals and runs them via `runSignal()` in
`copy-engine.ts`. Each per-client attempt is one row in `trade_executions`.

## Durable queue (signal-worker.ts) — replaced the old in-memory queue
Signal lifecycle status lives on `trade_signals.status`:
pending → executing → success/failed (+ `attempts`, `lastError`, `nextAttemptAt`,
`processedAt`, `updatedAt`). Work survives API restarts and retries VPS failures
with exponential backoff (cap `MAX_SIGNAL_ATTEMPTS=5`).

### Per-mentor FIFO is enforced by the CLAIM, not an in-process Map
The claim SQL grabs the oldest claimable signal for each mentor that has no FRESH
`executing` signal — one signal per mentor per tick, different mentors in parallel.
**Why FIFO matters:** CLOSE/MODIFY map back to the client's own ticket via the prior
successful OPEN row; a CLOSE that ran before its OPEN committed is permanently
mis-recorded. The claim guarantees one-at-a-time per mentor in `created_at, id` order.

### Claim must be lock-safe (lesson — architect caught this)
The claim is ONE statement: `active`(fresh-executing mentors) → `candidates`
(DISTINCT ON mentor_id) → `locked` (`FOR UPDATE SKIP LOCKED`) → UPDATE that
**re-checks the claimable predicate**. Both the SKIP LOCKED and the UPDATE re-check
are required — without them two concurrent workers/instances can double-claim the
same row and double-fire VPS trades. Note Postgres forbids `FOR UPDATE` with
`DISTINCT`, so locking happens in a separate CTE keyed by id.

### Lease prevents permanent 'executing' wedge (lesson)
A signal is reclaimable if pending+due OR `executing` with `updated_at` older than
`EXECUTING_LEASE_SECONDS` (10 min). **Why:** if a crash or a failed finalize DB
write leaves a signal in `executing`, that mentor would otherwise be blocked
forever. The lease must exceed one `runSignal` pass. Idempotency guard makes the
re-run safe (no duplicate fills).

### Startup reconciliation ORDER is load-bearing
`reconcileOnStartup()`: orphan `pending` EXECUTION rows → failed + retryable=0
FIRST, THEN `executing` SIGNALS → pending. **Why:** the interrupted client fills
have unknown VPS outcome, so marking them non-retryable BEFORE re-queuing the
signal means the idempotency guard skips them on re-run and never re-fires a trade
that may already have filled.

### Idempotency guard (copy-engine `priorOutcome`)
`executeForClient` skips clients whose latest execution row is
success/skipped/pending or failed+retryable=0; re-attempts only no-row or
failed+retryable=1. `settleExecution` persists `retryable` from `VpsResult.retriable`.
`runSignal` returns a tally; worker retries the signal if `failedRetryable > 0`.

## VPS success detection
Treat a VPS call as success only when HTTP 200 AND `data.success === true`. An
empty/non-JSON 200 body must NOT count as success. Retry ONLY transient failures
(network error/timeout, HTTP 5xx/429); logical failures (4xx, MT5 "No money",
login failed) are deterministic — do not retry.

## Credential safety
Decrypted MT5 password lives in memory only for the duration of the VPS call.
NEVER log or persist the raw VPS response blob — store/log only the redacted
whitelist from `vpsSummary()`. **Why:** the raw blob is the one place a leaked
credential could surface if the VPS contract ever changed to echo the request.

## Client real-time feed (ea-app)
The app stores `appClientToken` = base64(`<clientId>:client:<ts>`), the SAME
format `ws.ts` decodes — so the stored token works directly as the WS
`?token=`. The client subscribes to `/api/ws?token=...` for
`{type:"TRADE_EXECUTION", execution}` frames, merging by `execution.id` (the
engine emits a `pending` frame then a final `success/failed/skipped` frame for
the same id, so the UI must upsert-by-id, not append).

**WS hook lifecycle (lesson):** keep ALL connection state (disposed flag, active
socket, reconnect timer, attempt counter, fetch AbortController) inside the
`useEffect` closure — never in `useRef`/module scope shared across runs.
**Why:** on token change / StrictMode remount, cross-run shared refs let a stale
effect reconnect with the OLD token (zombie sockets) and let a stale history
fetch overwrite newer state. Guard every socket callback with
`if (ws !== activeWs || disposed) return;` and null out `activeWs` before closing
in cleanup so the intentional close is treated as stale (no reconnect).

## Superadmin visibility
`GET /superadmin/signal-queue` (contract-first: defined in `openapi.yaml`, consumed
via generated `useGetSignalQueue` hook) returns status counts + 50 most recent
signals. Page polls every 4s. The generated hook requires an explicit `queryKey`
in its query options (pass `getGetSignalQueueQueryKey()`) — orval does not default it.

## EA name is `users.robotName` — single source of truth, do NOT add a second column
The mentor-configurable "EA name" is the existing `users.robotName`. The Mentor Portal
Profile page already labels it "EA Name (Displayed on App)" and saves it via
`PATCH /profile`; it ALSO drives the generated MQ5 (`copier.ts` EA_CLOUD_EA_NAME) and
the app display (ea-app / ea-cloud Dashboard). The MT5 OPEN trade comment is derived
LIVE from it at execution time in `runSignal` (one read per signal) → `<robotName> | EA CLOUD`,
fallback `EA Cloud sig#<signalId>` when empty. **Why:** any request to "add an EA name field"
is already satisfied — reuse robotName; a parallel `eaName` column would diverge from the
MQ5/app/profile that all read robotName. **Caveat:** MT5 order comments are ~31 chars max;
long EA names may be truncated by the terminal/broker.

## Known limitations (flagged to user, not yet built)
- **Plain HTTP to VPS:** credentials go to the VPS over plain HTTP — a pre-existing,
  system-wide condition (the connect flow does the same). Needs HTTPS / private
  network at the infra level.
