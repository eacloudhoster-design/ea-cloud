import { directionalFields } from "./fixtures/scanner-direction.mjs";
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
import express from '../../artifacts/api-server/node_modules/express/index.js';
import { appRequest } from './helpers/in-process-http.mjs';
const names=['usersTable','appAccessTable','scannerEntitlementsTable','scannerReportsTable','scannerAdminSessionsTable','scannerAccessAuditTable'];
const tables=Object.fromEntries(names.map(name=>[name,Object.fromEntries(['id','email','firstName','lastName','status','clientId','tokenHash','userId','expiresAt','creditsRemaining','reference','updatedAt'].map(key=>[key,key]))]));
const hash=password=>createHash('sha256').update(password+'ea_cloud_salt_2024').digest('hex');
const state={users:[{id:1,email:'admin@fixture.test',role:'superadmin',status:'approved',password:hash('admin-password')},{id:2,email:'mentor@fixture.test',role:'mentor',status:'approved',password:hash('mentor-password')}],clients:[{id:7,email:'client@fixture.test',firstName:'Client',lastName:'Seven',status:'approved'},{id:8,email:'pending@fixture.test',status:'pending'}],entitlements:[],sessions:[],audit:[],reports:[],calls:0,fail:false,missing:false};
const store=table=>table===tables.usersTable?state.users:table===tables.appAccessTable?state.clients:table===tables.scannerEntitlementsTable?state.entitlements:table===tables.scannerAdminSessionsTable?state.sessions:table===tables.scannerReportsTable?state.reports:state.audit;
const matches=(row,condition)=>!condition||condition.op==='or'||condition.op==='sql'||(condition.op==='and'?condition.conditions.every(c=>matches(row,c)):condition.op==='gt'?row[condition.column]>condition.value:row[condition.column]===condition.value);
let queue=Promise.resolve();
const db={
 transaction(fn){const run=queue.then(async()=>{const snapshot=structuredClone(state);try{return await fn(db);}catch(e){for(const key of Object.keys(state))state[key]=snapshot[key];throw e;}});queue=run.catch(()=>{});return run;},
 select(){return{from(table){let where,limit=999,offset=0,join=false;const q={where(c){where=c;return q;},limit(n){limit=n;return q;},offset(n){offset=n;return q;},for(){return q;},orderBy(){return q;},leftJoin(){join=true;return q;},then(resolve,reject){return Promise.resolve().then(()=>{if(state.missing&&table===tables.scannerReportsTable)throw Error('missing migration');let rows=store(table).filter(row=>matches(row,where)).slice(offset,offset+limit);if(join)rows=rows.map(row=>({id:row.id,email:row.email,firstName:row.firstName,lastName:row.lastName,accountStatus:row.status,entitlement:state.entitlements.find(g=>g.clientId===row.id)??null}));return rows;}).then(resolve,reject);}};return q;}};},
 insert(table){return{values(value){let update,executed;const run=()=>executed??=Promise.resolve().then(()=>{if(state.failStorage&&table===tables.scannerReportsTable)throw Error('failed persistence');const list=store(table);let row=table===tables.scannerEntitlementsTable?list.find(g=>g.clientId===value.clientId):null;if(row&&update)Object.assign(row,update);else{row={id:'fixture-'+list.length,createdAt:new Date(),...value};list.push(row);}return [row];});const q={onConflictDoUpdate(options){update=options.set;return q;},returning:run,then(resolve,reject){return run().then(resolve,reject);}};return q;}};},
 update(table){return{set(values){return{where(condition){const row=store(table).find(row=>matches(row,condition));if(row)Object.assign(row,{...values,creditsRemaining:typeof values.creditsRemaining==='object'?row.creditsRemaining-1:values.creditsRemaining});return Promise.resolve();}};}};},
 delete(table){return{where(condition){const rows=store(table);for(let i=rows.length-1;i>=0;i--)if(matches(rows[i],condition))rows.splice(i,1);return Promise.resolve();}};}
};
const report={signal:'NO TRADE',symbol:null,timeframe:null,entry:null,stopLoss:null,takeProfit:null,reasoning:'Isolated test report.',limitations:'Fixture only.'};
globalThis.__adminFixture={tables,db,state,report};
const bundle=await build({stdin:{contents:'export { default as router } from "./artifacts/api-server/src/routes/scanner-admin.ts"; export { completeScannerReport } from "./artifacts/api-server/src/lib/scanner-completion.ts";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,banner:{js:'import { createRequire } from "node:module"; const require=createRequire(process.cwd()+"/package.json");'},plugins:[{name:'isolated',setup(b){b.onResolve({filter:/^@workspace\/db$|^drizzle-orm$|scanner-gemini$/},args=>({path:args.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='@workspace/db'?`const f=globalThis.__adminFixture;export const db=f.db;export const {${names.join(',')}}=f.tables;`:args.path==='drizzle-orm'?'export const eq=(column,value)=>({op:"eq",column,value}),gt=(column,value)=>({op:"gt",column,value}),ilike=(column,value)=>({op:"sql",column,value}),and=(...conditions)=>({op:"and",conditions}),or=(...conditions)=>({op:"or",conditions}),desc=c=>c,sql=(strings,...values)=>({op:"sql",strings,values});':`export class ScannerError extends Error {constructor(message,status=503,code="AI_UNAVAILABLE",category="ai",retryable=true){super(message);Object.assign(this,{status,code,category,retryable});}} export const scannerConfiguration=()=>({configured:true});export async function analyseChart(){const f=globalThis.__adminFixture;f.state.calls++;if(f.state.fail)throw new ScannerError("Provider failed");return f.report;}` }));}}]});
const {router,completeScannerReport}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const app=express();app.use(express.json());app.use('/api',router);
const request=(path,method='GET',body,token)=>appRequest(app,'http://localhost/api/superadmin/scanner/'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});

test('scanner management reauthenticates, verifies persisted role/status and rejects ordinary/forged sessions',async()=>{
 assert.equal((await request('users')).status,401);
 assert.equal((await request('users','GET',null,Buffer.from('1:superadmin:fixture').toString('base64'))).status,401);
 assert.equal((await request('session','POST',{email:'admin@fixture.test',password:'wrong'})).status,401);
 assert.equal((await request('session','POST',{email:'mentor@fixture.test',password:'mentor-password'})).status,401);
 const login=await request('session','POST',{email:'admin@fixture.test',password:'admin-password'});assert.equal(login.status,200);const {token}=await login.json();assert.match(token,/^easc_[a-f0-9]{64}$/);assert.notEqual(state.sessions[0].tokenHash,token);
 assert.equal((await request('users','GET',null,token)).status,200);
 assert.equal((await request('readiness','GET',null,token)).status,200);
 state.missing=true;assert.equal((await request('readiness','GET',null,token)).status,503);state.missing=false;
 state.users[0].role='mentor';assert.equal((await request('users','GET',null,token)).status,403);state.users[0].role='superadmin';
 state.users[0].status='suspended';assert.equal((await request('users','GET',null,token)).status,403);state.users[0].status='approved';
 state.sessions[0].expiresAt=new Date(0);assert.equal((await request('users','GET',null,token)).status,401);state.sessions[0].expiresAt=new Date(Date.now()+60_000);
 const grant={status:'active',creditsRemaining:2,expiresAt:'2027-01-01T00:00:00.000Z',reference:'Verified payment fixture',expectedUpdatedAt:null};
 for(const patch of [{creditsRemaining:-1},{creditsRemaining:1.5},{creditsRemaining:'100'},{status:'approved'},{reference:''},{expiresAt:'not a date'},{clientId:1}])assert.equal((await request('users/7','PUT',{...grant,...patch},token)).status,400);
 assert.equal((await request('users/8','PUT',grant,token)).status,409,'unapproved client cannot gain access');
 assert.equal((await request('users/99','PUT',grant,token)).status,404);
 assert.equal((await request('users/7','PUT',grant,token)).status,200);assert.equal(state.entitlements[0].creditsRemaining,2);assert.equal(state.audit.length,1);assert.equal(state.audit[0].actorId,1);
 assert.equal((await request('users/7','PUT',grant,token)).status,409,'stale first-time form cannot replace grant');
 let saved=state.entitlements[0];assert.equal((await request('users/7','PUT',{...grant,status:'revoked',expectedUpdatedAt:saved.updatedAt.toISOString()},token)).status,200);assert.equal(state.entitlements[0].status,'revoked');
 saved=state.entitlements[0];assert.equal((await request('users/7','PUT',{...grant,expectedUpdatedAt:saved.updatedAt.toISOString()},token)).status,200);
 const body=new FormData();body.append('image',new Blob([Buffer.from([255,216,255,0])],{type:'image/jpeg'}),'chart.jpg');body.append('strategy','Auto');
 const adminTest=await appRequest(app,'http://localhost/api/superadmin/scanner/test/chart',{method:'POST',headers:{Authorization:'Bearer '+token},body});assert.equal(adminTest.status,200);assert.equal((await adminTest.json()).executionAvailable,false);assert.equal(state.reports.length,0);assert.equal(state.entitlements[0].creditsRemaining,2);
 assert.equal((await request('session','DELETE',null,token)).status,200);assert.equal((await request('users','GET',null,token)).status,401);
});

test('paid scan completion serializes the final credit and rolls back failed/cancelled/unsaved reports',async()=>{
 state.entitlements=[{clientId:7,status:'active',expiresAt:null,creditsRemaining:1}];state.reports=[];
 let calls=0;const generate=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return report;};
 const results=await Promise.allSettled([completeScannerReport(7,'chart','Auto',generate,new AbortController().signal),completeScannerReport(7,'chart','Auto',generate,new AbortController().signal)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);assert.equal(state.entitlements[0].creditsRemaining,0);assert.equal(state.reports.length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'SCANNER_CREDITS_EXHAUSTED');
 state.entitlements[0].creditsRemaining=1;
 await assert.rejects(completeScannerReport(7,'chart','Auto',async()=>{throw Error('provider failed');},new AbortController().signal));assert.equal(state.entitlements[0].creditsRemaining,1);assert.equal(state.reports.length,1);
 state.failStorage=true;await assert.rejects(completeScannerReport(7,'chart','Auto',async()=>report,new AbortController().signal));assert.equal(state.entitlements[0].creditsRemaining,1);assert.equal(state.reports.length,1);state.failStorage=false;
 const cancelled=new AbortController();cancelled.abort();await assert.rejects(completeScannerReport(7,'chart','Auto',async()=>report,cancelled.signal));assert.equal(state.entitlements[0].creditsRemaining,1);assert.equal(state.reports.length,1);
 state.entitlements[0].status='revoked';await assert.rejects(completeScannerReport(7,'chart','Auto',generate,new AbortController().signal),e=>e.code==='SCANNER_ACCESS_REVOKED');assert.equal(calls,1);
 state.entitlements[0]={clientId:7,status:'active',expiresAt:null,creditsRemaining:null};await completeScannerReport(7,'fundamental',null,generate,new AbortController().signal);assert.equal(state.entitlements[0].creditsRemaining,null);
});

test('real Gemini adapter failures and malformed reports never charge; a validated saved analysis charges once',async()=>{
 const bundled=await build({entryPoints:['artifacts/api-server/src/lib/scanner-gemini.ts'],bundle:true,platform:'node',format:'esm',write:false});
 const {analyseChart}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
 const original={fetch:global.fetch,key:process.env.GEMINI_API_KEY,model:process.env.GEMINI_SCANNER_MODEL};
 state.entitlements=[{clientId:7,status:'active',expiresAt:null,creditsRemaining:1}];state.reports=[];
 const image=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(40)]),signal=new AbortController().signal;
 const analyse=()=>completeScannerReport(7,'chart','Auto',()=>analyseChart(image,'image/jpeg','Auto',signal),signal);
 try{
  process.env.GEMINI_API_KEY='isolated-test-key';process.env.GEMINI_SCANNER_MODEL='gemini-fixture-model';
  for(const status of [400,401,403,404,429,503]){
   global.fetch=async()=>new Response('private provider body',{status});await assert.rejects(analyse(),e=>e.upstreamStatus===status);assert.equal(state.entitlements[0].creditsRemaining,1);assert.equal(state.reports.length,0);
  }
  global.fetch=async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"fake":"unvalidated result"}'}]}}]}));
  await assert.rejects(analyse(),e=>e.code==='AI_INVALID_REPORT');assert.equal(state.entitlements[0].creditsRemaining,1);assert.equal(state.reports.length,0);
  for(const invalid of [report,{error:'UNREADABLE_CHART'}]){global.fetch=async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(invalid)}]}}]}));await assert.rejects(analyse());assert.equal(state.entitlements[0].creditsRemaining,1);assert.equal(state.reports.length,0);}
  global.fetch=async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({...report,...directionalFields,signal:'BUY'})}]}}]}));
  await analyse();assert.equal(state.entitlements[0].creditsRemaining,0);assert.equal(state.reports.length,1);
  state.entitlements[0].creditsRemaining=1;global.fetch=async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({signal:'SELL',reasoning:'A tentative downward bias is visible, without reliable optional trade levels.'})}]}}]}));await analyse();assert.equal(state.entitlements[0].creditsRemaining,0);assert.equal(state.reports.length,2);assert.equal(state.reports[1].report.entry,null);assert.equal(state.reports[1].report.confidence,null);
 }finally{
  global.fetch=original.fetch;
  for(const [name,value] of [['GEMINI_API_KEY',original.key],['GEMINI_SCANNER_MODEL',original.model]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}
 }
});
