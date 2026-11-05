import { Router } from "express";
import { db, appAccessTable, clientMt5ConnectionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();


// ─── Auth middleware ──────────────────────────────────────────────────────────
const requireClientAuth = async (req: any, res: any, next: any) => {
  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const decoded = Buffer.from(auth.slice(7), "base64").toString();
    const [idStr, role] = decoded.split(":");
    if (role !== "client") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = parseInt(idStr, 10);
    const [client] = await db
      .select({ id: appAccessTable.id, status: appAccessTable.status })
      .from(appAccessTable)
      .where(eq(appAccessTable.id, id))
      .limit(1);
    if (!client) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.clientId = id;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
};

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

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "[ClientMT5] error fetching connections");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
