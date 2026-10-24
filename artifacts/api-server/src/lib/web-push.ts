import webpush from "web-push";
import { createHash, createECDH } from "node:crypto";
import { z } from "zod";
import { and, eq, lt, sql, isNotNull } from "drizzle-orm";
import {
  db,
  pushSubscriptionsTable,
  pushEventsTable,
  pushDeliveriesTable,
  appAccessTable,
  clientSettingsTable,
} from "@workspace/db";
import {
  robotNotification,
  executionNotification,
  type PushContent,
} from "./push-notification";
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
export function pushConfiguration() {
  const names = [
      "WEB_PUSH_PUBLIC_KEY",
      "WEB_PUSH_PRIVATE_KEY",
      "WEB_PUSH_SUBJECT",
    ] as const,
    missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length)
    return {
      configured: false,
      reason: "PUSH_VAPID_MISSING",
      missing,
      publicKey: null,
    };
  const [publicKey, privateKey, subject] = names.map((name) =>
    process.env[name]!.trim(),
  );
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (ecdh.getPublicKey().toString("base64url") !== publicKey)
      throw Error("mismatch");
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return { configured: true, reason: null, missing: [], publicKey };
  } catch {
    return {
      configured: false,
      reason: "PUSH_VAPID_INVALID",
      missing: [],
      publicKey: null,
    };
  }
}
export function pushConfig() {
  const c = pushConfiguration();
  return c.configured ? { publicKey: c.publicKey! } : null;
}
export async function pushStorageReadiness() {
  try {
    const result = await db.execute(
      sql`SELECT to_regclass('push_subscriptions') IS NOT NULL AND to_regclass('push_events') IS NOT NULL AS base, to_regclass('push_deliveries') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='push_events' AND column_name='source_key') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='push_subscriptions' AND column_name='verified_at') AS delivery`,
    );
    const row = result.rows[0];
    return {
      ready: row?.base === true && row?.delivery === true,
      reason:
        row?.base === true
          ? row.delivery === true
            ? null
            : "PUSH_DELIVERY_MIGRATION_REQUIRED"
          : "PUSH_BASE_MIGRATION_REQUIRED",
    };
  } catch {
    return { ready: false, reason: "PUSH_STORAGE_UNAVAILABLE" };
  }
}
let defaultLog: any;
export async function queueBotPush(
  clientId: number,
  kind: "started" | "stopped",
  log: any = defaultLog,
  sourceKey?: string,
) {
  try {
    await db
      .insert(pushEventsTable)
      .values({
        clientId,
        kind,
        payload: robotNotification(kind),
        sourceKey: sourceKey ? `robot:${sourceKey}:${kind}` : null,
      })
      .onConflictDoNothing();
    void deliverPushEvents(log);
  } catch {
    log?.warn?.(
      { event: "web_push_enqueue_failed", code: "PUSH_STORAGE_UNAVAILABLE" },
      "Notification storage unavailable; trading state was preserved",
    );
  }
}
export async function queueExecutionPush(
  clientId: number,
  row: Parameters<typeof executionNotification>[0],
  log: any = defaultLog,
) {
  if (row.clientId !== undefined && row.clientId !== clientId) return;
  const notification = executionNotification(row);
  if (!notification) return;
  try {
    await db
      .insert(pushEventsTable)
      .values({
        clientId,
        kind: notification.kind,
        sourceKey: notification.sourceKey,
        payload: notification.content,
      })
      .onConflictDoNothing();
    void deliverPushEvents(log);
  } catch {
    log?.warn?.(
      { event: "web_push_enqueue_failed", code: "PUSH_STORAGE_UNAVAILABLE" },
      "Trade notification storage unavailable",
    );
  }
}
export function retryDelay(
  status: number | undefined,
  headers: any,
  attempt: number,
) {
  if (!status || ![429, 500, 502, 503, 504].includes(status) || attempt >= 4)
    return null;
  const raw = headers?.["retry-after"],
    seconds = Number(raw),
    date = typeof raw === "string" ? Date.parse(raw) : NaN;
  const delay =
    Number.isFinite(seconds) && seconds > 0
      ? seconds * 1000
      : Number.isFinite(date)
        ? date - Date.now()
        : 2000 * 2 ** attempt;
  return Math.min(3600000, Math.max(3000, delay));
}
let busy = false,
  timer: ReturnType<typeof setInterval> | null = null,
  lastRunAt: number | null = null;
export const pushWorkerState = () => ({
  running: timer !== null,
  engineHealthy: engineHealth(),
  lastRunAt,
});
let engineHealth: () => boolean = () => false;
export const configurePushEngineHealth = (reader: () => boolean) => {
  engineHealth = reader;
};
export async function deliverPushEvents(log: any = defaultLog) {
  if (busy || !pushConfig()) return;
  busy = true;
  try {
    const storage = await pushStorageReadiness();
    if (!storage.ready) {
      log?.warn?.(
        { event: "web_push_unavailable", code: storage.reason },
        "Apply the approved push migrations",
      );
      return;
    }
    // Claim events AND create per-device delivery rows atomically. Existing claimed rows are not replayed.
    await db.transaction(async (tx) => {
      const events = await tx.execute(
        sql`UPDATE push_events SET claimed_at=now() WHERE id IN (SELECT id FROM push_events WHERE claimed_at IS NULL AND (${engineHealth()} OR kind<>'started') ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED) AND claimed_at IS NULL RETURNING id,client_id,created_at`,
      );
      for (const event of events.rows) {
        if (
          Date.now() - new Date(event.created_at as string).getTime() >
          600000
        )
          continue;
        const subs = await tx
          .select({ id: pushSubscriptionsTable.id })
          .from(pushSubscriptionsTable)
          .where(
            and(
              eq(pushSubscriptionsTable.clientId, Number(event.client_id)),
              isNotNull(pushSubscriptionsTable.verifiedAt),
            ),
          )
          .limit(8);
        if (!subs.length)
          log?.info?.(
            { event: "web_push_no_subscription", eventId: event.id },
            "No opted-in device for this event",
          );
        if (subs.length)
          await tx
            .insert(pushDeliveriesTable)
            .values(
              subs.map((sub) => ({
                eventId: String(event.id),
                subscriptionId: sub.id,
              })),
            )
            .onConflictDoNothing();
      }
    });
    await db.execute(
      sql`UPDATE push_deliveries SET state='failed',lease_until=NULL WHERE state='sending' AND lease_until<now() AND attempts>=4`,
    );
    const claimed = await db.execute(
      sql`UPDATE push_deliveries SET state='sending',attempts=attempts+1,lease_until=now()+interval '120 seconds' WHERE id IN (SELECT id FROM push_deliveries WHERE attempts<4 AND ((state IN ('pending','retry') AND next_attempt_at<=now()) OR (state='sending' AND lease_until<now())) ORDER BY next_attempt_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING id,event_id,subscription_id,attempts`,
    );
    const send = async (item: any) => {
      const [event] = await db
          .select()
          .from(pushEventsTable)
          .where(eq(pushEventsTable.id, String(item.event_id)))
          .limit(1),
        [sub] = await db
          .select()
          .from(pushSubscriptionsTable)
          .where(eq(pushSubscriptionsTable.id, String(item.subscription_id)))
          .limit(1);
      const update = (state: string, extra: Record<string, unknown> = {}) =>
        db
          .update(pushDeliveriesTable)
          .set({ state, leaseUntil: null, ...extra })
          .where(
            and(
              eq(pushDeliveriesTable.id, String(item.id)),
              eq(pushDeliveriesTable.attempts, Number(item.attempts)),
            ),
          );
      if (
        !event ||
        !sub ||
        event.clientId !== sub.clientId ||
        sub.verifiedAt === null ||
        Date.now() - event.createdAt.getTime() > 600000
      ) {
        await update("suppressed");
        return;
      }
      const [client] = await db
        .select()
        .from(appAccessTable)
        .where(eq(appAccessTable.id, event.clientId))
        .limit(1);
      if ("code" in (await resolveAppSessionAccess(client))) {
        await update("suppressed");
        return;
      }
      if (event.kind === "started") {
        const [settings] = await db
          .select()
          .from(clientSettingsTable)
          .where(eq(clientSettingsTable.clientId, event.clientId))
          .limit(1);
        if (!settings?.copyingEnabled) {
          await update("suppressed");
          return;
        }
        if (!engineHealth()) {
          await update("retry", {
            attempts: Number(item.attempts) - 1,
            nextAttemptAt: new Date(Date.now() + 5000),
          });
          return;
        }
      }
      const valid = subscriptionSchema.safeParse(sub.subscription),
        content = event.payload as PushContent | null;
      const payload =
        content ||
        (event.kind === "started" || event.kind === "stopped"
          ? robotNotification(event.kind)
          : null);
      const titles: Record<string, string> = {
        started: "EA Cloud",
        stopped: "EA Cloud",
        trade_alert: "EA Cloud — Trade Alert",
        trade_executed: "EA Cloud — Trade Executed",
        trade_failed: "EA Cloud — Trade Failed",
      };
      if (
        !valid.success ||
        !payload ||
        !titles[event.kind] ||
        payload.title !== titles[event.kind] ||
        ![
          "/ea-app/?tab=home&activity=1",
          "/ea-app/?tab=metatrader&activity=1",
        ].includes(payload.url) ||
        typeof payload.body !== "string" ||
        payload.body.length > 300
      ) {
        await update("failed");
        return;
      }
      try {
        const accepted = await webpush.sendNotification(
          valid.data,
          JSON.stringify({
            version: 1,
            eventId: event.id,
            accountScope: `client:${event.clientId}`,
            title: payload.title,
            body: payload.body,
            url: payload.url,
            expiresAt: event.createdAt.getTime() + 600000,
          }),
          { TTL: 300, urgency: "normal", timeout: 10000 },
        );
        await update("sent", {
          sentAt: new Date(),
          lastStatus: accepted?.statusCode ?? null,
        });
        log?.info?.(
          { event: "web_push_sent", eventId: event.id, deliveryId: item.id },
          "Push service accepted notification",
        );
      } catch (error: any) {
        const status = Number.isInteger(error.statusCode)
          ? error.statusCode
          : undefined;
        if (status === 404 || status === 410) {
          await db
            .delete(pushSubscriptionsTable)
            .where(eq(pushSubscriptionsTable.id, sub.id));
          log?.info?.(
            { event: "web_push_subscription_expired", status },
            "Expired push subscription removed",
          );
          return;
        }
        const delay = retryDelay(status, error.headers, Number(item.attempts));
        await update(delay === null ? "failed" : "retry", {
          lastStatus: status ?? null,
          ...(delay !== null
            ? { nextAttemptAt: new Date(Date.now() + delay) }
            : {}),
        });
        log?.warn?.(
          {
            event: "web_push_delivery_failed",
            eventId: event.id,
            deliveryId: item.id,
            status: status ?? null,
            code:
              delay !== null
                ? "PUSH_RETRY_SCHEDULED"
                : status === 401 || status === 403
                  ? "PUSH_VAPID_REJECTED"
                  : "PUSH_DELIVERY_FAILED",
            attempt: item.attempts,
          },
          "Push service did not confirm delivery",
        );
      }
    };
    // Bounded parallelism keeps the batch inside its lease and avoids provider bursts.
    const pending = [...claimed.rows];
    await Promise.all(
      Array.from({ length: Math.min(3, pending.length) }, async () => {
        while (pending.length) await send(pending.shift());
      }),
    );
    await db
      .delete(pushEventsTable)
      .where(
        lt(pushEventsTable.createdAt, new Date(Date.now() - 7 * 86400000)),
      );
    lastRunAt = Date.now();
  } catch {
    log?.warn?.(
      {
        event: "web_push_worker_unavailable",
        code: "PUSH_STORAGE_UNAVAILABLE",
      },
      "Check push delivery storage; pending leases can recover",
    );
  } finally {
    busy = false;
  }
}
export function startPushWorker(log: any, health: () => boolean = () => false) {
  defaultLog = log;
  configurePushEngineHealth(health);
  if (timer) return;
  const c = pushConfiguration();
  if (!c.configured)
    log?.warn?.(
      {
        event: "web_push_configuration_missing",
        code: c.reason,
        missing: c.missing,
      },
      "Configure Web Push before enabling notifications",
    );
  timer = setInterval(() => void deliverPushEvents(log), 5000);
  timer.unref();
  void deliverPushEvents(log);
}
