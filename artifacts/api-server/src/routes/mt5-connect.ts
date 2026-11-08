import {assertAccountOwnership,markEnrollmentVerified} from "../lib/account-ownership";
import {encryptMT5Password,decryptMT5Password} from "../lib/mt5-crypto";
import {requireAuth} from "../middlewares/auth";
import { readBoundAccount } from "../lib/mt5-account-status";
import { Router } from "express";
import { db, mt5ConnectionsTable, usersTable } from "@workspace/db";
import { eq, desc, and,ne,sql } from "drizzle-orm";

const router = Router();


// ─── POST /api/admin/mt5/connect ──────────────────────────────────────────────
// Proxies credentials to the external MT5 backend, then saves the result.
router.post("/admin/mt5/connect", requireAuth, async (req: any, res) => {
  try {
    const mentor = ["mentor","superadmin"].includes(req.userRole) ? {id:req.userId} : null;
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
    if(req.body.broker!==undefined && req.body.broker!==account.broker){res.status(422).json({error:"Selected broker does not match verified account"});return;}
    if(account.role!=="mentor"){res.status(403).json({error:"A dedicated mentor-role worker is required"});return;}
    const saved=await db.transaction(async tx=>{
      const [ownerRow]=await tx.select().from(usersTable).where(eq(usersTable.id,mentor.id)).limit(1).for("update");
      if(ownerRow?.status!=="approved"||!["mentor","superadmin"].includes(ownerRow.role))throw Error("ACCOUNT_OWNER_UNAVAILABLE");
      const owner={kind:"mentor" as const,id:mentor.id,mentorId:mentor.id};
      await assertAccountOwnership(tx,owner,String(loginNum),server,account.broker);
      const [other]=await tx.select({id:mt5ConnectionsTable.id}).from(mt5ConnectionsTable).where(and(eq(mt5ConnectionsTable.mt5Login,loginNum),eq(mt5ConnectionsTable.mt5Server,server),ne(mt5ConnectionsTable.mentorId,mentor.id))).limit(1);
      if(other)return null;
      const [row]=await tx.insert(mt5ConnectionsTable).values({mentorId:mentor.id,mt5Login:loginNum,mt5Server:server,encryptedMt5Password:encryptMT5Password(password),balance:account.balance===null?null:String(account.balance),status:"connected",rawResponse:JSON.stringify({verified:true,accountMode:"demo",executionEnabled:false})}).returning();await markEnrollmentVerified(tx,owner,String(loginNum),server);return row;
    });
    if(!saved){res.status(409).json({error:"Account is already assigned to another mentor"});return;}
    res.setHeader("Cache-Control","no-store");
    res.json({status:"connected",id:saved.id,mt5Login:loginNum,server,balance:saved.balance,connectedAt:saved.connectedAt,accountMode:"demo",executionEnabled:account.execution_enabled});
  } catch(error) {
    if(error instanceof Error&&error.message==="ACCOUNT_OWNER_UNAVAILABLE"){res.status(403).json({error:"Account owner is no longer authorized",code:"ACCOUNT_OWNER_UNAVAILABLE"});return;}
    if(error instanceof Error&&error.message==="ACCOUNT_ALREADY_BOUND"){res.status(409).json({error:"Account is already reserved",code:"ACCOUNT_ALREADY_BOUND"});return;}
    res.status(503).json({error:"Account verification or storage temporarily unavailable"});
  }
});

// ─── GET /api/admin/mt5/connections ───────────────────────────────────────────
// List all connection attempts for the authenticated mentor (newest first).
router.get("/admin/mt5/connections", requireAuth, async (req: any, res) => {
  try {
    const mentor = ["mentor","superadmin"].includes(req.userRole) ? {id:req.userId} : null;
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

router.get("/admin/mt5/status",requireAuth,async(req:any,res)=>{
 res.setHeader("Cache-Control","no-store");if(!["mentor","superadmin"].includes(req.userRole)){res.status(403).json({error:"Forbidden"});return;}
 try{
  const [row]=await db.select().from(mt5ConnectionsTable).where(and(eq(mt5ConnectionsTable.mentorId,req.userId),eq(mt5ConnectionsTable.status,"connected"))).orderBy(desc(mt5ConnectionsTable.connectedAt)).limit(1);
  if(!row?.encryptedMt5Password){res.json({connected:false,verified:false,code:"MENTOR_ACCOUNT_NOT_CONFIGURED"});return;}
  const proof=await readBoundAccount(row.mt5Login,row.mt5Server,decryptMT5Password(row.encryptedMt5Password));
  if(proof.role!=="mentor")throw Error();
  res.json({connected:true,verified:true,login:proof.login,server:proof.server,broker:proof.broker,accountMode:"demo",executionEnabled:false,workerExecutionEnabled:proof.execution_enabled,readOnly:proof.read_only,observedAt:new Date().toISOString()});
 }catch{res.status(503).json({connected:false,verified:false,code:"MENTOR_VERIFICATION_UNAVAILABLE"});}
});
router.post("/admin/mt5/disconnect",requireAuth,async(req:any,res)=>{
 res.setHeader("Cache-Control","no-store");if(!["mentor","superadmin"].includes(req.userRole)){res.status(403).json({error:"Forbidden"});return;}
 const id=req.body?.id;if(!Number.isSafeInteger(id)||id<=0){res.status(422).json({error:"Choose an owned connection"});return;}
 try{
  const disconnected=await db.transaction(async tx=>{
   const [row]=await tx.select().from(mt5ConnectionsTable).where(and(eq(mt5ConnectionsTable.id,id),eq(mt5ConnectionsTable.mentorId,req.userId))).limit(1).for("update");if(!row)return false;
   await tx.update(mt5ConnectionsTable).set({status:"disconnected"}).where(and(eq(mt5ConnectionsTable.mentorId,req.userId),eq(mt5ConnectionsTable.mt5Login,row.mt5Login),eq(mt5ConnectionsTable.mt5Server,row.mt5Server)));return true;
  });
  if(!disconnected){res.status(404).json({error:"Connection not found"});return;}
  res.json({connected:false,credentialsRetainedForReconciliation:true,existingPositionsUnchanged:true});
 }catch{res.status(503).json({error:"Disconnect not confirmed"});}
});
export default router;
