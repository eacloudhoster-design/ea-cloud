import type { VpsResult } from "./mt5-vps";
function configuration() {
  const raw = process.env.OBSERVER_MT5_VPS_URL,
    token = process.env.OBSERVER_MT5_VPS_TOKEN;
  if (!raw || !token || token.length < 32)
    throw Error(
      "Observer execution requires a separately authenticated HTTPS VPS bridge.",
    );
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error("Observer VPS URL must be an HTTPS origin.");
  return { url, token };
}
export async function observerCapabilities() {
  const { url, token } = configuration();
  const r = await fetch(new URL("/observer/capabilities", url), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw Error("Observer VPS capability check failed.");
  const c: any = await r.json();
  if (
    c.version !== 2 ||
    c.persistentJournal !== true ||
    c.absoluteTargets !== true
  )
    throw Error(
      "Upgrade and verify the observer VPS journal before enabling copying.",
    );
  return true;
}
export async function syncObserverPosition(input: {
  login: string;
  password: string;
  server: string;
  sourceKey: string;
  revision: number;
  symbol: string;
  target: number;
  sl: number;
  tp: number;
  maxVolume: number;
  maxOpenTrades: number;
  maxDailyDrawdown: number;
}): Promise<VpsResult> {
  try {
    const { url, token } = configuration();
    const r = await fetch(new URL("/observer/sync-position", url), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...input, login: Number(input.login) }),
      signal: AbortSignal.timeout(20000),
    });
    const data: any = await r.json().catch(() => null);
    return {
      ok: r.ok && data?.success === true,
      httpStatus: r.status,
      ticket: data?.data?.ticket ?? null,
      retcode: data?.data?.retcode ?? null,
      message:
        typeof data?.message === "string"
          ? data.message
          : "Observer execution bridge rejected the request.",
      data,
      retriable: r.status >= 500 && data?.uncertain !== true,
      attempts: 1,
    };
  } catch {
    return {
      ok: false,
      httpStatus: 0,
      ticket: null,
      retcode: null,
      message:
        "Observer execution bridge unavailable. The same absolute target may be retried safely; unresolved broker submissions require manual reconciliation.",
      data: null,
      retriable: true,
      attempts: 1,
    };
  }
}
