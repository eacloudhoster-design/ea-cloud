/** Private host provisioning service. Inactive unless explicitly invoked/configured.
 * No SDK import or terminal creation logic is fabricated: a reviewed host driver is required.
 */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validate(v){
 if(!v||Object.keys(v).sort().join(',')!==['requestId','ownerKind','ownerId','broker','login','server','password','role','accountMode','executionEnabled'].sort().join(',')||!uuid.test(v.requestId)||!['client','mentor'].includes(v.ownerKind)||!Number.isSafeInteger(v.ownerId)||v.ownerId<=0||v.role!==(v.ownerKind==='client'?'client':'mentor')||!['deriv','exness','justmarkets','xm','rcg'].includes(v.broker)||typeof v.login!=='string'||!/^[1-9]\d*$/.test(v.login)||!Number.isSafeInteger(Number(v.login))||typeof v.server!=='string'||!v.server.trim()||v.server.length>256||/[\x00-\x1f\x7f]/.test(v.server)||typeof v.password!=='string'||!v.password||v.password.length>1024||/[\x00-\x1f\x7f]/.test(v.password)||!['demo','live'].includes(v.accountMode)||v.executionEnabled!==false)throw Error('INVALID_REQUEST');
}
function privateDir(root){const s=fs.lstatSync(root);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077))throw Error('PRIVATE_STATE_REQUIRED');}
function write(root,id,value){const target=path.join(root,id+'.json');const fd=fs.openSync(target,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const d=fs.openSync(root,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
function createService({token,root,enabled=false,driver,stops,dispatch,allowLiveReadonly=false,statusToken,statusDriver,dispatchStatus,dispatchStop}){
 if(typeof token!=='string'||!/^[\x21-\x7e]{32,2048}$/.test(token))throw Error('STRONG_TOKEN_REQUIRED');privateDir(root);
 if(statusToken!==undefined&&(typeof statusToken!=='string'||! /^[\x21-\x7e]{32,2048}$/.test(statusToken)||statusToken===token||typeof dispatchStatus!=='function'))throw Error('SEPARATE_STATUS_CREDENTIAL_REQUIRED');
 let busy=false;const statusActive=new Set(),active=new Set();
 return async function handle(req,res){
  const reply=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const statusRoute=req.method==='POST'&&req.url==='/v1/account-status';
  if(statusRoute&&statusToken===undefined)return reply(404,{code:'UNKNOWN_ROUTE'});
  const auth=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+(statusRoute?statusToken:token));
  if(auth.length!==expected.length||!crypto.timingSafeEqual(auth,expected))return reply(401,{code:'AUTH_REQUIRED'});
  if(statusRoute){
   let statusKey;
   try{
    if(req.headers['content-type']!=='application/json')throw Error('INVALID_REQUEST');
    let count=0,chunks=[];for await(const chunk of req){count+=chunk.length;if(count>8192)throw Error('INVALID_REQUEST');chunks.push(chunk);}
    const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!input||Object.keys(input).sort().join(',')!=='login,password,server'||!Number.isSafeInteger(input.login)||input.login<=0||typeof input.server!=='string'||!input.server||input.server.length>256||typeof input.password!=='string'||!input.password||input.password.length>1024)throw Error('INVALID_REQUEST');
    const key=JSON.stringify([input.login,input.server]);if(statusActive.has(key))return reply(503,{code:'STATUS_BUSY'});statusKey=key;statusActive.add(key);return reply(200,await dispatchStatus(statusDriver,input));
   }catch(error){const code=error instanceof Error?error.message:'';return reply(['ACCOUNT_NOT_ASSIGNED','ACCOUNT_PROOF_REJECTED'].includes(code)?403:503,{success:false,code:['ACCOUNT_NOT_ASSIGNED','ACCOUNT_PROOF_REJECTED'].includes(code)?code:'READONLY_STATUS_UNAVAILABLE'});}
   finally{if(statusKey)statusActive.delete(statusKey);}
  }
  const stop=req.method==='POST'&&/^\/v1\/provision\/([0-9a-f-]{36})\/stop$/i.exec(req.url||'');
  if(stop){
   const id=stop[1],intent=path.join(root,id+'.json'),stopped=path.join(root,id+'.stopped.json');
   if(!fs.existsSync(intent))return reply(404,{code:'REQUEST_NOT_FOUND'});
   if(active.has(id))return reply(409,{code:'PROVISIONING_STILL_ACTIVE',executionEnabled:false});
   if(fs.existsSync(stopped))return reply(200,JSON.parse(fs.readFileSync(stopped)));
   if(typeof dispatchStop!=='function')return reply(503,{code:'STOP_REVIEW_REQUIRED'});
   try{await dispatchStop(driver,id);const result={requestId:id,state:'stopped_retained',resourcesDeleted:false,executionEnabled:false};write(root,id+'.stopped',result);return reply(200,result);}
   catch{return reply(409,{requestId:id,code:'STOP_OUTCOME_UNCERTAIN',executionEnabled:false});}
  }
  const lookup=req.method==='GET'&&/^\/v1\/provision\/([0-9a-f-]{36})$/i.exec(req.url||'');
  if(lookup){
   const id=lookup[1],intent=path.join(root,id+'.json'),done=path.join(root,id+'.done.json'),held=path.join(root,id+'.held.json');
   if(!fs.existsSync(intent))return reply(404,{code:'REQUEST_NOT_FOUND'});
   if(fs.existsSync(path.join(root,id+'.stopped.json')))return reply(409,{requestId:id,code:'STOPPED_RETAINED_NO_REPLAY',executionEnabled:false});
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
    if(fs.existsSync(path.join(root,id+'.stopped.json')))throw Error('STOPPED_RETAINED_NO_REPLAY');
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
function dispatchStopDriver(config,id){
 return new Promise((resolve,reject)=>{
  try{
   if(!uuid.test(id)||!config||!path.isAbsolute(config.path)||!config.path.startsWith('/opt/ea-cloud/releases/'))throw Error();
   const meta=fs.lstatSync(config.path);if(!meta.isFile()||meta.isSymbolicLink()||meta.uid!==0||(meta.mode&0o022)||hash(fs.readFileSync(config.path))!==config.sha256)throw Error();
   const child=cp.spawn(config.path,['--stop-retain',id],{stdio:['pipe','ignore','ignore'],shell:false,detached:true,env:{PATH:'/usr/bin:/bin'}});
   const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}reject(Error('STOP_OUTCOME_UNCERTAIN'));},45000);
   child.stdin.end();child.on('error',()=>{clearTimeout(timer);reject(Error('STOP_OUTCOME_UNCERTAIN'));});
   child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('STOP_OUTCOME_UNCERTAIN'));});
  }catch{reject(Error('STOP_REVIEW_REQUIRED'));}
 });
}
function dispatchStatusDriver(config,input){
 return new Promise((resolve,reject)=>{
  try{
   if(!config||!path.isAbsolute(config.path)||!config.path.startsWith('/opt/ea-cloud/releases/'))throw Error('UNREVIEWED_STATUS_DRIVER');
   const meta=fs.lstatSync(config.path);if(!meta.isFile()||meta.isSymbolicLink()||meta.uid!==0||(meta.mode&0o022)||hash(fs.readFileSync(config.path))!==config.sha256)throw Error('UNREVIEWED_STATUS_DRIVER');
   const child=cp.spawn('/opt/ea-cloud/infra/linux/.venv/bin/python',[config.path],{stdio:['pipe','pipe','ignore'],shell:false,detached:true,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}});
   let chunks=[],bytes=0,settled=false;
   const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){try{process.kill(-child.pid,'SIGKILL');}catch{}reject(Error(typeof error==='string'?error:'READONLY_STATUS_UNAVAILABLE'));}else resolve(value);};
   const timer=setTimeout(()=>finish(true),18500);
   child.on('error',()=>finish(true));child.stdin.on('error',()=>{});
   child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>32768)return finish(true);chunks.push(chunk);});
   child.on('close',code=>{if(code!==0)return finish(code===44?'ACCOUNT_NOT_ASSIGNED':code===45?'ACCOUNT_PROOF_REJECTED':true);try{const value=JSON.parse(Buffer.concat(chunks));if(!((value.success===false&&value.code==='NO_DYNAMIC_BINDING')||(value.success===true&&value.financial_routes===false&&['EA_READ_ONLY_STATUS_V1','EA_BOUND_ACCOUNT_STATUS_V1'].includes(value.protocol))))throw Error();finish(false,value);}catch{finish(true);}});
   child.stdin.end(JSON.stringify(input));
  }catch{reject(Error('READONLY_STATUS_UNAVAILABLE'));}
 });
}

function main(){
 if(process.env.MT5_PRIVATE_PROVISIONER_ENABLED!=='1')throw Error('DISABLED_BY_DEFAULT');
 const config=JSON.parse(fs.readFileSync(process.env.MT5_PRIVATE_PROVISIONER_CONFIG,'utf8'));
 const tokenFile=fs.lstatSync(config.tokenFile);if(tokenFile.isSymbolicLink()||tokenFile.uid!==0||(tokenFile.mode&0o077))throw Error('PRIVATE_TOKEN_REQUIRED');
 if(config.statusTokenFile!==undefined){const meta=fs.lstatSync(config.statusTokenFile);if(!meta.isFile()||meta.isSymbolicLink()||meta.uid!==0||(meta.mode&0o077))throw Error('PRIVATE_STATUS_CREDENTIAL_REQUIRED');config.statusToken=fs.readFileSync(config.statusTokenFile,'utf8').trim();}
 const server=http.createServer(createService({...config,enabled:true,token:fs.readFileSync(config.tokenFile,'utf8').trim(),dispatch:dispatchDriver,dispatchStatus:dispatchStatusDriver,dispatchStop:dispatchStopDriver}));
 server.requestTimeout=5000;server.headersTimeout=5000;server.maxRequestsPerSocket=1;
 if(!Number.isInteger(config.port)||config.port<10000||config.port>11000)throw Error('PRIVATE_PORT_REQUIRED');
 server.listen(config.port,'127.0.0.1');
}
module.exports={createService,validate,dispatchDriver,dispatchStatusDriver,dispatchStopDriver};if(require.main===module)main();
