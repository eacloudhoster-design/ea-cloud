import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,stat,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {randomBytes} from 'node:crypto';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';import express from '../../artifacts/api-server/node_modules/express/index.js';
import {sessionFixture} from './helpers/browser-session-fixture.mjs';import {appRequest} from './helpers/in-process-http.mjs';
test('independent enrollment is encrypted, owned, idempotent, non-trading and exported only through a private verified-owner handoff',async()=>{
 process.env.SESSION_SECRET=randomBytes(32).toString('hex');const f=await sessionFixture(),dir=await mkdtemp(join(tmpdir(),'ea-enroll-'));const oldFetch=globalThis.fetch;
 try{
  const schema=globalThis.__sessionSchema,{getTableConfig}=await import('../../lib/db/node_modules/drizzle-orm/pg-core/index.js');
  for(const key of ['clientSettingsTable','mt5ConnectionsTable']){const c=getTableConfig(schema[key]);await f.engine.exec(`CREATE TABLE "${c.name}" (${c.columns.map(x=>`"${x.name}" ${x.getSQLType()}${x.primary?' PRIMARY KEY':''}`).join(',')})`);}
  const sql=await readFile('migrations/20261108_mt5_enrollment_requests.sql','utf8');await f.engine.exec(sql);await f.engine.exec(sql);
  if(!f.engine.pool)await f.engine.exec("CREATE FUNCTION pg_advisory_xact_lock(integer) RETURNS void LANGUAGE SQL AS 'SELECT NULL::void'");
  const {drizzle}=await import('../../lib/db/node_modules/drizzle-orm/node-postgres/index.js');
  const query=async(c,p)=>{const r=await f.engine.query(typeof c==='string'?c:c.text,p,{rowMode:c.rowMode==='array'?'array':'object'});return {rows:r.rows,fields:r.fields};};
  globalThis.__sessionDb=drizzle(f.engine.pool??{query,connect:async()=>({query,release(){}})});
  await build({stdin:{contents:`export {default as enrollment} from './artifacts/api-server/src/routes/mt5-enrollment';export {exportEnrollment} from './artifacts/api-server/src/lib/enrollment-export';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(dir,'api.mjs'),logLevel:'silent',banner:{js:'import {createRequire} from "node:module";const require=createRequire(import.meta.url);'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const db=globalThis.__sessionDb;${Object.keys(schema).filter(k=>k.endsWith('Table')).map(k=>`export const ${k}=globalThis.__sessionSchema.${k};`).join('')}`}));}}]});
  const api=await import(pathToFileURL(join(dir,'api.mjs')));const app=express();app.use(express.json());app.use('/api',f.api.browserSessionMiddleware,api.enrollment);
  const request=(path,init={})=>appRequest(app,'https://fixture.invalid/api'+path,init);
  const login=async(path,email)=>{const r=await appRequest(f.app,'https://fixture.invalid/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Test-only-pass-123!'})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const client=await login('/app/login','client@example.invalid'),mentor=await login('/auth/login','mentor1@example.invalid');
  const input={login:'101',server:'FixtureDemo',broker:'justmarkets',password:'private-fixture-password'};
  const post=(path,cookie,body=input,origin)=>request(path,{method:'POST',headers:{cookie,'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No engine call permitted');};
  assert.equal((await request('/app/mt5-enrollment')).status,401);
  assert.equal((await post('/app/mt5-enrollment',mentor)).status,401);
  assert.equal((await post('/app/mt5-enrollment',client,{...input,ownerId:2})).status,422);
  assert.equal((await post('/app/mt5-enrollment',client,input,'https://attacker.invalid')).status,403);
  const result=await post('/app/mt5-enrollment',client);assert.equal(result.status,202);const data=await result.json();assert.equal(data.executionEnabled,false);assert.equal(data.provisioningAutomatic,false);assert.equal(data.request.status,'pending');assert.ok(!JSON.stringify(data).includes(input.password));
  const again=await post('/app/mt5-enrollment',client);assert.equal((await again.json()).request.id,data.request.id);assert.equal((await f.engine.query('SELECT count(*)::int AS n FROM mt5_enrollment_requests')).rows[0].n,1);
  const stored=(await f.engine.query('SELECT * FROM mt5_enrollment_requests')).rows[0];assert.notEqual(stored.encrypted_password,input.password);assert.equal(stored.owner_id,10);assert.equal(stored.mentor_id,1);
  assert.equal((await post('/admin/mt5/enrollment',mentor)).status,409,'same account cannot cross roles');
  assert.equal((await post('/admin/mt5/enrollment',mentor,{...input,login:'102'})).status,202);
  const own=await request('/admin/mt5/enrollment',{headers:{cookie:mentor}});assert.deepEqual((await own.json()).requests.map(x=>x.login),['102']);
  assert.equal((await f.engine.query('SELECT count(*)::int AS n FROM client_settings')).rows[0].n,0);assert.equal((await f.engine.query('SELECT count(*)::int AS n FROM mt5_connections')).rows[0].n,0);assert.equal(calls,0);
  const privateDir=join(dir,'private');await mkdir(privateDir,{mode:0o700});const destination=join(privateDir,'request.json');
  const exportPool=f.engine.pool??{connect:async()=>({query:(text,params)=>f.engine.query(text,params),release(){}})};
  await api.exportEnrollment(exportPool,data.request.id,destination);const packet=JSON.parse(await readFile(destination,'utf8'));assert.equal(packet.password,input.password);assert.equal(packet.role,'client');assert.equal(packet.executionEnabled,false);assert.equal((await stat(destination)).mode&0o777,0o600);
  await assert.rejects(api.exportEnrollment(exportPool,data.request.id,destination));
  await f.engine.query('UPDATE app_access SET mentor_id=2 WHERE id=10');
  assert.equal((await request('/app/mt5-enrollment',{headers:{cookie:client}})).status,401,'licence/owner mismatch invalidates access');
  await assert.rejects(api.exportEnrollment(exportPool,data.request.id,join(privateDir,'reassigned.json')),/ownership unavailable/);
  await f.engine.query('UPDATE app_access SET mentor_id=1 WHERE id=10');
  const repository=join(dir,'repository');await mkdir(repository,{mode:0o700});await mkdir(join(repository,'.git'));await writeFile(join(repository,'.git','HEAD'),'ref: refs/heads/fixture\n');await assert.rejects(api.exportEnrollment(exportPool,data.request.id,join(repository,'packet.json')),/outside Git/);
  const renewedClient=await login('/app/login','client@example.invalid');
  process.env.EA_ENGINE_READ_ONLY='1';assert.equal((await post('/app/mt5-enrollment',renewedClient)).status,403);delete process.env.EA_ENGINE_READ_ONLY;
 }finally{globalThis.fetch=oldFetch;await f.engine.close();await rm(dir,{recursive:true,force:true});}
});
