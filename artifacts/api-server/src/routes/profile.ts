import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { issueApiKey } from "../lib/api-key";
import { regenKeyLimiter } from "../lib/rate-limit";

const router = Router();

router.get("/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
    if (!user) { res.status(404).json({ error: "Not found" }); return; }
    res.json({
      id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
      phone: user.phone, mentorName: user.mentorName, robotName: user.robotName,
      robotTagline: user.robotTagline, backgroundImageUrl: user.backgroundImageUrl,
      webhookUrl: user.webhookUrl,
      apiKey: user.apiKeyPrefix ?? null,   // only the prefix is returned — never the hash
      apiKeyPrefix: user.apiKeyPrefix ?? null,
      status: user.status,
      licenseLimit: user.licenseLimit, createdAt: user.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "GetProfile error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update profile — apiKey is NOT writable here; use /admin/regenerate-api-key instead
router.patch("/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { firstName, lastName, phone, mentorName, robotName, robotTagline,
      backgroundImageUrl, webhookUrl } = req.body as Record<string, string>;

    const updateData: Record<string, string | undefined> = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (mentorName !== undefined) updateData.mentorName = mentorName;
    if (robotName !== undefined) updateData.robotName = robotName;
    if (robotTagline !== undefined) updateData.robotTagline = robotTagline;
    if (backgroundImageUrl !== undefined) updateData.backgroundImageUrl = backgroundImageUrl;
    if (webhookUrl !== undefined) updateData.webhookUrl = webhookUrl;

    const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, req.userId!)).returning();
    res.json({
      id: updated.id, email: updated.email, firstName: updated.firstName, lastName: updated.lastName,
      phone: updated.phone, mentorName: updated.mentorName, robotName: updated.robotName,
      robotTagline: updated.robotTagline, backgroundImageUrl: updated.backgroundImageUrl,
      webhookUrl: updated.webhookUrl, apiKey: updated.apiKey, status: updated.status,
      licenseLimit: updated.licenseLimit, createdAt: updated.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "UpdateProfile error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Regenerate API key — invalidates old key immediately; all EA files must be re-downloaded
router.post("/admin/regenerate-api-key", requireAuth, regenKeyLimiter, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select({ role: usersTable.role, status: usersTable.status })
      .from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

    if (!user) { res.status(404).json({ error: "Not found" }); return; }
    if (user.role !== "mentor" && user.role !== "superadmin") {
      res.status(403).json({ error: "Only mentors can regenerate an API key" }); return;
    }

    const { rawKey, prefix } = await issueApiKey(req.userId!);

    req.log.info({ userId: req.userId }, "API key regenerated");
    // rawKey is returned ONCE — it is not stored anywhere in the DB
    res.json({ apiKey: rawKey, apiKeyPrefix: prefix, regenerated: true });
  } catch (err) {
    req.log.error({ err }, "RegenerateApiKey error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
