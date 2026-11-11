const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,deps,globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(!(n in deps))throw Error(n);return deps[n]},URL,AbortSignal,process:{env:{}},...globals});return exports;}
const env={};let data={success:true,connected:true,simulation:false,account_mode:'live',login:123,server:'Fixture',broker:'justmarkets',role:'client',read_only:true,protocol:'EA_READ_ONLY_STATUS_V1',financial_routes:false,execution_enabled:false,journal_bound:false,journal_holds:null,emergency_stop_active:null,open_positions:0,pending_orders:0,password:'MUST_NOT_RETURN'};
const transport=load('artifacts/api-server/src/lib/mt5-account-status.ts',{'./mt5-endpoint':{MT5_VPS_BASE:'https://fixture.invalid',mt5Headers:()=>({})}},{process:{env},fetch:async()=>({ok:true,json:async()=>data})});
(async()=>{
 await assert.rejects(()=>transport.readBoundAccount(123,'Fixture','SYNTHETIC'));
 env.MT5_LIVE_READONLY_ACCOUNTS='1';const live=await transport.readBoundAccount(123,'Fixture','SYNTHETIC');assert.equal(live.account_mode,'live');assert.equal(live.execution_enabled,false);assert.equal(live.password,undefined);
 for(const [key,value] of [['execution_enabled',true],['account_mode','unknown'],['simulation',true],['login',124],['financial_routes',true],['journal_bound',true]]){const old=data[key];data[key]=value;await assert.rejects(()=>transport.readBoundAccount(123,'Fixture','SYNTHETIC'));data[key]=old;}
 data={...data,owner_kind:'client',owner_id:7};
 await assert.rejects(()=>transport.readBoundAccount(123,'Fixture','SYNTHETIC'));
 await assert.rejects(()=>transport.readBoundAccount(123,'Fixture','SYNTHETIC',{kind:'client',id:8}));
 await assert.rejects(()=>transport.readBoundAccount(123,'Fixture','SYNTHETIC',{kind:'mentor',id:7}));
 assert.equal((await transport.readBoundAccount(123,'Fixture','SYNTHETIC',{kind:'client',id:7})).owner.id,7);
 const worker=load('artifacts/api-server/src/lib/copy-engine.ts',{'./copy-policy':{},'./observer-execution':{},'./observer-vps':{},'./trading-activity':{},'@workspace/db':{db:{select(){throw Error('Must not touch DB or dispatch')}}},'drizzle-orm':{},'./mt5-crypto':{},'./mt5-vps':{},'../ws':{}},{process:{env:{EA_MT5_MANAGEMENT_ONLY:'1'}}});
 assert.equal((await worker.runSignal({},{})).attempted,0);
 let exported=false;
 const auth=load('artifacts/api-server/src/middlewares/auth.ts',{'@workspace/db':{},'drizzle-orm':{}});
 const routes=[];load('artifacts/api-server/src/routes/copier.ts',{'../middlewares/auth':auth,fflate:{},'../lib/ea-builder/contracts':{},express:{Router:()=>({get:(path,...handlers)=>routes.push({path,handlers})})},'@workspace/db':{db:{select(){exported=true;throw Error('No credential lookup allowed')}}},'drizzle-orm':{},'../lib/api-key':{}});
 const route=routes.find(r=>r.path==='/admin/copier/download');assert(route);let denied=0;await route.handlers[0]({headers:{authorization:'Bearer '+Buffer.from('7:mentor').toString('base64')}},{status(n){denied=n;return this},json(){}},()=>{throw Error('Forged principal admitted')});assert.equal(denied,401);assert.equal(exported,false);
 const deniedDeps={'./mt5-endpoint':{MT5_VPS_BASE:'https://fixture.invalid',mt5Headers:()=>({})}};
 const management={process:{env:{EA_MT5_MANAGEMENT_ONLY:'1'}},fetch:()=>{throw Error('Execution attempted network I/O')}};
 const legacy=load('artifacts/api-server/src/lib/mt5-vps.ts',deniedDeps,management);
 for(const name of ['executeTradeOnVps','closeTradeOnVps','modifyTradeOnVps']){const result=await legacy[name]({},{});assert.equal(result.ok,false);assert.equal(result.attempts,1);assert.equal(result.retriable,false);}
 const observer=load('artifacts/api-server/src/lib/observer-vps.ts',{},management);assert.equal((await observer.syncObserverPosition({})).ok,false);assert.equal((await observer.syncObserverPosition({})).retriable,false);await assert.rejects(()=>observer.observerCapabilities());
 const forbidden=()=>{throw Error('Management startup performed maintenance or started execution')};
 const processStub={env:{EA_MT5_MANAGEMENT_ONLY:'1',PORT:'9999'},once(){},on(){}};
 load('artifacts/api-server/src/index.ts',{'./lib/mt5-provisioning-runtime':{startProvisioningConsumer:()=>()=>{}},'./lib/web-push':{startPushWorker:forbidden},http:{default:{createServer:()=>({listen:(_opts,ready)=>ready()})}},'./app':{default:{}},'./ws':{createWsServer:()=>({})},'./lib/logger':{logger:{info(){}}},'@workspace/db':{db:{select:forbidden},pool:{}},'./lib/backend-lifecycle':{startBackendDiagnostics:()=>()=>{}},'./lib/shutdown':{createShutdown:()=>()=>{}},'./lib/api-key':{backfillApiKeys:forbidden,backfillEncryptedKeys:forbidden},'./routes/mt5-validation':{expireStaleAccounts:forbidden},'./lib/signal-worker':{startWorker:forbidden,reconcileOnStartup:forbidden}},{process:processStub});
 console.log('PASS live-read-only default denial and proof projection, management execution/startup denial, forged-bearer credential-export denial');
})().catch(e=>{console.error(e);process.exitCode=1});
