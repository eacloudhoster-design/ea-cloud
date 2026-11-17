import {test} from 'node:test';import assert from 'node:assert/strict';
import {checkEngineConnectivity as probe} from '../../artifacts/api-server/check-engine-connectivity.mjs';
const env={EA_MT5_MANAGEMENT_ONLY:'0',EA_SIGNAL_WORKER_MODE:'external',MT5_PROVISIONING_CONSUMER:'0',COPY_ENGINE_MULTI_ACCOUNT:'1',MT5_ACCOUNT_INVENTORY:'1',MT5_SELF_SERVICE_PROVISIONING:'1',OBSERVER_MT5_ACCOUNT_ASSIGNMENTS_SOURCE:'gateway',MT5_ACCESS_REQUIRED:'1',MT5_VPS_URL:'https://status.example.invalid',OBSERVER_MT5_VPS_URL:'https://gateway.example.invalid',PUBLIC_WEBSITE_ORIGIN:'https://app.example.invalid',MT5_VPS_TOKEN:'fixture-status-secret-'.repeat(3),OBSERVER_MT5_VPS_TOKEN:'fixture-router-secret-'.repeat(3),MT5_ACCESS_CLIENT_ID:'status-id',MT5_ACCESS_CLIENT_SECRET:'status-secret',OBSERVER_MT5_ACCESS_CLIENT_ID:'gateway-id',OBSERVER_MT5_ACCESS_CLIENT_SECRET:'gateway-secret',DATABASE_URL:'postgres://fixture:private-password@db.example.invalid/db',SESSION_SECRET:'fixture-original-session-secret'};
const account={login:123,server:'FixtureDemo',broker:'xm',role:'client'};
function responder(change=()=>{}){return async(url,options)=>{
 assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(options.redirect,'error');
 assert.ok(['/healthz','/observer/assignments','/observer/receiving-sessions'].includes(url.pathname));
 const status=url.hostname==='status.example.invalid';assert.equal(options.headers['CF-Access-Client-Id'],status?'status-id':'gateway-id');assert.equal(options.headers['CF-Access-Client-Secret'],status?'status-secret':'gateway-secret');
 if(!options.headers.Authorization)return Response.json({}, {status:401});
 assert.equal(options.headers.Authorization,'Bearer '+(status?env.MT5_VPS_TOKEN:env.OBSERVER_MT5_VPS_TOKEN));
 let data=url.pathname==='/observer/assignments'?{version:1,assignments:[account]}:url.pathname==='/observer/receiving-sessions'?{version:1,sessions:[]}:status?{status:'ok',read_only:true,execution_enabled:false,accounts:1}:{status:'ok',service:'isolated-account-router',simulation:false,execution_readiness_claimed:false,accounts:1};
 change(data,url);return Response.json(data);
};}
test('hosted probe uses only GET, isolated credentials, protected roster and honest zero-session status',async()=>{
 const r=await probe(env,responder());assert.equal(r.ok,true);assert.equal(r.registeredReceivers,1);assert.equal(r.activeReceivingSessions,0);assert.equal(r.executionReadinessClaimed,false);assert.equal(r.financialRequestsSent,0);assert.equal(Object.keys(r.checks).length,6);assert.ok(!JSON.stringify(r).includes('secret'));
});
test('probe rejects fake health, leaked assignment fields, duplicate accounts and unexpected auth status',async()=>{
 for(const change of [(d,u)=>{if(u.pathname==='/healthz')d.simulation=true;},(d,u)=>{if(u.pathname==='/observer/assignments')d.assignments=[{...account,token:'fixture-secret'}];},(d,u)=>{if(u.pathname==='/observer/assignments')d.assignments=[account,account];}])assert.equal((await probe(env,responder(change))).ok,false);
 const noBearerAccepted=await probe(env,async(url,options)=>!options.headers.Authorization?Response.json({}):responder()(url,options));assert.equal(noBearerAccepted.ok,false);
 const r=await probe(env,async()=>{throw Error('fixture-secret transport error')});assert.equal(r.ok,false);assert.ok(!JSON.stringify(r).includes('fixture-secret'));
});
