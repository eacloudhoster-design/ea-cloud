import { MT5_VPS_BASE, mt5Headers } from "./mt5-endpoint";
export interface BoundAccountStatus {
  success: true; connected: true; simulation: false; account_mode: "demo";
  login: number; server: string; broker: string; role: "client" | "mentor";
  execution_enabled: boolean; emergency_stop_active: boolean | null; journal_bound: boolean; read_only:boolean;
  currency: string | null; balance: number | null; equity: number | null;
  open_positions: number; pending_orders: number; journal_holds:number | null;
}
const bindingErrors:Record<string,string>={
  ACCOUNT_NOT_ASSIGNED:"This account has no authoritative demo worker assignment. Request provisioning.",
  ACCOUNT_PROOF_REJECTED:"Account credentials do not match the assigned terminal binding.",
  MT5_SESSION_UNAVAILABLE:"The assigned demo terminal session is unavailable or lacks valid private authorization.",
};
class AccountBindingError extends Error {constructor(readonly code:string){super(bindingErrors[code]);}}
export function accountBindingFailure(error:unknown){
  const code=error instanceof AccountBindingError?error.code:"MT5_BINDING_UNVERIFIED";
  return {code,error:bindingErrors[code]||"The provisioned demo account could not be verified. Check the assigned worker and authorization."};
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
  if(!response.ok && Object.hasOwn(bindingErrors,data?.code))throw new AccountBindingError(data.code);
  const readonly=data?.read_only===true;
  const validJournal=readonly ? data.protocol==="EA_READ_ONLY_STATUS_V1" && data.financial_routes===false && data.execution_enabled===false && data.journal_bound===false && data.journal_holds===null && (data.emergency_stop_active===null || typeof data.emergency_stop_active==="boolean") : typeof data?.emergency_stop_active==="boolean" && data.journal_bound===true && Number.isSafeInteger(data.journal_holds) && data.journal_holds>=0;
  const brokers = ["deriv", "exness", "justmarkets", "xm", "rcg"];
  if (!response.ok || data?.success !== true || data.connected !== true || data.simulation !== false || data.account_mode !== "demo" ||
      data.login !== Number(login) || data.server !== server || !brokers.includes(data.broker) || !["mentor","client"].includes(data.role) ||
      typeof data.execution_enabled !== "boolean" || !validJournal || !Number.isSafeInteger(data.open_positions) || data.open_positions < 0 || !Number.isSafeInteger(data.pending_orders) || data.pending_orders < 0)
    throw Error("Provisioned demo account verification unavailable");
  if(data.execution_enabled && (data.emergency_stop_active || (data.journal_holds!==null && data.journal_holds>0) || data.role!=="client"))
    throw Error("Contradictory account safety snapshot");
  // Explicit projection: never return upstream credentials, names or debug text.
  const cash = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
  return { success:true, connected:true, simulation:false, account_mode:"demo",login:data.login,server:data.server,broker:data.broker,role:data.role,
    execution_enabled:data.execution_enabled, emergency_stop_active:data.emergency_stop_active,journal_bound:data.journal_bound,read_only:readonly,
    currency:typeof data.currency === "string" && /^[A-Z]{3}$/.test(data.currency) ? data.currency : null,
    balance:cash(data.balance),equity:cash(data.equity),open_positions:data.open_positions,pending_orders:data.pending_orders,journal_holds:data.journal_holds };
}

export interface BrokerSnapshot {
  observedAt:string; historyFrom:string; truncated:Record<string,boolean>;
  positions:Record<string,string|number>[]; orders:Record<string,string|number>[];
  deals:Record<string,string|number>[]; historyOrders:Record<string,string|number>[];
}
/** Read only the enrolled binding. No raw SDK metadata or upstream diagnostics escape. */
export async function readBoundSnapshot(login:string,server:string,password:string,broker:string):Promise<BrokerSnapshot> {
  if(!/^[1-9]\d*$/.test(login) || !Number.isSafeInteger(Number(login)) || !server || !password)throw Error("ACCOUNT_NOT_CONFIGURED");
  const response=await fetch(`${MT5_VPS_BASE}/observer/account-snapshot`,{method:"POST",redirect:"error",headers:mt5Headers(),body:JSON.stringify({login:Number(login),server,password}),signal:AbortSignal.timeout(20000)});
  const data:any=await response.json().catch(()=>null);
  if(!response.ok || data?.success!==true || data.simulation!==false || data.account_mode!=="demo" || data.login!==Number(login) || data.server!==server || data.broker!==broker || data.role!=="client")throw Error("BROKER_SNAPSHOT_UNAVAILABLE");
  const fields=new Set(["ticket","identifier","time","type","magic","volume","price_open","price_current","sl","tp","profit","symbol","time_setup","time_done","state","volume_initial","volume_current","order","entry","position_id","price","commission","swap"]);
  const ids=new Set(["ticket","identifier","order","position_id"]);
  const out:any={};
  for(const name of ["positions","orders","deals","historyOrders"]){
    if(!Array.isArray(data[name]) || data[name].length>200 || typeof data.truncated?.[name]!=="boolean")throw Error("BROKER_SNAPSHOT_INVALID");
    out[name]=data[name].map((row:any)=>{
      if(!row || typeof row!=="object" || Array.isArray(row))throw Error("BROKER_SNAPSHOT_INVALID");
      const result:Record<string,string|number>={};
      for(const [k,v] of Object.entries(row))if(fields.has(k)){
        if(k==="symbol" ? typeof v!=="string" || !/^[^\x00-\x1f\x7f]{1,64}$/.test(v) : ids.has(k) ? typeof v!=="string" || !/^\d{1,20}$/.test(v) : typeof v!=="number" || !Number.isFinite(v))throw Error("BROKER_SNAPSHOT_INVALID");
        result[k]=v as string|number;
      }
      if(!result.ticket || !result.symbol)throw Error("BROKER_SNAPSHOT_INVALID");
      return result;
    });
  }
  if(typeof data.observed_at!=="string" || typeof data.history_from!=="string" || !Number.isFinite(Date.parse(data.observed_at)) || !Number.isFinite(Date.parse(data.history_from)))throw Error("BROKER_SNAPSHOT_INVALID");
  const age=Date.now()-Date.parse(data.observed_at);if(age< -5000 || age>30000)throw Error("BROKER_SNAPSHOT_STALE");
  return {...out,observedAt:data.observed_at,historyFrom:data.history_from,truncated:Object.fromEntries(["positions","orders","deals","historyOrders"].map(k=>[k,data.truncated[k]]))};
}
