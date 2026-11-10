import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
const origin='http://127.0.0.1:8199';
const assignment={login:123,server:'FixtureDemo',broker:'xm',gatewayOrigin:origin};
const input={login:'123',server:'FixtureDemo',password:'fixture-only',sourceKey:'a'.repeat(64),revision:1,symbol:'EURUSD',target:.1,sl:0,tp:0,maxVolume:1,maxOpenTrades:2,maxDailyDrawdown:5};
const capabilities=()=>({service:'ea-cloud-account-router-v1',assignments:[{login:123,server:'FixtureDemo',broker:'xm',role:'client'}],version:2,persistentJournal:true,absoluteTargets:true,simulation:false,account_mode:'demo',execution_enabled:true,emergency_stop_active:false,journal_holds:0});
const ack={success:true,simulation:false,account_mode:'demo',uncertain:false,data:{volume:.1}};
async function fixture(run){
 const names=['OBSERVER_MT5_VPS_URL','OBSERVER_MT5_VPS_TOKEN','OBSERVER_MT5_ACCOUNT_ASSIGNMENTS','EA_RELEASE_MODE'];
 const before=names.map(n=>process.env[n]),oldFetch=globalThis.fetch,dir=await mkdtemp(join(tmpdir(),'ea-assignment-'));
 process.env.OBSERVER_MT5_VPS_URL=origin;process.env.OBSERVER_MT5_VPS_TOKEN='a'.repeat(64);
 process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS=JSON.stringify([assignment]);delete process.env.EA_RELEASE_MODE;
 try{
  await build({entryPoints:['artifacts/api-server/src/lib/observer-vps.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'client.mjs'),logLevel:'silent'});
  await run(await import(pathToFileURL(join(dir,'client.mjs'))));
 }finally{globalThis.fetch=oldFetch;names.forEach((n,i)=>before[i]===undefined?delete process.env[n]:process.env[n]=before[i]);await rm(dir,{recursive:true,force:true});}
}
test('explicit account assignment pins authoritative router and never accepts unknown/conflicting routing',()=>fixture(async api=>{
 let calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});assert.equal(options.redirect,'error');return new Response(JSON.stringify(options.method==='POST'?ack:capabilities()),{status:200});};
 assert.equal((await api.syncObserverPosition(input)).ok,true);
 assert.deepEqual(calls.map(c=>new URL(c.url).pathname),['/observer/capabilities','/observer/sync-position']);
 assert.equal(calls[0].options.body,undefined);assert.equal(JSON.parse(calls[1].options.body).login,123);
 for(const rows of [undefined,[],[assignment,assignment],[assignment,{...assignment,broker:'deriv'}],[{...assignment,gatewayOrigin:'https://other.invalid'}],[{...assignment,login:true}],[{...assignment,server:' FixtureDemo'}]]){
  calls=[];if(rows===undefined)delete process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS;else process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS=JSON.stringify(rows);
  const result=await api.syncObserverPosition(input);assert.equal(result.ok,false);assert.equal(result.attempts,0);assert.equal(result.retriable,false);assert.deepEqual(calls,[]);
 }
 process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS=JSON.stringify([assignment]);calls=[];
 assert.equal((await api.syncObserverPosition({...input,login:'124'})).ok,false);assert.deepEqual(calls,[]);
 // A generic/direct worker is not the declared account router, even with positive demo flags.
 for(const change of [{service:'direct-worker'},{assignments:[]},{assignments:[{...capabilities().assignments[0],broker:'deriv'}]},{emergency_stop_active:true},{journal_holds:1}]){
  calls=[];globalThis.fetch=async(url,options)=>{calls.push(options.method??'GET');return new Response(JSON.stringify({...capabilities(),...change}),{status:200});};
  assert.equal((await api.syncObserverPosition(input)).ok,false);assert.deepEqual(calls,['GET']);
 }
}));
test('lost, malformed or contradictory gateway outcomes never become success or automatic retry',()=>fixture(async api=>{
 let posts=0,mode='throw';
 globalThis.fetch=async(url,options)=>{
  if(options.method!=='POST')return new Response(JSON.stringify(capabilities()));
  posts++;if(mode==='throw')throw Error('Synthetic lost response');
  if(mode==='empty')return new Response('{}');
  if(mode==='malformedFlags')return new Response(JSON.stringify({...ack,uncertain:'true'}));
  if(mode==='invalid')return new Response('not json',{status:200});
  if(mode==='contradictory')return new Response(JSON.stringify({...ack,uncertain:true}));
  if(mode==='queued')return new Response(JSON.stringify(ack),{status:202});
  if(mode==='unsafeRetry')return new Response(JSON.stringify({success:false,retriable:true}),{status:503});
  return new Response(JSON.stringify({success:false,retriable:true,submission_started:false,uncertain:false}),{status:503});
 };
 for(mode of ['throw','invalid','empty','malformedFlags','contradictory','queued','unsafeRetry']){
  const result=await api.syncObserverPosition(input);assert.equal(result.ok,false);assert.equal(result.retriable,false);assert.equal(result.data.uncertain,true);
 }
 mode='noSubmission';const result=await api.syncObserverPosition(input);assert.equal(result.ok,false);assert.equal(result.retriable,true);assert.equal(result.data.uncertain,false);assert.equal(posts,8);
 process.env.EA_RELEASE_MODE='nontrading';posts=0;assert.equal((await api.syncObserverPosition(input)).ok,false);assert.equal(posts,0);
}));
