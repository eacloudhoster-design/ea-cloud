import { Router } from "express";
import { db, appAccessTable, licensesTable, clientSettingsTable } from "@workspace/db";
import { eq, and, ilike, desc } from "drizzle-orm";
import { requireSuperAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/superadmin/app-access", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    // Include each subscriber's live copy-trading state (copyingEnabled) so the
    // admin portal can show ACTIVE/PAUSED. Null until the subscriber has settings.
    const requests = await db
      .select({
        id: appAccessTable.id,
        firstName: appAccessTable.firstName,
        lastName: appAccessTable.lastName,
        email: appAccessTable.email,
        status: appAccessTable.status,
        createdAt: appAccessTable.createdAt,
        copyingEnabled: clientSettingsTable.copyingEnabled,
      })
      .from(appAccessTable)
      .leftJoin(clientSettingsTable, eq(clientSettingsTable.clientId, appAccessTable.id))
      .orderBy(appAccessTable.createdAt);
    res.json(requests.map(r => ({
      id: r.id, firstName: r.firstName, lastName: r.lastName,
      email: r.email, status: r.status, createdAt: r.createdAt,
      copyingEnabled: r.copyingEnabled ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "GetAppAccess error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/superadmin/app-access/:id/approve", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));

    // Approve + auto-link the mentor atomically so the subscriber is never left
    // approved-but-unlinked on a transient failure. The mentor is derived from
    // the subscriber's purchased license so copy dispatch can match them
    // (runSignal selects app_access WHERE mentor_id = signal.mentorId).
    const linked = await db.transaction(async (tx) => {
      // 1. Approve — existing flow preserved.
      const [updated] = await tx.update(appAccessTable).set({ status: "approved" }).where(eq(appAccessTable.id, id)).returning();
      if (!updated) return null;
      req.log.info({ event: "APPROVAL_GRANTED", clientId: updated.id, email: updated.email }, "APPROVAL_GRANTED");

      // 2. Idempotency guard — if a mentor is already linked (e.g. re-approval
      //    or a manual mapping), keep it rather than clobbering it.
      if (updated.mentorId) {
        req.log.info({ event: "MENTOR_LINKED", clientId: updated.id, mentorId: updated.mentorId, licenseKey: updated.licenseKey, alreadyLinked: true }, "MENTOR_LINKED");
        return updated;
      }

      // 3. Resolve the active license: by an already-activated key first, else
      //    by the most recent active license issued to this subscriber's email.
      let license: typeof licensesTable.$inferSelect | undefined;
      if (updated.licenseKey) {
        [license] = await tx.select().from(licensesTable)
          .where(and(eq(licensesTable.key, updated.licenseKey), eq(licensesTable.status, "active"))).limit(1);
      }
      if (!license) {
        [license] = await tx.select().from(licensesTable)
          .where(and(ilike(licensesTable.clientEmail, updated.email), eq(licensesTable.status, "active")))
          .orderBy(desc(licensesTable.createdAt)).limit(1);
      }

      if (!license) {
        req.log.warn({ clientId: updated.id, email: updated.email },
          "[AppAccess] approved but no active license found — mentor_id not linked; subscriber will not receive signals until a license is activated");
        return updated;
      }

      const [withMentor] = await tx.update(appAccessTable)
        .set({ mentorId: license.mentorId, licenseKey: license.key })
        .where(eq(appAccessTable.id, id)).returning();
      req.log.info({ event: "MENTOR_LINKED", clientId: withMentor.id, mentorId: license.mentorId, licenseKey: license.key }, "MENTOR_LINKED");
      return withMentor;
    });

    if (!linked) { res.status(404).json({ error: "Not found" }); return; }

    res.json({ id: linked.id, firstName: linked.firstName, lastName: linked.lastName,
      email: linked.email, status: linked.status, mentorId: linked.mentorId ?? null, createdAt: linked.createdAt });
  } catch (err) {
    req.log.error({ err }, "ApproveAppAccess error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/superadmin/app-access/:id/reject", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [updated] = await db.update(appAccessTable).set({ status: "rejected" }).where(eq(appAccessTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: updated.id, firstName: updated.firstName, lastName: updated.lastName,
      email: updated.email, status: updated.status, createdAt: updated.createdAt });
  } catch (err) {
    req.log.error({ err }, "RejectAppAccess error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/superadmin/app-access/:id", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [deleted] = await db.delete(appAccessTable).where(eq(appAccessTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DeleteAppAccess error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/app-access/register", async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body as { firstName: string; lastName: string; email: string };
    if (!firstName || !lastName || !email) {
      res.status(400).json({ error: "All fields required" });
      return;
    }
    const [existing] = await db.select().from(appAccessTable).where(eq(appAccessTable.email, email.toLowerCase())).limit(1);
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    const [request] = await db.insert(appAccessTable).values({
      firstName, lastName, email: email.toLowerCase(), status: "pending",
    }).returning();
    res.status(201).json({ id: request.id, firstName: request.firstName, lastName: request.lastName,
      email: request.email, status: request.status, createdAt: request.createdAt });
  } catch (err) {
    req.log.error({ err }, "RequestAppAccess error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
