import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
const b=await build({entryPoints:['artifacts/ea-app/src/lib/scanner-execution.ts'],bundle:true,platform:'node',format:'esm',write:false});const {createScannerSubmission}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const settings={lotUnits:5,positions:2},signal=new AbortController().signal;
test('interactive confirmation sends only confirmed quantities and authenticated saved scan; concurrent clicks submit once',async()=>{
 let calls=0,release;const gate=new Promise(r=>release=r);const controller=createScannerSubmission(async(path,token,_signal,init)=>{calls++;assert.equal(path,'execute');assert.equal(token,'session');assert.deepEqual(JSON.parse(init.body),{scanId:'saved',requestId:'uuid',confirmed:true,lotSize:.05,positions:2});await gate;throw Object.assign(new Error('Connect your MT5 account to execute this trade.'),{code:'MT5_ACCOUNT_REQUIRED'});},()=> 'uuid');
 const first=controller.submit('saved','session',settings,signal);assert.equal(await controller.submit('saved','session',settings,signal),null);release();assert.equal(await first,'Connect your MT5 account to execute this trade.');assert.equal(calls,1);
});
test('auth/quantity validation prevents calls; bare 200 and uncertain timeouts never fabricate broker success or retry',async()=>{
 let calls=0;const controller=createScannerSubmission(async()=>{calls++;return {success:true};},()=> 'uuid');
 assert.match(await controller.submit('saved',null,settings,signal),/Sign in/);assert.match(await controller.submit('saved','session',{lotUnits:0,positions:2},signal),/valid lot/);assert.equal(calls,0);
 assert.match(await controller.submit('saved','session',settings,signal),/could not be confirmed/);assert.match(await controller.submit('saved','session',settings,signal),/could not be confirmed/);assert.equal(calls,1);
 const timeout=createScannerSubmission(async()=>{calls++;throw Object.assign(new Error('timeout'),{code:'SCANNER_UNAVAILABLE'});},()=> 'uuid');await timeout.submit('saved','session',settings,signal);await timeout.submit('saved','session',settings,signal);assert.equal(calls,2);
});

test('future broker receipts must bind scan/request/confirmed quantity and enumerate real tickets before showing partial results',async()=>{
 const scan='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
 const receipt={scanId:scan,requestId:id,brokerConfirmed:true,requestedPositions:2,outcomes:[{position:1,status:'accepted',ticket:'12345'},{position:2,status:'rejected'}]};
 const accepted=createScannerSubmission(async()=>receipt,()=>id);assert.equal(await accepted.submit(scan,'session',settings,signal),'1 trade accepted; 1 rejected.');assert.equal(await accepted.submit(scan,'session',settings,signal),'1 trade accepted; 1 rejected.');
 for(const patch of [{brokerConfirmed:false},{requestId:scan},{requestedPositions:3},{outcomes:[{position:1,status:'accepted'}]},{outcomes:[{position:1,status:'accepted',ticket:'123'},{position:1,status:'rejected'}]}]){
  const unsafe=createScannerSubmission(async()=>({...receipt,...patch}),()=>id);assert.match(await unsafe.submit(scan,'session',settings,signal),/could not be confirmed/);
 }
});
