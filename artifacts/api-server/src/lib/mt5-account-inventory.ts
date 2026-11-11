import {randomUUID} from "node:crypto";
import {pool} from "@workspace/db";
import {encryptMT5Password,decryptMT5Password} from "./mt5-crypto";
import {readBoundAccount} from "./mt5-account-status";
import {uuidPattern,type Owner} from "./mt5-provisioning";

function enabled(){if(process.env.MT5_ACCOUNT_INVENTORY!=="1")throw Error("ACCOUNT_MANAGEMENT_UNAVAILABLE");}
function owned(owner:Owner){if(!["mentor","client"].includes(owner.kind)||!Number.isSafeInteger(owner.id)||owner.id<=0)throw Error("ACCOUNT_NOT_FOUND");}
function identifier(id:string){if(!uuidPattern.test(id))throw Error("ACCOUNT_NOT_FOUND");}
function view(row:any){return {id:row.id,broker:row.broker,login:row.login,server:row.server,accountRole:row.account_role,accountMode:row.account_mode,state:row.state,lastVerifiedAt:row.verified_at,connected:false,executionEnabled:false};}
async function audit(tx:any,id:string,event:string){await tx.query("INSERT INTO mt5_account_inventory_audit(account_id,event) VALUES($1,$2)",[id,event]);}
async function lock(tx:any,owner:Owner,login:string,server:string){
 await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))",["ea-account:"+server+":"+login]);
 await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))",["ea-client:"+owner.id]);
}
async function legacyOwner(tx:any,owner:Owner,login:string,server:string){
 const follower=await tx.query("SELECT client_id FROM client_settings WHERE mt5_login=$1 AND mt5_server=$2",[login,server]);
 if(follower.rows.some((r:any)=>owner.kind!=="client"||r.client_id!==owner.id))throw Error("ACCOUNT_ALREADY_BOUND");
 if(Number(login)<=2147483647){
  const source=await tx.query("SELECT mentor_id FROM mt5_connections WHERE mt5_login=$1 AND mt5_server=$2",[Number(login),server]);
  if(source.rows.some((r:any)=>owner.kind!=="mentor"||r.mentor_id!==owner.id))throw Error("ACCOUNT_ALREADY_BOUND");
 }
}
/** Multiple independently verified accounts; no implicit worker or execution activation. */
export async function linkOwnedAccount(owner:Owner,body:any){
 enabled();owned(owner);
 if(!body||typeof body!=="object"||Object.keys(body).some(k=>!["login","server","password","broker"].includes(k))||typeof body.login!=="string"||!(/^[1-9][0-9]*$/).test(body.login)||!Number.isSafeInteger(Number(body.login))||typeof body.server!=="string"||!body.server||body.server.length>256||body.server!==body.server.trim()||/[\x00-\x1f\x7f]/.test(body.server)||typeof body.password!=="string"||!body.password||body.password.length>1024)throw Error("INVALID_ACCOUNT_REQUEST");
 const proof=await readBoundAccount(body.login,body.server,body.password);
 if(proof.role!==owner.kind||(body.broker!==undefined&&body.broker!==proof.broker))throw Error("ACCOUNT_ROLE_MISMATCH");
 const encrypted=encryptMT5Password(body.password),tx=await pool.connect();
 try{
  await tx.query("BEGIN");await lock(tx,owner,body.login,body.server);await legacyOwner(tx,owner,body.login,body.server);
  const existing=(await tx.query("SELECT * FROM mt5_account_inventory WHERE login=$1 AND server=$2 FOR UPDATE",[body.login,body.server])).rows[0];
  if(existing&&(existing.owner_kind!==owner.kind||existing.owner_id!==owner.id))throw Error("ACCOUNT_ALREADY_BOUND");
  if(existing&&existing.account_mode!==proof.account_mode)throw Error("ACCOUNT_MODE_CHANGED");
  if(!existing){const count=(await tx.query("SELECT count(*)::int AS count FROM mt5_account_inventory WHERE owner_kind=$1 AND owner_id=$2",[owner.kind,owner.id])).rows[0].count;if(count>=20)throw Error("ACCOUNT_CAPACITY_REACHED");}
  const row=existing?(await tx.query("UPDATE mt5_account_inventory SET encrypted_password=$1,state='linked',verified_at=now(),updated_at=now() WHERE id=$2 RETURNING *",[encrypted,existing.id])).rows[0]:(await tx.query("INSERT INTO mt5_account_inventory(id,owner_kind,owner_id,broker,login,server,account_role,account_mode,encrypted_password,verified_at) VALUES($1,$2,$3,$4,$5,$6,$2,$7,$8,now()) RETURNING *",[randomUUID(),owner.kind,owner.id,proof.broker,body.login,body.server,proof.account_mode,encrypted])).rows[0];
  await audit(tx,row.id,"linked");await tx.query("COMMIT");return {...view(row),connected:true,verified:true,selected:false,readOnly:proof.read_only};
 }catch(e){await tx.query("ROLLBACK");throw e;}finally{tx.release();}
}
export async function listOwnedAccounts(owner:Owner){enabled();owned(owner);return (await pool.query("SELECT id,broker,login,server,account_role,account_mode,state,verified_at FROM mt5_account_inventory WHERE owner_kind=$1 AND owner_id=$2 ORDER BY created_at,id",[owner.kind,owner.id])).rows.map(view);}
async function account(owner:Owner,id:string){enabled();owned(owner);identifier(id);const row=(await pool.query("SELECT * FROM mt5_account_inventory WHERE id=$1 AND owner_kind=$2 AND owner_id=$3",[id,owner.kind,owner.id])).rows[0];if(!row)throw Error("ACCOUNT_NOT_FOUND");return row;}
async function verify(row:any){if(row.state!=="linked")throw Error("ACCOUNT_DISCONNECTED");const proof=await readBoundAccount(row.login,row.server,decryptMT5Password(row.encrypted_password));if(proof.role!==row.account_role||proof.broker!==row.broker||proof.account_mode!==row.account_mode)throw Error("ACCOUNT_MODE_CHANGED");return proof;}
export async function ownedAccountStatus(owner:Owner,id:string){const row=await account(owner,id),proof=await verify(row);return {...view(row),connected:true,verified:true,readOnly:proof.read_only,balance:proof.balance,equity:proof.equity,currency:proof.currency,positions:proof.open_positions,pendingOrders:proof.pending_orders,observedAt:new Date().toISOString()};}
/** Selection reuses the existing execution binding. Any retained mapping blocks a switch. */
export async function selectOwnedAccount(owner:Owner,id:string){
 const row=await account(owner,id);await verify(row);
 if(owner.kind==="mentor"&&Number(row.login)>2147483647)throw Error("SOURCE_LOGIN_SCHEMA_LIMIT");
 const tx=await pool.connect();
 try{
  await tx.query("BEGIN");await lock(tx,owner,row.login,row.server);await legacyOwner(tx,owner,row.login,row.server);
  const current=(await tx.query("SELECT * FROM mt5_account_inventory WHERE id=$1 AND owner_kind=$2 AND owner_id=$3 FOR UPDATE",[id,owner.kind,owner.id])).rows[0];
  if(!current||current.state!=="linked"||current.encrypted_password!==row.encrypted_password)throw Error("ACCOUNT_CHANGED_RETRY");
  if(owner.kind==="client"){
   const settings=(await tx.query("SELECT * FROM client_settings WHERE client_id=$1 FOR UPDATE",[owner.id])).rows[0];
   if(settings?.mt5_login&&(settings.mt5_login!==row.login||settings.mt5_server!==row.server)){
    const mappings=await tx.query("SELECT id FROM observer_allocations WHERE client_id=$1 LIMIT 1",[owner.id]);
    if(mappings.rows.length)throw Error("ACCOUNT_REBIND_REQUIRES_RECONCILIATION");
    const pending=await tx.query("SELECT id FROM trade_executions WHERE client_id=$1 AND (status='pending' OR (status='success' AND signal_kind='OPEN')) LIMIT 1",[owner.id]);
    if(pending.rows.length)throw Error("ACCOUNT_REBIND_REQUIRES_RECONCILIATION");
   }
   if(settings)await tx.query("UPDATE client_settings SET mt5_login=$1,mt5_server=$2,mt5_broker=$3,encrypted_mt5_password=$4,mt5_connected=true,copying_enabled=false WHERE client_id=$5",[row.login,row.server,row.broker,row.encrypted_password,owner.id]);
   else await tx.query("INSERT INTO client_settings(client_id,mt5_login,mt5_server,mt5_broker,encrypted_mt5_password,mt5_connected,copying_enabled) VALUES($1,$2,$3,$4,$5,true,false)",[owner.id,row.login,row.server,row.broker,row.encrypted_password]);
  }else{
   await tx.query("UPDATE mt5_connections SET status='disconnected' WHERE mentor_id=$1 AND mt5_login=$2 AND mt5_server=$3",[owner.id,Number(row.login),row.server]);
   await tx.query("INSERT INTO mt5_connections(mentor_id,mt5_login,mt5_server,encrypted_mt5_password,status,raw_response) VALUES($1,$2,$3,$4,'connected',$5)",[owner.id,Number(row.login),row.server,row.encrypted_password,JSON.stringify({verified:true,accountMode:row.account_mode,executionEnabled:false})]);
  }
  await audit(tx,id,"selected");await tx.query("COMMIT");return {...view(current),connected:true,verified:true,selected:true,copyingEnabled:false};
 }catch(e){await tx.query("ROLLBACK");throw e;}finally{tx.release();}
}
export async function disconnectOwnedAccount(owner:Owner,id:string){
 const row=await account(owner,id),tx=await pool.connect();
 try{
  await tx.query("BEGIN");await lock(tx,owner,row.login,row.server);
  if(owner.kind==="client")await tx.query("UPDATE client_settings SET mt5_connected=false,copying_enabled=false WHERE client_id=$1 AND mt5_login=$2 AND mt5_server=$3",[owner.id,row.login,row.server]);
  else if(Number(row.login)<=2147483647)await tx.query("UPDATE mt5_connections SET status='disconnected' WHERE mentor_id=$1 AND mt5_login=$2 AND mt5_server=$3",[owner.id,Number(row.login),row.server]);
  await tx.query("UPDATE mt5_account_inventory SET state='disconnected',updated_at=now() WHERE id=$1 AND owner_kind=$2 AND owner_id=$3",[id,owner.kind,owner.id]);
  await audit(tx,id,"disconnected");await tx.query("COMMIT");return {connected:false,copyingEnabled:false,credentialsRetainedForReconciliation:true,workerStopped:false};
 }catch(e){await tx.query("ROLLBACK");throw e;}finally{tx.release();}
}
