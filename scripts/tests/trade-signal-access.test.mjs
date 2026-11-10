import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
import express from '../../artifacts/api-server/node_modules/express/index.js';
import {sessionFixture} from './helpers/browser-session-fixture.mjs';
import {appRequest} from './helpers/in-process-http.mjs';

test('follower signal feed uses session mentor, rejects overrides and omits private ingestion/queue data',async()=>{
 process.env.SESSION_SECRET=randomBytes(32).toString('hex');
 const f=await sessionFixture(),dir=await mkdtemp(join(tmpdir(),'ea-signal-access-'));
 const oldFetch=globalThis.fetch;
 try{
  const schema=globalThis.__sessionSchema;
  const {getTableConfig}=await import('../../lib/db/node_modules/drizzle-orm/pg-core/index.js');
  for(const table of [schema.tradeSignalsTable,schema.robotBuildsTable]){
  const c=getTableConfig(table);
  await f.engine.exec(`CREATE TABLE "${c.name}" (${c.columns.map(x=>`"${x.name}" ${x.getSQLType()}${x.primary?' PRIMARY KEY':''}`).join(',')})`);
  }
  const {drizzle}=await import('../../lib/db/node_modules/drizzle-orm/node-postgres/index.js');
  const query=async(c,p)=>{const r=await f.engine.query(typeof c==='string'?c:c.text,p,{rowMode:c.rowMode==='array'?'array':'object'});return {rows:r.rows,fields:r.fields};};
  globalThis.__sessionDb=drizzle(f.engine.pool??{query,connect:async()=>({query,release(){}})});
  await f.engine.query(`INSERT INTO trade_signals(mentor_id,signal,symbol,order_type,raw_payload,last_error,created_at) VALUES(1,'SYNC','OWN_ONLY','BUY',$1,$2,now()),(2,'SYNC','FOREIGN_ONLY','BUY','{}',NULL,now())`,['{"password":"private-ingestion-fixture"}','private-queue-fixture']);
  await build({stdin:{contents:`export {default} from './artifacts/api-server/src/routes/trade-signals';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'route.mjs'),logLevel:'silent',banner:{js:'import {createRequire} from "node:module";const require=createRequire(import.meta.url);'},plugins:[{name:'fixture',setup(b){
   b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const db=globalThis.__sessionDb;export const pool=globalThis.__sessionPool;${Object.keys(schema).filter(k=>k.endsWith('Table')).map(k=>`export const ${k}=globalThis.__sessionSchema.${k};`).join('')}`}));
   b.onResolve({filter:/^\.\.\/ws$/},()=>({path:'ws',namespace:'broadcast'}));
   b.onLoad({filter:/.*/,namespace:'broadcast'},()=>({contents:`export function broadcastToMentorClients(mentorId,payload){globalThis.__followerBroadcast={mentorId,payload}}`}));
   b.onResolve({filter:/logger$/},()=>({path:'logger',namespace:'quiet'}));
   b.onLoad({filter:/.*/,namespace:'quiet'},()=>({contents:`export const logger={info(){},warn(){},error(){}}`}));
   b.onResolve({filter:/signal-worker$/},()=>({path:'worker',namespace:'blocked'}));
   b.onLoad({filter:/.*/,namespace:'blocked'},()=>({contents:`export function wakeWorker(){globalThis.__signalWakeCount=(globalThis.__signalWakeCount??0)+1}`}));
  }}]});
  const {default:route}=await import(pathToFileURL(join(dir,'route.mjs')));
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.log={info(){},error(){},warn(){}};next()});
  app.use('/api',f.api.browserSessionMiddleware);
  // Reproduce the production /app entitlement middleware, not just an unguarded router.
  app.use('/api/app',f.api.requireAppSession);app.use('/api',route);
  const request=(path,headers={})=>appRequest(app,'https://fixture.invalid/api'+path,{headers});
  const login=async(path,email)=>{
   const response=await appRequest(f.app,'https://fixture.invalid/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Test-only-pass-123!'})});
   assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];
  };
  const cookie=await login('/app/login','client@example.invalid');
  const mentor=await login('/auth/login','mentor1@example.invalid');
  globalThis.fetch=()=>{throw Error('No worker or external requests permitted')};
  assert.equal((await request('/app/signals?mentorId=2',{cookie})).status,403,'foreign mentor must be forbidden');
  assert.equal((await request('/app/signals?mentorId=999999',{cookie})).status,403,'do not reveal mentor existence');
  for(const path of ['/app/signals','/app/signals?mentorId=1']){
   const response=await request(path,{cookie});assert.equal(response.status,200);
   const rows=await response.json();assert.deepEqual(rows.map(r=>r.symbol),['OWN_ONLY']);
   assert.ok(!JSON.stringify(rows).includes('private-ingestion-fixture'));
   assert.ok(!JSON.stringify(rows).includes('private-queue-fixture'));
   assert.equal('rawPayload' in rows[0],false);assert.equal('lastError' in rows[0],false);
  }
  for(const query of ['mentorId=1junk','mentorId=','mentorId=1&mentorId=2','mentorId=2147483648'])assert.equal((await request('/app/signals?'+query,{cookie})).status,422);
  assert.equal((await request('/app/signals?mentorId=1')).status,401);
  assert.equal((await request('/app/signals?mentorId=1',{authorization:'Bearer '+Buffer.from('10:client').toString('base64')})).status,401);
  assert.equal((await request('/app/signals?mentorId=1',{cookie:mentor})).status,401);
  // Exercise the actual authenticated ingestion/notification path, with only the
  // broadcaster and scheduler sinks captured: no worker or network is activated.
  const key='fixture-'+randomBytes(24).toString('hex');
  await f.engine.query('UPDATE users SET api_key=$1 WHERE id=1',[createHash('sha256').update(key).digest('hex')]);
  const webhook=await appRequest(app,'https://fixture.invalid/api/signals/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':key},body:JSON.stringify({signal:'OPEN',symbol:'OWN_WEBHOOK',orderType:'BUY',password:'private-webhook-fixture'})});
  assert.equal(webhook.status,201);
  assert.equal(globalThis.__followerBroadcast.mentorId,1);
  assert.equal(globalThis.__followerBroadcast.payload.signal.symbol,'OWN_WEBHOOK');
  assert.equal('rawPayload' in globalThis.__followerBroadcast.payload.signal,false);
  assert.equal('lastError' in globalThis.__followerBroadcast.payload.signal,false);
  assert.ok(!JSON.stringify(globalThis.__followerBroadcast).includes('private-webhook-fixture'));
  assert.equal(globalThis.__signalWakeCount,1);
  assert.ok((await f.engine.query("SELECT raw_payload FROM trade_signals WHERE symbol='OWN_WEBHOOK'")).rows[0].raw_payload.includes('private-webhook-fixture'),'private ingress remains stored for backend processing');
  await f.engine.exec("UPDATE licenses SET status='revoked' WHERE key='ACTIVE'");
  assert.equal((await request('/app/signals?mentorId=1',{cookie})).status,401);
 }finally{globalThis.fetch=oldFetch;delete globalThis.__followerBroadcast;delete globalThis.__signalWakeCount;await f.engine.close();await rm(dir,{recursive:true,force:true});}
});
