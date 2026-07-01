import {
  db,
  appAccessTable,
  clientSettingsTable,
  symbolPairsTable,
  clientSymbolConfigsTable,
  tradeExecutionsTable,
  usersTable,
  type TradeSignal,
  type AppAccess,
  type ClientSettings,
  type SymbolPair,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import type { Logger } from "pino";
import { decryptMT5Password } from "./mt5-crypto";
import { executeTradeOnVps, closeTradeOnVps, modifyTradeOnVps, type VpsResult } from "./mt5-vps";
import { broadcastToClient } from "../ws";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Map a mentor's orderType to a market BUY/SELL the VPS understands.
function resolveAction(orderType: string): "BUY" | "SELL" {
  return orderType.toUpperCase().startsWith("SELL") ? "SELL" : "BUY";
}

// MT5 trade comment: always reflects the mentor's CURRENT EA name (robotName),
// resolved live at execution time so new trades pick up name changes immediately.
// Format: "<ea_name> | EA CLOUD". Falls back to "EA Cloud sig#<signalId>" when the
// mentor has not set an EA name.
function buildTradeComment(eaName: string, signalId: number): string {
  const name = eaName.trim();
  return name ? `${name} | EA CLOUD` : `EA Cloud sig#${signalId}`;
}

// Resolve copy volume from the signal, honouring the client's lot-sizing config.
// A per-pair `customLot` (from the client's symbol config) takes precedence over
// the global lot-sizing mode when present. The maxLotSize cap always applies.
function resolveVolume(signalLots: number | null, s: ClientSettings, customLot: number | null = null): number {
  const base = signalLots ?? 0;
  let vol: number;
  if (customLot !== null && customLot > 0) {
    vol = customLot;
  } else {
    switch (s.lotMode) {
      case "fixed":
        vol = num(s.fixedLotSize) ?? base;
        break;
      case "multiplier":
        vol = base * (num(s.lotMultiplier) ?? 1);
        break;
      default: // risk_percent (needs balance/pip data we don't have here) → copy 1:1
        vol = base;
    }
  }
  const cap = num(s.maxLotSize);
  if (cap !== null && cap > 0) vol = Math.min(vol, cap);
  vol = Math.round(vol * 100) / 100; // 2dp lots
  return vol > 0 ? vol : 0;
}

// Map a signal's symbol to the mentor's canonical pair name. Matches either the
// pair's canonical name or any of its broker variations (case-insensitive).
// Returns null when the mentor has not configured a pair for this symbol — in
// which case the copy engine falls back to the raw signal symbol + global lots.
function resolvePairName(symbol: string, pairs: SymbolPair[]): string | null {
  const sym = symbol.trim().toLowerCase();
  if (!sym) return null;
  for (const p of pairs) {
    if (p.pairName.trim().toLowerCase() === sym) return p.pairName;
    const vars = p.variations.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
    if (vars.includes(sym)) return p.pairName;
  }
  return null;
}

// Build a redacted, whitelisted view of the VPS response for storage/logging.
// NEVER persist or log the raw response blob — that is the only place a leaked
// credential could surface if the VPS contract ever changed.
function vpsSummary(r: VpsResult): Record<string, unknown> {
  const raw = (r.data && typeof r.data === "object") ? (r.data as Record<string, any>) : null;
  const inner = (raw && raw.data && typeof raw.data === "object") ? raw.data as Record<string, any> : raw;
  return {
    ok: r.ok,
    httpStatus: r.httpStatus,
    message: r.message,
    ticket: r.ticket,
    retcode: r.retcode,
    deal: inner?.deal ?? null,
    order: inner?.order ?? null,
    volume: inner?.volume ?? null,
    price: inner?.price ?? null,
    partial: inner?.partial ?? null,
    detail: raw?.detail ?? null, // FastAPI error detail (e.g. "Not Found")
  };
}

// Broadcast a real-time execution update to the owning client.
function pushUpdate(clientId: number, execution: unknown) {
  try {
    broadcastToClient(clientId, { type: "TRADE_EXECUTION", execution });
  } catch {
    // WS delivery is best-effort; never let it break execution.
  }
}

// Outcome of attempting one client for one signal — drives signal-level retry.
export type ClientOutcome = "success" | "failed_retryable" | "failed_terminal" | "skipped" | "already_done";

async function recordSkip(
  signal: TradeSignal,
  client: AppAccess,
  reason: string,
  log: Logger,
): Promise<ClientOutcome> {
  const [row] = await db.insert(tradeExecutionsTable).values({
    signalId: signal.id,
    mentorId: signal.mentorId,
    clientId: client.id,
    signalKind: signal.signal,
    symbol: signal.symbol,
    action: signal.signal === "OPEN" ? resolveAction(signal.orderType) : signal.signal,
    status: "skipped",
    errorMessage: reason,
    mentorTicket: signal.ticket ?? null,
  }).returning();
  log.info({ mentorId: signal.mentorId, clientId: client.id, signalId: signal.id, reason }, "[CopyEngine] client skipped");
  pushUpdate(client.id, row);
  return "skipped";
}

// Idempotency guard. A signal may be processed more than once (retry after a
// VPS failure, or resume after a restart). Decide whether this client still
// needs work, based on its latest execution row for THIS signal:
//   success / skipped              -> done, never redo
//   failed & retryable=0 (terminal/interrupted) -> never redo (avoid duplicate fills)
//   failed & retryable=1           -> re-attempt (the order never executed)
//   pending                        -> in-flight elsewhere -> do not touch
//   no row                         -> first attempt
// Returns "already_done" when the client should be skipped this pass.
async function priorOutcome(signalId: number, clientId: number): Promise<ClientOutcome | null> {
  const [prev] = await db.select({ status: tradeExecutionsTable.status, retryable: tradeExecutionsTable.retryable })
    .from(tradeExecutionsTable)
    .where(and(eq(tradeExecutionsTable.signalId, signalId), eq(tradeExecutionsTable.clientId, clientId)))
    .orderBy(desc(tradeExecutionsTable.createdAt))
    .limit(1);
  if (!prev) return null;
  if (prev.status === "success") return "success";
  if (prev.status === "skipped") return "skipped";
  if (prev.status === "pending") return "already_done";
  if (prev.status === "failed") return prev.retryable === 1 ? null : "failed_terminal";
  return null;
}

function finalize(result: VpsResult, log: Logger, ctx: Record<string, unknown>) {
  log.info(
    { ...ctx, ok: result.ok, ticket: result.ticket, retcode: result.retcode, attempts: result.attempts, vpsResponse: vpsSummary(result) },
    result.ok ? "[CopyEngine] execution success" : "[CopyEngine] execution failed",
  );
}

// Find the client's own ticket for a mentor position (for CLOSE / MODIFY).
async function findClientTicket(clientId: number, mentorTicket: string | null): Promise<string | null> {
  if (!mentorTicket) return null;
  const [prior] = await db.select({ ticket: tradeExecutionsTable.ticket })
    .from(tradeExecutionsTable)
    .where(and(
      eq(tradeExecutionsTable.clientId, clientId),
      eq(tradeExecutionsTable.mentorTicket, mentorTicket),
      eq(tradeExecutionsTable.status, "success"),
      eq(tradeExecutionsTable.signalKind, "OPEN"),
    ))
    .orderBy(desc(tradeExecutionsTable.createdAt))
    .limit(1);
  return prior?.ticket ?? null;
}

// Persist a finished VPS attempt and broadcast it. Returns the client outcome.
async function settleExecution(
  executionId: number,
  clientId: number,
  result: VpsResult,
  log: Logger,
): Promise<ClientOutcome> {
  const retryable = !result.ok && result.retriable;
  const [updated] = await db.update(tradeExecutionsTable).set({
    status: result.ok ? "success" : "failed",
    ticket: result.ticket,
    retcode: result.retcode,
    attempts: result.attempts,
    retryable: retryable ? 1 : 0,
    vpsResponse: JSON.stringify(vpsSummary(result)),
    errorMessage: result.ok ? null : (result.message ?? "VPS execution failed"),
  }).where(eq(tradeExecutionsTable.id, executionId)).returning();
  pushUpdate(clientId, updated);
  if (result.ok) return "success";
  return retryable ? "failed_retryable" : "failed_terminal";
}

async function executeForClient(signal: TradeSignal, client: AppAccess, eaName: string, canonicalPair: string | null, log: Logger): Promise<ClientOutcome> {
  // Idempotency: never repeat finished work or risk a duplicate fill on retry.
  const prior = await priorOutcome(signal.id, client.id);
  if (prior !== null) {
    log.info({ signalId: signal.id, clientId: client.id, prior }, "[CopyEngine] client already settled — skipping");
    return prior === "skipped" || prior === "success" ? prior : "already_done";
  }

  const [settings] = await db.select().from(clientSettingsTable)
    .where(eq(clientSettingsTable.clientId, client.id)).limit(1);

  // 1. Bot must be enabled.
  if (!settings || settings.copyingEnabled !== true) {
    return recordSkip(signal, client, "Bot disabled (copying paused)", log);
  }
  // 2. MT5 must be reachable with a login + server.
  if (!settings.mt5Connected || !settings.mt5Login || !settings.mt5Server) {
    return recordSkip(signal, client, "MT5 not connected", log);
  }
  // 2b. Connected flag set but NO stored credentials. The connect flow always
  // persists the encrypted password alongside mt5Connected=true, so a missing
  // password means a stale/legacy row (e.g. connected before the password
  // column existed). We cannot dispatch to the VPS without it — surface an
  // actionable reason instead of the generic "MT5 not connected".
  if (!settings.encryptedMt5Password) {
    return recordSkip(signal, client, "MT5 credentials missing — please reconnect your account", log);
  }

  // Decrypt the password in memory only — never logged or persisted in plaintext.
  let password: string;
  try {
    password = decryptMT5Password(settings.encryptedMt5Password);
  } catch (err) {
    log.error({ clientId: client.id, err }, "[CopyEngine] password decrypt failed");
    return recordSkip(signal, client, "Stored credentials could not be decrypted", log);
  }

  const baseCtx = {
    mentorId: signal.mentorId,
    clientId: client.id,
    clientMt5Login: settings.mt5Login,
    clientMt5Server: settings.mt5Server,
    signalId: signal.id,
  };

  // ── OPEN ────────────────────────────────────────────────────────────────
  if (signal.signal === "OPEN") {
    const action = resolveAction(signal.orderType);

    // Apply the client's broker-symbol selection + per-pair custom lot, if the
    // mentor configured this pair and the client has a saved config for it.
    let execSymbol = signal.symbol;
    let customLot: number | null = null;
    if (canonicalPair) {
      const [cfg] = await db.select().from(clientSymbolConfigsTable)
        .where(and(
          eq(clientSymbolConfigsTable.clientId, client.id),
          eq(clientSymbolConfigsTable.pairName, canonicalPair),
        )).limit(1);
      if (cfg?.selectedSymbol) execSymbol = cfg.selectedSymbol;
      const lot = num(cfg?.customLotSize);
      if (lot !== null && lot > 0) customLot = lot;
    }

    const volume = resolveVolume(num(signal.lots), settings, customLot);
    if (volume <= 0) {
      return recordSkip(signal, client, "Resolved lot size is zero", log);
    }

    // Pre-dispatch trace: exactly what mapping is being applied for THIS client
    // before the order is sent to the VPS. Confirms the remap + custom lot.
    log.info(
      {
        client: client.id,
        pair: canonicalPair ?? signal.symbol,
        signalSymbol: signal.symbol,
        selectedSymbol: execSymbol,
        lotSize: volume,
      },
      "[CopyEngine] dispatching trade to VPS",
    );

    const [pending] = await db.insert(tradeExecutionsTable).values({
      signalId: signal.id, mentorId: signal.mentorId, clientId: client.id,
      signalKind: "OPEN", symbol: execSymbol, action, volume: String(volume),
      status: "pending", mentorTicket: signal.ticket ?? null,
    }).returning();
    pushUpdate(client.id, pending);

    const result = await executeTradeOnVps({
      login: settings.mt5Login, password, server: settings.mt5Server,
      symbol: execSymbol, action, volume,
      sl: num(signal.stopLoss), tp: num(signal.takeProfit),
      comment: buildTradeComment(eaName, signal.id),
    }, log);
    finalize(result, log, { ...baseCtx, action, volume, signalSymbol: signal.symbol, execSymbol, canonicalPair });
    return settleExecution(pending.id, client.id, result, log);
  }

  // ── CLOSE / MODIFY ──────────────────────────────────────────────────────
  const clientTicket = await findClientTicket(client.id, signal.ticket ?? null);
  if (!clientTicket) {
    return recordSkip(signal, client, "No matching open position to " + signal.signal.toLowerCase(), log);
  }

  const action = signal.signal; // CLOSE | MODIFY
  const [pending] = await db.insert(tradeExecutionsTable).values({
    signalId: signal.id, mentorId: signal.mentorId, clientId: client.id,
    signalKind: signal.signal, symbol: signal.symbol, action,
    status: "pending", ticket: clientTicket, mentorTicket: signal.ticket ?? null,
  }).returning();
  pushUpdate(client.id, pending);

  const result = signal.signal === "CLOSE"
    ? await closeTradeOnVps({ login: settings.mt5Login, password, server: settings.mt5Server, ticket: clientTicket }, log)
    : await modifyTradeOnVps({ login: settings.mt5Login, password, server: settings.mt5Server, ticket: clientTicket, sl: num(signal.stopLoss), tp: num(signal.takeProfit) }, log);
  finalize(result, log, { ...baseCtx, action, clientTicket });
  return settleExecution(pending.id, client.id, result, log);
}

export interface SignalRunResult {
  clientCount: number;
  attempted: number;          // clients that ran this pass
  succeeded: number;
  failedRetryable: number;    // VPS unreachable/transient — worth retrying the signal
  failedTerminal: number;     // deterministic failure — will not change on retry
  skipped: number;
}

// Fan a single mentor signal out to every subscribed client.
// One client failing must NOT stop the others, so each is wrapped in try/catch.
// Returns a per-outcome tally so the worker can decide whether to retry the signal.
export async function runSignal(signal: TradeSignal, log: Logger): Promise<SignalRunResult> {
  const clients = await db.select().from(appAccessTable)
    .where(eq(appAccessTable.mentorId, signal.mentorId));

  // Resolve the mentor's CURRENT EA name (robotName) at execution time so every
  // new trade comment reflects the latest value configured in the Mentor Portal.
  const [mentor] = await db.select({ robotName: usersTable.robotName })
    .from(usersTable).where(eq(usersTable.id, signal.mentorId)).limit(1);
  const eaName = (mentor?.robotName ?? "").trim();

  // Load the mentor's ACTIVE trading pairs once and resolve the canonical pair
  // for this signal's symbol. Drives per-client broker-symbol remap + custom lot
  // sizing. Only active pairs are honoured — matching what clients can see/edit.
  const pairs = await db.select().from(symbolPairsTable)
    .where(and(eq(symbolPairsTable.mentorId, signal.mentorId), eq(symbolPairsTable.isActive, true)));
  const canonicalPair = resolvePairName(signal.symbol, pairs);

  const approved = clients.filter((c) => c.status === "approved");

  // Full subscriber-selection trace: every app_access row mapped to this mentor,
  // its approval status, and which ones were actually selected for execution.
  log.info(
    {
      signalId: signal.id,
      mentorId: signal.mentorId,
      kind: signal.signal,
      eaName: eaName || "(none — using fallback)",
      subscribersFound: clients.length,
      subscribersApproved: approved.length,
      candidates: clients.map((c) => ({ clientId: c.id, status: c.status })),
      selectedClientIds: approved.map((c) => c.id),
    },
    "[CopyEngine] processing signal — subscriber selection",
  );

  if (approved.length === 0) {
    log.warn(
      { signalId: signal.id, mentorId: signal.mentorId, subscribersFound: clients.length },
      "[CopyEngine] NO approved subscribers mapped to this mentor — nothing to execute (check app_access.mentor_id linkage)",
    );
  }

  const tally: SignalRunResult = {
    clientCount: clients.length, attempted: 0, succeeded: 0,
    failedRetryable: 0, failedTerminal: 0, skipped: 0,
  };

  for (const client of clients) {
    if (client.status !== "approved") {
      log.info({ clientId: client.id, status: client.status }, "[CopyEngine] client not approved — skipping");
      continue;
    }
    try {
      const outcome = await executeForClient(signal, client, eaName, canonicalPair, log);
      switch (outcome) {
        case "success": tally.succeeded++; tally.attempted++; break;
        case "failed_retryable": tally.failedRetryable++; tally.attempted++; break;
        case "failed_terminal": tally.failedTerminal++; tally.attempted++; break;
        case "skipped": tally.skipped++; break;
        case "already_done": break; // settled by a prior pass — no work this time
      }
    } catch (err) {
      // An unexpected error (e.g. DB blip) is treated as retryable so the signal
      // is re-queued rather than silently dropping this client.
      tally.failedRetryable++;
      log.error({ mentorId: signal.mentorId, clientId: client.id, signalId: signal.id, err }, "[CopyEngine] client execution errored — will retry");
    }
  }

  log.info({ mentorId: signal.mentorId, signalId: signal.id, ...tally }, "[CopyEngine] signal processing complete");
  return tally;
}
