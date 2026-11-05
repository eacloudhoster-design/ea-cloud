import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {randomBytes,scryptSync,createCipheriv} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from '../../lib/db/node_modules/pg/lib/index.js';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
import {auditEncryptedRecords} from '../../infra/linux/check-postgres-encryption.mjs';
test('PostgreSQL readonly audit preserves legacy encrypted rows; changed, missing and tampered keys fail closed',{skip:!process.env.EA_TEST_PG_URL},async()=>{
 const binding=new URL(process.env.EA_TEST_PG_URL);assert.equal(binding.searchParams.get('host'),'/var/lib/ea-cloud/validation/pg-test/socket');assert.equal(binding.username,'ea_db_test');
 const admin=new pg.Client({connectionString:binding.href});await admin.connect();assert.equal((await admin.query('SHOW data_directory')).rows[0].data_directory,'/var/lib/ea-cloud/validation/pg-test/data');
 const name='ea_validation_'+randomBytes(6).toString('hex');await admin.query('CREATE DATABASE '+name);await admin.end();binding.pathname='/'+name;
 const connection=()=>new pg.Client({connectionString:binding.href});
 const db=connection();await db.connect();await db.query('CREATE TABLE client_settings(id integer PRIMARY KEY,encrypted_mt5_password text)');
 const before=process.env.SESSION_SECRET;const secret='synthetic-legacy-secret-compatibility-v1';process.env.SESSION_SECRET=secret;
 const dir=await mkdtemp(join(tmpdir(),'ea-pg-crypto-'));
 try{
  const file=join(dir,'crypto.mjs');await build({entryPoints:['artifacts/api-server/src/lib/mt5-crypto.ts'],bundle:true,platform:'node',format:'esm',outfile:file,logLevel:'silent'});
  const module=await import(pathToFileURL(file));
  const iv=Buffer.from('000102030405060708090a0b','hex');const cipher=createCipheriv('aes-256-gcm',scryptSync(secret,'ea-cloud-mt5pass-salt-v1',32),iv);
  const payload=Buffer.concat([cipher.update('legacy-fixture-password','utf8'),cipher.final()]);
  const legacy=iv.toString('hex')+':'+cipher.getAuthTag().toString('hex')+':'+payload.toString('hex');
  await db.query('INSERT INTO client_settings VALUES(1,$1),(2,$2)',[legacy,module.encryptMT5Password('new-fixture-password')]);
  const original=(await db.query('SELECT * FROM client_settings ORDER BY id')).rows;
  const valid=await auditEncryptedRecords(connection(),module.decryptMT5Password);assert.equal(valid.compatibility_verified,true);assert.equal(valid.decrypted_records,2);
  // Independent reader/module simulates process restart with unchanged secret.
  const restarted=await import(pathToFileURL(file).href+'?restart');assert.equal((await auditEncryptedRecords(connection(),restarted.decryptMT5Password)).decrypted_records,2);
  const child=spawnSync(process.execPath,['--input-type=module','-e',`import pg from ${JSON.stringify(new URL('../../lib/db/node_modules/pg/lib/index.js',import.meta.url).href)};const crypto=await import(process.env.EA_CRYPTO_MODULE);const db=new pg.Client({connectionString:process.env.EA_CRYPTO_URL});await db.connect();const rows=(await db.query('SELECT encrypted_mt5_password FROM client_settings ORDER BY id')).rows;let n=0;for(const row of rows){if(crypto.decryptMT5Password(row.encrypted_mt5_password).endsWith('fixture-password'))n++;}await db.end();console.log(JSON.stringify({decrypted:n}));`],{env:{...process.env,SESSION_SECRET:secret,EA_CRYPTO_MODULE:pathToFileURL(file).href,EA_CRYPTO_URL:binding.href},encoding:'utf8'});
  assert.equal(child.status,0);assert.equal(JSON.parse(child.stdout).decrypted,2);

  process.env.SESSION_SECRET='different-synthetic-key-for-negative-test';const wrong=await import(pathToFileURL(file).href+'?wrong');assert.equal((await auditEncryptedRecords(connection(),wrong.decryptMT5Password)).failed_records,2);
  delete process.env.SESSION_SECRET;const absent=await import(pathToFileURL(file).href+'?absent');assert.equal((await auditEncryptedRecords(connection(),absent.decryptMT5Password)).failed_records,2);
  assert.deepEqual((await db.query('SELECT * FROM client_settings ORDER BY id')).rows,original);
  const damaged=legacy.split(':');damaged[1]=(damaged[1][0]==='a'?'b':'a')+damaged[1].slice(1);await db.query('UPDATE client_settings SET encrypted_mt5_password=$1 WHERE id=1',[damaged.join(':')]);
  const damagedBefore=(await db.query('SELECT * FROM client_settings ORDER BY id')).rows;assert.equal((await auditEncryptedRecords(connection(),module.decryptMT5Password)).failed_records,1);assert.deepEqual((await db.query('SELECT * FROM client_settings ORDER BY id')).rows,damagedBefore);
  let serverRestartVerified=false;
  if(process.env.EA_TEST_PG_RESTART==='1'){
   await db.end();const restartedServer=spawnSync('systemctl',['restart','ea-pg-validation'],{encoding:'utf8'});assert.equal(restartedServer.status,0);
   let recovered;
   for(let attempt=0;attempt<40;attempt++){
    const candidate=connection();candidate.on('error',()=>{});
    try{await candidate.connect();assert.equal((await candidate.query('SHOW data_directory')).rows[0].data_directory,'/var/lib/ea-cloud/validation/pg-test/data');recovered=candidate;break;}catch{await candidate.end().catch(()=>{});await new Promise(r=>setTimeout(r,100));}
   }
   assert.ok(recovered);assert.deepEqual((await recovered.query('SELECT * FROM client_settings ORDER BY id')).rows,damagedBefore);await recovered.end();serverRestartVerified=true;
  }
  const report={server_restart_preserves_ciphertext:serverRestartVerified,fresh_node_process_decrypts:true,engine:'isolated PostgreSQL 16',legacy_format_compatible:true,same_secret_restart_compatible:true,wrong_key_rejected:true,missing_key_rejected:true,tamper_rejected:true,audit_transactions_readonly:true,audit_rows_unchanged:true,production_binding_verified:false,production_records_accessed:0};
  if(process.env.EA_CRYPTO_REPORT)await writeFile(process.env.EA_CRYPTO_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await db.end();await rm(dir,{recursive:true,force:true});if(before===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=before;}
});
test('encryption audit refuses a non-readonly transaction before reading encrypted records',async()=>{
 const queries=[];let ended=false;
 const client={connect:async()=>{},query:async sql=>{queries.push(sql);if(sql.includes("current_setting"))return {rows:[{mode:'off'}]};return {rows:[]};},end:async()=>{ended=true;}};
 await assert.rejects(()=>auditEncryptedRecords(client,()=>{throw Error('Decrypt must not run');}),/READ_ONLY_REQUIRED/);
 assert.ok(queries.some(q=>q.startsWith('BEGIN TRANSACTION')&&q.includes('READ ONLY')));assert.ok(queries.includes('ROLLBACK'));assert.equal(ended,true);assert.ok(!queries.some(q=>q.includes('encrypted_mt5_password')));
});
