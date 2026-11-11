import {executionGatewayHeaders} from "./mt5-endpoint";
import {nonTradingRelease,financialExecutionBlocked} from "./release-mode";
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
    (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname))) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error("Observer VPS URL must be an HTTPS origin.");
  const text = process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS;
  if (!text || text.length > 65536) throw Error("Explicit account gateway assignments required");
  const assignments: any = JSON.parse(text);
  if (!Array.isArray(assignments) || !assignments.length || assignments.length > 1000) throw Error("Invalid gateway assignments");
  const identities = new Set<string>();
  for (const row of assignments) {
    if (!row || typeof row !== "object" || Object.keys(row).sort().join(",") !== "broker,gatewayOrigin,login,server" ||
        !Number.isSafeInteger(row.login) || row.login < 1 || row.login > 2147483647 ||
        typeof row.server !== "string" || !row.server || row.server.length > 100 || row.server !== row.server.trim() || /[\x00-\x1f\x7f]/.test(row.server) ||
        !["deriv","exness","justmarkets","xm","rcg"].includes(row.broker) || row.gatewayOrigin !== url.origin) throw Error("Invalid or conflicting gateway assignment");
    const identity = JSON.stringify([row.login,row.server]);
    if (identities.has(identity)) throw Error("Duplicate account gateway assignment");
    identities.add(identity);
  }
  return { url, token, assignments };
}
async function verifyGateway({url, token, assignments}: ReturnType<typeof configuration>) {
  const r = await fetch(new URL("/observer/capabilities", url), {
    redirect: "error",
    headers: executionGatewayHeaders(url.origin,token),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw Error("Observer VPS capability check failed.");
  const c: any = await r.json();
  if (
    c.service !== "ea-cloud-account-router-v1" || !Array.isArray(c.assignments) || c.assignments.length !== assignments.length ||
    !assignments.every((assigned: any) => c.assignments.filter((row: any) => row && row.login === assigned.login && row.server === assigned.server && row.broker === assigned.broker && row.role === "client").length === 1) ||
    c.version !== 2 ||
    c.persistentJournal !== true ||
    c.absoluteTargets !== true || c.simulation !== false || c.account_mode !== "demo" || c.execution_enabled !== true || c.emergency_stop_active !== false || c.journal_holds !== 0
  )
    throw Error(
      "Upgrade and verify the observer VPS journal before enabling copying.",
    );
  return true;
}
export async function observerCapabilities() {
  if(nonTradingRelease())throw Error("Financial execution is disabled in this release");
  return verifyGateway(configuration());
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
  maxExposureLots?: number;
  maxDailyDrawdown: number;
}): Promise<VpsResult> {
  if(nonTradingRelease())return financialExecutionBlocked();
  let config: ReturnType<typeof configuration>;
  try {
    config = configuration();
    if (!/^[1-9]\d*$/.test(input.login) || !config.assignments.some((row: any) => row.login === Number(input.login) && row.server === input.server)) throw Error("Unassigned account");
    await verifyGateway(config);
  } catch {
    return {ok:false,httpStatus:0,ticket:null,retcode:null,message:"Assigned authoritative gateway unavailable or unverified",data:{code:"GATEWAY_ASSIGNMENT_UNVERIFIED",uncertain:false,submission_started:false},retriable:false,attempts:0};
  }
  try {
    const { url, token } = config;
    const r = await fetch(new URL("/observer/sync-position", url), {
      method: "POST",
      redirect:"error",
      headers: executionGatewayHeaders(url.origin,token),
      body: JSON.stringify({ ...input, login: Number(input.login) }),
      signal: AbortSignal.timeout(20000),
    });
    const data: any = await r.json().catch(() => null);
    const malformed = !data || typeof data !== "object" || Array.isArray(data) || typeof data.success !== "boolean" ||
      ["uncertain","retriable"].some(key => data[key] !== undefined && typeof data[key] !== "boolean");
    const ok = !malformed && r.status === 200 && data?.success === true && data?.simulation === false && data?.account_mode === "demo" && data?.uncertain !== true && data?.retriable !== true;
    const noSubmission = !malformed && data?.success === false && data?.submission_started === false && data?.uncertain !== true;
    const ambiguous = !ok && !noSubmission && (malformed || data?.success === true || data?.uncertain === true || r.status >= 500);
    const evidence = ambiguous ? {...(data && typeof data === "object" ? data : {}),success:false,uncertain:true,retriable:false} : data;
    return {
      ok,
      httpStatus: r.status,
      ticket: data?.data?.ticket ?? null,
      retcode: data?.data?.retcode ?? null,
      message:
        typeof data?.message === "string"
          ? data.message
          : "Observer execution bridge rejected the request.",
      data: evidence,
      retriable: r.status === 503 && noSubmission && data?.retriable === true,
      attempts: 1,
    };
  } catch {
    return {
      ok: false,
      httpStatus: 0,
      ticket: null,
      retcode: null,
      message:
        "Observer execution outcome unknown; reconcile before retry",
      data: {code:"GATEWAY_OUTCOME_UNKNOWN",uncertain:true,retriable:false},
      retriable: false,
      attempts: 1,
    };
  }
}
