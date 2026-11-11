import {validateCopyPolicy} from "../lib/copy-policy";
import { Router } from "express";
import { db, appAccessTable,mentorCopyPoliciesTable,mentorCopyPolicyAuditTable } from "@workspace/db";
import { and,eq,desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAppSession } from "../middlewares/app-session";
import { clientEngineStatus } from "../lib/engine-status";
const router=Router();
router.get("/app/engine/status",requireAppSession,async(req:any,res)=>{
  res.setHeader("Cache-Control","no-store");
  try {res.json(await clientEngineStatus(req.clientId,true));}
  catch {res.status(503).json({error:"Engine status temporarily unavailable",code:"ENGINE_STATUS_UNAVAILABLE"});}
});
router.get("/admin/engine/clients",requireAuth,async(req:any,res)=>{
  res.setHeader("Cache-Control","no-store");
  if(!["mentor","superadmin"].includes(req.userRole)){res.status(403).json({error:"Forbidden"});return;}
  try {
    const clients=await db.select({id:appAccessTable.id,firstName:appAccessTable.firstName,lastName:appAccessTable.lastName,status:appAccessTable.status})
      .from(appAccessTable).where(eq(appAccessTable.mentorId,req.userId)).orderBy(desc(appAccessTable.id)).limit(100);
    res.json({clients,limit:100});
  }catch {res.status(503).json({error:"Engine status temporarily unavailable",code:"ENGINE_STATUS_UNAVAILABLE"});}
});
router.get("/admin/engine/clients/:id",requireAuth,async(req:any,res)=>{
  res.setHeader("Cache-Control","no-store");
  if(!["mentor","superadmin"].includes(req.userRole) || !/^[1-9]\d*$/.test(req.params.id) || Number(req.params.id)>2147483647){res.status(403).json({error:"Forbidden"});return;}
  try {
    const [client]=await db.select({id:appAccessTable.id}).from(appAccessTable).where(and(eq(appAccessTable.id,Number(req.params.id)),eq(appAccessTable.mentorId,req.userId))).limit(1);
    if(!client){res.status(404).json({error:"Client not found"});return;}
    // Ownership is checked before the backend's read-only credential proof.
    // No password/ciphertext/balance enters the portal response.
    res.json(await clientEngineStatus(client.id,true,req.userId));
  }catch {res.status(503).json({error:"Engine status temporarily unavailable",code:"ENGINE_STATUS_UNAVAILABLE"});}
});

router.get("/admin/engine/clients/:id/policy",requireAuth,async(req:any,res)=>{
 res.setHeader("Cache-Control","no-store");
 if(!["mentor","superadmin"].includes(req.userRole)||!/^[1-9]\d*$/.test(req.params.id)||Number(req.params.id)>2147483647){res.status(403).json({error:"Forbidden"});return;}
 try{
  const [client]=await db.select({id:appAccessTable.id}).from(appAccessTable).where(and(eq(appAccessTable.id,Number(req.params.id)),eq(appAccessTable.mentorId,req.userId))).limit(1);
  if(!client){res.status(404).json({error:"Client not found"});return;}
  const [policy]=await db.select().from(mentorCopyPoliciesTable).where(and(eq(mentorCopyPoliciesTable.clientId,client.id),eq(mentorCopyPoliciesTable.mentorId,req.userId))).limit(1);
  res.json({clientId:client.id,policy:policy??null,executionEnabled:false,configurationOnly:true});
 }catch{res.status(503).json({error:"Copy policy unavailable"});}
});
router.patch("/admin/engine/clients/:id/policy",requireAuth,async(req:any,res)=>{
 res.setHeader("Cache-Control","no-store");
 if(process.env.EA_ENGINE_READ_ONLY==="1"){res.status(403).json({error:"Read-only deployment"});return;}
 if(!["mentor","superadmin"].includes(req.userRole)||!/^[1-9]\d*$/.test(req.params.id)||Number(req.params.id)>2147483647){res.status(403).json({error:"Forbidden"});return;}
 let value;try{value=validateCopyPolicy(req.body);}catch{res.status(422).json({error:"Invalid copying policy or risk limits"});return;}
 try{
  const policy=await db.transaction(async tx=>{
   const [client]=await tx.select({id:appAccessTable.id}).from(appAccessTable).where(and(eq(appAccessTable.id,Number(req.params.id)),eq(appAccessTable.mentorId,req.userId))).limit(1).for("update");
   if(!client)return null;
   const [saved]=await tx.insert(mentorCopyPoliciesTable).values({clientId:client.id,mentorId:req.userId,...value}).onConflictDoUpdate({target:mentorCopyPoliciesTable.clientId,set:{mentorId:req.userId,...value}}).returning();
   await tx.insert(mentorCopyPolicyAuditTable).values({clientId:client.id,mentorId:req.userId,action:"policy_updated",snapshot:JSON.stringify(value)});
   return saved;
  });
  if(!policy){res.status(404).json({error:"Client not found"});return;}
  res.json({clientId:Number(req.params.id),policy,configurationOnly:true,executionEnabled:false});
 }catch{res.status(503).json({error:"Policy storage unavailable"});}
});

export default router;
