import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
import {postgresFixture} from './helpers/postgres-fixture.mjs';
test('real PostgreSQL locks isolate concurrent client, mentor and pending account reservations',{skip:!process.env.EA_TEST_PG_URL,timeout:30000},async()=>{
 const engine=await postgresFixture(),dir=await mkdtemp(join(tmpdir(),'ea-ownership-pg-'));
 try{
  await build({entryPoints:['lib/db/src/schema/index.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'schema.mjs'),logLevel:'silent'});
  const schema=await import(pathToFileURL(join(dir,'schema.mjs'))),{drizzle}=await import('../../lib/db/node_modules/drizzle-orm/node-postgres/index.js');
  const {getTableConfig}=await import('../../lib/db/node_modules/drizzle-orm/pg-core/index.js');
  for(const table of [schema.usersTable,schema.clientSettingsTable,schema.observerAllocationsTable,schema.appAccessTable,schema.mt5ConnectionsTable]){const c=getTableConfig(table);await engine.exec(`CREATE TABLE "${c.name}" (${c.columns.map(x=>`"${x.name}" ${x.getSQLType()}${x.primary?' PRIMARY KEY':''}`).join(',')})`);}
  await engine.exec(await readFile('migrations/20261108_mt5_enrollment_requests.sql','utf8'));
  await engine.query("INSERT INTO users(id,status,role) VALUES(10,'approved','mentor'),(20,'approved','mentor')");
  await engine.query("INSERT INTO app_access(id,status,mentor_id) VALUES(1,'approved',10),(2,'approved',20),(3,'approved',10),(4,'approved',20)");
  await engine.exec('CREATE UNIQUE INDEX fixture_client_unique ON client_settings(client_id)');
  globalThis.__enginePgDb=drizzle(engine.pool);globalThis.__enginePgSchema=schema;
  await build({stdin:{contents:`export {bindClientAccount} from './artifacts/api-server/src/lib/bind-client-account';export {assertAccountOwnership} from './artifacts/api-server/src/lib/account-ownership';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'bind.mjs'),logLevel:'silent',plugins:[{name:'synthetic-postgres',setup(b){b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const db=globalThis.__enginePgDb;${Object.keys(schema).filter(k=>k.endsWith('Table')).map(k=>`export const ${k}=globalThis.__enginePgSchema.${k};`).join('')}`}));}}]});
  const api=await import(pathToFileURL(join(dir,'bind.mjs'))),account={login:'991',server:'SyntheticDemo',broker:'justmarkets'};
  await assert.rejects(api.bindClientAccount(99,account,'fixture'),/ACCOUNT_OWNER_UNAVAILABLE/);
  const results=await Promise.allSettled([api.bindClientAccount(1,account,'fixture'),api.bindClientAccount(2,account,'fixture')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.message==='ACCOUNT_ALREADY_BOUND').length,1);
  const owner=(await engine.query('SELECT client_id FROM client_settings')).rows[0].client_id;
  await engine.query("INSERT INTO observer_allocations(id,client_id) VALUES('fixture',$1)",[owner]);
  await assert.rejects(api.bindClientAccount(owner,{...account,login:'992'},'fixture'),/ACCOUNT_REBIND_REQUIRES_RECONCILIATION/);
  const raceAccount={...account,login:'993'};
  const roleRace=await Promise.allSettled([api.bindClientAccount(3,raceAccount,'fixture'),globalThis.__enginePgDb.transaction(async tx=>{
   await api.assertAccountOwnership(tx,{kind:'mentor',id:30,mentorId:30},raceAccount.login,raceAccount.server,raceAccount.broker);
   const {sql}=await import('../../lib/db/node_modules/drizzle-orm/index.js');await tx.execute(sql`INSERT INTO mt5_connections(mentor_id,mt5_login,mt5_server,status) VALUES(30,993,'SyntheticDemo','disconnected')`);
  })]);assert.equal(roleRace.filter(r=>r.status==='fulfilled').length,1);assert.equal(roleRace.filter(r=>r.status==='rejected'&&r.reason.message==='ACCOUNT_ALREADY_BOUND').length,1);
  await engine.query("INSERT INTO mt5_enrollment_requests(id,owner_kind,owner_id,mentor_id,login,server,broker,encrypted_password) VALUES('pending','mentor',40,40,'994','SyntheticDemo','justmarkets','fixture')");
  await assert.rejects(api.bindClientAccount(4,{...account,login:'994'},'fixture'),/ACCOUNT_ALREADY_BOUND/);
  await engine.query("INSERT INTO mt5_connections(mentor_id,mt5_login,mt5_server,status) VALUES(50,995,'SyntheticDemo','disconnected')");
  await assert.rejects(api.bindClientAccount(4,{...account,login:'995'},'fixture'),/ACCOUNT_ALREADY_BOUND/);
  assert.equal((await engine.query('SELECT mt5_login FROM client_settings WHERE client_id=$1',[owner])).rows[0].mt5_login,'991');
 }finally{await engine.close();await rm(dir,{recursive:true,force:true});delete globalThis.__enginePgDb;delete globalThis.__enginePgSchema;}
});
