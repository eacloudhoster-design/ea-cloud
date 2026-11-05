import {test} from 'node:test';import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import pg from '../../lib/db/node_modules/pg/lib/index.js';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
test('real PostgreSQL advisory locks enforce exclusive account claims and persistent immutable mappings',{timeout:30000},async()=>{
 const socket='/var/lib/ea-cloud/validation/pg-test/socket',name='ea_validation_'+randomBytes(6).toString('hex'),dir=await mkdtemp(join(tmpdir(),'ea-engine-pg-'));
 const admin=new pg.Client({host:socket,user:'ea_db_test',database:'postgres'});let pool;
 try{
  await admin.connect();const location=await admin.query('SHOW data_directory');assert.equal(location.rows[0].data_directory,'/var/lib/ea-cloud/validation/pg-test/data');
  await admin.query(`CREATE DATABASE "${name}"`);pool=new pg.Pool({host:socket,user:'ea_db_test',database:name,max:4});
  await build({entryPoints:['lib/db/src/schema/index.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'schema.mjs'),logLevel:'silent'});
  const schema=await import(pathToFileURL(join(dir,'schema.mjs'))),{drizzle}=await import('../../lib/db/node_modules/drizzle-orm/node-postgres/index.js');
  const {getTableConfig}=await import('../../lib/db/node_modules/drizzle-orm/pg-core/index.js');
  for(const table of [schema.clientSettingsTable,schema.observerAllocationsTable]){
   const c=getTableConfig(table);await pool.query(`CREATE TABLE "${c.name}" (${c.columns.map(x=>`"${x.name}" ${x.getSQLType()}${x.primary?' PRIMARY KEY':''}`).join(',')})`);
  }
  await pool.query('CREATE UNIQUE INDEX fixture_client_unique ON client_settings(client_id)');
  globalThis.__enginePgDb=drizzle(pool);globalThis.__enginePgSchema=schema;
  await build({entryPoints:['artifacts/api-server/src/lib/bind-client-account.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'bind.mjs'),logLevel:'silent',plugins:[{name:'synthetic-postgres',setup(b){b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const db=globalThis.__enginePgDb;export const clientSettingsTable=globalThis.__enginePgSchema.clientSettingsTable;export const observerAllocationsTable=globalThis.__enginePgSchema.observerAllocationsTable;'}));}}]});
  const {bindClientAccount}=await import(pathToFileURL(join(dir,'bind.mjs'))),account={login:'991',server:'SyntheticDemo',broker:'justmarkets'};
  const results=await Promise.allSettled([bindClientAccount(1,account,'synthetic-ciphertext'),bindClientAccount(2,account,'synthetic-ciphertext')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.message==='ACCOUNT_ALREADY_BOUND').length,1);
  let rows=(await pool.query('SELECT client_id,mt5_login,copying_enabled FROM client_settings')).rows;assert.equal(rows.length,1);assert.equal(rows[0].copying_enabled,false);const owner=rows[0].client_id;
  await pool.query("INSERT INTO observer_allocations(id,client_id) VALUES('fixture',$1)",[owner]);
  await assert.rejects(bindClientAccount(owner,{...account,login:'992'},'synthetic'),/ACCOUNT_REBIND_REQUIRES_RECONCILIATION/);
  const old=pool;await old.end();pool=new pg.Pool({host:socket,user:'ea_db_test',database:name,max:2});
  rows=(await pool.query('SELECT mt5_login FROM client_settings')).rows;assert.equal(rows[0].mt5_login,'991');
  console.log(JSON.stringify({validation:'disposable PostgreSQL account binding',concurrent_claims:2,exclusive_owner:1,failed_rebinding_preserved_original:true,fresh_pool_persistence:true,production_records_modified:0}));
 }finally{await pool?.end();await admin.end();await rm(dir,{recursive:true,force:true});delete globalThis.__enginePgDb;delete globalThis.__enginePgSchema;}
});
