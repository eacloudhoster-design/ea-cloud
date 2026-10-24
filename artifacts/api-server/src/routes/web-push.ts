import { Router } from "express";
import rateLimit from "express-rate-limit";
import { and, eq, sql } from "drizzle-orm";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { requireAppSession } from "../middlewares/app-session";
import { subscriptionSchema, endpointHash, pushConfig } from "../lib/web-push";
const router = Router();
router.use(
  "/app/push",
  requireAppSession,
  rateLimit({
    windowMs: 60000,
    limit: 12,
    keyGenerator: (req: any) => String(req.clientId),
  }),
);
router.get("/app/push/config", (_req, res) => {
  const config = pushConfig();
  res
    .set("Cache-Control", "no-store")
    .json({ enabled: !!config, publicKey: config?.publicKey ?? null });
});
router.post("/app/push/subscriptions", async (req: any, res) => {
  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid push subscription." });
    return;
  }
  if (!pushConfig()) {
    res.status(503).json({ error: "Push notifications are not configured." });
    return;
  }
  const hash = endpointHash(parsed.data.endpoint);
  try {
    // One endpoint belongs to one account; never silently steal another account's device.
    const [existing] = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.endpointHash, hash))
      .limit(1);
    if (existing && existing.clientId !== req.clientId) {
      res
        .status(409)
        .json({ error: "Unsubscribe this device before switching accounts." });
      return;
    }
    const own = await db
      .select({ id: pushSubscriptionsTable.id })
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.clientId, req.clientId))
      .limit(8);
    if (!existing && own.length >= 8) {
      res.status(409).json({ error: "Device subscription limit reached." });
      return;
    }
    const rows = await db
      .insert(pushSubscriptionsTable)
      .values({
        clientId: req.clientId,
        endpointHash: hash,
        subscription: parsed.data,
      })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpointHash,
        set: { subscription: parsed.data },
        setWhere: eq(pushSubscriptionsTable.clientId, req.clientId),
      })
      .returning({ id: pushSubscriptionsTable.id });
    res.status(rows.length ? 201 : 409).json({ saved: !!rows.length });
  } catch {
    res.status(503).json({ error: "Push subscription storage unavailable." });
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
export default router;
