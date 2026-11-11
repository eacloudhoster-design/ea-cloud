/** Private host provisioning service. Inactive unless explicitly invoked/configured.
 * No SDK import or terminal creation logic is fabricated: a reviewed host driver is required.
 */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validate(v){
 if(!v||Object.keys(v).sort().join(',')!==['requestId','ownerKind','ownerId','broker','login','server','password','role','accountMode','executionEnabled'].sort().join(',')||!uuid.test(v.requestId)||!['client','mentor'].includes(v.ownerKind)||!Number.isSafeInteger(v.ownerId)||v.ownerId<=0||v.role!==(v.ownerKind==='client'?'client':'mentor')||!['deriv','exness','justmarkets','xm','rcg'].includes(v.broker)||typeof v.login!=='string'||!/^[1-9]\d*$/.test(v.login)||!Number.isSafeInteger(Number(v.login))||typeof v.server!=='string'||!v.server.trim()||v.server.length>256||/[\x00-\x1f\x7f]/.test(v.server)||typeof v.password!=='string'||!v.password||v.password.length>1024||!['demo','live'].includes(v.accountMode)||v.executionEnabled!==false)throw Error('INVALID_REQUEST');
}
function privateDir(root){const s=fs.lstatSync(root);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077))throw Error('PRIVATE_STATE_REQUIRED');}
function write(root,id,value){const target=path.join(root,id+'.json');const fd=fs.openSync(target,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const d=fs.openSync(root,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
function createService({token,root,enabled=false,driver,stops,dispatch,allowLiveReadonly=false}){
 if(typeof token!=='string'||!/^[\x21-\x7e]{32,2048}$/.test(token))throw Error('STRONG_TOKEN_REQUIRED');privateDir(root);
 let busy=false;const active=new Set();
 return async function handle(req,res){
  const reply=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const auth=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+token);
  if(auth.length!==expected.length||!crypto.timingSafeEqual(auth,expected))return reply(401,{code:'AUTH_REQUIRED'});
  const lookup=req.method==='GET'&&/^\/v1\/provision\/([0-9a-f-]{36})$/i.exec(req.url||'');
  if(lookup){
   const id=lookup[1],intent=path.join(root,id+'.json'),done=path.join(root,id+'.done.json'),held=path.join(root,id+'.held.json');
   if(!fs.existsSync(intent))return reply(404,{code:'REQUEST_NOT_FOUND'});
   if(fs.existsSync(done))return reply(200,JSON.parse(fs.readFileSync(done)));
   if(fs.existsSync(held)||!active.has(id))return reply(409,{requestId:id,code:'UNCERTAIN_NO_RETRY',executionEnabled:false});
   const old=JSON.parse(fs.readFileSync(intent));return reply(202,{requestId:id,state:'provisioning',accountMode:old.accountMode,executionEnabled:false});
  }
  if(req.method!=='POST'||req.url!=='/v1/provision')return reply(404,{code:'UNKNOWN_ROUTE'});
  if(!enabled)return reply(503,{code:'PROVISIONING_DISABLED',executionEnabled:false});
  if(busy)return reply(409,{code:'PROVISIONER_BUSY'});
  busy=true;let id;
  try{
   if(req.headers['content-type']!=='application/json')throw Error('INVALID_REQUEST');
   let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)throw Error('INVALID_REQUEST');chunks.push(chunk);}
   const v=JSON.parse(Buffer.concat(chunks).toString('utf8'));validate(v);if(v.accountMode==='live'&&allowLiveReadonly!==true)throw Error('LIVE_READONLY_NOT_APPROVED');id=v.requestId;
   if(!Array.isArray(stops)||stops.length!==2||!stops.every(p=>fs.lstatSync(p).isFile()))throw Error('STOPS_REQUIRED');
   // HMAC binds credential changes without storing a reversible password or unsalted hash.
   const binding=crypto.createHmac('sha256',token).update(JSON.stringify(v)).digest('hex');
   const intentPath=path.join(root,id+'.json');
   if(fs.existsSync(intentPath)){
    const old=JSON.parse(fs.readFileSync(intentPath));
    if(old.binding!==binding)throw Error('IDEMPOTENCY_CONFLICT');
    const done=path.join(root,id+'.done.json');
    if(fs.existsSync(done))return reply(200,JSON.parse(fs.readFileSync(done)));
    return reply(409,{requestId:id,code:'UNCERTAIN_NO_RETRY',executionEnabled:false});
   }
   write(root,id,{binding,state:'reserved',observedAt:new Date().toISOString(),ownerKind:v.ownerKind,ownerId:v.ownerId,accountMode:v.accountMode});
   // Exactly one reviewed driver invocation. No path/command from request.
   active.add(id);
   // Accepted intents run independently of the HTTP connection. Credentials stay
   // in memory/stdin only. A restart never reconstructs or retries a claimed job.
   const requestId=id;
   void Promise.resolve().then(()=>dispatch(driver,v)).then(()=>{
    const result={requestId,state:'worker_prepared',accountMode:v.accountMode,executionEnabled:false};write(root,requestId+'.done',result);
   }).catch(()=>{try{write(root,requestId+'.held',{requestId,code:'UNCERTAIN_NO_RETRY',executionEnabled:false});}catch{}}).finally(()=>{active.delete(requestId);busy=false;});
   reply(202,{requestId,state:'provisioning',accountMode:v.accountMode,executionEnabled:false});
  }catch{reply(409,{...(id?{requestId:id}:{}),code:'PROVISIONING_REVIEW_REQUIRED',executionEnabled:false});}
  finally{if(!id||!active.has(id))busy=false;}
 };
}
function dispatchDriver(config,input){
 return new Promise((resolve,reject)=>{
  try{
   if(!config||!path.isAbsolute(config.path)||!config.path.startsWith('/opt/ea-cloud/releases/'))throw Error('UNREVIEWED_DRIVER');
   const stat=fs.lstatSync(config.path);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o022)||hash(fs.readFileSync(config.path))!==config.sha256)throw Error('UNREVIEWED_DRIVER');
   const child=cp.spawn(config.path,[],{stdio:['pipe','ignore','ignore'],shell:false,detached:true,env:{PATH:'/usr/bin:/bin'}});
   const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}};
   let timedOut=false;
   const stopRetain=()=>{
    // Fixed reviewed driver, request UUID only; no secret enters argv. Best effort
    // bounded cleanup, never a retry of provisioning or order submission.
    const cleaner=cp.spawn(config.path,['--stop-retain',input.requestId],{stdio:['pipe','ignore','ignore'],shell:false,detached:true,env:{PATH:'/usr/bin:/bin'}});
    const limit=setTimeout(()=>{try{process.kill(-cleaner.pid,'SIGKILL');}catch{}reject(Error('CLEANUP_UNCERTAIN'));},45000);
    cleaner.on('error',()=>{clearTimeout(limit);reject(Error('CLEANUP_UNCERTAIN'));});
    cleaner.on('exit',()=>{clearTimeout(limit);reject(Error('UNCERTAIN'));});
    cleaner.stdin.on('error',()=>{});cleaner.stdin.end();
   };
   const timer=setTimeout(()=>{timedOut=true;kill();stopRetain();},360000);
   child.on('error',()=>{clearTimeout(timer);reject(Error('UNCERTAIN'));});child.stdin.on('error',()=>{});
   child.on('exit',code=>{clearTimeout(timer);if(timedOut)return;if(code===0)resolve();else reject(Error('UNCERTAIN'));});
   child.stdin.end(JSON.stringify(input));
  }catch{reject(Error('DRIVER_UNAVAILABLE'));}
 });
}
function main(){
 if(process.env.MT5_PRIVATE_PROVISIONER_ENABLED!=='1')throw Error('DISABLED_BY_DEFAULT');
 const config=JSON.parse(fs.readFileSync(process.env.MT5_PRIVATE_PROVISIONER_CONFIG,'utf8'));
 const tokenFile=fs.lstatSync(config.tokenFile);if(tokenFile.isSymbolicLink()||tokenFile.uid!==0||(tokenFile.mode&0o077))throw Error('PRIVATE_TOKEN_REQUIRED');
 const server=http.createServer(createService({...config,enabled:true,token:fs.readFileSync(config.tokenFile,'utf8').trim(),dispatch:dispatchDriver}));
 server.requestTimeout=5000;server.headersTimeout=5000;server.maxRequestsPerSocket=1;
 if(!Number.isInteger(config.port)||config.port<10000||config.port>11000)throw Error('PRIVATE_PORT_REQUIRED');
 server.listen(config.port,'127.0.0.1');
}
module.exports={createService,validate,dispatchDriver};if(require.main===module)main();
