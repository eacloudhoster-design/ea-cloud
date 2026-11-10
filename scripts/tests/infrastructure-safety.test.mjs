import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
let previousAssignments;
function assigned(login=1,server='demo',origin='http://127.0.0.1:8199'){
 process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS=JSON.stringify([{login,server,broker:'deriv',gatewayOrigin:origin}]);
}
function routerProof(){return {service:'ea-cloud-account-router-v1',assignments:JSON.parse(process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS).map(({gatewayOrigin,...row})=>({...row,role:'client'}))};}
beforeEach(()=>{previousAssignments=process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS;assigned();});
afterEach(()=>{if(previousAssignments===undefined)delete process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS;else process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS=previousAssignments;});
const log={warn(){},info(){},error(){}};
async function compiled(source,run){
 const directory=await mkdtemp(join(tmpdir(),'ea-infra-test-'));
 try{
  const output=join(directory,'module.mjs');
  await build({entryPoints:[source],bundle:true,platform:'node',format:'esm',outfile:output,logLevel:'silent'});
  await run(pathToFileURL(output).href);
 }finally{await rm(directory,{recursive:true,force:true});}
}
test('MT5 encryption refuses absent secrets; roundtrip, tamper and wrong-key behavior verified with disposable keys',async()=>{
 const before=process.env.SESSION_SECRET;
 try{
  await compiled('artifacts/api-server/src/lib/mt5-crypto.ts',async url=>{
   delete process.env.SESSION_SECRET;
   const absent=await import(url+'?absent');assert.throws(()=>absent.encryptMT5Password('fixture'),/SESSION_SECRET/);
   process.env.SESSION_SECRET=randomBytes(32).toString('hex');
   const valid=await import(url+'?valid');const encrypted=valid.encryptMT5Password('synthetic-broker-password');
   assert.equal(valid.decryptMT5Password(encrypted),'synthetic-broker-password');assert.ok(!encrypted.includes('synthetic'));
   const parts=encrypted.split(':');parts[1]=(parts[1][0]==='a'?'b':'a')+parts[1].slice(1);
   assert.throws(()=>valid.decryptMT5Password(parts.join(':')));
   process.env.SESSION_SECRET=randomBytes(32).toString('hex');
   const wrong=await import(url+'?wrong');assert.throws(()=>wrong.decryptMT5Password(encrypted));
  });
 }finally{if(before===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=before;}
});
test('ambiguous legacy order submission is never automatically replayed',async()=>{
 const original=globalThis.fetch;const before=process.env.MT5_VPS_TOKEN;process.env.MT5_VPS_TOKEN='a'.repeat(64);
 try{
  await compiled('artifacts/api-server/src/lib/mt5-vps.ts',async url=>{
   const module=await import(url);let count=0;
   globalThis.fetch=async()=>{count++;throw new Error('synthetic lost response');};
   const r=await module.executeTradeOnVps({login:1,password:'fixture',server:'simulation',symbol:'EURUSD',action:'BUY',volume:.1},log);
   assert.equal(count,1);assert.equal(r.ok,false);assert.equal(r.retriable,false);assert.equal(r.data.uncertain,true);
  });
 }finally{globalThis.fetch=original;if(before===undefined)delete process.env.MT5_VPS_TOKEN;else process.env.MT5_VPS_TOKEN=before;}
});
test('production observer client rejects simulation capabilities and results',async()=>{
 const original=globalThis.fetch;const names=['OBSERVER_MT5_VPS_URL','OBSERVER_MT5_VPS_TOKEN'];const before=names.map(n=>process.env[n]);
 process.env.OBSERVER_MT5_VPS_URL='http://127.0.0.1:8100';process.env.OBSERVER_MT5_VPS_TOKEN='b'.repeat(64);assigned(1,'simulation','http://127.0.0.1:8100');
 try{
  await compiled('artifacts/api-server/src/lib/observer-vps.ts',async url=>{
   const module=await import(url);
   globalThis.fetch=async()=>new Response(JSON.stringify({...routerProof(),version:2,persistentJournal:true,absoluteTargets:true,success:true,simulation:true}),{status:200});
   await assert.rejects(module.observerCapabilities());
   assert.equal((await module.syncObserverPosition({login:'1',password:'fixture',server:'simulation',sourceKey:'a'.repeat(64),revision:1,symbol:'EURUSD',target:.1,sl:0,tp:0,maxVolume:1,maxOpenTrades:10,maxDailyDrawdown:5})).ok,false);
   process.env.OBSERVER_MT5_VPS_URL='http://203.0.113.1:8100';await assert.rejects(module.observerCapabilities());
  });
 }finally{globalThis.fetch=original;names.forEach((n,i)=>{if(before[i]===undefined)delete process.env[n];else process.env[n]=before[i];});}
});
test('observer reconnect retries only the journaled absolute target and stops on uncertain submission',async()=>{
 const original=globalThis.fetch;
 const before={url:process.env.OBSERVER_MT5_VPS_URL,token:process.env.OBSERVER_MT5_VPS_TOKEN};
 process.env.OBSERVER_MT5_VPS_URL='http://127.0.0.1:8199';process.env.OBSERVER_MT5_VPS_TOKEN='a'.repeat(64);
 const input={login:'123',password:'fixture-only',server:'demo',sourceKey:'a'.repeat(64),revision:2,symbol:'EURUSD',target:.1,sl:0,tp:0,maxVolume:1,maxOpenTrades:10,maxDailyDrawdown:5};
 let calls=[];let mode='offline';assigned(123);
 try{
  globalThis.fetch=async(url,options)=>{
   if(options.method!=='POST')return new Response(JSON.stringify({...routerProof(),version:2,persistentJournal:true,absoluteTargets:true,simulation:false,account_mode:'demo',execution_enabled:true,emergency_stop_active:false,journal_holds:0}));
   calls.push(JSON.parse(options.body));
   const [status,data]=mode==='offline'?[503,{success:false,retriable:true,submission_started:false}]:mode==='uncertain'?[503,{success:false,retriable:false,uncertain:true}]:[200,{success:true,simulation:false,account_mode:"demo",data:{volume:.1}}];
   return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  };
  await compiled('artifacts/api-server/src/lib/observer-vps.ts',async url=>{
   const {syncObserverPosition}=await import(url);
   const offline=await syncObserverPosition(input);assert.equal(offline.ok,false);assert.equal(offline.retriable,true);assert.equal(calls.length,1);
   mode='online';const connected=await syncObserverPosition(input);assert.equal(connected.ok,true);assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
   mode='uncertain';const uncertain=await syncObserverPosition({...input,revision:3});assert.equal(uncertain.ok,false);assert.equal(uncertain.retriable,false);assert.equal(calls.length,3);
  });
 }finally{
  globalThis.fetch=original;
  for(const [key,value] of [['OBSERVER_MT5_VPS_URL',before.url],['OBSERVER_MT5_VPS_TOKEN',before.token]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});

test('observer requires positive demo markers and refuses credential redirects',async()=>{
 const original=globalThis.fetch;const previous={url:process.env.OBSERVER_MT5_VPS_URL,token:process.env.OBSERVER_MT5_VPS_TOKEN};
 process.env.OBSERVER_MT5_VPS_URL='http://127.0.0.1:8199';process.env.OBSERVER_MT5_VPS_TOKEN='a'.repeat(64);
 try{await compiled('artifacts/api-server/src/lib/observer-vps.ts',async url=>{
  const api=await import(url);const input={login:'1',password:'fixture',server:'demo',sourceKey:'a'.repeat(64),revision:1,symbol:'EURUSD',target:.1,sl:0,tp:0,maxVolume:1,maxOpenTrades:10,maxDailyDrawdown:5};
  for(const ack of [{success:true},{success:true,simulation:false,account_mode:'live'}]){
   globalThis.fetch=async(u,o)=>{assert.equal(o.redirect,'error');return new Response(JSON.stringify(o.method==='POST'?ack:{...routerProof(),version:2,persistentJournal:true,absoluteTargets:true,simulation:false,account_mode:'demo',execution_enabled:true,emergency_stop_active:false,journal_holds:0}),{status:200});};
   assert.equal((await api.syncObserverPosition(input)).ok,false);
  }
 });}finally{globalThis.fetch=original;if(previous.url===undefined)delete process.env.OBSERVER_MT5_VPS_URL;else process.env.OBSERVER_MT5_VPS_URL=previous.url;if(previous.token===undefined)delete process.env.OBSERVER_MT5_VPS_TOKEN;else process.env.OBSERVER_MT5_VPS_TOKEN=previous.token;}
});

test('observer capability requires an explicit execution-enabled receiver',async()=>{
 const old=globalThis.fetch;const before={url:process.env.OBSERVER_MT5_VPS_URL,token:process.env.OBSERVER_MT5_VPS_TOKEN};process.env.OBSERVER_MT5_VPS_URL='http://127.0.0.1:8199';process.env.OBSERVER_MT5_VPS_TOKEN='a'.repeat(64);
 try{await compiled('artifacts/api-server/src/lib/observer-vps.ts',async url=>{
  const {observerCapabilities}=await import(url);let ack={...routerProof(),version:2,persistentJournal:true,absoluteTargets:true,simulation:false,account_mode:'demo'};
  globalThis.fetch=async()=>new Response(JSON.stringify(ack));await assert.rejects(observerCapabilities());ack={...ack,execution_enabled:false};await assert.rejects(observerCapabilities());ack.execution_enabled=true;await assert.rejects(observerCapabilities());ack.emergency_stop_active=false;ack.journal_holds=0;assert.equal(await observerCapabilities(),true);
 });}finally{globalThis.fetch=old;for(const [key,value] of [['OBSERVER_MT5_VPS_URL',before.url],['OBSERVER_MT5_VPS_TOKEN',before.token]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
