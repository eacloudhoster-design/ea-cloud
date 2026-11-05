import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
import express from '../../artifacts/api-server/node_modules/express/index.js';
import {sessionFixture} from './helpers/browser-session-fixture.mjs';
import {appRequest} from './helpers/in-process-http.mjs';
test('real browser sessions, owned engine status, strict broker proof and account binding', {timeout:120000},async()=>{
 const oldFetch=globalThis.fetch;process.env.SESSION_SECRET=randomBytes(32).toString('hex');process.env.MT5_VPS_TOKEN=randomBytes(32).toString('hex');process.env.MT5_VPS_URL='http://127.0.0.1:8999';
 const f=await sessionFixture(),dir=await mkdtemp(join(tmpdir(),'ea-engine-api-'));
 try{
  const schema=globalThis.__sessionSchema;
  const {getTableConfig}=await import('../../lib/db/node_modules/drizzle-orm/pg-core/index.js');
  for(const key of ['clientSettingsTable','tradeExecutionsTable','observerAllocationsTable','clientSymbolConfigsTable','symbolPairsTable']){
   const c=getTableConfig(schema[key]);await f.engine.exec(`CREATE TABLE "${c.name}" (${c.columns.map(x=>`"${x.name}" ${x.getSQLType()}${x.primary?' PRIMARY KEY':''}`).join(',')})`);
  }
  // PGlite has no concurrent transaction clients. This shim exercises sequential binding only;
  // cross-process advisory locking is separately accepted against real PostgreSQL.
  await f.engine.exec("CREATE FUNCTION pg_advisory_xact_lock(integer) RETURNS void LANGUAGE SQL AS 'SELECT NULL::void'");
  const {drizzle}=await import('../../lib/db/node_modules/drizzle-orm/node-postgres/index.js');
  const query=async(c,p)=>{const r=await f.engine.query(typeof c==='string'?c:c.text,p,{rowMode:c.rowMode==='array'?'array':'object'});return {rows:r.rows,fields:r.fields};};
  globalThis.__sessionDb=drizzle({query,connect:async()=>({query,release(){}})});
  await build({stdin:{contents:`export {createReadOnlyEngineApp} from './artifacts/api-server/src/engine-readonly-app';export {default as router} from './artifacts/api-server/src/routes/engine';export {default as settings} from './artifacts/api-server/src/routes/client-settings';export {readBoundAccount} from './artifacts/api-server/src/lib/mt5-account-status';export {encryptMT5Password} from './artifacts/api-server/src/lib/mt5-crypto';export {bindClientAccount} from './artifacts/api-server/src/lib/bind-client-account';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'api.mjs'),logLevel:'silent',banner:{js:'import {createRequire} from "node:module";const require=createRequire(import.meta.url);'},plugins:[{name:'isolated',setup(b){b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const db=globalThis.__sessionDb;export const pool=globalThis.__sessionPool;${Object.keys(schema).filter(k=>k.endsWith('Table')).map(k=>`export const ${k}=globalThis.__sessionSchema.${k};`).join('')}`}));b.onResolve({filter:/\/web-push$/},()=>({path:'push',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const queueBotPush=async()=>{};export const queueSymbolPush=async()=>{};'}));}}]});
  const api=await import(pathToFileURL(join(dir,'api.mjs'))),app=express();app.use(express.json());app.use((q,s,n)=>{q.log={info(){},warn(){},error(){}};n();});app.use('/api',f.api.browserSessionMiddleware,api.router,api.settings);
  const request=(path,init={})=>appRequest(app,'https://fixture.invalid/api'+path,init);
  assert.equal((await request('/app/engine/status',{headers:{Authorization:'Bearer '+Buffer.from('10:client').toString('base64')}})).status,401);
  const login=async(path,body)=>{const r=await appRequest(f.app,'https://fixture.invalid/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const clientCookie=await login('/app/login',{email:'client@example.invalid',password:'Test-only-pass-123!'});
  const mentorCookie=await login('/auth/login',{email:'mentor1@example.invalid',password:'Test-only-pass-123!'});
  let result=await request('/app/engine/status',{headers:{cookie:clientCookie}});assert.equal(result.status,200);assert.equal((await result.json()).connection.code,'ACCOUNT_NOT_CONFIGURED');
  const ack={success:true,connected:true,simulation:false,account_mode:'demo',broker:'justmarkets',role:'client',login:91,server:'FixtureDemo',execution_enabled:false,emergency_stop_active:true,journal_bound:true,journal_holds:0,open_positions:0,pending_orders:0,currency:'ZAR',balance:1000,equity:1000,password:'upstream-secret'};
  let calls=0,response=ack;globalThis.fetch=async(url,options)=>{calls++;assert.equal(new URL(url).pathname,'/observer/account-status');assert.equal(JSON.parse(options.body).password,'fixture-broker-password');return new Response(JSON.stringify(response),{status:200});};
  for(const change of [{},{success:false},{login:92},{simulation:true},{account_mode:'live'},{execution_enabled:true,emergency_stop_active:true},{execution_enabled:true,emergency_stop_active:false,role:'mentor'},{execution_enabled:true,emergency_stop_active:false,journal_holds:1},null]){
   response=change===null?null:{...ack,...change};if(change && !Object.keys(change).length){assert.ok(await api.readBoundAccount('91','FixtureDemo','fixture-broker-password'));continue;}
   await assert.rejects(api.readBoundAccount('91','FixtureDemo','fixture-broker-password'));
  }
  response=ack;
  await f.engine.exec("INSERT INTO client_settings(client_id,copying_enabled) VALUES(10,true)");
  const connect=()=>request('/app/mt5-connect',{method:'POST',headers:{cookie:clientCookie,'Content-Type':'application/json'},body:JSON.stringify({login:'91',server:'FixtureDemo',password:'fixture-broker-password'})});
  result=await connect();assert.equal(result.status,200);assert.equal((await result.json()).connected,true);
  const stored=(await f.engine.query('SELECT * FROM client_settings WHERE client_id=10')).rows[0];assert.notEqual(stored.encrypted_mt5_password,'fixture-broker-password');assert.equal(stored.copying_enabled,false);
  result=await request('/app/engine/status',{headers:{cookie:clientCookie}});let state=await result.json();assert.equal(state.connection.verified,true);assert.equal(state.copier.executionPermitted,false);assert.equal(state.copier.emergencyStopActive,true);assert.ok(!JSON.stringify(state).includes('upstream-secret'));assert.ok(!JSON.stringify(state).includes(stored.encrypted_mt5_password));
  await f.engine.exec("INSERT INTO app_access(id,email,first_name,last_name,status,mentor_id) VALUES(12,'other@example.invalid','Other','Client','approved',2)");
  await f.engine.exec("UPDATE client_settings SET copying_enabled=true WHERE client_id=10");response={...ack,journal_holds:1};
  result=await request('/app/engine/status',{headers:{cookie:clientCookie}});state=await result.json();assert.equal(state.copier.state,'review_required');assert.equal(state.copier.unresolvedJournalHolds,1);assert.equal(state.copier.executionPermitted,false);response=ack;
  await f.engine.exec("INSERT INTO observer_allocations(id,client_id,source_key,mentor_id,symbol,scale) VALUES('other-mentor',10,'other',2,'PRIVATE_SYMBOL','1')");
  response={...ack,execution_enabled:true,emergency_stop_active:true};result=await request('/app/engine/status',{headers:{cookie:clientCookie}});state=await result.json();assert.equal(state.connection.verified,false);assert.equal(state.copier.executionPermitted,false);
  response={...ack,execution_enabled:true,emergency_stop_active:false};await f.engine.exec("UPDATE client_settings SET mt5_connected=false WHERE client_id=10");result=await request('/app/engine/status',{headers:{cookie:clientCookie}});state=await result.json();assert.equal(state.copier.state,'blocked');assert.equal(state.copier.executionPermitted,false);
  await f.engine.exec("UPDATE client_settings SET mt5_connected=true WHERE client_id=10");response=ack;
  const before=calls;assert.equal((await request('/admin/engine/clients/12',{headers:{cookie:mentorCookie}})).status,404);
  const own=await request('/admin/engine/clients/10',{headers:{cookie:mentorCookie}});assert.equal(own.status,200);assert.equal((await own.json()).mappings.length,0,'A mentor cannot see prior mentors allocations for a reassigned client');assert.equal(calls,before+1,'Only the owned client may trigger a backend read-only proof; no credential is returned');
  assert.equal((await request('/admin/engine/clients',{headers:{cookie:clientCookie}})).status,401);
  await assert.rejects(api.bindClientAccount(12,{login:'91',server:'FixtureDemo',broker:'justmarkets'},'fixture'),/ACCOUNT_ALREADY_BOUND/);
  await f.engine.exec("INSERT INTO observer_allocations(id,client_id,source_key,mentor_id,symbol,scale) VALUES('alloc',10,'fixture',1,'XAUUSD.fixture','1')");
  await assert.rejects(api.bindClientAccount(10,{login:'92',server:'FixtureDemo',broker:'justmarkets'},'fixture'),/ACCOUNT_REBIND_REQUIRES_RECONCILIATION/);
  // Explicit status-only relay proves connection but cannot assert journal or execution readiness.
  response={...ack,read_only:true,protocol:'EA_READ_ONLY_STATUS_V1',financial_routes:false,journal_bound:false,journal_holds:null,emergency_stop_active:null,execution_enabled:false};
  result=await request('/app/engine/status',{headers:{cookie:clientCookie}});state=await result.json();assert.equal(state.connection.code,'VERIFIED_DEMO_READ_ONLY');assert.equal(state.copier.state,'read_only');assert.equal(state.copier.executionPermitted,false);assert.equal(state.copier.unresolvedJournalHolds,null);
  for(const bad of [{execution_enabled:true},{journal_bound:true},{journal_holds:0},{financial_routes:true},{protocol:'other'}]){const before=response;response={...response,...bad};await assert.rejects(api.readBoundAccount('91','FixtureDemo','fixture-broker-password'));response=before;}
  response=ack;
  // Read-only canary consumes existing cookies without refresh/revocation writes.
  await f.engine.exec("UPDATE browser_sessions SET last_seen_at=now()-interval '2 days'");
  const sessionsBefore=(await f.engine.query('SELECT * FROM browser_sessions ORDER BY token_hash')).rows;
  const oldQuery=globalThis.__sessionPool.query,mutations=[];
  globalThis.__sessionPool.query=(sql,...args)=>{const text=typeof sql==='string'?sql:sql.text;if(!/^\s*(SELECT|SHOW)\b/i.test(text))mutations.push(text.split(' ')[0]);return oldQuery(sql,...args);};
  let canary=api.createReadOnlyEngineApp();
  const check=async(path,init={})=>appRequest(canary,'https://fixture.invalid/api'+path,init);
  result=await check('/app/engine/status',{headers:{cookie:clientCookie}});assert.equal(result.status,200);assert.equal((await result.json()).connection.verified,true);
  assert.deepEqual((await f.engine.query('SELECT * FROM browser_sessions ORDER BY token_hash')).rows,sessionsBefore);
  const callsBeforeMutation=calls;
  assert.equal((await check('/app/mt5-connect',{method:'POST',headers:{cookie:clientCookie},body:'{}'})).status,405);assert.equal(calls,callsBeforeMutation);
  assert.equal((await check('/app/trading-controls',{headers:{cookie:clientCookie}})).status,404);
  canary=api.createReadOnlyEngineApp();assert.equal((await check('/app/engine/status',{headers:{cookie:clientCookie}})).status,200,'Canary restart retains existing cookie without jobs or renewal');
  await f.engine.exec("UPDATE browser_sessions SET credential_hash='invalid-fixture' WHERE kind='portal'");
  const invalidBefore=(await f.engine.query("SELECT count(*)::int AS n FROM browser_sessions WHERE kind='portal'")).rows[0].n;
  assert.equal((await check('/admin/engine/clients',{headers:{cookie:mentorCookie}})).status,401);
  assert.equal((await f.engine.query("SELECT count(*)::int AS n FROM browser_sessions WHERE kind='portal'")).rows[0].n,invalidBefore);
  assert.deepEqual(mutations,[],'Canary session verification must never refresh or revoke rows');globalThis.__sessionPool.query=oldQuery;
  result=await request('/app/mt5-disconnect',{method:'POST',headers:{cookie:clientCookie,'Content-Type':'application/json'},body:'{}'});assert.equal(result.status,200);
  const after=(await f.engine.query('SELECT * FROM client_settings WHERE client_id=10')).rows[0];assert.equal(after.mt5_connected,false);assert.equal(after.encrypted_mt5_password,stored.encrypted_mt5_password);assert.equal(after.mt5_login,'91');
 }finally{globalThis.fetch=oldFetch;await f.engine.close();await rm(dir,{recursive:true,force:true});}
});
