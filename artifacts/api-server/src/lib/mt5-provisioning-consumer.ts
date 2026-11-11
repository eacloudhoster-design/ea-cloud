import {resolveAppSessionAccess} from "./app-session-access";
/** Inactive queue consumer contract. No SDK imports, endpoints or automatic startup.
 * A separately approved private supervisor must supply the dedicated-worker port.
 */
import {pool} from "@workspace/db";
import {decryptMT5Password} from "./mt5-crypto";
import {readBoundAccount} from "./mt5-account-status";
export interface DedicatedWorkerPort {
 provisionDedicatedWorker(input:{requestId:string;ownerKind:"client"|"mentor";ownerId:number;broker:string;login:string;server:string;password:string;role:"client"|"mentor";accountMode:"demo"|"live";executionEnabled:false;signal:AbortSignal}):Promise<void>;
}
export async function processNextProvisioning(port:DedicatedWorkerPort){
 if(process.env.MT5_SELF_SERVICE_PROVISIONING!=="1")throw Error("PROVISIONING_NOT_CONFIGURED");
 const db=await pool.connect();let row:any;
 try{
  await db.query("BEGIN");
  // Only queued intents are claimable. Crashed provisioning intents are NEVER retried.
  const result=await db.query("SELECT * FROM mt5_provisioning_requests WHERE state='queued' AND expires_at>now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1");row=result.rows[0];
  if(!row){await db.query("COMMIT");return {processed:false};}
  await db.query("UPDATE mt5_provisioning_requests SET state='provisioning',updated_at=now() WHERE id=$1",[row.id]);
  await db.query("INSERT INTO mt5_provisioning_audit(request_id,event) VALUES($1,'provisioning')",[row.id]);
  await db.query("COMMIT");
 }catch(e){await db.query("ROLLBACK");throw e;}finally{db.release();}
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  // Revocation/mentor reassignment can occur after submission. Recheck at dispatch.
  const ownerResult=await pool.query(row.owner_kind==="client"?"SELECT * FROM app_access WHERE id=$1":"SELECT * FROM users WHERE id=$1",[row.owner_id]);
  const owner=ownerResult.rows[0];
  if(!owner)throw Error("OWNERSHIP_VERIFICATION_REQUIRED");
  if(row.owner_kind==="client"){
   const access=await resolveAppSessionAccess(owner);
   if("code" in access)throw Error("OWNERSHIP_VERIFICATION_REQUIRED");
  }else if(owner.role!=="mentor" || !["active","approved"].includes(owner.status))throw Error("OWNERSHIP_VERIFICATION_REQUIRED");
  const authorizationSnapshot=JSON.stringify([owner.id,owner.status,owner.role??null,owner.mentorId??owner.mentor_id??null]);
  if(row.account_mode==="live" && process.env.MT5_LIVE_READONLY_ACCOUNTS!=="1")throw Error("OWNERSHIP_VERIFICATION_REQUIRED");
  const password=decryptMT5Password(row.encrypted_password);
  await Promise.race([
   (async()=>{
    await port.provisionDedicatedWorker({requestId:row.id,ownerKind:row.owner_kind,ownerId:row.owner_id,broker:row.broker,login:row.login,server:row.server,password,role:row.account_role==="master"?"mentor":"client",accountMode:row.account_mode??"demo",executionEnabled:false,signal:controller.signal});
    if(controller.signal.aborted)throw Error("PROVISIONING_OUTCOME_UNCERTAIN");
    const proof=await readBoundAccount(row.login,row.server,password);
    const currentResult=await pool.query(row.owner_kind==="client"?"SELECT * FROM app_access WHERE id=$1":"SELECT * FROM users WHERE id=$1",[row.owner_id]);
    const current=currentResult.rows[0];
    if(!current || authorizationSnapshot!==JSON.stringify([current.id,current.status,current.role??null,current.mentorId??current.mentor_id??null]))throw Error("OWNERSHIP_VERIFICATION_REQUIRED");
    if(row.owner_kind==="client" && "code" in await resolveAppSessionAccess(current))throw Error("OWNERSHIP_VERIFICATION_REQUIRED");
    if(controller.signal.aborted || proof.account_mode!==(row.account_mode??"demo") || proof.broker!==row.broker || proof.role!==(row.account_role==="master"?"mentor":"client") || proof.execution_enabled!==false || proof.read_only!==true)throw Error("PROVISIONING_OUTCOME_UNCERTAIN");
   })(),
   new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("PROVISIONING_OUTCOME_UNCERTAIN"));},120000);})
  ]);
  // User must still authenticate and bind through the existing connect route.
  await pool.query("WITH changed AS (UPDATE mt5_provisioning_requests SET state='awaiting_verification',encrypted_password=NULL,updated_at=now() WHERE id=$1 AND state='provisioning' RETURNING id) INSERT INTO mt5_provisioning_audit(request_id,event) SELECT id,'awaiting_verification' FROM changed",[row.id]);
  return {processed:true,state:"awaiting_verification",executionEnabled:false};
 }catch{
  controller.abort();
  await pool.query("WITH changed AS (UPDATE mt5_provisioning_requests SET state='review_required',error_code='PROVISIONING_OUTCOME_UNCERTAIN',encrypted_password=NULL,updated_at=now() WHERE id=$1 AND state='provisioning' RETURNING id) INSERT INTO mt5_provisioning_audit(request_id,event) SELECT id,'review_required' FROM changed",[row.id]);
  return {processed:true,state:"review_required",executionEnabled:false};
 }finally{clearTimeout(timer);}
}
/** Explicit maintenance hook; no timer or service is installed here. */
export async function expireQueuedProvisioning(){
 await pool.query("UPDATE mt5_provisioning_requests SET state='failed',error_code='REQUEST_EXPIRED',encrypted_password=NULL,updated_at=now() WHERE state='queued' AND expires_at<=now()");
}
