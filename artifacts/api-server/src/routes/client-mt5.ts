import { requireAppSession } from "../middlewares/app-session";
import { Router } from "express";
import { db, clientMt5ConnectionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();


// Reuse verified, account-owned browser sessions; bearer identity hints are not authentication.
const requireClientAuth = requireAppSession;

// Connect is handled by the shared credential-bound client-settings route.

// ─── GET /api/client/mt5/connections ──────────────────────────────────────────
router.get("/client/mt5/connections", requireClientAuth, async (req: any, res) => {
  try {
    const rows = await db
      .select({
        id: clientMt5ConnectionsTable.id,
        mt5Login: clientMt5ConnectionsTable.mt5Login,
        mt5Server: clientMt5ConnectionsTable.mt5Server,
        balance: clientMt5ConnectionsTable.balance,
        status: clientMt5ConnectionsTable.status,
        connectedAt: clientMt5ConnectionsTable.connectedAt,
      })
      .from(clientMt5ConnectionsTable)
      .where(eq(clientMt5ConnectionsTable.clientId, req.clientId))
      .orderBy(desc(clientMt5ConnectionsTable.connectedAt))
      .limit(50);

    res.setHeader("Cache-Control", "no-store");
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "[ClientMT5] error fetching connections");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
