import { MT5_VPS_BASE, mt5Headers } from "./mt5-endpoint";
export interface BoundAccountStatus {
  success: true; connected: true; simulation: false; account_mode: "demo";
  login: number; server: string; broker: string; role: "client" | "mentor";
  execution_enabled: boolean; emergency_stop_active: boolean; journal_bound: true;
  currency: string | null; balance: number | null; equity: number | null;
  open_positions: number; pending_orders: number; journal_holds:number;
}
/** Credential proof and exact binding, never a generic HTTP-200 connectivity claim. */
export async function readBoundAccount(login: string | number, server: string, password: string): Promise<BoundAccountStatus> {
  if (!/^[1-9]\d*$/.test(String(login)) || !Number.isSafeInteger(Number(login)) || !server || typeof password !== "string" || !password)
    throw Error("Invalid account binding");
  const response = await fetch(`${MT5_VPS_BASE}/observer/account-status`, {
    method: "POST", redirect: "error", headers: mt5Headers(),
    body: JSON.stringify({ login: Number(login), server, password }), signal: AbortSignal.timeout(20000),
  });
  const data: any = await response.json().catch(() => null);
  const brokers = ["deriv", "exness", "justmarkets", "xm", "rcg"];
  if (!response.ok || data?.success !== true || data.connected !== true || data.simulation !== false || data.account_mode !== "demo" ||
      data.login !== Number(login) || data.server !== server || !brokers.includes(data.broker) || !["mentor","client"].includes(data.role) ||
      typeof data.execution_enabled !== "boolean" || typeof data.emergency_stop_active !== "boolean" || data.journal_bound !== true ||
      !Number.isSafeInteger(data.journal_holds) || data.journal_holds < 0 || !Number.isSafeInteger(data.open_positions) || data.open_positions < 0 || !Number.isSafeInteger(data.pending_orders) || data.pending_orders < 0)
    throw Error("Provisioned demo account verification unavailable");
  if(data.execution_enabled && (data.emergency_stop_active || data.journal_holds>0 || data.role!=="client"))
    throw Error("Contradictory account safety snapshot");
  // Explicit projection: never return upstream credentials, names or debug text.
  const cash = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
  return { success:true, connected:true, simulation:false, account_mode:"demo",login:data.login,server:data.server,broker:data.broker,role:data.role,
    execution_enabled:data.execution_enabled, emergency_stop_active:data.emergency_stop_active,journal_bound:true,
    currency:typeof data.currency === "string" && /^[A-Z]{3}$/.test(data.currency) ? data.currency : null,
    balance:cash(data.balance),equity:cash(data.equity),open_positions:data.open_positions,pending_orders:data.pending_orders,journal_holds:data.journal_holds };
}
