const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ts=require('typescript');
function load(path,deps){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>deps[n],process:{env:{SESSION_SECRET:'offline-fixture-secret-only-123456789',MT5_SELF_SERVICE_PROVISIONING:'1'}},AbortController,setTimeout,clearTimeout});return exports;}
let assertions=0;const check=fn=>{fn();assertions++};
const lib=load('artifacts/api-server/src/lib/mt5-provisioning.ts',{'node:crypto':crypto,'@workspace/db':{pool:{}},'./mt5-crypto':{}});
const body={requestKey:crypto.randomUUID(),broker:'justmarkets',login:'123',server:'DemoFixture',password:'NOT_REAL',accountRole:'follower',accountMode:'demo'};
check(()=>assert.throws(()=>lib.validateProvisioning(body,{kind:'client',id:7}),/OWNERSHIP_CONFIRMATION_REQUIRED/));
check(()=>assert.equal(lib.validateProvisioning({...body,ownershipConfirmed:true},{kind:'client',id:7}).accountRole,'follower'));
check(()=>assert.throws(()=>lib.validateProvisioning({...body,ownershipConfirmed:true,accountRole:'master'},{kind:'client',id:7}),/ACCOUNT_ROLE_NOT_AUTHORIZED/));
let reads=0,calls=[],changesOwner=true;
const job={id:crypto.randomUUID(),owner_kind:'client',owner_id:7,account_role:'follower',login:'123',server:'DemoFixture',broker:'justmarkets',encrypted_password:'ENCRYPTED_FIXTURE'};
const pool={connect:async()=>({release(){},query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.startsWith('SELECT * FROM mt5_provisioning_requests')?[job]:[]}}}),query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.startsWith('SELECT * FROM app_access')?[{id:7,status:'active',mentor_id:++reads>1&&changesOwner?99:3}]:[]}}};
const consumer=load('artifacts/api-server/src/lib/mt5-provisioning-consumer.ts',{'@workspace/db':{pool},'./app-session-access':{resolveAppSessionAccess:async()=>({mentorId:3})},'./mt5-crypto':{decryptMT5Password:()=> 'PASSWORD_FIXTURE_NOT_REAL'},'./mt5-account-status':{readBoundAccount:async()=>({account_mode:'demo',broker:'justmarkets',role:'client',execution_enabled:false,read_only:true})}});
(async()=>{
 const result=await consumer.processNextProvisioning({provisionDedicatedWorker:async()=>{}});
 check(()=>assert.equal(result.state,'review_required'));
 check(()=>assert(calls.some(c=>c.sql.includes("'review_required' FROM changed"))));
 check(()=>assert(calls.some(c=>c.sql.includes("VALUES($1,'provisioning')"))));
 check(()=>assert(!JSON.stringify(calls).includes('PASSWORD_FIXTURE_NOT_REAL')));
 changesOwner=false;reads=0;calls=[];
 const success=await consumer.processNextProvisioning({provisionDedicatedWorker:async()=>{}});
 check(()=>assert.equal(success.state,'awaiting_verification'));
 check(()=>assert(calls.some(c=>c.sql.includes("'awaiting_verification' FROM changed"))));
 check(()=>assert(calls.filter(c=>c.sql.startsWith('SELECT * FROM app_access')).length===2));
 console.log('PASS',assertions,'new hardening assertions; no database, broker or external calls');
})().catch(e=>{console.error(e);process.exitCode=1});
