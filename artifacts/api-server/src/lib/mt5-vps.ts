import type { Logger } from "pino";

// ─── MT5 VPS trade-execution client ───────────────────────────────────────────
// Thin wrapper around the FastAPI service running on the Windows VPS
// (see /vps-mt5-service). Handles structured success detection and transient
// retry. NEVER log the decrypted password passed in `password`.

const EXTERNAL_MT5_BASE = "http://102.214.9.67:8000";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [500, 1500]; // delay before attempts 2 and 3

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Single POST attempt — classifies the outcome but does not retry.
async function postOnce(path: string, body: Record<string, unknown>): Promise<Omit<VpsResult, "attempts">> {
  let res: Response;
  try {
    res = await fetch(`${EXTERNAL_MT5_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Network error / timeout — never reached or no response: transient.
    return { ok: false, httpStatus: 0, ticket: null, retcode: null, message: "VPS unreachable", data: null, retriable: true };
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  // Transient server-side problems are worth retrying.
  if (res.status >= 500 || res.status === 429) {
    return { ok: false, httpStatus: res.status, ticket: null, retcode: null, message: `VPS HTTP ${res.status}`, data, retriable: true };
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

async function callWithRetry(path: string, body: Record<string, unknown>, log: Logger): Promise<VpsResult> {
  let last: Omit<VpsResult, "attempts"> | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await postOnce(path, body);
    if (last.ok || !last.retriable) {
      return { ...last, attempts: attempt };
    }
    if (attempt < MAX_ATTEMPTS) {
      const delay = RETRY_BACKOFF_MS[attempt - 1] ?? 1500;
      log.warn({ path, attempt, httpStatus: last.httpStatus, message: last.message }, "VPS call transient failure — retrying");
      await sleep(delay);
    }
  }
  return { ...(last as Omit<VpsResult, "attempts">), attempts: MAX_ATTEMPTS };
}

export function executeTradeOnVps(p: ExecuteParams, log: Logger): Promise<VpsResult> {
  return callWithRetry("/execute-trade", {
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
  return callWithRetry("/close-trade", {
    login: Number(p.login),
    password: p.password,
    server: p.server,
    ticket: Number(p.ticket),
    volume: p.volume ?? undefined,
  }, log);
}

export function modifyTradeOnVps(p: ModifyParams, log: Logger): Promise<VpsResult> {
  return callWithRetry("/modify-trade", {
    login: Number(p.login),
    password: p.password,
    server: p.server,
    ticket: Number(p.ticket),
    sl: p.sl ?? undefined,
    tp: p.tp ?? undefined,
  }, log);
}
