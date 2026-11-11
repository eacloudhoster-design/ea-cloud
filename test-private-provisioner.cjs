const {createService,validate}=require('./infra/provisioning/private-service.cjs');
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{Readable}=require('stream'),crypto=require('crypto');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ea-provision-service-'));fs.chmodSync(root,0o700);
const stops=[path.join(root,'OPEN.STOP'),path.join(root,'CLEANUP.STOP')];stops.forEach(p=>fs.writeFileSync(p,'test'));
const token='F'.repeat(48);let sends=0,fail=false,checks=0;
const v={requestId:crypto.randomUUID(),ownerKind:'client',ownerId:7,broker:'justmarkets',login:'123',server:'FixtureDemo',password:'FIXTURE_PASSWORD_ONLY',role:'client',accountMode:'demo',executionEnabled:false};
function invoke(handler,body=v,auth='Bearer '+token){return new Promise((resolve,reject)=>{const req=Readable.from([Buffer.from(JSON.stringify(body))]);req.method='POST';req.url='/v1/provision';req.headers={authorization:auth,'content-type':'application/json'};let code;handler(req,{writeHead:c=>code=c,end:data=>resolve({code,body:JSON.parse(data)})}).catch(reject);});}
const dispatch=async()=>{sends++;if(fail)throw Error('SECRET_VENDOR_DETAIL')};
(async()=>{try{
 const service=createService({token,root,enabled:true,stops,driver:{},dispatch});
 assert.equal((await invoke(service,v,'Bearer wrong')).code,401);checks++;
 const disabled=createService({token,root,stops,driver:{},dispatch});assert.equal((await invoke(disabled)).code,503);checks++;
 assert.equal((await invoke(service)).body.state,'worker_prepared');checks++;
 assert.equal((await invoke(service)).body.state,'worker_prepared');assert.equal(sends,1);checks++;
 assert.equal((await invoke(service,{...v,password:'changed'})).code,409);checks++;
 for(const p of fs.readdirSync(root).filter(n=>n.endsWith('.json')))assert(!fs.readFileSync(path.join(root,p),'utf8').includes(v.password));checks++;
 const uncertain={...v,requestId:crypto.randomUUID()};fail=true;assert.equal((await invoke(service,uncertain)).code,409);checks++;
 fail=false;assert.equal((await invoke(service,uncertain)).body.code,'UNCERTAIN_NO_RETRY');assert.equal(sends,2);checks++;
 fs.unlinkSync(stops[0]);assert.equal((await invoke(service,{...v,requestId:crypto.randomUUID()})).code,409);checks++;
 assert.equal((await invoke(service,{...v,requestId:crypto.randomUUID(),accountMode:'live'})).code,409);checks++;
 assert.throws(()=>validate({...v,ownerKind:'mentor'}));checks++;
 assert.throws(()=>validate({...v,command:'shell'}));checks++;
 console.log('PASS',checks,'private service assertions; injected driver only, no listeners/processes/brokers');
 }finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
