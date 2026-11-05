import { MT5_VPS_BASE, mt5Headers } from "./mt5-endpoint";
import type { Logger } from "pino";

// ─── MT5 VPS trade-execution client ───────────────────────────────────────────
// Thin wrapper around the FastAPI service running on the Windows VPS
// (see /vps-mt5-service). Handles structured success detection without
// replaying ambiguous non-idempotent submissions. NEVER log the decrypted password passed in `password`.

const EXTERNAL_MT5_BASE = MT5_VPS_BASE;
const REQUEST_TIMEOUT_MS = 20_000;

export interface VpsResult {
  ok: boolean;                 // logical success (terminal executed the request)
  httpStatus: number;          // 0 when the request never reached the VPS
  ticket: string | null;       // client's MT5 ticket, when present
  retcode: number | null;      // MT5 order_send retcode, when present
  message: string | null;      // VPS human-readable message
  data: unknown;               // full parsed VPS response (for storage)
  retriable: boolean;          // failure looked transient (worth retrying)
  attempts: number;            // how many attempts were made
}

interface ExecuteParams {
  login: string | number;
  password: string;
  server: string;
  symbol: string;
  action: "BUY" | "SELL";
  volume: number;
  sl?: number | null;
  tp?: number | null;
  comment?: string;
}

interface CloseParams {
  login: string | number;
  password: string;
  server: string;
  ticket: string | number;
  volume?: number | null;
}

interface ModifyParams {
  login: string | number;
  password: string;
  server: string;
  ticket: string | number;
  sl?: number | null;
  tp?: number | null;
}

// Single POST attempt — classifies the outcome but does not retry.
async function postOnce(path: string, body: Record<string, unknown>): Promise<Omit<VpsResult, "attempts">> {
  let res: Response;
  try {
    res = await fetch(`${EXTERNAL_MT5_BASE}${path}`, {
      method: "POST",
      redirect: "error",
      headers: mt5Headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // A missing response does not establish whether the broker already filled.
    return { ok: false, httpStatus: 0, ticket: null, retcode: null, message: "VPS outcome unknown; reconcile account history before retry", data: { uncertain: true }, retriable: false };
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  // HTTP failure alone cannot establish that no broker submission occurred.
  if (res.status >= 500 || res.status === 429) {
    return { ok: false, httpStatus: res.status, ticket: null, retcode: null, message: `VPS HTTP ${res.status}; reconcile before retry`, data, retriable: false };
  }

  // Logical success requires a positive, structured marker from the VPS — an
  // empty/non-JSON 200 body (data === null) must NOT count as success.
  const ok = res.ok && data != null && data.success === true && data.status !== "failed";
  const inner = (data && typeof data === "object" && data.data) ? data.data : data;
  const ticket = inner?.ticket != null ? String(inner.ticket) : null;
  const retcode = inner?.retcode != null ? Number(inner.retcode) : null;
  const message = data?.message != null ? String(data.message) : null;

  // Logical failures (e.g. "No money", "login failed") are deterministic — do not retry.
  return { ok, httpStatus: res.status, ticket, retcode, message, data, retriable: false };
}

async function callOnce(path: string, body: Record<string, unknown>, log: Logger): Promise<VpsResult> {
  const result = await postOnce(path, body);
  if (!result.ok && result.httpStatus === 0) {
    log.warn({ path }, "VPS submission outcome unknown; automatic replay blocked");
  }
  return { ...result, attempts: 1 };
}

export function executeTradeOnVps(p: ExecuteParams, log: Logger): Promise<VpsResult> {
  return callOnce("/execute-trade", {
    login: Number(p.login),
    password: p.password,
    server: p.server,
    symbol: p.symbol,
    action: p.action,
    volume: p.volume,
    sl: p.sl ?? undefined,
    tp: p.tp ?? undefined,
    comment: p.comment,
  }, log);
}

export function closeTradeOnVps(p: CloseParams, log: Logger): Promise<VpsResult> {
  return callOnce("/close-trade", {
    login: Number(p.login),
    password: p.password,
    server: p.server,
    ticket: Number(p.ticket),
    volume: p.volume ?? undefined,
  }, log);
}

export function modifyTradeOnVps(p: ModifyParams, log: Logger): Promise<VpsResult> {
  return callOnce("/modify-trade", {
    login: Number(p.login),
    password: p.password,
    server: p.server,
    ticket: Number(p.ticket),
    sl: p.sl ?? undefined,
    tp: p.tp ?? undefined,
  }, log);
}
