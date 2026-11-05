import { db, clientSettingsTable, tradeExecutionsTable, observerAllocationsTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { decryptMT5Password } from "./mt5-crypto";
import { readBoundAccount } from "./mt5-account-status";
/** Read-only account-owned status. Stored connected=true is never live evidence. */
export async function clientEngineStatus(clientId: number, probe = false, mentorId?:number) {
  const [settings] = await db.select().from(clientSettingsTable).where(eq(clientSettingsTable.clientId, clientId)).limit(1);
  const recent = await db.select({id:tradeExecutionsTable.id,signalId:tradeExecutionsTable.signalId,status:tradeExecutionsTable.status,
    symbol:tradeExecutionsTable.symbol,kind:tradeExecutionsTable.signalKind,ticket:tradeExecutionsTable.ticket,
    attempts:tradeExecutionsTable.attempts,retryable:tradeExecutionsTable.retryable,updatedAt:tradeExecutionsTable.updatedAt})
    .from(tradeExecutionsTable).where(and(eq(tradeExecutionsTable.clientId,clientId),mentorId ? eq(tradeExecutionsTable.mentorId,mentorId) : undefined)).orderBy(desc(tradeExecutionsTable.id)).limit(20);
  const mappings = await db.select({id:observerAllocationsTable.id,symbol:observerAllocationsTable.symbol,scale:observerAllocationsTable.scale})
    .from(observerAllocationsTable).where(and(eq(observerAllocationsTable.clientId,clientId),mentorId ? eq(observerAllocationsTable.mentorId,mentorId) : undefined)).orderBy(desc(observerAllocationsTable.createdAt)).limit(50);
  let live: Awaited<ReturnType<typeof readBoundAccount>> | null = null;
  let code = !settings?.mt5Login || !settings.mt5Server ? "ACCOUNT_NOT_CONFIGURED" : "NOT_PROBED";
  if (probe && settings?.mt5Login && settings.mt5Server && settings.encryptedMt5Password) {
    try {
      live=await readBoundAccount(settings.mt5Login,settings.mt5Server,decryptMT5Password(settings.encryptedMt5Password));
      if(live.role!=="client" || (settings.mt5Broker && live.broker!==settings.mt5Broker))throw Error("Binding mismatch");
      code=live.read_only?"VERIFIED_DEMO_READ_ONLY":"VERIFIED_DEMO";
    } catch { live=null;code="ACCOUNT_VERIFICATION_UNAVAILABLE"; }
  }
  const copyingRequested=settings?.copyingEnabled === true;
  return { clientId,observedAt:new Date().toISOString(),account:settings?.mt5Login ? {login:settings.mt5Login,server:settings.mt5Server,broker:settings.mt5Broker,storedConnected:settings.mt5Connected}:null,
    connection:{code,verified:live!==null,...(live?{mode:live.account_mode,positions:live.open_positions,pendingOrders:live.pending_orders,currency:live.currency}: {})},
    copier:{requested:copyingRequested,state:!copyingRequested?"paused":!live?"unverified":live.read_only?"read_only":live.journal_holds!==null && live.journal_holds>0?"review_required":!settings?.mt5Connected || live.emergency_stop_active || !live.execution_enabled?"blocked":"worker_permitted",
      executionPermitted:!!(copyingRequested && settings?.mt5Connected && live?.execution_enabled && !live.read_only && live.emergency_stop_active===false && live.journal_holds===0),unresolvedJournalHolds:live?.journal_holds ?? null,emergencyStopActive:live?.emergency_stop_active ?? null,
      endToEndAcceptanceVerified:false},
    mappings,recentExecutions:recent.map(row=>({...row,errorCode:row.status==="failed"?"EXECUTION_FAILED_REVIEW_REQUIRED":null})),
    limitations:["Mappings are retained allocations, not a live position count","No retries, reconciliation holds or execution flags are changed by status reads","Worker permission is not end-to-end trading acceptance"] };
}
