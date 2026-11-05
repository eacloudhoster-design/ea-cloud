// Strictly read-only compatibility audit. Never starts application jobs or migrations.
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function auditEncryptedRecords(client,decrypt,limit=100){
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Invalid sample bound');
 let transaction=false;
 try{
  await client.connect();await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');transaction=true;
  await client.query("SET LOCAL statement_timeout='5s'");await client.query("SET LOCAL lock_timeout='1s'");
  const mode=await client.query("SELECT current_setting('transaction_read_only') AS mode");if(mode.rows[0]?.mode!=='on')throw Error('READ_ONLY_REQUIRED');
  const exists=await client.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='client_settings' AND column_name IN ('id','encrypted_mt5_password')");
  if(exists.rows[0]?.n!==2)throw Error('SCHEMA_NOT_READY');
  const records=await client.query('SELECT encrypted_mt5_password FROM client_settings WHERE encrypted_mt5_password IS NOT NULL ORDER BY id LIMIT $1',[limit]);
  let formatValid=0,decrypted=0,failed=0;
  for(const row of records.rows){
   const value=row.encrypted_mt5_password;
   if(typeof value!=='string'||!/^[a-f0-9]{24}:[a-f0-9]{32}:(?:[a-f0-9]{2})*$/i.test(value)){failed++;continue;}
   formatValid++;
   try{if(typeof decrypt(value)==='string')decrypted++;else failed++;}catch{failed++;}
  }
  return {mode:'read-only',sample_limit:limit,records_sampled:records.rows.length,v1_format_valid:formatValid,decrypted_records:decrypted,failed_records:failed,compatibility_verified:records.rows.length>0&&failed===0,records_modified:0,plaintext_or_ciphertext_returned:false};
 }finally{if(transaction)await client.query('ROLLBACK').catch(()=>{});await client.end().catch(()=>{});}
}
export async function main(){
 if(!process.env.DATABASE_URL||!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<16){console.log(JSON.stringify({verified:false,code:'UNCHANGED_PRODUCTION_BINDINGS_REQUIRED',records_modified:0}));return 1;}
 const require=createRequire(new URL('../../lib/db/package.json',import.meta.url));const {Client}=require('pg');
 const dir=await mkdtemp(join(tmpdir(),'ea-encryption-audit-'));
 try{
  const {build}=await import('../../artifacts/api-server/node_modules/esbuild/lib/main.js');
  const file=join(dir,'crypto.mjs');await build({entryPoints:[new URL('../../artifacts/api-server/src/lib/mt5-crypto.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',outfile:file,logLevel:'silent'});
  const crypto=await import(pathToFileURL(file));
  const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,application_name:'ea-cloud-readonly-encryption-audit'});
  const result=await auditEncryptedRecords(client,crypto.decryptMT5Password);console.log(JSON.stringify(result));return result.compatibility_verified?0:result.records_sampled===0?2:1;
 }catch(error){const code=/^[A-Z0-9_]{5,50}$/.test(error?.code||'')?error.code:'READONLY_AUDIT_FAILED';console.log(JSON.stringify({verified:false,code,records_modified:0}));return 1;}
 finally{await rm(dir,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main();
