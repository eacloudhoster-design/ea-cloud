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
  if(!result.rows.length||result.rows.some((r:any)=>!decryptMT5Password(r.encrypted_mt5_password)))throw Error('Original nonempty encryption compatibility evidence required');
  const requirements:Record<string,string[]>={client_settings:['SELECT','INSERT','UPDATE'],mt5_connections:['SELECT','INSERT','UPDATE'],mentor_copy_policies:['SELECT','INSERT','UPDATE'],mentor_copy_policy_audit:['SELECT','INSERT'],browser_sessions:['SELECT','UPDATE','DELETE'],users:['SELECT'],app_access:['SELECT'],licenses:['SELECT'],eas:['SELECT'],trade_executions:['SELECT'],observer_allocations:['SELECT']};
  const values=Object.entries(requirements).flatMap(([table,privileges])=>privileges.map(privilege=>`('${table}','${privilege}')`)).join(',');
  const grants=await client.query(`SELECT bool_and(has_table_privilege(current_user,t,p)) AS allowed FROM (VALUES ${values}) AS requirements(t,p)`);
  if(grants.rows[0]?.allowed!==true)throw Error('Owner management privileges missing');
  await client.query('COMMIT');transaction=false;
 }catch{throw Error('Management database/schema/original-key verification failed');}
 finally{if(transaction)await client.query('ROLLBACK').catch(()=>{});client.release();}
}
