import { Router } from "express";
import { db, licensesTable, activityTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { randomBytes } from "crypto";

const router = Router();

function generateLicenseKey(): string {
  const part = () => randomBytes(3).toString("hex").toUpperCase();
  return `${part()}-${part()}-${part()}-${part()}`;
}

function getExpiryDate(duration: string): Date | null {
  const now = new Date();
  switch (duration) {
    case "1month": now.setMonth(now.getMonth() + 1); return now;
    case "3months": now.setMonth(now.getMonth() + 3); return now;
    case "6months": now.setMonth(now.getMonth() + 6); return now;
    case "1year": now.setFullYear(now.getFullYear() + 1); return now;
    case "3years": now.setFullYear(now.getFullYear() + 3); return now;
    default: return null;
  }
}

router.get("/licenses", requireAuth, async (req: AuthRequest, res) => {
  try {
    const licenses = await db.select().from(licensesTable)
      .where(eq(licensesTable.mentorId, req.userId!))
      .orderBy(licensesTable.createdAt);
    res.json(licenses.map(l => ({
      id: l.id, key: l.key, clientName: l.clientName, clientEmail: l.clientEmail,
      status: l.status, duration: l.duration, expiresAt: l.expiresAt, createdAt: l.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "GetLicenses error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/licenses", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { clientName, clientEmail, duration } = req.body as {
      clientName: string; clientEmail: string; duration: string;
    };

    if (!clientName || !clientEmail || !duration) {
      res.status(400).json({ error: "All fields required" });
      return;
    }

    const key = generateLicenseKey();
    const expiresAt = getExpiryDate(duration);

    const [license] = await db.insert(licensesTable).values({
      key, mentorId: req.userId!, clientName, clientEmail,
      status: "active", duration, expiresAt,
    }).returning();

    await db.insert(activityTable).values({
      mentorId: req.userId!,
      type: "license_created",
      description: `License generated for ${clientEmail}`,
    });

    res.status(201).json({
      id: license.id, key: license.key, clientName: license.clientName,
      clientEmail: license.clientEmail, status: license.status,
      duration: license.duration, expiresAt: license.expiresAt, createdAt: license.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "CreateLicense error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/licenses/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [license] = await db.select().from(licensesTable)
      .where(and(eq(licensesTable.id, id), eq(licensesTable.mentorId, req.userId!)))
      .limit(1);
    if (!license) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: license.id, key: license.key, clientName: license.clientName,
      clientEmail: license.clientEmail, status: license.status,
      duration: license.duration, expiresAt: license.expiresAt, createdAt: license.createdAt });
  } catch (err) {
    req.log.error({ err }, "GetLicense error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/licenses/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { status } = req.body as { status: string };
    const [updated] = await db.update(licensesTable).set({ status })
      .where(and(eq(licensesTable.id, id), eq(licensesTable.mentorId, req.userId!)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: updated.id, key: updated.key, clientName: updated.clientName,
      clientEmail: updated.clientEmail, status: updated.status,
      duration: updated.duration, expiresAt: updated.expiresAt, createdAt: updated.createdAt });
  } catch (err) {
    req.log.error({ err }, "UpdateLicense error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/licenses/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(licensesTable).where(and(eq(licensesTable.id, id), eq(licensesTable.mentorId, req.userId!)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "DeleteLicense error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
