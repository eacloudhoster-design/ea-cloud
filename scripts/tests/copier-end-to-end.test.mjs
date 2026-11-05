import {eq} from '../../lib/db/node_modules/drizzle-orm/index.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {randomUUID,randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {copierFixture} from './helpers/copier-fixture.mjs';
test('mentor database routing to five isolated HTTP workers: mapping, replay, disconnect, crash and latency', {timeout:120000},async()=>{
 const previous=process.env.SESSION_SECRET;process.env.SESSION_SECRET=randomBytes(32).toString('hex');
 const f=await copierFixture();const {db,schema:s,api,engine}=f;const errors=[];
 const log={info(){},warn(){},error(v){errors.push(String(v.err?.message||'client failure'));}};
 const brokers=['deriv','exness','justmarkets','xm','rcg'];
 let calls=0,lostAck=false,gate=null,healthyDone=0,release;const samples=[];
 const transport=async input=>{
  calls++;
  if(gate&&input.login==='1')await gate;
  const {status,data}=await f.call('/observer/sync-position',input);
  assert.equal(data.simulation,true,'Only synthetic transport receipts accepted by this fixture');
  if(gate&&input.login!=='1'){healthyDone++;if(healthyDone===4)release();}
  if(lostAck&&input.login==='1'&&data.success){lostAck=false;return {ok:false,httpStatus:0,ticket:null,retcode:null,message:'Synthetic lost acknowledgement',data:null,retriable:true,attempts:1};}
  return {ok:status===200&&data.success,httpStatus:status,ticket:data.data?.ticket??null,retcode:data.data?.retcode??null,message:data.message,data,retriable:data.retriable===true&&!data.uncertain,attempts:1};
 };
 const count=async()=>Object.values((await f.call('/test/state')).data).reduce((sum,a)=>sum+a.fills.length,0);
 let robot;
 const enqueue=async(sequence,volume,side='BUY',positionId='100',extra={})=>{
  const payload=api.robotEvent.parse({eventId:'event-'+positionId+'-'+sequence+'-'+randomUUID(),sourceAccount:'700',sourceServer:'SyntheticMentor',accountMode:'HEDGING',kind:'SNAPSHOT',entry:'SNAPSHOT',sourceMagic:'12345',sequence,dealId:'0',orderId:'0',positionId,symbol:'EURUSD',side,volume,price:1.1,stopLoss:0,takeProfit:0,timestampMs:Date.now(),...extra});
  const id=randomUUID();
  const routed=await db.transaction(async tx=>{
   await tx.insert(s.robotEventsTable).values({id,robotId:robot.id,mentorId:1,sourceAccount:payload.sourceAccount,sourceServer:payload.sourceServer,eventId:payload.eventId,payload});
   const result=await api.routeSnapshot(tx,robot,payload,id);
   if(result.signalId)await tx.update(s.robotEventsTable).set({signalId:result.signalId}).where(eq(s.robotEventsTable.id,id));
   return result;
  });
  if(!routed.signalId)return {routed};
  const signal=(await db.select().from(s.tradeSignalsTable)).find(row=>row.id===routed.signalId);
  return {routed,signal};
 };
 const execute=async signal=>{
  const claimed=await engine.query(f.claimSQL);assert.deepEqual(claimed.rows.map(r=>r.id),[signal.id]);
  const result=await api.runSignal(signal,log,transport);
  await engine.query("UPDATE trade_signals SET status=$1 WHERE id=$2",[result.failedRetryable?'pending':result.failedTerminal?'failed':'success',signal.id]);
  assert.deepEqual(errors,[]);return result;
 };
 try{
  await db.insert(s.usersTable).values({id:1,email:'mentor@example.invalid',password:'fixture',role:'mentor',status:'approved'});
  await db.insert(s.easTable).values({id:1,mentorId:1,name:'Synthetic observer'});
  [robot]=await db.insert(s.robotBuildsTable).values({id:'synthetic-robot',mentorId:1,eaId:1,displayName:'Synthetic',managerName:'Fixture',mode:'existing-observer',sourceMagic:'12345',copyEnabled:true,startSequence:'0',templateVersion:'fixture',tokenHash:'synthetic-token-hash',sourceAccount:'700',sourceServer:'SyntheticMentor'}).returning();
  await db.insert(s.mt5ConnectionsTable).values({mentorId:1,mt5Login:700,mt5Server:'SyntheticMentor'});
  await db.insert(s.symbolPairsTable).values({mentorId:1,pairName:'EURUSD',variations:'EURUSD.m,EURUSDm'});
  for(let i=1;i<=5;i++){
   await db.insert(s.appAccessTable).values({id:i,firstName:'Synthetic',lastName:'Client',email:`client${i}@example.invalid`,mentorId:1,status:'approved',licenseKey:'FIXTURE-'+i});
   await db.insert(s.licensesTable).values({key:'FIXTURE-'+i,mentorId:1,clientName:'Synthetic',clientEmail:`client${i}@example.invalid`,duration:'1month'});
   await db.insert(s.clientSettingsTable).values({clientId:i,mt5Login:String(i),mt5Server:'SimulationOnly',mt5Broker:brokers[i-1],encryptedMt5Password:api.encryptMT5Password('synthetic-password'),mt5Connected:true,copyingEnabled:true,lotMode:i===2?'multiplier':'fixed',fixedLotSize:'0.10',lotMultiplier:'2',maxLotSize:i===4?'0.08':'1'});
   await db.insert(s.clientSymbolConfigsTable).values({clientId:i,pairName:'EURUSD',selectedSymbol:'EURUSD.'+brokers[i-1],customLotSize:i===3?'0.06':null});
  }
  // Measure a cold, healthy full pipeline before injecting failures.
  const coldStart=performance.now();let cold=await enqueue(1,.2,'BUY','900');
  assert.equal((await execute(cold.signal)).succeeded,5);const coldMs=performance.now()-coldStart;
  cold=await enqueue(2,0,'BUY','900');assert.equal((await execute(cold.signal)).succeeded,5);
  const baselineFills=await count();
  assert.ok(Math.abs(api.resolveVolume(.1,{lotMode:'multiplier',lotMultiplier:'0.05',maxLotSize:'1'},null,true)-.005)<1e-12);
  assert.equal(api.resolveVolume(.1,{lotMode:'multiplier',lotMultiplier:'0.05',maxLotSize:'1'},null,false),.01); // Legacy OPEN behavior remains separate.
  assert.equal(api.resolveVolume(.1,{lotMode:"risk_percent",riskPercent:"1",maxLotSize:"1"}),0,"Unimplemented risk-percent sizing must not silently copy 1:1");
  // One disconnected client must not prevent the other four completing.
  await f.call('/test/fault/1/offline',{});gate=new Promise(r=>release=r);
  let {signal}=await enqueue(1,.2);let tally=await execute(signal);gate=null;
  assert.equal(healthyDone,4);assert.equal(tally.failedRetryable,1);assert.equal(tally.succeeded,4);
  await f.call('/test/fault/1/healthy',{});tally=await execute(signal);assert.equal(tally.succeeded,5);assert.equal(await count(),baselineFills+5);
  const initial=(await f.call('/test/state')).data;
  for(let i=0;i<5;i++){assert.equal(initial[brokers[i]].positions[0].symbol,'EURUSD.'+brokers[i]);assert.equal(initial[brokers[i]].positions[0].volume,[.1,.4,.06,.08,.1][i]);}
  await engine.exec("UPDATE client_symbol_configs SET selected_symbol='EURUSD.changed' WHERE client_id=5");
  const beforeDuplicate=await count();await api.runSignal(signal,log,transport);assert.equal(await count(),beforeDuplicate);
  assert.equal((await enqueue(1,.2)).routed.state,'stale_snapshot');
  assert.equal((await enqueue(2,.12,'BUY','100',{symbol:'OTHER'})).routed.state,'blocked_position_identity_change');
  // Restart the complete HTTP/process gateway, then replay the identical target.
  await f.restart();const key=api.sourceKey(1,'700','SyntheticMentor','100');
  const replay=await transport({login:'1',password:'synthetic-password',server:'SimulationOnly',sourceKey:key,revision:signal.id,symbol:'EURUSD.deriv',target:.1,sl:0,tp:0,maxVolume:1,maxOpenTrades:10,maxDailyDrawdown:5});
  assert.equal(replay.ok,true);assert.equal(await count(),beforeDuplicate);
  // Lost acknowledgement: backend retry must read the worker's journal.
  ({signal}=await enqueue(2,.12));lostAck=true;tally=await execute(signal);assert.equal(tally.failedRetryable,1);
  const beforeRetry=await count();tally=await execute(signal);assert.equal(tally.succeeded,5);assert.equal(await count(),beforeRetry);
  for(const [seq,target,side] of [[3,.06,'SELL'],[4,0,'SELL']]){({signal}=await enqueue(seq,target,side));tally=await execute(signal);assert.equal(tally.succeeded,5);}
  assert.ok(Object.values((await f.call('/test/state')).data).every(a=>a.positions.length===0));
  // Sustained complete database->HTTP->process->journal lifecycle, cold phase above included separately.
  for(let cycle=0;cycle<3;cycle++)for(const [offset,target,side] of [[0,.2,'BUY'],[1,.12,'BUY'],[2,.06,'SELL'],[3,0,'SELL']]){
   const start=performance.now();({signal}=await enqueue(5+cycle*4+offset,target,side));tally=await execute(signal);assert.equal(tally.succeeded,5);samples.push(performance.now()-start);
  }
  ({signal}=await enqueue(1,.2,'BUY','300'));assert.equal((await execute(signal)).succeeded,5);
  ({signal}=await enqueue(2,.2,'BUY','300',{stopLoss:1.05,takeProfit:1.2}));assert.equal((await execute(signal)).succeeded,5);
  assert.ok(Object.values((await f.call('/test/state')).data).every(a=>a.positions.every(p=>p.sl===1.05&&p.tp===1.2)));
  ({signal}=await enqueue(3,0,'BUY','300'));assert.equal((await execute(signal)).succeeded,5);
  // Concurrent backend retries cannot duplicate a source-position fill.
  ({signal}=await enqueue(1,.2,'BUY','400'));const beforeConcurrent=await count();
  assert.deepEqual((await engine.query(f.claimSQL)).rows.map(r=>r.id),[signal.id]);
  const concurrent=await Promise.all([api.runSignal(signal,log,transport),api.runSignal(signal,log,transport)]);
  assert.ok(concurrent.every(t=>t.succeeded===5));assert.equal(await count(),beforeConcurrent+5);
  await engine.query("UPDATE trade_signals SET status='success' WHERE id=$1",[signal.id]);
  ({signal}=await enqueue(2,0,'BUY','400'));assert.equal((await execute(signal)).succeeded,5);
  const pinned=(await engine.query("SELECT symbol,vps_response FROM trade_executions WHERE client_id=5 AND mentor_ticket=$1 AND status='success'",[key])).rows;
  assert.ok(pinned.every(row=>row.symbol==='EURUSD.rcg'));
  assert.ok(pinned.every(row=>{const receipt=JSON.parse(row.vps_response);return /^[a-f0-9]{64}$/.test(receipt.allocation)&&Number.isSafeInteger(receipt.magic)&&Array.isArray(receipt.tickets);}));
  // Broker precision, not backend rounding, decides a small receiving target.
  await engine.exec("UPDATE client_settings SET lot_multiplier='0.01' WHERE client_id=2");
  const beforeSmall=(await f.call('/test/state')).data.exness.fills.length;
  ({signal}=await enqueue(1,.2,'BUY','501'));tally=await execute(signal);assert.equal(tally.failedTerminal,1);assert.equal(tally.succeeded,4);
  assert.equal((await f.call('/test/state')).data.exness.fills.length,beforeSmall);
  ({signal}=await enqueue(2,0,'BUY','501'));assert.equal((await execute(signal)).succeeded,5);
  await engine.exec("UPDATE client_settings SET lot_multiplier='2' WHERE client_id=2");
  const baseline=(await f.call('/test/state')).data;assert.ok(Object.values(baseline).every(a=>a.positions.length===0));
  assert.ok(Object.values(baseline).every(a=>a.mappings.length===a.fills.length&&a.mappings.every(m=>m.phase==='acknowledged'&&JSON.parse(m.receipt).deal>0)));
  // Receipt tampering fails before dispatch, regardless of its claimed volume.
  await db.insert(s.usersTable).values({id:2,email:'other-mentor@example.invalid',password:'fixture',role:'mentor',status:'approved'});
  await db.insert(s.appAccessTable).values({id:6,firstName:'Other',lastName:'Client',email:'other@example.invalid',mentorId:2,status:'approved',licenseKey:'OTHER'});
  await db.insert(s.licensesTable).values({key:'OTHER',mentorId:2,clientName:'Other',clientEmail:'other@example.invalid',duration:'1month'});
  const callCount=calls;const tampered={...signal,rawPayload:JSON.stringify({...JSON.parse(signal.rawPayload),sourceVolume:.9})};
  const clients=await db.select().from(s.appAccessTable);const settings=await db.select().from(s.clientSettingsTable);
  assert.equal((await api.executeObserver(tampered,clients[0],settings[0],'synthetic-password','EURUSD.deriv',v=>v,transport)).ok,false);assert.equal(calls,callCount);
  assert.equal((await api.executeObserver(signal,clients.find(c=>c.id===6),settings[0],'synthetic-password','EURUSD.deriv',v=>v,transport)).ok,false);assert.equal(calls,callCount);
  // Crash after one synthetic fill: uncertainty blocks replay and later closes for that source.
  await f.call('/test/fault/1/crash',{});({signal}=await enqueue(1,.2,'BUY','200'));tally=await execute(signal);assert.equal(tally.failedTerminal,1);assert.equal(tally.succeeded,4);
  const uncertainCount=await count();await f.call('/test/fault/1/healthy',{});tally=await api.runSignal(signal,log,transport);assert.equal(tally.failedTerminal,1);assert.equal(await count(),uncertainCount);
  ({signal}=await enqueue(2,0,'BUY','200'));tally=await execute(signal);assert.equal(tally.failedTerminal,1);assert.equal(tally.succeeded,4);
  const sorted=samples.toSorted((a,b)=>a-b);
  const report={observed_at:new Date().toISOString(),simulation:true,broker_orders:0,brokers,source_routing:'actual routeSnapshot + Drizzle/'+f.databaseKind,queue:'actual claim SQL',queue_scheduler:'Claim invoked immediately by fixture; production polling/backoff excluded',copier:'actual runSignal + executeObserver guards, mapping and sizing',transport:'explicit test-only synthetic receipt adapter over real authenticated loopback HTTP',workers:'five real isolated subprocesses, durable SQLite fills/receipts',measured_warm_events:samples.length,p95_ms:sorted[Math.floor(.95*(sorted.length-1))],maximum_ms:Math.max(coldMs,...samples),cold_event_ms:coldMs,cold_start_included:true,simulation_target_met:Math.max(coldMs,...samples)<15000,actual_broker_target_verified:false,disconnect_recovery:true,gateway_restart_replay:true,lost_ack_duplicate_prevention:true,uncertain_fill_blocked:true,baseline_accounts_flat:true,concurrent_backend_retry_verified:true,sl_tp_modification_verified:true,custom_lots_caps_and_symbol_pinning_verified:true,subminimum_receiver_target_rejected_without_roundup:true,excluded:['public mentor HTTP authentication',...(f.databaseKind==='PGlite'?['real PostgreSQL server']:[]),'Windows SDK/broker execution','production deployment']};
  if(process.env.EA_COPIER_REPORT)await writeFile(process.env.EA_COPIER_REPORT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
 }finally{await f.close();if(previous===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=previous;}
});
