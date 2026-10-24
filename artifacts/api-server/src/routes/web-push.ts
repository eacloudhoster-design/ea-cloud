import { requirePushSession, clearPushSession } from "../lib/push-session";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { and, eq, sql, isNotNull } from "drizzle-orm";
import { db, pushSubscriptionsTable, appAccessTable } from "@workspace/db";
import { requireAppSession } from "../middlewares/app-session";
import {
  subscriptionSchema,
  endpointHash,
  pushConfiguration,
  pushStorageReadiness,
  pushWorkerState,
} from "../lib/web-push";
const router = Router();
router.use(
  "/app/push",
  requireAppSession,
  requirePushSession,
  rateLimit({
    windowMs: 60000,
    limit: 12,
    keyGenerator: (req: any) => String(req.clientId),
  }),
);
router.get("/app/push/config", async (_req, res) => {
  const config = pushConfiguration(),
    storage = await pushStorageReadiness();
  res.set("Cache-Control", "private, no-store").json({
    enabled: config.configured && storage.ready,
    publicKey: config.publicKey,
    code: config.reason || storage.reason,
  });
});
router.get("/app/push/status", async (req: any, res) => {
  const configuration = pushConfiguration(),
    storage = await pushStorageReadiness();
  let subscriptions = 0,
    unverifiedSubscriptions = 0,
    endpointOwned = false,
    endpointConflict = false,
    lastDelivery: null | { state: string; httpStatus: number | null } = null;
  if (storage.ready)
    try {
      const own = await db
        .select({
          hash: pushSubscriptionsTable.endpointHash,
          verifiedAt: pushSubscriptionsTable.verifiedAt,
        })
        .from(pushSubscriptionsTable)
        .where(eq(pushSubscriptionsTable.clientId, req.clientId));
      subscriptions = own.filter((row) => row.verifiedAt !== null).length;
      unverifiedSubscriptions = own.length - subscriptions;
      if (
        typeof req.query.endpoint === "string" &&
        req.query.endpoint.length <= 2048
      ) {
        const hash = endpointHash(req.query.endpoint);
        endpointOwned = own.some((row) => row.hash === hash);
        if (!endpointOwned) {
          const [other] = await db
            .select({ id: pushSubscriptionsTable.id })
            .from(pushSubscriptionsTable)
            .where(eq(pushSubscriptionsTable.endpointHash, hash))
            .limit(1);
          endpointConflict = !!other;
        }
      }
      const rows = await db.execute(
        sql`SELECT d.state,d.last_status FROM push_deliveries d JOIN push_events e ON e.id=d.event_id WHERE e.client_id=${req.clientId} ORDER BY e.created_at DESC LIMIT 1`,
      );
      if (rows.rows[0])
        lastDelivery = {
          state: String(rows.rows[0].state),
          httpStatus:
            typeof rows.rows[0].last_status === "number"
              ? rows.rows[0].last_status
              : null,
        };
    } catch {
      storage.ready = false;
      storage.reason = "PUSH_STORAGE_UNAVAILABLE";
    }
  res.set("Cache-Control", "private, no-store").json({
    enabled: configuration.configured && storage.ready,
    configuration: {
      configured: configuration.configured,
      code: configuration.reason,
      missing: configuration.missing,
    },
    storage,
    subscriptions,
    unverifiedSubscriptions,
    endpointOwned,
    endpointConflict,
    lastDelivery,
    worker: pushWorkerState(),
  });
});
router.post("/app/push/subscriptions", async (req: any, res) => {
  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid push subscription." });
    return;
  }
  const config = pushConfiguration(),
    storage = await pushStorageReadiness();
  if (!config.configured || !storage.ready) {
    res.status(503).json({
      error: "Push notifications need configuration.",
      code: config.reason || storage.reason,
    });
    return;
  }
  const hash = endpointHash(parsed.data.endpoint);
  try {
    const result = await db.transaction(async (tx) => {
      // Serialize enrollment/device-limit changes for this authenticated account.
      await tx
        .select({ id: appAccessTable.id })
        .from(appAccessTable)
        .where(eq(appAccessTable.id, req.clientId))
        .for("update");
      const [existing] = await tx
        .select()
        .from(pushSubscriptionsTable)
        .where(eq(pushSubscriptionsTable.endpointHash, hash))
        .limit(1);
      if (existing && existing.clientId !== req.clientId)
        return {
          status: 409,
          body: { error: "Unsubscribe this device before switching accounts." },
        };
      const own = await tx
        .select({ id: pushSubscriptionsTable.id })
        .from(pushSubscriptionsTable)
        .where(
          and(
            eq(pushSubscriptionsTable.clientId, req.clientId),
            isNotNull(pushSubscriptionsTable.verifiedAt),
          ),
        )
        .limit(8);
      if (!existing?.verifiedAt && own.length >= 8)
        return {
          status: 409,
          body: { error: "Device subscription limit reached." },
        };
      const rows = await tx
        .insert(pushSubscriptionsTable)
        .values({
          clientId: req.clientId,
          endpointHash: hash,
          subscription: parsed.data,
          verifiedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: pushSubscriptionsTable.endpointHash,
          set: { subscription: parsed.data, verifiedAt: new Date() },
          setWhere: eq(pushSubscriptionsTable.clientId, req.clientId),
        })
        .returning({ id: pushSubscriptionsTable.id });
      return {
        status: rows.length ? 201 : 409,
        body: { saved: !!rows.length },
      };
    });
    res.status(result.status).json(result.body);
  } catch {
    req.log?.warn?.(
      {
        event: "web_push_subscription_failed",
        code: "PUSH_STORAGE_UNAVAILABLE",
      },
      "Push subscription could not be saved",
    );
    res.status(503).json({
      error: "Push subscription storage unavailable.",
      code: "PUSH_STORAGE_UNAVAILABLE",
    });
  }
});
router.delete("/app/push/subscriptions", async (req: any, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > 2048) {
    res.status(400).end();
    return;
  }
  try {
    await db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.clientId, req.clientId),
          eq(pushSubscriptionsTable.endpointHash, endpointHash(endpoint)),
        ),
      );
    res.status(204).end();
  } catch {
    res.status(503).end();
  }
});
router.post("/app/push/logout", (_req, res) => {
  clearPushSession(res);
  res.status(204).end();
});
export default router;
