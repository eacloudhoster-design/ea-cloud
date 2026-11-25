import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
test('client sends credentials once, requires exact verification and cancels bounded requests',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ea-mt5-client-')),old=globalThis.fetch;let calls=0;
 try{
  await build({entryPoints:['artifacts/ea-app/src/lib/mt5-engine.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'client.mjs'),logLevel:'silent'});
  const api=await import(pathToFileURL(join(dir,'client.mjs'))),input={login:'91',server:'Fixture',password:'fixture-secret'},controller=new AbortController();
  let body={connected:true,status:'connected',login:'91',server:'Fixture',accountMode:'demo'};
  globalThis.fetch=async(url,init)=>{calls++;assert.equal(url,'/api/app/mt5-connect');assert.equal(init.credentials,'same-origin');assert.equal(JSON.parse(init.body).password,'fixture-secret');return new Response(JSON.stringify(body),{status:200});};
  assert.equal((await api.connectMt5Account(input,'fixture-cookie-hint',controller.signal)).connected,true);assert.equal(calls,1);
  for(const invalid of [{},{connected:false},{...body,login:'92'}]){body=invalid;await assert.rejects(api.connectMt5Account(input,'fixture-cookie-hint',controller.signal));}
  for(const [code,status,phrase] of [["ACCOUNT_NOT_ASSIGNED",409,"assigned MT5 worker"],["ACCOUNT_PROOF_REJECTED",422,"account details"],["MT5_SESSION_UNAVAILABLE",503,"assigned MT5 terminal"],["MT5_GATEWAY_UNAVAILABLE",503,"gateway"]]){
   globalThis.fetch=async()=>new Response(JSON.stringify({code,error:"PRIVATE_PASSWORD_MUST_NOT_RENDER"}),{status});
   await assert.rejects(api.connectMt5Account(input,'fixture-cookie-hint',controller.signal),e=>e.code===code && e.message.includes(phrase) && !e.message.includes("PRIVATE_PASSWORD"));
  }
  const pending={connected:false,status:'provisioning',executionEnabled:false,provisioning:{id:'12345678-1234-1234-1234-123456789abc',login:'91',server:'Fixture',broker:'justmarkets',accountRole:'follower',accountMode:'demo',connected:false,executionEnabled:false}};
  globalThis.fetch=async()=>Response.json(pending,{status:202});
  assert.equal((await api.connectMt5Account({...input,broker:'justmarkets',accountMode:'demo'},'fixture-cookie-hint',controller.signal)).connected,false);
  pending.provisioning.login='92';await assert.rejects(api.connectMt5Account({...input,broker:'justmarkets',accountMode:'demo'},'fixture-cookie-hint',controller.signal));
  globalThis.fetch=async()=>Response.json({connected:true,status:'connected',login:'91',server:'Fixture',accountMode:'demo',broker:'justmarkets'});
  assert.equal((await api.connectMt5Account({...input,broker:'custom'},'fixture-cookie-hint',controller.signal)).broker,'justmarkets');
  await assert.rejects(api.connectMt5Account({...input,broker:'exness'},'fixture-cookie-hint',controller.signal));
  controller.abort();const before=calls;await assert.rejects(api.connectMt5Account(input,'fixture-cookie-hint',controller.signal),{name:'AbortError'});assert.equal(calls,before);
 }finally{globalThis.fetch=old;await rm(dir,{recursive:true,force:true});}
});
test('account gateway failures retain safe actionable codes without upstream secrets',async()=>{
 const old=globalThis.fetch,oldToken=process.env.MT5_VPS_TOKEN;
 const built=await build({entryPoints:['artifacts/api-server/src/lib/mt5-account-status.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 try{
  for(const [code,status,expected,expectedStatus] of [['ACCOUNT_NOT_ASSIGNED',403,'ACCOUNT_NOT_ASSIGNED',409],['ACCOUNT_PROOF_REJECTED',403,'ACCOUNT_PROOF_REJECTED',422],['MT5_SESSION_UNAVAILABLE',503,'MT5_SESSION_UNAVAILABLE',503],['unknown',502,'MT5_SESSION_UNAVAILABLE',503],['unknown',401,'MT5_GATEWAY_AUTH_REJECTED',503],['UNSUPPORTED_ACCOUNT_CONFIGURATION',422,'UNSUPPORTED_ACCOUNT_CONFIGURATION',422]]){
   // No real endpoint or token: configuration construction is intercepted offline.
   process.env.MT5_VPS_TOKEN='a'.repeat(64);
   globalThis.fetch=async()=>Response.json({code,message:'PRIVATE_UPSTREAM_SECRET'}, {status});
   await assert.rejects(api.readBoundAccount('91','Fixture','fixture-secret'),e=>{
    assert.equal(api.accountBindingFailure(e).code,expected);assert.equal(api.accountBindingFailure(e).status,expectedStatus);assert(!e.message.includes('PRIVATE_UPSTREAM_SECRET'));return true;
   });
  }
  globalThis.fetch=async()=>{throw Error('PRIVATE_TRANSPORT_SECRET')};
  await assert.rejects(api.readBoundAccount('91','Fixture','fixture-secret'),e=>api.accountBindingFailure(e).code==='MT5_GATEWAY_UNAVAILABLE');
  globalThis.fetch=async()=>{throw new DOMException('PRIVATE_TIMEOUT','TimeoutError')};
  await assert.rejects(api.readBoundAccount('91','Fixture','fixture-secret'),e=>api.accountBindingFailure(e).code==='MT5_GATEWAY_TIMEOUT');
  delete process.env.MT5_VPS_TOKEN;let sent=false;globalThis.fetch=async()=>{sent=true;throw Error('must not send')};
  await assert.rejects(api.readBoundAccount('91','Fixture','fixture-secret'),e=>api.accountBindingFailure(e).code==='MT5_GATEWAY_NOT_CONFIGURED');assert.equal(sent,false);
 }finally{globalThis.fetch=old;if(oldToken===undefined)delete process.env.MT5_VPS_TOKEN;else process.env.MT5_VPS_TOKEN=oldToken;}
});

test('bot rejection reasons are actionable and never expose arbitrary response text',async()=>{
 const built=await build({entryPoints:['artifacts/ea-app/src/lib/request.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64')),old=globalThis.fetch;
 try{
  for(const reason of ['DEPLOYMENT_EXECUTION_DISABLED','ACCOUNT_DISCONNECTED','PROVISIONING_PENDING','GATEWAY_UNAVAILABLE','MENTOR_AUTHORIZATION_REQUIRED','EMERGENCY_STOP_ACTIVE','RECOVERY_HOLD']){
   let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({code:'EXECUTION_NOT_APPROVED',reason,error:'PRIVATE_UPSTREAM_SECRET'},{status:409})};
   await assert.rejects(api.requestJson('/api/app/trading-controls',{method:'PATCH',body:'{"copyingEnabled":true}'}),error=>error.status===409&&error.reason===reason&&!error.retryable&&error.message===api.botActivationMessage(reason));
   assert.equal(calls,1,'Rejected commands are never retried');
  }
  for(const reason of ['PRIVATE_UPSTREAM_SECRET','__proto__','constructor',null])assert.equal(api.botActivationMessage(reason),null);
 }finally{globalThis.fetch=old;}
});

test('customer connection copy and account-type proof stay separate from private diagnostics',async()=>{
 const built=await build({stdin:{contents:"export * from './artifacts/ea-app/src/lib/mt5-account-messages';export * from './artifacts/ea-app/src/lib/request';export * from './artifacts/ea-app/src/lib/mt5-engine';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64')),old=globalThis.fetch;
 try{
  for(const code of ['MT5_GATEWAY_NOT_CONFIGURED','MT5_GATEWAY_AUTH_REJECTED','MT5_GATEWAY_UNAVAILABLE','PROVISIONING_NOT_CONFIGURED','ACCOUNT_NOT_ASSIGNED','ACCOUNT_PROOF_REJECTED','UNSUPPORTED_ACCOUNT_CONFIGURATION','ACCOUNT_MODE_MISMATCH']){
   const message=api.mt5AccountMessage(new api.ApiRequestError('PRIVATE_SECRET',code,'backend',false));assert(!/gateway|worker|provision|deployment|testing|PRIVATE_SECRET/i.test(message));
  }
  assert(!api.mt5AccountMessage('PRIVATE_SECRET').includes('PRIVATE_SECRET'));
  const input={login:'91',server:'Fixture',password:'fixture-only-secret',broker:'justmarkets',accountMode:'live'};
  globalThis.fetch=async()=>Response.json({connected:true,status:'connected',login:'91',server:'Fixture',broker:'justmarkets',accountMode:'demo'});
  await assert.rejects(api.connectMt5Account(input,'fixture',new AbortController().signal));
  globalThis.fetch=async()=>Response.json({connected:true,status:'connected',login:'91',server:'Fixture',broker:'justmarkets',accountMode:'live'});
  assert.equal((await api.connectMt5Account(input,'fixture',new AbortController().signal)).accountMode,'live');
  const job={id:'12345678-1234-1234-1234-123456789abc',login:'91',server:'Fixture',broker:'justmarkets',accountMode:'live',accountRole:'follower',state:'connected',connected:false,executionEnabled:false};
  globalThis.fetch=async()=>Response.json({requests:[job]});assert.equal((await api.readAccountRequests('fixture')).length,1,'Completed requests still require fresh terminal proof');
  job.executionEnabled=true;await assert.rejects(api.readAccountRequests('fixture'));
 }finally{globalThis.fetch=old;}
});

test('submitted login zeros survive application proof and private diagnostics expose setting names only',async()=>{
 const old=globalThis.fetch;
 const built=await build({entryPoints:['artifacts/ea-app/src/lib/mt5-engine.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 try{
  const input={login:'00091',server:'Fixture',password:'fixture-only',accountMode:'demo'};
  globalThis.fetch=async(url,init)=>{assert.equal(JSON.parse(init.body).login,'00091');return Response.json({connected:true,status:'connected',login:'00091',server:'Fixture',accountMode:'demo'});};
  assert.equal((await api.connectMt5Account(input,'fixture',new AbortController().signal)).login,'00091');
  globalThis.fetch=async()=>Response.json({connected:true,status:'connected',login:'91',server:'Fixture',accountMode:'demo',accountMode:'demo'});
  await assert.rejects(api.connectMt5Account(input,'fixture',new AbortController().signal));
 }finally{globalThis.fetch=old;}
 const transport=await build({entryPoints:['artifacts/api-server/src/lib/mt5-endpoint.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 const before={...process.env};try{
  process.env.RENDER='true';delete process.env.MT5_VPS_URL;delete process.env.MT5_VPS_TOKEN;process.env.MT5_ACCESS_REQUIRED='1';delete process.env.MT5_ACCESS_CLIENT_ID;delete process.env.MT5_ACCESS_CLIENT_SECRET;
  const endpoint=await import('data:text/javascript;base64,'+Buffer.from(transport.outputFiles[0].text+'\n//isolated-config-test').toString('base64'));
  assert.deepEqual(endpoint.mt5ConfigurationIssues(),['MT5_VPS_URL_REMOTE_REQUIRED','MT5_VPS_TOKEN_MISSING_OR_INVALID','MT5_ACCESS_SERVICE_PAIR_REQUIRED']);assert.throws(()=>endpoint.mt5Headers());
 }finally{for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before);}
});

test('runtime transport check logs only safe settings and probes relay health without account operations',async()=>{
 const saved={...process.env},old=globalThis.fetch;
 try{
  delete process.env.RENDER;process.env.MT5_VPS_URL='https://relay.example.invalid';process.env.MT5_VPS_TOKEN='fixture-token-'.repeat(4);
  delete process.env.MT5_ACCESS_REQUIRED;delete process.env.MT5_ACCESS_CLIENT_ID;delete process.env.MT5_ACCESS_CLIENT_SECRET;
  const built=await build({entryPoints:['artifacts/api-server/src/lib/mt5-transport-readiness.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
  const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text+'\n//runtime-health-check').toString('base64'));
  let records=[],calls=0;const log={info:(fields)=>records.push(fields),warn:(fields)=>records.push(fields)};
  globalThis.fetch=async(url,init)=>{calls++;assert.equal(url,'https://relay.example.invalid/healthz');assert.equal(init.method,'GET');assert.equal(init.body,undefined);assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer '+process.env.MT5_VPS_TOKEN);return Response.json({status:'ok',read_only:true,execution_enabled:false,accounts:42,password:'UPSTREAM_SECRET'});};
  await api.reportMt5TransportReadiness(log);assert.equal(records.at(-1).code,'MT5_GATEWAY_REACHABLE');assert.equal(records.at(-1).brokerConnectivityChecked,false);assert(!JSON.stringify(records).includes('SECRET'));assert(!JSON.stringify(records).includes('fixture-token'));assert(!JSON.stringify(records).includes('accounts'));
  delete process.env.MT5_VPS_TOKEN;const before=calls;await api.reportMt5TransportReadiness(log);assert.equal(calls,before);assert(records.at(-1).configurationIssues.includes('MT5_VPS_TOKEN_MISSING_OR_INVALID'));
  process.env.MT5_VPS_TOKEN='fixture-token-'.repeat(4);globalThis.fetch=async()=>new Response('PRIVATE_EDGE_DETAIL',{status:403});await api.reportMt5TransportReadiness(log);assert.equal(records.at(-1).code,'MT5_GATEWAY_AUTH_REJECTED');
  globalThis.fetch=async()=>Response.json({status:'ok',read_only:true,execution_enabled:true});await api.reportMt5TransportReadiness(log);assert.equal(records.at(-1).code,'MT5_GATEWAY_HEALTH_UNVERIFIED');
  globalThis.fetch=async()=>{throw Error('PRIVATE_NETWORK_DETAIL')};await api.reportMt5TransportReadiness(log);assert.equal(records.at(-1).code,'MT5_GATEWAY_UNAVAILABLE');assert(!JSON.stringify(records).includes('PRIVATE'));
 }finally{globalThis.fetch=old;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
