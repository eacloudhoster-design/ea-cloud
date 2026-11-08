import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';import {sessionFixture} from './helpers/browser-session-fixture.mjs';import {appRequest} from './helpers/in-process-http.mjs';
test('same-service non-trading profile preserves real cookie auth, enforces origin auth and prevents all execution transports and queue wakes',async()=>{
 process.env.NODE_ENV='production';process.env.EA_RELEASE_MODE='nontrading';process.env.EA_MT5_MANAGEMENT_ONLY='1';process.env.EA_APPLICATION_ORIGIN_TOKEN='x'.repeat(64);
 const f=await sessionFixture(),dir=await mkdtemp(join(tmpdir(),'ea-nontrading-'));const oldFetch=globalThis.fetch;
 try{
  const schema=globalThis.__sessionSchema;
  await build({stdin:{contents:`export {createNonTradingApp} from './artifacts/api-server/src/nontrading-app';export * from './artifacts/api-server/src/lib/mt5-vps';export {observerCapabilities,syncObserverPosition} from './artifacts/api-server/src/lib/observer-vps';export {startWorker,wakeWorker,signalWorkerHealthy} from './artifacts/api-server/src/lib/signal-worker';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'runtime.mjs'),logLevel:'silent',banner:{js:'import {createRequire} from "node:module";const require=createRequire(import.meta.url);'},plugins:[{name:'isolated',setup(b){b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const db=globalThis.__sessionDb;export const pool=globalThis.__sessionPool;${Object.keys(schema).filter(k=>k.endsWith('Table')).map(k=>`export const ${k}=globalThis.__sessionSchema.${k};`).join('')}`}));}}]});
  const api=await import(pathToFileURL(join(dir,'runtime.mjs')));let ready=false;const app=api.createNonTradingApp(f.app,async()=>{if(!ready)throw Error('private details');});
  const request=(path,init={})=>appRequest(app,'https://fixture.invalid/api'+path,init),headers={'x-ea-cloud-origin-token':process.env.EA_APPLICATION_ORIGIN_TOKEN,'Content-Type':'application/json'};
  assert.equal((await request('/healthz')).status,200);assert.equal((await request('/auth/me')).status,401);assert.equal((await request('/auth/me',{headers})).status,401);
  assert.equal((await request('/readyz',{headers})).status,503);ready=true;assert.equal((await request('/readyz',{headers})).status,200);
  const login=await request('/auth/login',{method:'POST',headers,body:JSON.stringify({email:'mentor1@example.invalid',password:'Test-only-pass-123!'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/test/admin',{headers:{...headers,cookie}})).status,200);
  assert.equal((await request('/test/admin',{headers:{...headers,cookie,Authorization:'Bearer forged'}})).status,200);
  assert.equal((await request('/test/admin',{headers:{...headers,Authorization:'Bearer forged'}})).status,401);
  for(const path of ['/signals/webhook','/robots/events','/admin/ea-builder/robots/id/enable-copy']){const r=await request(path,{method:'POST',headers:{...headers,cookie},body:'{}'});assert.equal(r.status,403);assert.equal((await r.json()).code,'FINANCIAL_EXECUTION_DISABLED');}
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No network submission permitted');};const log={warn(){}};
  for(const send of [api.executeTradeOnVps,api.closeTradeOnVps,api.modifyTradeOnVps]){const r=await send({login:1,password:'private',server:'demo'},log);assert.equal(r.ok,false);assert.equal(r.retriable,false);assert.equal(r.attempts,0);}
  assert.equal((await api.syncObserverPosition({})).ok,false);await assert.rejects(api.observerCapabilities());assert.throws(()=>api.startWorker(log));api.wakeWorker(log);assert.equal(api.signalWorkerHealthy(),false);assert.equal(calls,0);
 }finally{globalThis.fetch=oldFetch;await f.engine.close();await rm(dir,{recursive:true,force:true});delete process.env.EA_RELEASE_MODE;delete process.env.EA_MT5_MANAGEMENT_ONLY;delete process.env.EA_APPLICATION_ORIGIN_TOKEN;}
});
