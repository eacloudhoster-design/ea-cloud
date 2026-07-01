import { Router } from "express";
import { db, brokerServersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireSuperAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

// Public: list all active broker servers (used by mobile app)
router.get("/app/broker-servers", async (req, res) => {
  try {
    const servers = await db.select().from(brokerServersTable)
      .where(eq(brokerServersTable.isActive, true))
      .orderBy(brokerServersTable.brokerName, brokerServersTable.serverName);
    res.json(servers);
  } catch (err) {
    req.log.error({ err }, "GetBrokerServers error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// SuperAdmin: list all broker servers (including inactive)
router.get("/superadmin/broker-servers", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const servers = await db.select().from(brokerServersTable)
      .orderBy(brokerServersTable.brokerName, brokerServersTable.serverName);
    res.json(servers);
  } catch (err) {
    req.log.error({ err }, "SuperAdminGetBrokerServers error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// SuperAdmin: add a broker server
router.post("/superadmin/broker-servers", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { brokerName, serverName, serverType } = req.body as {
      brokerName: string; serverName: string; serverType: string;
    };
    if (!brokerName || !serverName || !serverType) {
      res.status(400).json({ error: "brokerName, serverName, and serverType are required" }); return;
    }
    const [server] = await db.insert(brokerServersTable).values({
      brokerName: brokerName.trim(),
      serverName: serverName.trim(),
      serverType: serverType === "demo" ? "demo" : "live",
      isActive: true,
    }).returning();
    res.status(201).json(server);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Server name already exists" }); return;
    }
    req.log.error({ err }, "AddBrokerServer error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// SuperAdmin: update broker server
router.patch("/superadmin/broker-servers/:id", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { brokerName, serverName, serverType, isActive } = req.body as {
      brokerName?: string; serverName?: string; serverType?: string; isActive?: boolean;
    };
    const updates: Partial<typeof brokerServersTable.$inferInsert> = {};
    if (brokerName !== undefined) updates.brokerName = brokerName.trim();
    if (serverName !== undefined) updates.serverName = serverName.trim();
    if (serverType !== undefined) updates.serverType = serverType;
    if (isActive !== undefined) updates.isActive = isActive;

    const [server] = await db.update(brokerServersTable).set(updates)
      .where(eq(brokerServersTable.id, id)).returning();
    if (!server) { res.status(404).json({ error: "Not found" }); return; }
    res.json(server);
  } catch (err) {
    req.log.error({ err }, "UpdateBrokerServer error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// SuperAdmin: delete broker server
router.delete("/superadmin/broker-servers/:id", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(brokerServersTable).where(eq(brokerServersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "DeleteBrokerServer error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
