const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript');
function load(path,deps,extra={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(!(n in deps))throw Error(n);return deps[n]},Buffer,URL,AbortSignal,...extra});return exports;}
let principal=null,origin=true,queries=0;
const chain={from(){return this},where(){return this},limit:async()=>{queries++;return [{id:7}]}};
const session=load('artifacts/api-server/src/middlewares/app-session.ts',{
 '../lib/browser-session':{verifyBrowserSession:async()=>principal,trustedBrowserOrigin:()=>origin},
 '../lib/session-diagnostics':{reportSessionFailure:()=>{throw Error('unexpected failure')}},
 '@workspace/db':{db:{select:()=>chain},appAccessTable:{id:'id'}},'drizzle-orm':{eq:()=>true},
 '../lib/app-session-access':{resolveAppSessionAccess:async()=>({mentorId:3})}});
function req(method='GET'){return {method,headers:{authorization:'Bearer '+Buffer.from('7:client').toString('base64')},log:{warn(){}}}}
async function auth(request){let status=200,next=false;const res={setHeader(){},status(n){status=n;return this},json(){}};await session.requireAppSession(request,res,()=>next=true);return {status,next,request};}
(async()=>{
 assert.equal((await auth(req())).status,401);assert.equal(queries,0);
 principal={id:7};let result=await auth(req());assert.equal(result.next,true);assert.equal(result.request.clientId,7);
 origin=false;assert.equal((await auth(req('POST'))).status,403);origin=true;
 const endpoint='artifacts/api-server/src/lib/mt5-endpoint.ts';
 const e=load(endpoint,{}, {process:{env:{MT5_VPS_TOKEN:'x'.repeat(40)}}});assert.equal(e.MT5_VPS_BASE,'http://127.0.0.1:8005');assert.equal(e.mt5Headers().Authorization,'Bearer '+'x'.repeat(40));
 for(const url of ['http://public.example','https://u:p@example.test','https://example.test/path'])assert.throws(()=>load(endpoint,{}, {process:{env:{MT5_VPS_URL:url}}}));
 const missing=load(endpoint,{}, {process:{env:{MT5_VPS_URL:'https://private.example'}}});assert.throws(()=>missing.mt5Headers());
 const paired=load(endpoint,{}, {process:{env:{MT5_VPS_TOKEN:'x'.repeat(40),MT5_VPS_URL:'https://private.example',MT5_ACCESS_REQUIRED:'1',MT5_ACCESS_CLIENT_ID:'id'}}});assert.throws(()=>paired.mt5Headers());
 let sent;const transport=load('artifacts/api-server/src/lib/mt5-account-status.ts',{'./mt5-endpoint':{MT5_VPS_BASE:'https://private.example',mt5Headers:()=>({'Authorization':'Bearer fixture'})}}, {fetch:async(url,init)=>{sent={url,init};return {ok:true,json:async()=>({success:true,connected:true,simulation:false,account_mode:'demo',login:123,server:'Fixture',broker:'justmarkets',role:'client',read_only:true,protocol:'EA_READ_ONLY_STATUS_V1',financial_routes:false,execution_enabled:false,journal_bound:false,journal_holds:null,emergency_stop_active:null,open_positions:0,pending_orders:0,password:'NEVER_RETURN'})}}});
 const proof=await transport.readBoundAccount(123,'Fixture','FIXTURE_ONLY');assert.equal(proof.connected,true);assert.equal(proof.read_only,true);assert.equal(sent.init.redirect,'error');assert.equal(sent.init.headers.Authorization,'Bearer fixture');assert.equal(proof.password,undefined);
 console.log('PASS: forged bearer denial, cookie principal, origin denial, authenticated private endpoint validation, status projection');
})().catch(e=>{console.error(e);process.exitCode=1});
