import { randomUUID } from "node:crypto";
import {
  db,
  usersTable,
  easTable,
  observerAllocationsTable,
  observerPositionsTable,
  robotBuildsTable,
  robotEventsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { resolveAppSessionAccess } from "./app-session-access";
import { syncObserverPosition } from "./observer-vps";
import { verifiedSource } from "./ea-builder/routing";
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
  initialVolume: (source: number) => number,
): Promise<VpsResult> {
  let payload: any;
  try {
    payload = JSON.parse(signal.rawPayload);
  } catch {
    return rejected("Invalid observer dispatch metadata");
  }
  if (
    !signal.observerEventId ||
    payload.protocol !== "EA_OBSERVER_SYNC_V2" ||
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
  let [allocation] = await db
    .select()
    .from(observerAllocationsTable)
    .where(
      and(
        eq(observerAllocationsTable.clientId, client.id),
        eq(observerAllocationsTable.sourceKey, payload.sourceKey),
      ),
    )
    .limit(1);
  if (!allocation && payload.sourceVolume === 0)
    return {
      ...rejected("Already flat; no allocation was opened"),
      ok: true,
      httpStatus: 200,
    };
  if (!allocation) {
    const volume = initialVolume(payload.sourceVolume);
    if (!Number.isFinite(volume) || volume <= 0)
      return rejected("Configured client lot size resolves to zero");
    [allocation] = await db
      .insert(observerAllocationsTable)
      .values({
        id: randomUUID(),
        clientId: client.id,
        sourceKey: payload.sourceKey,
        mentorId: signal.mentorId,
        symbol,
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
            eq(observerAllocationsTable.sourceKey, payload.sourceKey),
          ),
        )
        .limit(1);
  }
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
    Math.min(cap, payload.sourceVolume * scale) *
    (payload.side === "BUY" ? 1 : -1);
  return syncObserverPosition({
    login: settings.mt5Login,
    password,
    server: settings.mt5Server,
    sourceKey: payload.sourceKey,
    revision: signal.id,
    symbol: allocation.symbol,
    target,
    // Receipt retains broker precision beyond the legacy queue numeric(18,5).
    sl: Number((event.payload as any).stopLoss || 0),
    tp: Number((event.payload as any).takeProfit || 0),
    maxVolume: cap,
    maxOpenTrades: Number(settings.maxOpenTrades ?? 10),
    maxDailyDrawdown: Number(settings.maxDailyDrawdown ?? 5),
  });
}
