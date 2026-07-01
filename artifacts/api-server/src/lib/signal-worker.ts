import { db, tradeSignalsTable, tradeExecutionsTable, type TradeSignal } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import type { Logger } from "pino";
import { runSignal } from "./copy-engine";

// ─── Durable signal execution queue ───────────────────────────────────────────
// Every incoming signal is persisted with status='pending'. A single background
// worker claims pending signals and processes them via the copy engine, so work
// survives an API restart and VPS failures are retried with backoff.
//
// Ordering guarantee: signals from the SAME mentor are processed strictly one at
// a time in arrival order (a CLOSE/MODIFY can never run before the OPEN it
// references). Different mentors are processed in parallel. This is enforced by
// only claiming the oldest pending signal for mentors that have no signal already
// in the 'executing' state.

const POLL_INTERVAL_MS = 2_000;       // base poll cadence
const MAX_SIGNAL_ATTEMPTS = 5;        // give up (mark 'failed') after this many passes
const RETRY_BASE_MS = 5_000;          // backoff = min(BASE * 2^attempts, MAX)
const RETRY_MAX_MS = 5 * 60_000;
// Lease: a signal claimed into 'executing' is considered abandoned if its row has
// not been touched within this window (e.g. the process crashed mid-process, or a
// finalize DB write failed). Such rows are reclaimable so a signal can never wedge
// in 'executing' forever. Must comfortably exceed the time one runSignal pass takes.
const EXECUTING_LEASE_SECONDS = 10 * 60;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let ticking = false;       // re-entrancy guard for a single tick
let pendingWake = false;   // a wake arrived while a tick was in flight
let stopped = false;

function backoffMs(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_MS);
}

// Atomically claim the oldest claimable signal for each mentor that is not
// currently busy. A signal is claimable if it is 'pending' and due, OR it is
// 'executing' but its lease has expired (abandoned by a crash / failed finalize).
// A mentor is "busy" only if it has a FRESH (non-expired) executing signal.
//
// Race-safety: candidate rows are locked with FOR UPDATE SKIP LOCKED so two
// concurrent workers/instances can never grab the same row, and the final UPDATE
// re-checks the claimable predicate so a row another worker just transitioned is
// not re-claimed. The whole thing is one statement -> the pending->executing flip
// cannot race with itself.
async function claimSignals(): Promise<number[]> {
  const lease = sql`make_interval(secs => ${EXECUTING_LEASE_SECONDS})`;
  const rows = await db.execute(sql`
    WITH active AS (
      SELECT DISTINCT mentor_id
      FROM ${tradeSignalsTable}
      WHERE status = 'executing' AND updated_at >= now() - ${lease}
    ),
    candidates AS (
      SELECT DISTINCT ON (mentor_id) id
      FROM ${tradeSignalsTable}
      WHERE mentor_id NOT IN (SELECT mentor_id FROM active)
        AND (
          (status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
          OR (status = 'executing' AND updated_at < now() - ${lease})
        )
      ORDER BY mentor_id, created_at ASC, id ASC
    ),
    locked AS (
      SELECT id FROM ${tradeSignalsTable}
      WHERE id IN (SELECT id FROM candidates)
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ${tradeSignalsTable}
    SET status = 'executing', updated_at = now()
    WHERE id IN (SELECT id FROM locked)
      AND (
        (status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
        OR (status = 'executing' AND updated_at < now() - ${lease})
      )
    RETURNING id
  `);
  const list = (rows as unknown as { rows?: Array<{ id: number }> }).rows ?? (rows as unknown as Array<{ id: number }>);
  return Array.isArray(list) ? list.map((r) => Number(r.id)) : [];
}

// Process one claimed signal and move it to a terminal/retry state.
async function processSignal(signal: TradeSignal, log: Logger): Promise<void> {
  const attempts = signal.attempts + 1;
  try {
    const tally = await runSignal(signal, log);
    const needsRetry = tally.failedRetryable > 0;

    if (needsRetry && attempts < MAX_SIGNAL_ATTEMPTS) {
      const delay = backoffMs(attempts);
      await db.update(tradeSignalsTable).set({
        status: "pending",
        attempts,
        lastError: `${tally.failedRetryable} client(s) failed on VPS — retrying`,
        nextAttemptAt: new Date(Date.now() + delay),
      }).where(eq(tradeSignalsTable.id, signal.id));
      log.warn({ signalId: signal.id, attempts, delay }, "[SignalWorker] signal re-queued for retry");
      return;
    }

    await db.update(tradeSignalsTable).set({
      status: needsRetry ? "failed" : "success",
      attempts,
      processedAt: new Date(),
      lastError: needsRetry ? `Exhausted retries; ${tally.failedRetryable} client(s) still failing on VPS` : null,
    }).where(eq(tradeSignalsTable.id, signal.id));
    log.info({ signalId: signal.id, attempts, status: needsRetry ? "failed" : "success" }, "[SignalWorker] signal finalised");
  } catch (err) {
    // Fatal processing error (e.g. could not even load clients). Retry or fail.
    const msg = err instanceof Error ? err.message : String(err);
    if (attempts < MAX_SIGNAL_ATTEMPTS) {
      const delay = backoffMs(attempts);
      await db.update(tradeSignalsTable).set({
        status: "pending", attempts, lastError: msg, nextAttemptAt: new Date(Date.now() + delay),
      }).where(eq(tradeSignalsTable.id, signal.id));
      log.error({ signalId: signal.id, attempts, err }, "[SignalWorker] signal processing errored — re-queued");
    } else {
      await db.update(tradeSignalsTable).set({
        status: "failed", attempts, processedAt: new Date(), lastError: msg,
      }).where(eq(tradeSignalsTable.id, signal.id));
      log.error({ signalId: signal.id, attempts, err }, "[SignalWorker] signal failed permanently");
    }
  }
}

async function tick(log: Logger): Promise<void> {
  if (ticking || stopped) { pendingWake = true; return; }
  ticking = true;
  try {
    const ids = await claimSignals();
    if (ids.length === 0) return;

    const signals = await db.select().from(tradeSignalsTable).where(inArray(tradeSignalsTable.id, ids));
    // Different mentors run in parallel; per-mentor ordering already guaranteed
    // by the claim (one signal per mentor per tick).
    await Promise.all(signals.map((s) => processSignal(s, log)));

    // More may be claimable immediately (next per-mentor signal, or due retries).
    pendingWake = true;
  } catch (err) {
    log.error({ err }, "[SignalWorker] tick failed");
  } finally {
    ticking = false;
    if (pendingWake && !stopped) {
      pendingWake = false;
      setImmediate(() => void tick(log));
    }
  }
}

// Reset state left dangling by a crash/restart so the worker can safely resume.
// Order matters: orphaned in-flight EXECUTIONS are marked failed & NON-retryable
// FIRST (we cannot confirm whether the VPS filled them, so we must not re-fire
// and risk a duplicate trade). THEN any 'executing' signals are returned to
// 'pending' so the worker re-runs them — re-running will skip the now-terminal
// clients and only attempt clients that never got a row.
export async function reconcileOnStartup(log: Logger): Promise<void> {
  const orphanExec = await db.update(tradeExecutionsTable).set({
    status: "failed",
    retryable: 0,
    errorMessage: "Interrupted by server restart (outcome unknown)",
  }).where(eq(tradeExecutionsTable.status, "pending")).returning({ id: tradeExecutionsTable.id });

  const requeued = await db.update(tradeSignalsTable).set({
    status: "pending",
    nextAttemptAt: null,
  }).where(eq(tradeSignalsTable.status, "executing")).returning({ id: tradeSignalsTable.id });

  log.info(
    { orphanExecutions: orphanExec.length, requeuedSignals: requeued.length },
    "[SignalWorker] startup reconciliation complete",
  );
}

// Nudge the worker to run immediately (called right after a signal is enqueued).
export function wakeWorker(log: Logger): void {
  void tick(log);
}

export function startWorker(log: Logger): void {
  stopped = false;
  if (pollTimer) return;
  pollTimer = setInterval(() => void tick(log), POLL_INTERVAL_MS);
  log.info({ pollIntervalMs: POLL_INTERVAL_MS }, "[SignalWorker] started");
  void tick(log);
}

export function stopWorker(): void {
  stopped = true;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
