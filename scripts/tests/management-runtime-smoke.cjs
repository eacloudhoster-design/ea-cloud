// Starts only the compiled management entry in a temporary cwd on loopback.
// Database URL is deliberately unusable; startup must perform no migration/maintenance.
const cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),net=require('node:net');
const root=process.env.EA_RELEASE_ROOT||path.resolve(__dirname,'../..');
async function main(){
 const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'ea-management-smoke-'));
 const child=cp.spawn(process.execPath,[path.join(root,'artifacts/api-server/management-start.mjs')],{cwd,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,NODE_ENV:'production',PORT:String(port),API_LISTEN_HOST:'127.0.0.1',DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic?connect_timeout=1',SESSION_SECRET:'SYNTHETIC_MANAGEMENT_SMOKE_SECRET_ONLY',MT5_SELF_SERVICE_PROVISIONING:'0',MT5_PROVISIONING_CONSUMER:'0'}});
 let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
 try{
  const origin='http://127.0.0.1:'+port;let response;
  for(let i=0;i<50;i++){if(child.exitCode!==null)throw Error('Compiled management startup failed: '+output.slice(-1000));try{response=await fetch(origin+'/api/healthz');if(response.ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(response?.status,200);assert.equal((await fetch(origin+'/api/app/mt5-accounts')).status,401);assert.equal((await fetch(origin+'/api/admin/mt5-accounts')).status,401);assert.equal((await fetch(origin+'/api/admin/copier/download',{headers:{Authorization:'Bearer '+Buffer.from('7:mentor').toString('base64')}})).status,401);
  await new Promise(resolve=>setTimeout(resolve,1000));assert(output.includes('Account management runtime; signal execution and startup maintenance disabled'));assert(!output.includes('Startup task failed'));assert(!output.includes('Startup reconciliation failed'));
  console.log('PASS compiled full-app management runtime: liveness, anonymous client/mentor denial, forged copier bearer denial, no migration/maintenance or execution startup; no working database or broker configured');
 }finally{child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(()=>{child.kill('SIGKILL');resolve();},5000))]);}
}
main().catch(e=>{console.error(e);process.exitCode=1});
