import { Router } from "express";
import { db, symbolPairsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

// Normalize a comma-separated variations string: trim each token, drop blanks,
// de-duplicate (case-insensitive), and re-join.
function normalizeVariations(input: unknown): string {
  if (typeof input !== "string") return "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.join(",");
}

router.get("/symbol-pairs", requireAuth, async (req: AuthRequest, res) => {
  try {
    const pairs = await db.select().from(symbolPairsTable)
      .where(eq(symbolPairsTable.mentorId, req.userId!));
    res.json(pairs);
  } catch (err) {
    req.log.error({ err }, "GetSymbolPairs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/symbol-pairs", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { pairName, variations, isActive } = req.body as {
      pairName?: string; variations?: string; isActive?: boolean;
    };
    const name = (pairName ?? "").trim();
    if (!name) { res.status(400).json({ error: "pairName is required" }); return; }

    const [pair] = await db.insert(symbolPairsTable).values({
      mentorId: req.userId!,
      pairName: name,
      variations: normalizeVariations(variations),
      isActive: isActive ?? true,
    }).returning();
    res.status(201).json(pair);
  } catch (err: unknown) {
    // Unique (mentor_id, pair_name) violation → friendly 409.
    if ((err as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "A pair with this name already exists" }); return;
    }
    req.log.error({ err }, "CreateSymbolPair error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/symbol-pairs/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { pairName, variations, isActive } = req.body as {
      pairName?: string; variations?: string; isActive?: boolean;
    };
    const updateData: Record<string, string | boolean> = {};
    if (pairName !== undefined) {
      const name = pairName.trim();
      if (!name) { res.status(400).json({ error: "pairName cannot be empty" }); return; }
      updateData.pairName = name;
    }
    if (variations !== undefined) updateData.variations = normalizeVariations(variations);
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db.update(symbolPairsTable).set(updateData)
      .where(and(eq(symbolPairsTable.id, id), eq(symbolPairsTable.mentorId, req.userId!)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Symbol pair not found" }); return; }
    res.json(updated);
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "A pair with this name already exists" }); return;
    }
    req.log.error({ err }, "UpdateSymbolPair error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/symbol-pairs/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(symbolPairsTable)
      .where(and(eq(symbolPairsTable.id, id), eq(symbolPairsTable.mentorId, req.userId!)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "DeleteSymbolPair error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
