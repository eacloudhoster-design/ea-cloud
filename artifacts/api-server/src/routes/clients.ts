import { Router } from "express";
import { db, clientsTable, appAccessTable, clientSettingsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/clients", requireAuth, async (req: AuthRequest, res) => {
  try {
    // Surface each client's live copy-trading state (copyingEnabled) by linking
    // the mentor's client registry to their app subscriber + settings. Match is
    // by mentor + case-insensitive email; null when the client has no app access.
    const clients = await db
      .select({
        id: clientsTable.id,
        email: clientsTable.email,
        firstName: clientsTable.firstName,
        lastName: clientsTable.lastName,
        licenseKey: clientsTable.licenseKey,
        status: clientsTable.status,
        connectedBroker: clientsTable.connectedBroker,
        lastActive: clientsTable.lastActive,
        createdAt: clientsTable.createdAt,
        copyingEnabled: clientSettingsTable.copyingEnabled,
      })
      .from(clientsTable)
      .leftJoin(
        appAccessTable,
        and(
          eq(appAccessTable.mentorId, clientsTable.mentorId),
          sql`lower(${appAccessTable.email}) = lower(${clientsTable.email})`,
        ),
      )
      .leftJoin(clientSettingsTable, eq(clientSettingsTable.clientId, appAccessTable.id))
      .where(eq(clientsTable.mentorId, req.userId!))
      .orderBy(clientsTable.createdAt);
    res.json(clients.map(c => ({
      id: c.id, email: c.email, firstName: c.firstName, lastName: c.lastName,
      licenseKey: c.licenseKey, status: c.status, connectedBroker: c.connectedBroker,
      lastActive: c.lastActive, createdAt: c.createdAt,
      copyingEnabled: c.copyingEnabled ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "GetClients error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/clients/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [client] = await db.select().from(clientsTable)
      .where(and(eq(clientsTable.id, id), eq(clientsTable.mentorId, req.userId!)))
      .limit(1);
    if (!client) { res.status(404).json({ error: "Not found" }); return; }
    res.json({
      id: client.id, email: client.email, firstName: client.firstName, lastName: client.lastName,
      licenseKey: client.licenseKey, status: client.status, connectedBroker: client.connectedBroker,
      lastActive: client.lastActive, createdAt: client.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "GetClient error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
