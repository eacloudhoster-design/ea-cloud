import {open,lstat,unlink,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {decryptMT5Password} from './mt5-crypto';
/** Explicit private operator handoff; no stdout secrets, network calls, status transitions or worker changes. */
export async function exportEnrollment(pool:any,id:string,destination:string){
 if(!/^[a-f0-9-]{36}$/.test(id)||!path.isAbsolute(destination))throw Error('Invalid private export selectors');
 const directory=await lstat(path.dirname(destination));
 if(!directory.isDirectory()||(directory.mode&0o077)!==0)throw Error('Private export directory must be mode 0700');
 let ancestor=await realpath(path.dirname(destination));
 while(true){
  try{
   const marker=path.join(ancestor,'.git'),entry=await lstat(marker);
   if(!entry.isDirectory())throw Error('Private export must be outside Git');
   // Managed sandboxes may have empty .git placeholders; real metadata has HEAD.
   try{await lstat(path.join(marker,'HEAD'));throw Error('Private export must be outside Git');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const parent=path.dirname(ancestor);if(parent===ancestor)break;ancestor=parent;
 }
 const client=await pool.connect();let transaction=false,created=false;
 try{
  await client.query('BEGIN READ ONLY');transaction=true;
  const result=await client.query(`SELECT r.*,u.status AS mentor_status,u.role AS mentor_role,a.status AS client_status,a.mentor_id AS current_mentor_id
   FROM mt5_enrollment_requests r JOIN users u ON u.id=r.mentor_id LEFT JOIN app_access a ON r.owner_kind='client' AND a.id=r.owner_id WHERE r.id=$1`,[id]);
  const row=result.rows[0];
  if(!row||row.status!=='pending'||row.mentor_status!=='approved'||!['mentor','superadmin'].includes(row.mentor_role)||
   (row.owner_kind==='client'&&(row.client_status!=='approved'||row.current_mentor_id!==row.mentor_id))||
   (row.owner_kind==='mentor'&&row.owner_id!==row.mentor_id))throw Error('Enrollment ownership unavailable');
  if(!Number.isSafeInteger(Number(row.login))||Number(row.login)>2147483647||Number(row.login)<=0||String(Number(row.login))!==row.login)throw Error('Enrollment account identifier unavailable');
  const packet={protocol:'EA_APP_DEMO_ENROLLMENT_V1',requestId:row.id,role:row.owner_kind,applicationOwner:{kind:row.owner_kind,id:row.owner_id,mentorId:row.mentor_id},broker:row.broker,login:Number(row.login),server:row.server,password:decryptMT5Password(row.encrypted_password),accountMode:'demo',brokerIdentityVerified:false,executionEnabled:false};
  const file=await open(destination,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  created=true;
  try{await file.writeFile(JSON.stringify(packet)+'\n');}finally{await file.close();}
  await client.query('COMMIT');transaction=false;
 }catch(error){if(created)await unlink(destination).catch(()=>{});throw error;}finally{if(transaction)await client.query('ROLLBACK').catch(()=>{});client.release();}
}
