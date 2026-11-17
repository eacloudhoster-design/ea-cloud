import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
test('pending schema and live scoped transport preserve exact account assignment and no-retry semantics',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ea-pending-contract-')),previous={...process.env},fetchOld=globalThis.fetch;
 try{
  process.env.MT5_VPS_URL='http://127.0.0.1:8004';process.env.MT5_VPS_TOKEN='r'.repeat(64);process.env.OBSERVER_MT5_VPS_URL='http://127.0.0.1:8004';process.env.OBSERVER_MT5_VPS_TOKEN='r'.repeat(64);process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS=JSON.stringify([{login:123,server:'FixtureLive',broker:'xm',gatewayOrigin:'http://127.0.0.1:8004'},{login:124,server:'UnrelatedOffline',broker:'deriv',gatewayOrigin:'http://127.0.0.1:8004'}]);delete process.env.EA_RELEASE_MODE;
  await build({stdin:{contents:"export {robotEvent} from './artifacts/api-server/src/lib/ea-builder/contracts';export {syncObserverPending,receivingSessions} from './artifacts/api-server/src/lib/observer-vps';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'test.mjs'),logLevel:'silent'});
  const {robotEvent,syncObserverPending,receivingSessions}=await import(pathToFileURL(join(dir,'test.mjs')));
  const event={eventId:'pending-fixture',sourceAccount:'123',sourceServer:'FixtureLive',accountMode:'HEDGING',kind:'PENDING',entry:'PENDING',sourceMagic:'12345',sequence:1,mixed:false,dealId:'0',orderId:'200',positionId:'200',symbol:'EURUSD',side:'BUY',volume:.1,price:1.1,stopLoss:1.05,takeProfit:1.2,pendingState:'active',pendingType:2,stopLimit:0,typeTime:0,expiration:0,timestampMs:Date.now()};
  assert.equal(robotEvent.safeParse(event).success,true);assert.equal(robotEvent.safeParse({...event,side:'SELL'}).success,false);assert.equal(robotEvent.safeParse({...event,pendingType:6}).success,false);
  const calls=[];globalThis.fetch=async(url,opts)=>{calls.push(String(url));const body=JSON.parse(opts.body);assert.equal(body.login,123,'No unrelated account queried');
   if(String(url).endsWith('/observer/account-capabilities'))return Response.json({service:'ea-cloud-account-router-v1',version:2,persistentJournal:true,absoluteTargets:true,pendingOrders:true,simulation:false,account_mode:'live',execution_enabled:true,emergency_stop_active:false,journal_holds:0,assignments:[{login:123,server:'FixtureLive',broker:'xm',role:'client'}]});
   return Response.json({success:true,simulation:false,account_mode:'live',data:{ticket:'200',pending_state:'active'}});
  };
  const input={login:'123',server:'FixtureLive',password:'fixture-only',sourceKey:'a'.repeat(64),revision:1,symbol:'EURUSD',target:.1,sl:1.05,tp:1.2,maxVolume:1,maxOpenTrades:5,maxDailyDrawdown:2,orderType:2,state:'active',price:1.1,stoplimit:0,typeTime:0,expiration:0};
  assert.equal((await syncObserverPending(input)).ok,true);assert.deepEqual(calls.map(u=>new URL(u).pathname),['/observer/account-capabilities','/observer/sync-pending']);
  globalThis.fetch=async()=>Response.json({version:1,sessions:[{login:123,server:'FixtureLive',broker:'xm',mode:'live',owner_kind:'client',owner_id:7},{login:124,server:'UnrelatedOffline',broker:'deriv',mode:'demo',owner_kind:'client',owner_id:8}]});
  process.env.COPY_ENGINE_RECEIVING_PERMIT_ACCOUNTS=JSON.stringify([{login:123,server:'FixtureLive',owner_id:7}]);
  assert.deepEqual((await receivingSessions()).map(v=>v.login),[123]);delete process.env.COPY_ENGINE_RECEIVING_PERMIT_ACCOUNTS;
  globalThis.fetch=async()=>{throw Error('simulated response loss')};const uncertain=await syncObserverPending(input);assert.equal(uncertain.attempts,0,'Preflight failure is not an order attempt');
 }finally{globalThis.fetch=fetchOld;for(const k of Object.keys(process.env))if(!(k in previous))delete process.env[k];Object.assign(process.env,previous);await rm(dir,{recursive:true,force:true})}
});
