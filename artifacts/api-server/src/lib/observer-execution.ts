import {policyVolume} from "./copy-policy";
import { createHash, randomUUID } from "node:crypto";
import {
  db,
  usersTable,
  appAccessTable,
  easTable,
  observerAllocationsTable,
  observerPositionsTable,
  robotBuildsTable,
  robotEventsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { resolveAppSessionAccess } from "./app-session-access";
import { syncObserverPosition,syncObserverPending } from "./observer-vps";
import { sourceKey, verifiedSource } from "./ea-builder/routing";
import type { VpsResult } from "./mt5-vps";
const rejected = (message: string): VpsResult => ({
  ok: false,
  httpStatus: 409,
  ticket: null,
  retcode: null,
  message,
  data: null,
  retriable: false,
  attempts: 0,
});
/** Called only inside the existing copy worker, after its bot/MT5 guards. */
export async function executeObserver(
  signal: any,
  client: any,
  settings: any,
  password: string,
  symbol: string,
  initialVolume: (source: number) => number|Promise<number>,
  dispatch: typeof syncObserverPosition = syncObserverPosition,
): Promise<VpsResult> {
  let payload: any;
  try {
    payload = JSON.parse(signal.rawPayload);
  } catch {
    return rejected("Invalid observer dispatch metadata");
  }
  if (
    !signal.observerEventId ||
    !["EA_OBSERVER_SYNC_V2","EA_OBSERVER_PENDING_V1"].includes(payload.protocol) ||
    !/^[a-f0-9]{64}$/.test(payload.sourceKey) ||
    !Number.isSafeInteger(payload.sequence) ||
    !Number.isFinite(payload.sourceVolume) ||
    payload.sourceVolume < 0
  )
    return rejected("Unregistered observer signal");
  const [event] = await db
    .select()
    .from(robotEventsTable)
    .where(
      and(
        eq(robotEventsTable.id, signal.observerEventId),
        eq(robotEventsTable.signalId, signal.id),
        eq(robotEventsTable.mentorId, signal.mentorId),
      ),
    )
    .limit(1);
  const [robot] = await db
    .select()
    .from(robotBuildsTable)
    .where(
      and(
        eq(robotBuildsTable.id, payload.robotId),
        eq(robotBuildsTable.mentorId, signal.mentorId),
      ),
    )
    .limit(1);
  if (!event || !robot || !robot.copyEnabled || robot.revokedAt)
    return rejected("Observer copying disabled or revoked");
  const receipt=event.payload as any;
  const isPending=payload.protocol==='EA_OBSERVER_PENDING_V1';
  if(event.robotId!==robot.id || !receipt || receipt.kind!==(isPending?"PENDING":"SNAPSHOT") ||
    receipt.sequence!==payload.sequence || receipt.volume!==payload.sourceVolume ||
    receipt.side!==payload.side || !["BUY","SELL"].includes(payload.side) ||
    receipt.symbol!==signal.symbol || receipt.sourceMagic!==robot.sourceMagic || receipt.mixed ||
    receipt.sourceAccount!==event.sourceAccount || receipt.sourceServer!==event.sourceServer ||
    receipt.sourceAccount!==robot.sourceAccount || receipt.sourceServer!==robot.sourceServer ||
    sourceKey(signal.mentorId,receipt.sourceAccount,receipt.sourceServer,isPending?"pending:"+receipt.orderId:receipt.positionId)!==payload.sourceKey)
    return rejected("Observer dispatch does not match its authenticated receipt");

  if(isPending&&(payload.orderType!==receipt.pendingType||payload.price!==receipt.price||payload.stoplimit!==(receipt.stopLimit??0)||payload.typeTime!==receipt.typeTime||payload.expiration!==receipt.expiration||payload.state!==(receipt.pendingState==='active'?'active':'cancel')))return rejected('Pending target does not match authenticated receipt');

  const [mentor] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, signal.mentorId))
    .limit(1);
  if (
    !mentor ||
    mentor.status !== "approved" ||
    !["mentor", "superadmin"].includes(mentor.role)
  )
    return rejected("Mentor is not approved");
  const [ea] = await db
    .select()
    .from(easTable)
    .where(
      and(eq(easTable.id, robot.eaId), eq(easTable.mentorId, signal.mentorId)),
    )
    .limit(1);
  if (!ea?.isActive) return rejected("Source EA is disabled or missing");
  const access = await resolveAppSessionAccess(client);
  if ("code" in access || access.mentorId !== signal.mentorId)
    return rejected("Client licence is not authorized for this mentor");
  if (
    !robot.sourceAccount ||
    !robot.sourceServer ||
    !(await verifiedSource(
      db,
      signal.mentorId,
      robot.sourceAccount,
      robot.sourceServer,
    ))
  )
    return rejected(
      "Source verification expired; reconnect the source account",
    );
  const [position] = await db
    .select()
    .from(observerPositionsTable)
    .where(eq(observerPositionsTable.key, payload.sourceKey))
    .limit(1);
  if (!position || Number(position.sequence) > payload.sequence)
    return {
      ...rejected("Superseded by a newer source-position revision"),
      ok: true,
      httpStatus: 200,
    };
  const allocationKey=(key:string)=>settings.accountScopedAllocation===true?createHash('sha256').update(JSON.stringify(['account-allocation-v1',settings.mt5Login,settings.mt5Server,key])).digest('hex'):key;
  let [allocation] = await db
    .select()
    .from(observerAllocationsTable)
    .where(
      and(
        eq(observerAllocationsTable.clientId, client.id),
        eq(observerAllocationsTable.sourceKey, allocationKey(payload.sourceKey)),
      ),
    )
    .limit(1);
  if (!allocation && payload.sourceVolume === 0)
    return {
      ...rejected("Already flat; no allocation was opened"),
      ok: true,
      httpStatus: 200,
    };
  let predecessorKey:string|undefined;
  let predecessorAllocation:any;
  if(!isPending&&receipt.pendingOrderId&&receipt.pendingOrderId!=='0'){
    const key=sourceKey(signal.mentorId,receipt.sourceAccount,receipt.sourceServer,'pending:'+receipt.pendingOrderId);
    [predecessorAllocation]=await db.select().from(observerAllocationsTable).where(and(eq(observerAllocationsTable.clientId,client.id),eq(observerAllocationsTable.sourceKey,allocationKey(key)))).limit(1);
    if(predecessorAllocation){if(predecessorAllocation.mentorId!==signal.mentorId||predecessorAllocation.symbol!==symbol)return rejected('Pending predecessor ownership/symbol mismatch');predecessorKey=key;}
  }
  if (!allocation) {
    const volume = predecessorAllocation?Number(predecessorAllocation.scale)*payload.sourceVolume:await initialVolume(payload.sourceVolume);
    if (!Number.isFinite(volume) || volume <= 0)
      return rejected("Configured client lot size resolves to zero");
    [allocation] = await db
      .insert(observerAllocationsTable)
      .values({
        id: randomUUID(),
        clientId: client.id,
        sourceKey: allocationKey(payload.sourceKey),
        mentorId: signal.mentorId,
        symbol,
        accountLogin:settings.mt5Login,accountServer:settings.mt5Server,
        scale: String(volume / payload.sourceVolume),
      })
      .onConflictDoNothing()
      .returning();
    if (!allocation)
      [allocation] = await db
        .select()
        .from(observerAllocationsTable)
        .where(
          and(
            eq(observerAllocationsTable.clientId, client.id),
            eq(observerAllocationsTable.sourceKey, allocationKey(payload.sourceKey)),
          ),
        )
        .limit(1);
  }
  if(allocation&&(allocation.accountLogin!==settings.mt5Login||allocation.accountServer!==settings.mt5Server))return rejected('Allocation belongs to a different or unverified legacy account binding');
  const cap = Number(settings.maxLotSize || 1),
    scale = Number(allocation?.scale);
  if (
    !allocation ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isFinite(cap) ||
    cap <= 0
  )
    return rejected("Invalid position allocation or client volume cap");
  const target =
    (settings.mentorPolicy?policyVolume(Math.min(cap,payload.sourceVolume*scale),payload.sourceVolume,settings.mentorPolicy):Math.min(cap,payload.sourceVolume*scale)) *
    (payload.side === "BUY" ? 1 : -1);
  const [currentOwner]=await db.select({mentorId:appAccessTable.mentorId,status:appAccessTable.status}).from(appAccessTable).where(eq(appAccessTable.id,client.id)).limit(1);
  if(currentOwner?.mentorId!==signal.mentorId || currentOwner.status!=="approved" || allocation.mentorId!==signal.mentorId)return rejected("Client ownership changed before dispatch");
  const input={
    login: settings.mt5Login,
    password,
    server: settings.mt5Server,
    sourceKey: payload.sourceKey,
    routingKey:sourceKey(signal.mentorId,receipt.sourceAccount,receipt.sourceServer,'*'),
    ...(predecessorKey?{predecessorKey}:{}),
    revision: signal.id,
    symbol: allocation.symbol,
    target,
    // Receipt retains broker precision beyond the legacy queue numeric(18,5).
    sl: Number((event.payload as any).stopLoss || 0),
    tp: Number((event.payload as any).takeProfit || 0),
    maxVolume: cap,
    maxOpenTrades: Number(settings.maxOpenTrades ?? 10),
    maxExposureLots: Number(settings.mentorPolicy?.maxExposureLots ?? settings.maxLotSize),
    maxDailyDrawdown: Number(settings.maxDailyDrawdown ?? 5),
  };
  if(isPending)return syncObserverPending({...input,target:Math.abs(target),orderType:payload.orderType,state:payload.state,price:payload.price,stoplimit:payload.stoplimit,typeTime:payload.typeTime,expiration:payload.expiration});
  return dispatch(input);
}
