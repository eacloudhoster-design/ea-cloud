import { Router } from "express";
import { db, usersTable, easTable, appAccessTable, licensesTable, eaModeImagesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { requireClientAuth } from "./client-app";

const router = Router();
const image = z.string().max(2048).refine(value => {
  if (/^\/api\/storage\/(?:r2\/\d+\/[a-zA-Z0-9-]+|objects\/[a-zA-Z0-9/_-]+)$/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}, "Invalid image URL").nullable();
const input = z.object({ images: z.tuple([image, image, image, image]) }).strict();
const rowImages = (row: any, fallback: string | null) => [row?.normal || fallback, row?.beast || null, row?.aggressive || null, row?.ultimate || null];
const unavailable = (req: any, res: any, error: unknown) => {
  req.log?.error({ event: "ea_mode_images_failed", code: (error as any)?.code }, "EA mode images unavailable");
  res.status(503).json({ error: "Mode images are unavailable. Retry or ask support to verify the EA mode-images migration." });
};

async function owner(req: AuthRequest, res: any) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Invalid EA" }); return null; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user || user.status !== "approved" || user.role !== req.userRole || !["mentor", "superadmin"].includes(user.role)) {
    res.status(403).json({ error: "An approved mentor account is required." }); return null;
  }
  const [ea] = await db.select().from(easTable).where(and(eq(easTable.id, id), eq(easTable.mentorId, user.id))).limit(1);
  if (!ea) { res.status(404).json({ error: "EA not found" }); return null; }
  return { ea, user };
}
router.get("/eas/:id/mode-images", requireAuth, async (req: AuthRequest, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const access = await owner(req, res); if (!access) return;
    const [row] = await db.select().from(eaModeImagesTable).where(eq(eaModeImagesTable.eaId, access.ea.id)).limit(1);
    res.json({ eaId: access.ea.id, images: rowImages(row, access.user.backgroundImageUrl), savedImages: rowImages(row, null), normalFallback: access.user.backgroundImageUrl || null });
  } catch (error) { unavailable(req, res, error); }
});
router.put("/eas/:id/mode-images", requireAuth, async (req: AuthRequest, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const access = await owner(req, res); if (!access) return;
    const parsed = input.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Provide exactly four valid image URLs or null values." }); return; }
    if (parsed.data.images.some(url => url?.startsWith("/api/storage/r2/") && !url.startsWith(`/api/storage/r2/${access.user.id}/`))) {
      res.status(403).json({ error: "Use images uploaded by your own account." }); return;
    }
    const [normal, beast, aggressive, ultimate] = parsed.data.images;
    const values = { normal, beast, aggressive, ultimate, updatedAt: new Date() };
    await db.insert(eaModeImagesTable).values({ eaId: access.ea.id, ...values })
      .onConflictDoUpdate({ target: eaModeImagesTable.eaId, set: values });
    res.json({ eaId: access.ea.id, images: rowImages(values, access.user.backgroundImageUrl), savedImages: rowImages(values, null), normalFallback: access.user.backgroundImageUrl || null });
  } catch (error) { unavailable(req, res, error); }
});

router.get("/app/ea-mode-images", requireClientAuth, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const [client] = await db.select().from(appAccessTable).where(eq(appAccessTable.id, req.clientId)).limit(1);
    const [license] = client?.licenseKey ? await db.select().from(licensesTable).where(eq(licensesTable.key, client.licenseKey)).limit(1) : [];
    if (!client || client.status !== "approved" || !client.mentorId || !license || license.mentorId !== client.mentorId || license.status !== "active" || (license.expiresAt && (!Number.isFinite(new Date(license.expiresAt).getTime()) || new Date(license.expiresAt).getTime() <= Date.now()))) {
      res.status(403).json({ error: "An approved account with an active linked EA licence is required." }); return;
    }
    const [mentor] = await db.select({ backgroundImageUrl: usersTable.backgroundImageUrl }).from(usersTable).where(eq(usersTable.id, client.mentorId)).limit(1);
    const rows = await db.select({ id: easTable.id, name: easTable.name, normal: eaModeImagesTable.normal, beast: eaModeImagesTable.beast, aggressive: eaModeImagesTable.aggressive, ultimate: eaModeImagesTable.ultimate })
      .from(easTable).leftJoin(eaModeImagesTable, eq(eaModeImagesTable.eaId, easTable.id))
      .where(and(eq(easTable.mentorId, client.mentorId), eq(easTable.isActive, true))).orderBy(asc(easTable.id));
    res.json({ eas: rows.map(row => ({ id: row.id, name: row.name, images: rowImages(row, mentor?.backgroundImageUrl || null) })) });
  } catch (error) { unavailable(req, res, error); }
});
export default router;
