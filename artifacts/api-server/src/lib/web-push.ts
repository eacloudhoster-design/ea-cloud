import { signalWorkerHealthy } from "./signal-worker";
import webpush from "web-push";
import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, lt, sql } from "drizzle-orm";
import {
  db,
  pushSubscriptionsTable,
  pushEventsTable,
  appAccessTable,
  clientSettingsTable,
} from "@workspace/db";
import { resolveAppSessionAccess } from "./app-session-access";
export const subscriptionSchema = z
  .object({
    endpoint: z
      .string()
      .url()
      .max(2048)
      .refine((value) => {
        try {
          const u = new URL(value),
            host = u.hostname;
          return (
            u.protocol === "https:" &&
            !u.username &&
            !u.password &&
            !u.port &&
            [
              "web.push.apple.com",
              "fcm.googleapis.com",
              "push.services.mozilla.com",
              "notify.windows.com",
            ].some(
              (allowed) => host === allowed || host.endsWith("." + allowed),
            )
          );
        } catch {
          return false;
        }
      }),
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
        auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
      })
      .strict(),
  })
  .strict();
export const endpointHash = (endpoint: string) =>
  createHash("sha256").update(endpoint).digest("hex");
export function pushConfig() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY,
    privateKey = process.env.WEB_PUSH_PRIVATE_KEY,
    subject = process.env.WEB_PUSH_SUBJECT;
  if (
    !publicKey ||
    !privateKey ||
    !subject ||
    !/^mailto:[^\s@]+@[^\s@]+$|^https:\/\//.test(subject)
  )
    return null;
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return { publicKey };
  } catch {
    return null;
  }
}
export async function queueBotPush(
  clientId: number,
  kind: "started" | "stopped",
) {
  // Optional notification failure cannot undo an already-confirmed trading preference.
  if (!pushConfig()) return;
  try {
    await db.insert(pushEventsTable).values({ clientId, kind });
  } catch {}
}
let busy = false;
export async function deliverPushEvents(log: any) {
  if (busy || !pushConfig()) return;
  busy = true;
  try {
    // Atomic at-most-once claim across API replicas. Do not retry an ambiguous send.
    const rows = await db.execute(
      sql`UPDATE push_events SET claimed_at=now() WHERE id IN (SELECT id FROM push_events WHERE claimed_at IS NULL AND (${signalWorkerHealthy()} OR kind='stopped') ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED) AND claimed_at IS NULL RETURNING id,client_id,kind,created_at`,
    );
    for (const row of rows.rows) {
      if (
        !["started", "stopped"].includes(String(row.kind)) ||
        Date.now() - new Date(row.created_at as string).getTime() > 600000
      )
        continue;
      const clientId = Number(row.client_id),
        [client] = await db
          .select()
          .from(appAccessTable)
          .where(eq(appAccessTable.id, clientId))
          .limit(1);
      if ("code" in (await resolveAppSessionAccess(client))) continue;
      if (row.kind === "started") {
        const [settings] = await db
          .select()
          .from(clientSettingsTable)
          .where(eq(clientSettingsTable.clientId, clientId))
          .limit(1);
        if (!settings?.copyingEnabled) continue;
      }
      const subscriptions = await db
        .select()
        .from(pushSubscriptionsTable)
        .where(eq(pushSubscriptionsTable.clientId, clientId))
        .limit(8);
      for (const item of subscriptions) {
        const valid = subscriptionSchema.safeParse(item.subscription);
        if (!valid.success) continue;
        try {
          await webpush.sendNotification(
            valid.data,
            JSON.stringify({
              eventId: row.id,
              title: "EA Cloud",
              body:
                row.kind === "started" ? "Robot started." : "Robot stopped.",
            }),
            { TTL: 300, urgency: "normal", timeout: 10000 },
          );
        } catch (error: any) {
          if (error.statusCode === 404 || error.statusCode === 410)
            await db
              .delete(pushSubscriptionsTable)
              .where(eq(pushSubscriptionsTable.id, item.id));
          else
            log?.warn?.(
              { event: "web_push_failed", status: error.statusCode },
              "Web Push delivery failed",
            );
        }
      }
    }
    await db
      .delete(pushEventsTable)
      .where(
        lt(pushEventsTable.createdAt, new Date(Date.now() - 7 * 86400000)),
      );
  } catch {
    log?.warn?.(
      { event: "web_push_worker_unavailable" },
      "Check Web Push configuration/migration",
    );
  } finally {
    busy = false;
  }
}
export function startPushWorker(log: any) {
  if (!pushConfig()) return;
  const timer = setInterval(() => void deliverPushEvents(log), 15000);
  timer.unref();
  void deliverPushEvents(log);
}
