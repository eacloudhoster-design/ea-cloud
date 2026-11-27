const {createService}=require('./infra/provisioning/private-service.cjs');
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{Readable}=require('stream');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ea-private-status-'));fs.chmodSync(root,0o700);
const token='P'.repeat(48),statusToken='S'.repeat(48);let reads=0,provisions=0;
function invoke(handler,url,auth,body){return new Promise((resolve,reject)=>{const req=Readable.from([Buffer.from(JSON.stringify(body))]);req.method='POST';req.url=url;req.headers={authorization:'Bearer '+auth,'content-type':'application/json'};let code;handler(req,{writeHead:c=>code=c,end:data=>resolve({code,body:JSON.parse(data)})}).catch(reject);});}
(async()=>{try{
 const handler=createService({root,token,statusToken,enabled:true,dispatch:async()=>provisions++,dispatchStatus:async(_config,input)=>{reads++;assert.equal(input.login,123);return {success:true,read_only:true,execution_enabled:false,owner_kind:'mentor',owner_id:1};}});
 const body={login:123,server:'Fixture',password:'FIXTURE_ONLY'};
 assert.equal((await invoke(handler,'/v1/account-status',statusToken,body)).code,200);
 assert.equal((await invoke(handler,'/v1/account-status',token,body)).code,401);
 assert.equal((await invoke(handler,'/v1/provision',statusToken,body)).code,401);
 assert.equal((await invoke(handler,'/v1/account-status',statusToken,{...body,command:'shell'})).code,503);
 assert.equal(reads,1);assert.equal(provisions,0);assert.deepEqual(fs.readdirSync(root),[]);
 for(const code of ['ACCOUNT_NOT_ASSIGNED','ACCOUNT_PROOF_REJECTED','SENSITIVE_VENDOR_DETAIL']){const failed=createService({root,token,statusToken,dispatchStatus:async()=>{throw Error(code);}});const response=await invoke(failed,'/v1/account-status',statusToken,body);assert.equal(response.code,code==='SENSITIVE_VENDOR_DETAIL'?503:403);assert.equal(response.body.code,code==='SENSITIVE_VENDOR_DETAIL'?'READONLY_STATUS_UNAVAILABLE':code);}
 assert.throws(()=>createService({root,token,statusToken:token,dispatchStatus:async()=>{}}));
 console.log('PASS status-only token cannot provision, provisioning token cannot read-status, request schema/defaults and no credential persistence; injected helpers only');
}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
