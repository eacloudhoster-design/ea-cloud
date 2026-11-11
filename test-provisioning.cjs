const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ts=require('typescript');
let checks=0;function ok(fn){fn();checks++}
function load(path,deps,extra={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(!(n in deps))throw Error(n);return deps[n]},process:{env:{SESSION_SECRET:'fixture-test-key-only-32-characters',MT5_SELF_SERVICE_PROVISIONING:'1'}},AbortController,setTimeout,clearTimeout,...extra});return exports;}
const calls=[];let existing=null,inserted=null;
const db={release(){},async query(sql,args){calls.push({sql,args});if(sql.startsWith('SELECT *'))return {rows:existing?[existing]:[]};if(sql.includes('count(*)'))return {rows:[{count:0}]};if(sql.startsWith('INSERT INTO mt5_provisioning_requests')){inserted={id:args[0],owner_kind:args[1],owner_id:args[2],request_key:args[3],request_hash:args[4],broker:args[5],login:args[6],server:args[7],account_role:args[8],encrypted_password:args[9],state:'queued'};return {rows:[inserted]}}return {rows:[],rowCount:0}}};
const m=load('artifacts/api-server/src/lib/mt5-provisioning.ts',{'node:crypto':crypto,'@workspace/db':{pool:{connect:async()=>db,query:db.query.bind(db)}},'./mt5-crypto':{encryptMT5Password:p=>'ENCRYPTED_FIXTURE'}});
const body={requestKey:crypto.randomUUID(),broker:'justmarkets',login:'123',server:'FixtureDemo',password:'DO_NOT_RETURN',accountRole:'follower',accountMode:'demo',ownershipConfirmed:true},owner={kind:'client',id:7};
(async()=>{
 ok(()=>assert.equal(m.validateProvisioning(body,owner).accountRole,'follower'));
 for(const [k,v] of [['accountRole','master'],['accountMode','live'],['broker','invented'],['login','9007199254740993'],['password',''],['server','Fixture\n'],['requestKey','invalid'],['ownerId',999]])ok(()=>assert.throws(()=>m.validateProvisioning({...body,[k]:v},owner)));
 ok(()=>assert.equal(m.validateProvisioning({...body,accountRole:'master'},{kind:'mentor',id:8}).accountRole,'master'));
 const publicJob=await m.queueProvisioning(body,owner);ok(()=>assert.equal(publicJob.state,'queued'));ok(()=>assert.equal(publicJob.connected,false));ok(()=>assert.equal(inserted.encrypted_password,'ENCRYPTED_FIXTURE'));ok(()=>assert(!JSON.stringify(publicJob).includes('DO_NOT_RETURN')));ok(()=>assert(!JSON.stringify(calls).includes('DO_NOT_RETURN')));
 existing=inserted;await m.queueProvisioning(body,owner);checks++;
 await assert.rejects(()=>m.queueProvisioning({...body,password:'changed'},owner));checks++;
 ok(()=>assert.equal(m.publicProvisioning({...inserted,error_code:'RAW_PASSWORD',state:'awaiting_verification'}).errorCode,'PROVISIONING_REVIEW_REQUIRED'));
 ok(()=>assert(m.publicProvisioning({...inserted,state:'awaiting_verification'}).requiresConnectionVerification));
 const consumerCalls=[];
 const job={...inserted,encrypted_password:'ENCRYPTED_FIXTURE'};
 const pool={connect:async()=>({release(){},query:async(sql,args)=>({rows:sql.startsWith('SELECT *')?[job]:[]})}),query:async(sql,args)=>{consumerCalls.push({sql,args});return {rows:sql.startsWith('SELECT * FROM app_access')?[{id:7}]:[]}}};
 let proof={account_mode:'demo',broker:'justmarkets',role:'client',execution_enabled:false,read_only:true};
 const consumer=load('artifacts/api-server/src/lib/mt5-provisioning-consumer.ts',{'@workspace/db':{pool},'./app-session-access':{resolveAppSessionAccess:async()=>({mentorId:3})},'./mt5-crypto':{decryptMT5Password:()=> 'DECRYPTED_FIXTURE'},'./mt5-account-status':{readBoundAccount:async()=>proof}});
 const port={provisionDedicatedWorker:async input=>{assert.equal(input.ownerId,7);assert.equal(input.role,'client');assert.equal(input.executionEnabled,false);assert.equal(input.password,'DECRYPTED_FIXTURE')}};
 const success=await consumer.processNextProvisioning(port);ok(()=>assert.equal(success.state,'awaiting_verification'));ok(()=>assert(consumerCalls.some(x=>x.sql.includes('encrypted_password=NULL'))));
 proof={...proof,role:'mentor'};const held=await consumer.processNextProvisioning(port);ok(()=>assert.equal(held.state,'review_required'));
 const thrown=await consumer.processNextProvisioning({provisionDedicatedWorker:async()=>{throw Error('SECRET_VENDOR_ERROR')}});ok(()=>assert.equal(thrown.state,'review_required'));ok(()=>assert(!JSON.stringify(consumerCalls).includes('SECRET_VENDOR_ERROR')));
 await m.cancelProvisioning(owner,crypto.randomUUID());ok(()=>assert(calls.some(x=>x.sql.includes("state='queued'")&&x.sql.includes('owner_kind=$2')&&x.args[1]==='client'&&x.args[2]===7)));
 console.log('PASS',checks,'new provisioning assertions; mocked SQL/worker/SDK proof, no external calls');
})().catch(e=>{console.error(e);process.exitCode=1});
