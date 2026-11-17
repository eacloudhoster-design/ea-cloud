import {readFileSync,lstatSync} from "node:fs";
import {executionGatewayHeaders} from "./mt5-endpoint";
import {nonTradingRelease,financialExecutionBlocked} from "./release-mode";
import type { VpsResult } from "./mt5-vps";
async function configuration() {
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
  const file=process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS_FILE;
  let text=process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS;
  if(file){const m=lstatSync(file);if(!m.isFile()||m.isSymbolicLink()||(m.mode&0o022)!==0||(m.uid!==0&&m.uid!==process.getuid?.()))throw Error('Protected server assignment file required');text=readFileSync(file,'utf8');}
  if(process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS_SOURCE!==undefined){
    if(process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS_SOURCE!=='gateway'||file||text)throw Error('Choose one protected assignment source');
    const response=await fetch(new URL('/observer/assignments',url),{redirect:'error',headers:executionGatewayHeaders(url.origin,token),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('Authoritative assignment roster unavailable');const roster:any=await response.json();
    if(roster.version!==1||!Array.isArray(roster.assignments)||roster.assignments.some((r:any)=>r.role!=='client'))throw Error('Invalid assignment roster');
    text=JSON.stringify(roster.assignments.map((r:any)=>({login:r.login,server:r.server,broker:r.broker,gatewayOrigin:url.origin})));
  }
  if (!text) throw Error("Explicit account gateway assignments required");
  const assignments: any = JSON.parse(text);
  if (!Array.isArray(assignments) || !assignments.length) throw Error("Invalid gateway assignments");
  const identities = new Set<string>();
  for (const row of assignments) {
    if (!row || typeof row !== "object" || Object.keys(row).sort().join(",") !== "broker,gatewayOrigin,login,server" ||
        !Number.isSafeInteger(row.login) || row.login < 1 ||
        typeof row.server !== "string" || !row.server || row.server.length > 100 || row.server !== row.server.trim() || /[\x00-\x1f\x7f]/.test(row.server) ||
        !["deriv","exness","justmarkets","xm","rcg"].includes(row.broker) || row.gatewayOrigin !== url.origin) throw Error("Invalid or conflicting gateway assignment");
    const identity = JSON.stringify([row.login,row.server]);
    if (identities.has(identity)) throw Error("Duplicate account gateway assignment");
    identities.add(identity);
  }
  return { url, token, assignments };
}
async function verifyGateway({url, token, assignments}: Awaited<ReturnType<typeof configuration>>, input?:{login:string;server:string;password:string}, pending=false) {
  const r = await fetch(new URL(input?"/observer/account-capabilities":"/observer/capabilities", url), {
    ...(input?{method:"POST",body:JSON.stringify({...input,login:Number(input.login)})}:{}),
    redirect: "error",
    headers: executionGatewayHeaders(url.origin,token),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw Error("Observer VPS capability check failed.");
  const c: any = await r.json();
  const expected=input?assignments.filter((row:any)=>row.login===Number(input.login)&&row.server===input.server):assignments;
  if (
    c.service !== "ea-cloud-account-router-v1" || !Array.isArray(c.assignments) || c.assignments.length !== expected.length ||
    !expected.every((assigned: any) => c.assignments.filter((row: any) => row && row.login === assigned.login && row.server === assigned.server && row.broker === assigned.broker && row.role === "client").length === 1) ||
    c.version !== 2 ||
    c.persistentJournal !== true ||
    c.absoluteTargets !== true || c.simulation !== false || !["demo","live",...(input?[]:["mixed"])].includes(c.account_mode) || (pending && c.pendingOrders!==true) || c.execution_enabled !== true || c.emergency_stop_active !== false || c.journal_holds !== 0
  )
    throw Error(
      "Upgrade and verify the observer VPS journal before enabling copying.",
    );
  return true;
}
export async function observerCapabilities(mentorId?:number) {
  if(nonTradingRelease())throw Error("Financial execution is disabled in this release");
  if(mentorId===undefined)return verifyGateway(await configuration());
  if(!Number.isSafeInteger(mentorId)||mentorId<1)throw Error('Authenticated mentor required');
  const config=await configuration(),sessions=await receivingSessions();
  const {pool}=await import('@workspace/db');const {decryptMT5Password}=await import('./mt5-crypto');
  const rows=(await pool.query("SELECT i.login,i.server,i.broker,i.account_mode,i.owner_id,i.encrypted_password FROM mt5_account_inventory i JOIN app_access a ON a.id=i.owner_id WHERE i.owner_kind='client' AND i.account_role='client' AND i.state='linked' AND a.mentor_id=$1 AND a.status='approved'",[mentorId])).rows;
  const queue=rows.filter((r:any)=>sessions.some(v=>v.owner_id===r.owner_id&&String(v.login)===r.login&&v.server===r.server&&v.broker===r.broker&&v.mode===r.account_mode));
  if(!queue.length)throw Error('No owned receiving execution session for this mentor');
  let found=false;const deadline=Date.now()+10000;
  const probe=async()=>{while(!found&&queue.length&&Date.now()<deadline){const row=queue.shift();try{await verifyGateway(config,{login:row.login,server:row.server,password:decryptMT5Password(row.encrypted_password)});found=true;return true;}catch{}}throw Error('No ready owned receiving session');};
  return Promise.any(Array.from({length:Math.min(8,queue.length)},probe));
}
export interface PositionTarget {
  login: string;
  password: string;
  server: string;
  sourceKey: string;
  routingKey?:string;
  predecessorKey?:string;
  revision: number;
  symbol: string;
  target: number;
  sl: number;
  tp: number;
  maxVolume: number;
  maxOpenTrades: number;
  maxExposureLots?: number;
  maxDailyDrawdown: number;
}
export interface PendingTarget extends PositionTarget {orderType:2|3|4|5|6|7;state:"active"|"cancel";price:number;stoplimit:number;typeTime:0|1|2|3;expiration:number}
export async function syncObserverPosition(input:PositionTarget):Promise<VpsResult>{return syncTarget(input,false)}
export async function syncObserverPending(input:PendingTarget):Promise<VpsResult>{return syncTarget(input,true)}
async function syncTarget(input:PositionTarget|PendingTarget,pending:boolean):Promise<VpsResult> {
  if(nonTradingRelease())return financialExecutionBlocked();
  let config: Awaited<ReturnType<typeof configuration>>;
  try {
    config = await configuration();
    if (!/^[1-9]\d*$/.test(input.login) || !config.assignments.some((row: any) => row.login === Number(input.login) && row.server === input.server)) throw Error("Unassigned account");
    await verifyGateway(config,input,pending);
  } catch {
    return {ok:false,httpStatus:0,ticket:null,retcode:null,message:"Assigned authoritative gateway unavailable or unverified",data:{code:"GATEWAY_ASSIGNMENT_UNVERIFIED",uncertain:false,submission_started:false},retriable:false,attempts:0};
  }
  try {
    const { url, token } = config;
    const r = await fetch(new URL(pending?"/observer/sync-pending":"/observer/sync-position", url), {
      method: "POST",
      redirect:"error",
      headers: executionGatewayHeaders(url.origin,token),
      body: JSON.stringify({ ...input, login: Number(input.login) }),
      signal: AbortSignal.timeout(20000),
    });
    const data: any = await r.json().catch(() => null);
    const malformed = !data || typeof data !== "object" || Array.isArray(data) || typeof data.success !== "boolean" ||
      ["uncertain","retriable"].some(key => data[key] !== undefined && typeof data[key] !== "boolean");
    const ok = !malformed && r.status === 200 && data?.success === true && data?.simulation === false && ["demo","live"].includes(data?.account_mode) && data?.uncertain !== true && data?.retriable !== true;
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

/** Advisory broker sizing through the same pinned receiving account. No order submission. */
export async function sizeObserverPosition(input:{login:string;server:string;password:string;symbol:string;side:0|1;method:'risk_percent';risk_percent:number;stop_loss:number;max_lots:number;entry_price?:number}):Promise<number>{
 const config=await configuration();
 if(!config.assignments.some((r:any)=>r.login===Number(input.login)&&r.server===input.server))throw Error('Sizing account not assigned');
 const response=await fetch(new URL('/observer/size-position',config.url),{method:'POST',redirect:'error',headers:executionGatewayHeaders(config.url.origin,config.token),body:JSON.stringify({...input,login:Number(input.login)}),signal:AbortSignal.timeout(20000)});
 const data:any=await response.json().catch(()=>null);
 if(!response.ok||data?.success!==true||data.submitted!==false||data.method!=='risk_percent'||!['demo','live'].includes(data.account_mode)||typeof data.lots!=='number'||!Number.isFinite(data.lots)||data.lots<=0||data.lots>input.max_lots)throw Error('Broker risk sizing unavailable; approved stop/cost/margin required');
 return data.lots;
}

/** Explicit owner-controlled sessions; never enumerate unrelated gateway users. */
export async function receivingSessions():Promise<Array<{login:number;server:string;broker:string;mode:string;owner_kind:string;owner_id:number}>>{
 const c=await configuration();const r=await fetch(new URL('/observer/receiving-sessions',c.url),{redirect:'error',headers:executionGatewayHeaders(c.url.origin,c.token),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Receiving session registry unavailable');const body:any=await r.json();
 if(body.version!==1||!Array.isArray(body.sessions))throw Error('Invalid receiving session registry');
 const seen=new Set<string>();for(const v of body.sessions){const key=JSON.stringify([v.login,v.server]);if(!Number.isSafeInteger(v.login)||v.login<1||typeof v.server!=='string'||!v.server||v.owner_kind!=='client'||!Number.isSafeInteger(v.owner_id)||v.owner_id<1||!['demo','live'].includes(v.mode)||!c.assignments.some((a:any)=>a.login===v.login&&a.server===v.server&&a.broker===v.broker)||seen.has(key))throw Error('Unassigned receiving session');seen.add(key);}
 const permitText=process.env.COPY_ENGINE_RECEIVING_PERMIT_ACCOUNTS;
 if(!permitText)return body.sessions;
 const permit=JSON.parse(permitText);if(!Array.isArray(permit)||!permit.length||permit.some(a=>!Number.isSafeInteger(a.login)||typeof a.server!=='string'||!Number.isSafeInteger(a.owner_id)))throw Error('Invalid execution permit accounts');
 return body.sessions.filter((v:any)=>permit.some(a=>a.login===v.login&&a.server===v.server&&a.owner_id===v.owner_id));
}
