import {createDecipheriv,createHash,scryptSync} from 'node:crypto';
import {decryptMT5Password} from './mt5-crypto';
import {MT5_VPS_BASE,mt5Headers} from './mt5-endpoint';
/** A closed execution worker is insufficient: require the status-only gateway contract. */
export async function verifyManagementGateway(){
 const response=await fetch(`${MT5_VPS_BASE}/observer/capabilities`,{headers:mt5Headers(),redirect:'error',signal:AbortSignal.timeout(10000)});
 const data:any=await response.json().catch(()=>null);
 if(response.status!==503||data?.read_only!==true||data.execution_enabled!==false||data.persistentJournal!==false||data.absoluteTargets!==false)throw Error('Verified status-only gateway required');
}
/** No startup mutations; prove schema, privileges and original nonempty ciphertext with explicit READ ONLY. */
export async function verifyManagementDatabase(pool:any){
 const client=await pool.connect();let transaction=false;
 try{
  const mode=await client.query('SHOW default_transaction_read_only');
  if(mode.rows[0]?.default_transaction_read_only!=='off')throw Error('Separate authorized management binding required');
  await client.query('BEGIN READ ONLY');transaction=true;
  await client.query('SELECT client_id,mentor_id,enabled,lot_mode,fixed_lot_size,allocation_percent,max_lot_size,max_exposure_lots,max_open_trades,max_daily_drawdown FROM mentor_copy_policies LIMIT 0');
  await client.query('SELECT client_id,mentor_id,action,snapshot FROM mentor_copy_policy_audit LIMIT 0');
  await client.query('SELECT mentor_id,mt5_login,mt5_server,encrypted_mt5_password FROM mt5_connections LIMIT 0');
  const result=await client.query('SELECT encrypted_mt5_password FROM client_settings WHERE encrypted_mt5_password IS NOT NULL LIMIT 3');
  if(result.rows.length){
   if(result.rows.some((r:any)=>!decryptMT5Password(r.encrypted_mt5_password)))throw Error('Original MT5 ciphertext verification failed');
  }else{
   // First MT5 enrollment: prove the same original secret against existing API-key ciphertext/hash.
   // Never use the API-key module's development fallback or permit an empty evidence override.
   const secret=process.env.SESSION_SECRET;
   if(!secret||secret.length<16)throw Error('Original key required');
   const keys=await client.query('SELECT api_key,api_key_encrypted FROM users WHERE api_key_encrypted IS NOT NULL ORDER BY id LIMIT 3');
   if(!keys.rows.length)throw Error('Original nonempty encryption compatibility evidence required');
   const key=scryptSync(secret,'ea-cloud-apikey-salt-v1',32);
   for(const row of keys.rows){
    if(typeof row.api_key_encrypted!=='string'||!/^[a-f0-9]{24}:[a-f0-9]{32}:(?:[a-f0-9]{2})+$/i.test(row.api_key_encrypted))throw Error('Original key evidence malformed');
    const [iv,tag,ciphertext]=row.api_key_encrypted.split(':');
    const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'hex'));decipher.setAuthTag(Buffer.from(tag,'hex'));
    const raw=Buffer.concat([decipher.update(Buffer.from(ciphertext,'hex')),decipher.final()]).toString('utf8');
    if(!/^eac_[a-f0-9]{48}$/i.test(raw)||createHash('sha256').update(raw).digest('hex')!==row.api_key)throw Error('Original key evidence mismatch');
   }
  }
  const requirements:Record<string,string[]>={client_settings:['SELECT','INSERT','UPDATE'],mt5_connections:['SELECT','INSERT','UPDATE'],mentor_copy_policies:['SELECT','INSERT','UPDATE'],mentor_copy_policy_audit:['SELECT','INSERT'],browser_sessions:['SELECT','UPDATE','DELETE'],users:['SELECT'],app_access:['SELECT'],licenses:['SELECT'],eas:['SELECT'],trade_executions:['SELECT'],observer_allocations:['SELECT']};
  const values=Object.entries(requirements).flatMap(([table,privileges])=>privileges.map(privilege=>`('${table}','${privilege}')`)).join(',');
  const grants=await client.query(`SELECT bool_and(has_table_privilege(current_user,t,p)) AS allowed FROM (VALUES ${values}) AS requirements(t,p)`);
  if(grants.rows[0]?.allowed!==true)throw Error('Owner management privileges missing');
  await client.query('COMMIT');transaction=false;
 }catch{throw Error('Management database/schema/original-key verification failed');}
 finally{if(transaction)await client.query('ROLLBACK').catch(()=>{});client.release();}
}
