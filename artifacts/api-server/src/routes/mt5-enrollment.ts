import rateLimit from 'express-rate-limit';
import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {db,mt5EnrollmentTable,usersTable,appAccessTable} from '@workspace/db';
import {and,eq,desc} from 'drizzle-orm';
import {requireAuth} from '../middlewares/auth';
import {requireAppSession} from '../middlewares/app-session';
import {encryptMT5Password} from '../lib/mt5-crypto';
import {assertAccountOwnership,type AccountOwner} from '../lib/account-ownership';
const router=Router();
const projection={id:mt5EnrollmentTable.id,login:mt5EnrollmentTable.login,server:mt5EnrollmentTable.server,broker:mt5EnrollmentTable.broker,status:mt5EnrollmentTable.status,createdAt:mt5EnrollmentTable.createdAt,updatedAt:mt5EnrollmentTable.updatedAt};
async function ownerFor(tx:any,req:any):Promise<AccountOwner|null>{
 if(req.clientId){
  const [client]=await tx.select().from(appAccessTable).where(eq(appAccessTable.id,req.clientId)).limit(1).for('update');
  if(client?.status!=='approved'||!client.mentorId)return null;
  const [mentor]=await tx.select().from(usersTable).where(eq(usersTable.id,client.mentorId)).limit(1);
  if(mentor?.status!=='approved'||!['mentor','superadmin'].includes(mentor.role))return null;
  return {kind:'client',id:client.id,mentorId:client.mentorId};
 }
 if(['mentor','superadmin'].includes(req.userRole)){
  const [mentor]=await tx.select().from(usersTable).where(eq(usersTable.id,req.userId)).limit(1).for('update');
  if(mentor?.status==='approved'&&['mentor','superadmin'].includes(mentor.role))return {kind:'mentor',id:mentor.id,mentorId:mentor.id};
 }
 return null;
}
for(const [path,auth] of [['/app/mt5-enrollment',requireAppSession],['/admin/mt5/enrollment',requireAuth]] as const){
 router.get(path,auth,async(req:any,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
   const result=await db.transaction(async tx=>{const owner=await ownerFor(tx,req);if(!owner)return null;
    return tx.select(projection).from(mt5EnrollmentTable).where(and(eq(mt5EnrollmentTable.ownerKind,owner.kind),eq(mt5EnrollmentTable.ownerId,owner.id),eq(mt5EnrollmentTable.mentorId,owner.mentorId))).orderBy(desc(mt5EnrollmentTable.createdAt)).limit(20);});
   if(!result){res.status(403).json({code:'ENROLLMENT_OWNER_UNAVAILABLE'});return;}
   res.json({requests:result,executionEnabled:false,provisioningAutomatic:false});
  }catch{res.status(503).json({code:'ENROLLMENT_STORAGE_UNAVAILABLE'});}
 });
 router.post(path,auth,rateLimit({windowMs:3600000,limit:10,keyGenerator:(req:any)=>String(req.clientId??req.userId),message:{code:'ENROLLMENT_RATE_LIMITED'}}),async(req:any,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(process.env.EA_ENGINE_READ_ONLY==='1'){res.status(403).json({code:'READ_ONLY_DEPLOYMENT'});return;}
  const b=req.body;
  if(!b||Object.keys(b).some(k=>!['login','server','password','broker'].includes(k))||typeof b.login!=='string'||!/^[1-9]\d*$/.test(b.login)||!Number.isSafeInteger(Number(b.login))||Number(b.login)>2147483647||typeof b.server!=='string'||!b.server||b.server.trim()!==b.server||b.server.length>100||/[\x00-\x1f\x7f]/.test(b.server)||typeof b.password!=='string'||!b.password||b.password.length>1024||!['justmarkets','exness','deriv','xm','rcg'].includes(b.broker)){
   res.status(422).json({code:'INVALID_ENROLLMENT_REQUEST'});return;
  }
  try{
   const request=await db.transaction(async tx=>{
    const owner=await ownerFor(tx,req);if(!owner)return null;
    await assertAccountOwnership(tx,owner,b.login,b.server,b.broker);
    const [prior]=await tx.select().from(mt5EnrollmentTable).where(and(eq(mt5EnrollmentTable.login,b.login),eq(mt5EnrollmentTable.server,b.server))).limit(1);
    // Same owned request is idempotent; a corrected password is encrypted again, never replayed upstream.
    if(prior){
     if(prior.broker!==b.broker)throw Error('ACCOUNT_ALREADY_BOUND');
     const [saved]=await tx.update(mt5EnrollmentTable).set({encryptedPassword:encryptMT5Password(b.password),status:'pending',updatedAt:new Date()}).where(eq(mt5EnrollmentTable.id,prior.id)).returning(projection);return saved;
    }
    const outstanding=await tx.select({id:mt5EnrollmentTable.id}).from(mt5EnrollmentTable).where(and(eq(mt5EnrollmentTable.ownerKind,owner.kind),eq(mt5EnrollmentTable.ownerId,owner.id),eq(mt5EnrollmentTable.status,'pending'))).limit(8);
    if(outstanding.length>=8)throw Error('ENROLLMENT_CAPACITY_REACHED');
    const [saved]=await tx.insert(mt5EnrollmentTable).values({id:randomUUID(),ownerKind:owner.kind,ownerId:owner.id,mentorId:owner.mentorId,login:b.login,server:b.server,broker:b.broker,encryptedPassword:encryptMT5Password(b.password)}).returning(projection);return saved;
   });
   if(!request){res.status(403).json({code:'ENROLLMENT_OWNER_UNAVAILABLE'});return;}
   res.status(202).json({request,executionEnabled:false,provisioningAutomatic:false,nextAction:'Operator provisioning required, then connect to verify the dedicated demo account'});
  }catch(error){if(error instanceof Error&&error.message==='ENROLLMENT_CAPACITY_REACHED'){res.status(409).json({code:'ENROLLMENT_CAPACITY_REACHED'});return;}if(error instanceof Error&&error.message==='ACCOUNT_ALREADY_BOUND'){res.status(409).json({code:'ACCOUNT_ALREADY_BOUND'});return;}res.status(503).json({code:'ENROLLMENT_STORAGE_UNAVAILABLE'});}
 });
}
export default router;
