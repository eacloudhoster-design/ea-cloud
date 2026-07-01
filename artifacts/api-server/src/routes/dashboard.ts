import { Router } from "express";
import { db, licensesTable, clientsTable, activityTable, usersTable } from "@workspace/db";
import { eq, count, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/dashboard", requireAuth, async (req: AuthRequest, res) => {
  try {
    const mentorId = req.userId!;

    const [totalLicenses] = await db.select({ count: count() }).from(licensesTable).where(eq(licensesTable.mentorId, mentorId));
    const [activeLicenses] = await db.select({ count: count() }).from(licensesTable).where(and(eq(licensesTable.mentorId, mentorId), eq(licensesTable.status, "active")));
    const [totalClients] = await db.select({ count: count() }).from(clientsTable).where(eq(clientsTable.mentorId, mentorId));
    const [activeClients] = await db.select({ count: count() }).from(clientsTable).where(and(eq(clientsTable.mentorId, mentorId), eq(clientsTable.status, "active")));
    const [recentActivity] = await db.select({ count: count() }).from(activityTable).where(eq(activityTable.mentorId, mentorId));

    const [mentorRow] = await db.select({ licenseLimit: usersTable.licenseLimit }).from(usersTable).where(eq(usersTable.id, mentorId)).limit(1);
    const licenseLimit = mentorRow?.licenseLimit ?? 10;
    const usedCount = totalLicenses.count;
    const usagePercent = licenseLimit > 0 ? Math.round((Number(usedCount) / licenseLimit) * 100) : 0;

    res.json({
      totalClients: Number(totalClients.count),
      activeClients: Number(activeClients.count),
      totalLicenses: Number(totalLicenses.count),
      activeLicenses: Number(activeLicenses.count),
      connectedAccounts: Number(activeClients.count),
      recentActivityCount: Number(recentActivity.count),
      maxLicenses: licenseLimit,
      licenseUsagePercent: usagePercent,
    });
  } catch (err) {
    req.log.error({ err }, "GetDashboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/activity", requireAuth, async (req: AuthRequest, res) => {
  try {
    const activities = await db.select().from(activityTable)
      .where(eq(activityTable.mentorId, req.userId!))
      .orderBy(activityTable.createdAt)
      .limit(50);
    res.json(activities.map(a => ({
      id: a.id, type: a.type, description: a.description, createdAt: a.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "GetActivity error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
