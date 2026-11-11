import {createHmac,randomUUID} from "node:crypto";
import {pool} from "@workspace/db";
import {encryptMT5Password} from "./mt5-crypto";
export const provisioningBrokers=["deriv","exness","justmarkets","xm","rcg"];
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type Owner={kind:"client"|"mentor";id:number};
export function validateProvisioning(body:any,owner:Owner){
 if(!body || typeof body!=="object" || Array.isArray(body) || Object.keys(body).some(k=>!["requestKey","broker","login","server","password","accountRole","accountMode","ownershipConfirmed"].includes(k)))throw Error("INVALID_PROVISIONING_REQUEST");
 const role=owner.kind==="client"?"follower":"master";
 if(body.ownershipConfirmed!==true)throw Error("OWNERSHIP_CONFIRMATION_REQUIRED");
 if(body.accountRole!==role || (!["demo","live"].includes(body.accountMode) || (body.accountMode==="live" && process.env.MT5_LIVE_READONLY_ACCOUNTS!=="1")))throw Error("ACCOUNT_ROLE_NOT_AUTHORIZED");
 if(!Number.isSafeInteger(owner.id)||owner.id<=0 || (typeof body.requestKey!=="string" || !uuidPattern.test(body.requestKey)) || !provisioningBrokers.includes(body.broker) || typeof body.login!=="string" || !/^[1-9]\d*$/.test(body.login) || !Number.isSafeInteger(Number(body.login)) || (owner.kind==="mentor"&&Number(body.login)>2147483647) || typeof body.server!=="string" || !body.server.trim() || body.server!==body.server.trim() || body.server.length>256 || /[\x00-\x1f\x7f]/.test(body.server) || typeof body.password!=="string" || !body.password || body.password.length>1024)throw Error("INVALID_PROVISIONING_REQUEST");
 return {requestKey:body.requestKey,broker:body.broker,login:body.login,server:body.server,password:body.password,accountRole:role,accountMode:body.accountMode};
}
const errors=new Set(["BROKER_AUTHENTICATION_FAILED","BROKER_SERVER_UNAVAILABLE","PROVISIONING_CAPACITY_UNAVAILABLE","ACCOUNT_ALREADY_BOUND","OWNERSHIP_VERIFICATION_REQUIRED","PROVISIONING_OUTCOME_UNCERTAIN","REQUEST_EXPIRED"]);
export function publicProvisioning(row:any){
 return {id:row.id,broker:row.broker,login:row.login,server:row.server,accountRole:row.account_role,accountMode:row.account_mode??"demo",state:row.state,
  // Provisioning success alone is not a fresh account connection proof.
  connected:false,requiresConnectionVerification:["connected","awaiting_verification"].includes(row.state),executionEnabled:false,
  errorCode:row.error_code?(errors.has(row.error_code)?row.error_code:"PROVISIONING_REVIEW_REQUIRED"):null,
  createdAt:row.created_at,updatedAt:row.updated_at,expiresAt:row.expires_at};
}
export async function queueProvisioning(body:any,owner:Owner){
 const input=validateProvisioning(body,owner);
 const secret=process.env.SESSION_SECRET;if(!secret||secret.length<16)throw Error("PROVISIONING_ENCRYPTION_UNAVAILABLE");
 const hash=createHmac("sha256",secret).update(JSON.stringify([owner,input])).digest("hex");
 const db=await pool.connect();
 try{
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`mt5-provision:${owner.kind}:${owner.id}`]);
  const old=await db.query("SELECT * FROM mt5_provisioning_requests WHERE owner_kind=$1 AND owner_id=$2 AND request_key=$3",[owner.kind,owner.id,input.requestKey]);
  if(old.rows[0]){if(old.rows[0].request_hash!==hash)throw Error("PROVISIONING_REQUEST_CONFLICT");await db.query("COMMIT");return publicProvisioning(old.rows[0]);}
  await db.query("UPDATE mt5_provisioning_requests SET state='failed',error_code='REQUEST_EXPIRED',encrypted_password=NULL,updated_at=now() WHERE owner_kind=$1 AND owner_id=$2 AND state='queued' AND expires_at<=now()",[owner.kind,owner.id]);
  const pending=await db.query("SELECT count(*)::int AS count FROM mt5_provisioning_requests WHERE owner_kind=$1 AND owner_id=$2 AND state IN ('queued','provisioning','awaiting_verification','review_required')",[owner.kind,owner.id]);
  if(pending.rows[0].count>=1)throw Error("PROVISIONING_ALREADY_PENDING");
  const encrypted=encryptMT5Password(input.password);
  const result=await db.query("INSERT INTO mt5_provisioning_requests(id,owner_kind,owner_id,request_key,request_hash,broker,login,server,account_role,encrypted_password,account_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",[randomUUID(),owner.kind,owner.id,input.requestKey,hash,input.broker,input.login,input.server,input.accountRole,encrypted,input.accountMode]);
  await db.query("INSERT INTO mt5_provisioning_audit(request_id,event) VALUES($1,'queued')",[result.rows[0].id]);
  await db.query("COMMIT");return publicProvisioning(result.rows[0]);
 }catch(e){await db.query("ROLLBACK");throw e;}finally{db.release();}
}
export async function provisioningStatus(owner:Owner){
 const result=await pool.query("SELECT id,broker,login,server,account_role,account_mode,state,error_code,created_at,updated_at,expires_at FROM mt5_provisioning_requests WHERE owner_kind=$1 AND owner_id=$2 ORDER BY created_at DESC LIMIT 20",[owner.kind,owner.id]);
 return result.rows.map(publicProvisioning);
}
export async function cancelProvisioning(owner:Owner,id:string){
 if(!uuidPattern.test(id))throw Error("INVALID_PROVISIONING_REQUEST");
 const result=await pool.query("WITH cancelled AS (UPDATE mt5_provisioning_requests SET state='cancelled',encrypted_password=NULL,updated_at=now() WHERE id=$1 AND owner_kind=$2 AND owner_id=$3 AND state='queued' RETURNING id) INSERT INTO mt5_provisioning_audit(request_id,event) SELECT id,'cancelled' FROM cancelled RETURNING request_id",[id,owner.kind,owner.id]);
 return result.rowCount===1;
}
/** Called only AFTER fresh broker proof and the existing owner-binding transaction. */
export async function markProvisioningBound(owner:Owner,login:string,server:string){
 if(process.env.MT5_SELF_SERVICE_PROVISIONING!=="1")return;
 await pool.query("WITH changed AS (UPDATE mt5_provisioning_requests SET state='connected',encrypted_password=NULL,updated_at=now() WHERE owner_kind=$1 AND owner_id=$2 AND login=$3 AND server=$4 AND state='awaiting_verification' RETURNING id) INSERT INTO mt5_provisioning_audit(request_id,event) SELECT id,'connected' FROM changed",[owner.kind,owner.id,login,server]);
}
