import {test} from 'node:test';import assert from 'node:assert/strict';import {checkMt5Transport} from '../check-mt5-status-transport.mjs';
test('deployment transport probe requires edge and service auth independently, accepts the intentional read-only 503 and never sends account credentials',async()=>{
 const env={MT5_VPS_URL:'https://fixture.invalid',MT5_VPS_TOKEN:'x'.repeat(64),MT5_ACCESS_CLIENT_ID:'fixture-id',MT5_ACCESS_CLIENT_SECRET:'fixture-secret',MT5_ACCESS_REQUIRED:'1'};let calls=0,bypass=false;
 const request=async(url,options)=>{calls++;assert.equal(options.body,undefined);assert.equal(options.redirect,'error');assert.ok(['/healthz','/observer/capabilities'].includes(url.pathname));
  if(!bypass&&(!options.headers.Authorization||!options.headers['CF-Access-Client-Secret']))return new Response('{}',{status:403});
  return new Response(JSON.stringify(url.pathname==='/healthz'?{read_only:true,execution_enabled:false}:{read_only:true,execution_enabled:false,persistentJournal:false,absoluteTargets:false}),{status:url.pathname==='/healthz'?200:503});};
 const result=await checkMt5Transport(env,request);assert.equal(result.financialRequestsSent,false);assert.equal(calls,4);
 bypass=true;await assert.rejects(checkMt5Transport(env,request),/negative probe/);
 await assert.rejects(checkMt5Transport({...env,MT5_ACCESS_CLIENT_SECRET:''},request));await assert.rejects(checkMt5Transport({...env,MT5_VPS_URL:'http://remote.invalid'},request));
});
