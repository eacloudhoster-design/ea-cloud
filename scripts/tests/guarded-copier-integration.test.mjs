import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {eq} from '../../lib/db/node_modules/drizzle-orm/index.js';
import {copierFixture} from './helpers/copier-fixture.mjs';

test('application records through assigned fenced gateway process and signed IPC remain synthetic, isolated and fail closed', {timeout:120000}, async()=>{
 const previous=process.env.SESSION_SECRET;process.env.SESSION_SECRET=randomBytes(32).toString('hex');
 const f=await copierFixture({guarded:true});const {api,db,schema:s,engine}=f;
 const log={info(){},warn(){},error(){}};let calls=0,robot;
 const dispatch=async input=>{
  calls++;
  const {status,data}=await f.call('/observer/sync-position',input);
  assert.equal(data.simulation,true);
  assert.equal(data.financial_execution??false,false);
  return {ok:status===200&&data.success===true,httpStatus:status,ticket:data.data?.ticket??null,
   retcode:data.data?.retcode??null,message:data.code??'Fixture refusal',data,retriable:false,attempts:1};
 };
 const mirror=(login,mode='clear')=>f.call(`/test/fault/${login}/${mode}`,{});
 const snapshot=async()=> (await f.call('/test/state')).data;
 const fills=async login=>(await snapshot()).accounts[String(login)].fills.length;
 const enqueue=async(sequence,volume,positionId='100')=>{
  const payload=api.robotEvent.parse({eventId:randomUUID(),sourceAccount:'700',sourceServer:'SyntheticMentor',accountMode:'HEDGING',kind:'SNAPSHOT',entry:'SNAPSHOT',sourceMagic:'12345',sequence,dealId:'0',orderId:'0',positionId,symbol:'EURUSD',side:'BUY',volume,price:1.1,stopLoss:0,takeProfit:0,timestampMs:Date.now()});
  return db.transaction(async tx=>{
   const id=randomUUID();await tx.insert(s.robotEventsTable).values({id,robotId:robot.id,mentorId:1,sourceAccount:payload.sourceAccount,sourceServer:payload.sourceServer,eventId:payload.eventId,payload});
   const routed=await api.routeSnapshot(tx,robot,payload,id);
   if(!routed.signalId)return {routed};
   await tx.update(s.robotEventsTable).set({signalId:routed.signalId}).where(eq(s.robotEventsTable.id,id));
   return {routed,signal:(await tx.select().from(s.tradeSignalsTable).where(eq(s.tradeSignalsTable.id,routed.signalId)))[0]};
  });
 };
 const run=signal=>api.runSignal(signal,log,dispatch);
 try{
  await db.insert(s.usersTable).values([{id:1,email:'mentor1@example.invalid',password:'fixture',role:'mentor',status:'approved'},{id:2,email:'mentor2@example.invalid',password:'fixture',role:'mentor',status:'approved'}]);
  await db.insert(s.easTable).values({id:1,mentorId:1,name:'Synthetic guarded observer'});
  [robot]=await db.insert(s.robotBuildsTable).values({id:'guarded-source',mentorId:1,eaId:1,displayName:'Fixture',managerName:'Fixture',mode:'existing-observer',sourceMagic:'12345',copyEnabled:true,startSequence:'0',templateVersion:'fixture',tokenHash:'fixture-hash',sourceAccount:'700',sourceServer:'SyntheticMentor'}).returning();
  await db.insert(s.mt5ConnectionsTable).values({mentorId:1,mt5Login:700,mt5Server:'SyntheticMentor'});
  await db.insert(s.symbolPairsTable).values({mentorId:1,pairName:'EURUSD',variations:'EURUSD'});
  for(let i=1;i<=2;i++){
   await db.insert(s.appAccessTable).values({id:i,firstName:'Fixture',lastName:'Client',email:`c${i}@example.invalid`,mentorId:i,status:'approved',licenseKey:'FIXTURE-'+i});
   await db.insert(s.licensesTable).values({key:'FIXTURE-'+i,mentorId:i,clientName:'Fixture',clientEmail:`c${i}@example.invalid`,duration:'1month'});
   await db.insert(s.mentorCopyPoliciesTable).values({clientId:i,mentorId:i,enabled:true,lotMode:'fixed',fixedLotSize:'.1',allocationPercent:'100',maxLotSize:'.1',maxExposureLots:'.2',maxOpenTrades:2,maxDailyDrawdown:'5'});
   await db.insert(s.clientSettingsTable).values({clientId:i,mt5Login:String(i),mt5Server:'SimulationOnly',mt5Broker:i===1?'justmarkets':'xm',encryptedMt5Password:api.encryptMT5Password('fixture-only'),mt5Connected:true,copyingEnabled:true,lotMode:'fixed',fixedLotSize:'.1',maxLotSize:'.1'});
  }
  const state=await snapshot();assert.notEqual(state.gateway_pid,state.http_pid);
  // Explicit assignment rejects unknown accounts; no fallback or provisioning.
  assert.equal((await f.call('/observer/sync-position',{login:'99',server:'SimulationOnly',sourceKey:'a'.repeat(64),revision:1,symbol:'EURUSD',target:.1,sl:0,tp:0,maxVolume:.1})).status,422);
  let {signal}=await enqueue(1,.1);
  // Missing mirror stops execution and must remain accurately recorded.
  assert.equal((await run(signal)).failedTerminal,1);assert.equal(await fills(1),0);
  let record=(await db.select().from(s.tradeExecutionsTable))[0];
  let receipt=JSON.parse(record.vpsResponse);assert.equal(record.status,'failed');assert.equal(record.retryable,0);
  assert.equal(receipt.simulation,true);assert.equal(receipt.code,'STOPPED');assert.equal(receipt.uncertain,false);
  // New source revision after explicit mock clear, not resetting any recovery hold.
  await mirror(1);({signal}=await enqueue(2,.12));assert.equal((await run(signal)).succeeded,1);
  assert.equal(await fills(1),1);assert.equal(await fills(2),0);
  record=(await db.select().from(s.tradeExecutionsTable)).find(r=>r.signalId===signal.id);
  receipt=JSON.parse(record.vpsResponse);assert.equal(record.status,'success');assert.equal(receipt.simulation,true);
  assert.equal(receipt.financialExecution,false);assert.equal(receipt.code,'SYNCED');assert.ok(receipt.allocation);
  assert.equal((await snapshot()).accounts['1'].positions[0].volume,.1,'mentor/client caps enforced');
  const baselineCalls=calls;await run(signal);assert.equal(calls,baselineCalls);assert.equal(await fills(1),1);
  // A retained legacy OPEN ticket must not route CLOSE/MODIFY around this gateway.
  await db.insert(s.tradeExecutionsTable).values({signalId:signal.id,mentorId:1,clientId:1,signalKind:'OPEN',symbol:'EURUSD',action:'BUY',status:'success',ticket:'1001',mentorTicket:'legacy-source'});
  const oldFetch=globalThis.fetch;
  try{
   globalThis.fetch=async()=>{throw Error('Direct legacy transport must not be called')};
   for(const kind of ['CLOSE','MODIFY']){
    const [legacy]=await db.insert(s.tradeSignalsTable).values({mentorId:1,signal:kind,symbol:'EURUSD',orderType:'BUY',ticket:'legacy-source'}).returning();
    assert.equal((await run(legacy)).skipped,1);
   }
  }finally{globalThis.fetch=oldFetch;}

  assert.equal((await enqueue(2,.12)).routed.state,'stale_snapshot');
  const clients=await db.select().from(s.appAccessTable),settings=(await db.select().from(s.clientSettingsTable))[0];
  assert.equal((await api.executeObserver(signal,clients.find(c=>c.id===2),settings,'fixture-only','EURUSD',()=>.1,dispatch)).ok,false);
  assert.equal(calls,baselineCalls,'foreign licensed mentor refused before IPC');
  await engine.exec('UPDATE mentor_copy_policies SET enabled=false WHERE client_id=1');
  let next=await enqueue(3,.14);assert.equal((await run(next.signal)).skipped,1);assert.equal(calls,baselineCalls);
  await engine.exec('UPDATE mentor_copy_policies SET enabled=true WHERE client_id=1');
  await mirror(1,'stop');next=await enqueue(4,.16);assert.equal((await run(next.signal)).failedTerminal,1);assert.equal(await fills(1),1);
  record=(await db.select().from(s.tradeExecutionsTable)).find(r=>r.signalId===next.signal.id);
  assert.equal(JSON.parse(record.vpsResponse).code,'STOPPED');
  // Kill the independent gateway, retain journals, and verify unknown outcome is explicit.
  await mirror(1,'kill');next=await enqueue(5,.18);assert.equal((await run(next.signal)).failedTerminal,1);
  record=(await db.select().from(s.tradeExecutionsTable)).find(r=>r.signalId===next.signal.id);
  receipt=JSON.parse(record.vpsResponse);assert.equal(receipt.uncertain,true);assert.equal(record.retryable,0);
  assert.equal(receipt.code,'AUTHORITY_UNAVAILABLE');
  const update=f.updates.at(-1);assert.equal(update.clientId,1);assert.equal(update.payload.type,'TRADE_EXECUTION');
  assert.equal(update.payload.execution.status,'failed');assert.equal(JSON.parse(update.payload.execution.vpsResponse).uncertain,true);
  assert.ok(f.updates.every(u=>u.clientId===1),'no follower notification crosses mentor/account');
  await mirror(1,'restart');await mirror(1);
  const before=calls;assert.equal((await run(next.signal)).failedTerminal,1);assert.equal(calls,before,'unknown execution not automatically replayed');
  // Restart retained the successful command/SDK journals: direct authenticated replay has no effect.
  const key=api.sourceKey(1,'700','SyntheticMentor','100');
  const replay=await dispatch({login:'1',password:'fixture-only',server:'SimulationOnly',sourceKey:key,revision:signal.id,symbol:'EURUSD',target:.1,sl:0,tp:0,maxVolume:.1,maxOpenTrades:2,maxExposureLots:.2,maxDailyDrawdown:5});
  assert.equal(replay.ok,true);assert.equal(await fills(1),1);assert.equal(await fills(2),0);
  assert.ok((await snapshot()).accounts['1'].mappings.every(m=>m.phase==='acknowledged'));
 }finally{await f.close();if(previous===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=previous;}
});
