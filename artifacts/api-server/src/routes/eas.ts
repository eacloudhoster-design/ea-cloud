import { Router } from "express";
import { db, easTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/eas", requireAuth, async (req: AuthRequest, res) => {
  try {
    const eas = await db.select().from(easTable).where(eq(easTable.mentorId, req.userId!));
    res.json(eas);
  } catch (err) {
    req.log.error({ err }, "GetEas error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/eas", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, description, symbol, lotSize, riskLevel, isActive } = req.body as {
      name: string; description?: string; symbol?: string; lotSize?: string; riskLevel?: string; isActive?: boolean;
    };
    if (!name) { res.status(400).json({ error: "Name is required" }); return; }
    const [ea] = await db.insert(easTable).values({
      mentorId: req.userId!,
      name,
      description: description ?? null,
      symbol: symbol ?? "XAUUSD",
      lotSize: lotSize ?? "0.01",
      riskLevel: riskLevel ?? "medium",
      isActive: isActive ?? true,
    }).returning();
    res.status(201).json(ea);
  } catch (err) {
    req.log.error({ err }, "CreateEa error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/eas/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { name, description, symbol, lotSize, riskLevel, isActive } = req.body as {
      name?: string; description?: string; symbol?: string; lotSize?: string; riskLevel?: string; isActive?: boolean;
    };
    const updateData: Record<string, string | boolean | null | undefined> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (symbol !== undefined) updateData.symbol = symbol;
    if (lotSize !== undefined) updateData.lotSize = lotSize;
    if (riskLevel !== undefined) updateData.riskLevel = riskLevel;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db.update(easTable).set(updateData)
      .where(and(eq(easTable.id, id), eq(easTable.mentorId, req.userId!)))
      .returning();
    if (!updated) { res.status(404).json({ error: "EA not found" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "UpdateEa error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/eas/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(easTable).where(and(eq(easTable.id, id), eq(easTable.mentorId, req.userId!)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "DeleteEa error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
