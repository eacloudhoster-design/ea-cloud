import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {spawn} from 'node:child_process';import {once} from 'node:events';
import https from 'node:https';import {execFileSync} from 'node:child_process';import {checkMt5Transport} from '../check-mt5-status-transport.mjs';
import {mkdtemp,rm,readFile,symlink,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {randomBytes} from 'node:crypto';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';import {sessionFixture} from './helpers/browser-session-fixture.mjs';
test('actual non-trading release talks to unchanged Person 1 relay over HTTP and preserves PostgreSQL sessions through process restart',{skip:!process.env.EA_TEST_PG_URL,timeout:60000},async()=>{
 const secret=randomBytes(32).toString('hex');process.env.SESSION_SECRET=secret;
 const f=await sessionFixture(),dir=await mkdtemp(join(tmpdir(),'ea-engine-contract-'));const servers=[];let relay,runtime;let probes=0;
 const stop=async child=>{if(child?.exitCode===null){const exit=once(child,'exit');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),5000);await exit;clearTimeout(timer);}};
 try{
  const schema=globalThis.__sessionSchema,{getTableConfig}=await import('../../lib/db/node_modules/drizzle-orm/pg-core/index.js');
  for(const key of ['clientSettingsTable','mt5ConnectionsTable','tradeExecutionsTable','observerAllocationsTable']){const c=getTableConfig(schema[key]);await f.engine.exec(`CREATE TABLE "${c.name}" (${c.columns.map(x=>`"${x.name}" ${x.getSQLType()}${x.primary?' PRIMARY KEY':''}`).join(',')})`);}
  await f.engine.exec(await readFile('migrations/20261106_mentor_copy_policies.sql','utf8'));await f.engine.exec(await readFile('migrations/20261108_mt5_enrollment_requests.sql','utf8'));
  await build({entryPoints:['artifacts/api-server/src/lib/mt5-crypto.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'crypto.mjs'),logLevel:'silent'});
  const crypto=await import(pathToFileURL(join(dir,'crypto.mjs')));await f.engine.query('INSERT INTO client_settings(client_id,encrypted_mt5_password) VALUES(10,$1)',[crypto.encryptMT5Password('legacy-fixture-proof')]);
  const token=randomBytes(32).toString('hex'),originToken=randomBytes(32).toString('hex');const accounts=[];
  for(const [role,login] of [['mentor',701],['client',702]]){
   const api_token=randomBytes(32).toString('hex'),password='fixture-'+role+'-password';
   const server=http.createServer((req,res)=>{
    if(req.url!=='/v1/read-only-snapshot'||req.headers.authorization!=='Bearer '+api_token){res.writeHead(403);res.end('{}');return;}
    probes++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,read_only:true,initialized:true,identity_verified:true,portable_paths_verified:true,connected:true,positions_read_verified:true,orders_read_verified:true,automated_trading_enabled:false,execution_enabled:false,financial_trades:0,open_positions:0,pending_orders:0,account:{login,server:'FixtureDemo',mode:'demo',currency:'USD',balance:1000,equity:1000}}));
   });await new Promise(r=>server.listen(0,'127.0.0.1',r));servers.push(server);
   accounts.push({broker:'justmarkets',login,server:'FixtureDemo',role,url:'http://127.0.0.1:'+server.address().port,password,api_token});
  }
  relay=spawn(process.env.EA_TEST_PYTHON||'python3',['scripts/tests/helpers/readonly-relay-server.py'],{stdio:['pipe','pipe','pipe']});relay.stderr.resume();
  const port=await new Promise((yes,no)=>{let text='';const timer=setTimeout(()=>no(Error('Relay fixture startup timed out')),10000);relay.once('error',no);relay.stdout.on('data',chunk=>{text+=chunk;try{const data=JSON.parse(text.split('\n')[0]);clearTimeout(timer);yes(data.port);}catch{}});relay.once('exit',()=>no(Error('Relay fixture exited')));relay.stdin.end(JSON.stringify({accounts,token})+'\n');});
  const gateway='http://127.0.0.1:'+port;
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'edge-key.pem'),'-out',join(dir,'edge-cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'ignore'});
  const certificate=await readFile(join(dir,'edge-cert.pem')),accessId='fixture-access-id',accessSecret=randomBytes(32).toString('hex');
  const edge=https.createServer({key:await readFile(join(dir,'edge-key.pem')),cert:certificate},async(req,res)=>{
   if(req.headers['cf-access-client-id']!==accessId||req.headers['cf-access-client-secret']!==accessSecret){res.writeHead(403);res.end('{}');return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const response=await fetch(gateway+req.url,{method:req.method,headers:{Authorization:req.headers.authorization??'','Content-Type':'application/json'},body:req.method==='POST'?Buffer.concat(chunks):undefined,redirect:'error'});
   res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());
  });await new Promise(r=>edge.listen(0,'127.0.0.1',r));servers.push(edge);const secureGateway='https://127.0.0.1:'+edge.address().port;
  const transportEnv={MT5_VPS_URL:secureGateway,MT5_VPS_TOKEN:token,MT5_ACCESS_REQUIRED:'1',MT5_ACCESS_CLIENT_ID:accessId,MT5_ACCESS_CLIENT_SECRET:accessSecret};
  const probe=await checkMt5Transport(transportEnv,(url,options)=>new Promise((yes,no)=>{
   const req=https.request(url,{method:'GET',headers:options.headers,ca:certificate,signal:options.signal},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>yes(new Response(Buffer.concat(chunks),{status:res.statusCode})));});req.on('error',no);req.end();
  }));assert.equal(probe.edgeAuthRequired,true);assert.equal(probe.serviceAuthRequired,true);
  const inheritedTrust=process.env.NODE_EXTRA_CA_CERTS?await readFile(process.env.NODE_EXTRA_CA_CERTS):Buffer.alloc(0);
  await writeFile(join(dir,'trust.pem'),Buffer.concat([inheritedTrust,Buffer.from('\n'),certificate]));
  const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const appPort=reserve.address().port;await new Promise(r=>reserve.close(r));
  const buildProcess=spawn(process.execPath,['artifacts/api-server/build-application-nontrading.mjs'],{env:{...process.env,EA_RELEASE_OUTDIR:dir},stdio:'ignore'});assert.equal((await once(buildProcess,'exit'))[0],0);
  const env={...process.env,NODE_ENV:'production',DATABASE_URL:f.engine.pool.options.connectionString,SESSION_SECRET:secret,PORT:String(appPort),EA_RELEASE_MODE:'nontrading',EA_MT5_MANAGEMENT_ONLY:'1',EA_APPLICATION_ORIGIN_TOKEN:originToken,...transportEnv,NODE_EXTRA_CA_CERTS:join(dir,'trust.pem'),PUBLIC_WEBSITE_ORIGIN:'https://fixture.invalid',LOG_LEVEL:'silent'};
  await symlink(new URL('../../artifacts/api-server/node_modules',import.meta.url).pathname,join(dir,'node_modules'),'dir');
  const start=async()=>{let startupError='';runtime=spawn(process.execPath,[join(dir,'application-nontrading.mjs')],{env,stdio:['ignore','ignore','pipe']});runtime.stderr.on('data',chunk=>{startupError+=chunk;});for(let i=0;i<100;i++){if(runtime.exitCode!==null)throw Error('Release entry exited during fixture startup: '+startupError);try{const r=await fetch('http://127.0.0.1:'+appPort+'/api/healthz');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Release fixture startup timed out');};
  for(const invalid of [{MT5_ACCESS_REQUIRED:'0'},{MT5_VPS_URL:gateway},{NODE_ENV:'development'},{PUBLIC_WEBSITE_ORIGIN:'http://fixture.invalid'}]){
   const refused=spawn(process.execPath,[join(dir,'application-nontrading.mjs')],{env:{...env,...invalid},stdio:['ignore','ignore','pipe']});let error='';refused.stderr.on('data',c=>error+=c);assert.equal((await once(refused,'exit'))[0],1);assert.match(error,/"phase":"configuration"/);
  }
  await start();
  const request=async(path,init={})=>fetch('http://127.0.0.1:'+appPort+'/api'+path,{...init,headers:{'x-ea-cloud-origin-token':originToken,'x-forwarded-proto':'https',Origin:'https://fixture.invalid','Content-Type':'application/json',...init.headers}});
  const login=async(path,email)=>{const r=await request(path,{method:'POST',body:JSON.stringify({email,password:'Test-only-pass-123!'})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const client=await login('/app/login','client@example.invalid'),mentor=await login('/auth/login','mentor1@example.invalid'),otherMentor=await login('/auth/login','superadmin2@example.invalid');
  const connect=async(role,cookie,account)=>request(role==='mentor'?'/admin/mt5/connect':'/app/mt5-connect',{method:'POST',headers:{cookie},body:JSON.stringify({login:String(account.login),server:account.server,password:account.password,broker:account.broker})});
  assert.equal((await connect('client',client,accounts[0])).status,403);
  assert.equal((await connect('mentor',mentor,accounts[0])).status,200);assert.equal((await connect('client',client,accounts[1])).status,200);
  const status=await request('/app/engine/status',{headers:{cookie:client}});assert.equal(status.status,200);const state=await status.json();assert.equal(state.connection.code,'VERIFIED_DEMO_READ_ONLY');assert.equal(state.copier.executionPermitted,false);
  const before=probes;assert.equal((await request('/admin/engine/clients/10',{headers:{cookie:otherMentor}})).status,404);assert.equal(probes,before);
  for(const path of ['/robots/events','/signals/webhook'])assert.equal((await request(path,{method:'POST',body:'{}'})).status,403);
  assert.equal((await f.engine.query("SELECT to_regclass('public.trade_signals') AS table")).rows[0].table,null,'Release did not create or process a signal queue');
  await stop(runtime);await start();assert.equal((await request('/app/me',{headers:{cookie:client}})).status,200,'same cookie survives restart');
  assert.equal((await request('/app/mt5-disconnect',{method:'POST',headers:{cookie:client},body:'{}'})).status,200);
  const disconnected=await request('/app/engine/status',{headers:{cookie:client}});assert.equal((await disconnected.json()).connection.code,'ACCOUNT_DISCONNECTED');
  assert.ok((await f.engine.query('SELECT encrypted_mt5_password FROM client_settings WHERE client_id=10')).rows[0].encrypted_mt5_password);
 }finally{await stop(runtime);await stop(relay);for(const s of servers)await new Promise(r=>s.close(r));await f.engine.close();await rm(dir,{recursive:true,force:true});}
});
