import { createHash } from "node:crypto";
import {
  usersTable,
  easTable,
  robotBuildsTable,
  observerPositionsTable,
  mt5ConnectionsTable,
  tradeSignalsTable,
} from "@workspace/db";
import { and, eq, gt, inArray, ne } from "drizzle-orm";
import type { z } from "zod";
import { robotEvent } from "./contracts";
export const sourceKey = (
  mentor: number,
  account: string,
  server: string,
  position: string,
) =>
  createHash("sha256")
    .update(JSON.stringify([mentor, account, server, position]))
    .digest("hex");
export async function verifiedSource(
  tx: any,
  mentorId: number,
  account: string,
  server: string,
) {
  const login = Number(account);
  if (!Number.isSafeInteger(login) || login < 1 || login > 2147483647)
    return false;
  const rows = await tx
    .select({ id: mt5ConnectionsTable.id })
    .from(mt5ConnectionsTable)
    .where(
      and(
        eq(mt5ConnectionsTable.mentorId, mentorId),
        eq(mt5ConnectionsTable.mt5Login, login),
        eq(mt5ConnectionsTable.mt5Server, server),
        eq(mt5ConnectionsTable.status, "connected"),
        gt(mt5ConnectionsTable.connectedAt, new Date(Date.now() - 86400000)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
/** Shared mentor-row lock serializes activation, legacy ingestion and observer dispatch. */
export async function lockMentor(tx: any, id: number) {
  await tx
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .for("update")
    .limit(1);
}
export async function legacyBlocked(tx: any, mentorId: number) {
  const rows = await tx
    .select({ id: robotBuildsTable.id })
    .from(robotBuildsTable)
    .where(
      and(
        eq(robotBuildsTable.mentorId, mentorId),
        eq(robotBuildsTable.copyEnabled, true),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
export async function enableObserver(
  tx: any,
  robot: any,
  legacyConsent: boolean,
) {
  if (robot.mode !== "existing-observer" || robot.revokedAt)
    return "Download a Connect Existing EA observer first.";
  const [ea] = await tx
    .select()
    .from(easTable)
    .where(
      and(eq(easTable.id, robot.eaId), eq(easTable.mentorId, robot.mentorId)),
    )
    .limit(1);
  if (!ea?.isActive)
    return "Enable the owned source EA before enabling its observer.";
  if (!legacyConsent)
    return "Confirm that EA Cloud will reject this mentor's legacy webhook while observer copying is enabled. Check the original EX5's old destination independently.";
  if (robot.sourceMagic === "0")
    return "Magic 0 also identifies manual trades. Verify a unique nonzero magic number in actual MT5 deal history before copying.";
  if (
    !robot.sourceAccount ||
    !robot.sourceServer ||
    !(await verifiedSource(
      tx,
      robot.mentorId,
      robot.sourceAccount,
      robot.sourceServer,
    ))
  )
    return "Verify this exact source login/server using the existing MT5 connection panel (successful connection within 24 hours).";
  if (
    !robot.lastHeartbeatAt ||
    Date.now() - new Date(robot.lastHeartbeatAt).getTime() > 30000 ||
    !robot.historyHealthy ||
    (robot.lastEventAt &&
      new Date(robot.lastEventAt) > new Date(robot.lastHeartbeatAt))
  )
    return "Waiting for a recent authenticated MT5 heartbeat and healthy history reconciliation.";
  if (robot.inventoryCount !== 0 || robot.queueDepth !== 0)
    return "Start flat: close eligible source positions and drain the observer outbox before enabling copying. Existing trades are never copied retroactively.";
  const pending = await tx
    .select({ id: tradeSignalsTable.id })
    .from(tradeSignalsTable)
    .where(
      and(
        eq(tradeSignalsTable.mentorId, robot.mentorId),
        inArray(tradeSignalsTable.status, ["pending", "executing"]),
      ),
    )
    .limit(1);
  if (pending.length)
    return "Wait for the existing mentor execution queue to settle first.";
  const duplicate = await tx
    .select({ id: robotBuildsTable.id })
    .from(robotBuildsTable)
    .where(
      and(
        eq(robotBuildsTable.mentorId, robot.mentorId),
        eq(robotBuildsTable.sourceAccount, robot.sourceAccount),
        eq(robotBuildsTable.sourceServer, robot.sourceServer),
        eq(robotBuildsTable.copyEnabled, true),
        ne(robotBuildsTable.id, robot.id),
      ),
    )
    .limit(1);
  if (duplicate.length)
    return "Another observer already owns copying for this source account.";
  await tx
    .update(robotBuildsTable)
    .set({
      copyEnabled: true,
      activatedAt: new Date(),
      startSequence: robot.lastSequence || "0",
    })
    .where(eq(robotBuildsTable.id, robot.id));
  return null;
}
export async function routeSnapshot(
  tx: any,
  robot: any,
  payload: z.infer<typeof robotEvent>,
  receiptId: string,
) {
  if (payload.kind !== "SNAPSHOT")
    return { state: "capture_only", signalId: null };
  const key = sourceKey(
      robot.mentorId,
      payload.sourceAccount,
      payload.sourceServer,
      payload.positionId,
    ),
    sequence = payload.sequence!;
  const [prior] = await tx
    .select()
    .from(observerPositionsTable)
    .where(eq(observerPositionsTable.key, key))
    .for("update")
    .limit(1);
  if (prior && Number(prior.sequence) >= sequence)
    return { state: "stale_snapshot", signalId: null };
  const value = {
    robotId: robot.id,
    mentorId: robot.mentorId,
    positionId: payload.positionId,
    sequence: String(sequence),
    volume: String(payload.volume),
    side: payload.side,
    symbol: payload.symbol,
    updatedAt: new Date(),
  };
  await tx
    .insert(observerPositionsTable)
    .values({ key, ...value })
    .onConflictDoUpdate({ target: observerPositionsTable.key, set: value });
  if (!robot.copyEnabled || sequence <= Number(robot.startSequence || 0))
    return { state: "capture_only", signalId: null };
  if (
    robot.revokedAt ||
    payload.sourceMagic !== robot.sourceMagic ||
    payload.mixed
  )
    return { state: "blocked_source_filter", signalId: null };
  if (
    !(await verifiedSource(
      tx,
      robot.mentorId,
      payload.sourceAccount,
      payload.sourceServer,
    ))
  )
    return { state: "source_verification_expired", signalId: null };
  if (!prior && payload.volume === 0)
    return { state: "already_flat", signalId: null };
  const [signal] = await tx
    .insert(tradeSignalsTable)
    .values({
      mentorId: robot.mentorId,
      eaId: robot.eaId,
      observerEventId: receiptId,
      signal: "SYNC",
      symbol: payload.symbol,
      orderType: payload.side,
      lots: String(payload.volume),
      openPrice: String(payload.price),
      stopLoss: String(payload.stopLoss),
      takeProfit: String(payload.takeProfit),
      ticket: key,
      comment: robot.displayName,
      rawPayload: JSON.stringify({
        protocol: "EA_OBSERVER_SYNC_V2",
        robotId: robot.id,
        sourceKey: key,
        sequence,
        sourceVolume: payload.volume,
        sourceMagic: payload.sourceMagic,
        accountMode: payload.accountMode,
        side: payload.side,
      }),
      status: "pending",
    })
    .returning({ id: tradeSignalsTable.id });
  return { state: "enqueued", signalId: signal.id };
}
