import { readBoundAccount } from "../lib/mt5-account-status";
import { Router } from "express";
import { db, mt5ConnectionsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();


// ─── Auth helper (Bearer JWT → mentor row) ────────────────────────────────────
const getBearerMentor = async (authHeader: string | undefined) => {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = Buffer.from(authHeader.slice(7), "base64").toString();
    const [idStr, role] = decoded.split(":");
    if (role !== "mentor" && role !== "superadmin") return null;
    const id = parseInt(idStr, 10);
    const [mentor] = await db
      .select({ id: usersTable.id, status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    return mentor ?? null;
  } catch {
    return null;
  }
};

// ─── POST /api/admin/mt5/connect ──────────────────────────────────────────────
// Proxies credentials to the external MT5 backend, then saves the result.
router.post("/admin/mt5/connect", async (req: any, res) => {
  try {
    const mentor = await getBearerMentor(req.headers.authorization);
    if (!mentor) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { login, password, server } = req.body as {
      login?: unknown; password?: string; server?: string;
    };

    if (!login || !password || !server) {
      res.status(400).json({ error: "login, password, and server are required" }); return;
    }

    const loginNum = Number(login);
    if (!Number.isInteger(loginNum) || loginNum <= 0) {
      res.status(400).json({ error: "login must be a valid positive integer" }); return;
    }

    if(typeof password!=="string" || password.length>1024 || typeof server!=="string" || server.length>256 || !Number.isSafeInteger(loginNum) || loginNum>2147483647){res.status(400).json({error:"Invalid credentials or login exceeds current connection schema"});return;}
    let account;
    try {account=await readBoundAccount(loginNum,server,password);}
    catch {res.status(422).json({error:"Provisioned demo mentor account verification unavailable",code:"MT5_BINDING_UNVERIFIED"});return;}
    if(account.role!=="mentor"){res.status(403).json({error:"A dedicated mentor-role worker is required"});return;}
    const [saved]=await db.insert(mt5ConnectionsTable).values({mentorId:mentor.id,mt5Login:loginNum,mt5Server:server,balance:account.balance===null?null:String(account.balance),status:"connected",rawResponse:JSON.stringify({verified:true,accountMode:"demo",executionEnabled:account.execution_enabled})}).returning();
    res.setHeader("Cache-Control","no-store");
    res.json({status:"connected",id:saved.id,mt5Login:loginNum,server,balance:saved.balance,connectedAt:saved.connectedAt,accountMode:"demo",executionEnabled:account.execution_enabled});
  } catch {res.status(503).json({error:"Account verification or storage temporarily unavailable"});}
});

// ─── GET /api/admin/mt5/connections ───────────────────────────────────────────
// List all connection attempts for the authenticated mentor (newest first).
router.get("/admin/mt5/connections", async (req: any, res) => {
  try {
    const mentor = await getBearerMentor(req.headers.authorization);
    if (!mentor) { res.status(401).json({ error: "Unauthorized" }); return; }

    const rows = await db
      .select({
        id: mt5ConnectionsTable.id,
        mt5Login: mt5ConnectionsTable.mt5Login,
        mt5Server: mt5ConnectionsTable.mt5Server,
        balance: mt5ConnectionsTable.balance,
        status: mt5ConnectionsTable.status,
        connectedAt: mt5ConnectionsTable.connectedAt,
      })
      .from(mt5ConnectionsTable)
      .where(eq(mt5ConnectionsTable.mentorId, mentor.id))
      .orderBy(desc(mt5ConnectionsTable.connectedAt))
      .limit(50);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "MT5GetConnections error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
