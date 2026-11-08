import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {build} from '../../../artifacts/api-server/node_modules/esbuild/lib/main.js';
export async function copierFixture(){
 const directory=await mkdtemp(join(tmpdir(),'ea-copier-e2e-'));
 let engine,postgres=false;
 if(process.env.EA_TEST_PG_URL){
  const url=new URL(process.env.EA_TEST_PG_URL);
  if(url.username!=='ea_db_test'||url.password||!/^\/ea_validation_[a-f0-9]+$/.test(url.pathname)||url.searchParams.get('host')!=='/var/lib/ea-cloud/validation/pg-test/socket')throw Error('Disposable PostgreSQL binding required');
  const {default:pg}=await import('../../../lib/db/node_modules/pg/lib/index.js');
  const pool=new pg.Pool({connectionString:url.href,max:4,application_name:'ea-cloud-disposable-copier-validation'});
  const settings=await pool.query('SHOW data_directory');
  if(settings.rows[0].data_directory!=='/var/lib/ea-cloud/validation/pg-test/data'){await pool.end();throw Error('Wrong validation server');}
  const occupied=await pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'");
  if(occupied.rows[0].n!==0){await pool.end();throw Error('Validation database must be new and empty');}
  engine={query:(...args)=>pool.query(...args),exec:sql=>pool.query(sql),close:()=>pool.end(),connect:()=>pool.connect()};postgres=true;
 }else{
  const {PGlite}=await import(pathToFileURL(resolve(process.env.PGLITE_MODULE)));engine=new PGlite();
 }
 const banner={js:'import {createRequire} from "node:module";const require=createRequire(import.meta.url);'};
 await build({entryPoints:['lib/db/src/schema/index.ts'],bundle:true,platform:'node',format:'esm',outfile:join(directory,'schema.mjs'),banner,logLevel:'silent'});
 const schema=await import(pathToFileURL(join(directory,'schema.mjs')));
 const {getTableConfig,PgDialect}=await import('../../../lib/db/node_modules/drizzle-orm/pg-core/index.js');
 const {drizzle}=await import('../../../lib/db/node_modules/drizzle-orm/node-postgres/index.js');
 const dialect=new PgDialect();
 const literal=v=>typeof v==='string'?"'"+v.replaceAll("'","''")+"'":typeof v==='number'||typeof v==='boolean'?String(v):dialect.sqlToQuery(v).sql;
 for(const name of ['usersTable','appAccessTable','licensesTable','easTable','clientSettingsTable','symbolPairsTable','clientSymbolConfigsTable','tradeExecutionsTable','tradeSignalsTable','robotBuildsTable','robotEventsTable','observerPositionsTable','observerAllocationsTable','mt5ConnectionsTable','mentorCopyPoliciesTable','mentorCopyPolicyAuditTable']){
  const t=getTableConfig(schema[name]);
  const columns=t.columns.map(c=>`"${c.name}" ${c.getSQLType()}${c.primary?' PRIMARY KEY':''}${c.notNull?' NOT NULL':''}${c.isUnique?' UNIQUE':''}${c.default!==undefined?' DEFAULT '+literal(c.default):''}`);
  for(const u of t.uniqueConstraints)columns.push(`UNIQUE (${u.columns.map(c=>'"'+c.name+'"').join(',')})`);
  await engine.exec(`CREATE TABLE "${t.name}" (${columns.join(',')})`);
  for(const index of t.indexes){const cfg=index.config;if(cfg.unique)await engine.exec(`CREATE UNIQUE INDEX "${cfg.name}" ON "${t.name}" (${cfg.columns.map(c=>'"'+c.name+'"').join(',')})`);}
 }
 const query=async(config,params)=>{
  if(postgres)return engine.query(config,params);
  const r=await engine.query(typeof config==='string'?config:config.text,params,{rowMode:config.rowMode==='array'?'array':'object'});return {rows:r.rows,fields:r.fields};
 };
 globalThis.__copierSchema=schema;globalThis.__copierDb=drizzle({query,connect:async()=>postgres?await engine.connect():({query,release(){}})});
 await build({stdin:{contents:`export {routeSnapshot,sourceKey} from './artifacts/api-server/src/lib/ea-builder/routing';export {robotEvent} from './artifacts/api-server/src/lib/ea-builder/contracts';export {runSignal,resolveVolume} from './artifacts/api-server/src/lib/copy-engine';export {executeObserver} from './artifacts/api-server/src/lib/observer-execution';export {encryptMT5Password} from './artifacts/api-server/src/lib/mt5-crypto';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(directory,'engine.mjs'),banner,logLevel:'silent',plugins:[{name:'isolated-db',setup(b){b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const db=globalThis.__copierDb;${Object.keys(schema).filter(k=>k.endsWith('Table')).map(k=>`export const ${k}=globalThis.__copierSchema.${k};`).join('')}`,loader:'js'}));b.onResolve({filter:/^\.\.\/ws$/},()=>({path:'ws',namespace:'quiet'}));b.onResolve({filter:/^\.\/trading-activity$/},()=>({path:'activity',namespace:'quiet'}));b.onLoad({filter:/.*/,namespace:'quiet'},()=>({contents:'export const broadcastToClient=()=>{};export const recordExecutionActivity=async()=>{};',loader:'js'}));}}]});
 const api=await import(pathToFileURL(join(directory,'engine.mjs')));
 const token=randomBytes(32).toString('hex');let child,port;
 const start=async()=>{
  child=spawn(process.env.EA_TEST_PYTHON || 'python3',['scripts/tests/helpers/copier-simulation-server.py',join(directory,'workers')],{env:{...process.env,EA_WORKER_MODE:'simulation',EA_TEST_TOKEN:token},stdio:['ignore','pipe','pipe']});
  port=await new Promise((yes,no)=>{let output='';const timer=setTimeout(()=>no(Error('Fixture startup timeout')),15000);child.stdout.on('data',chunk=>{output+=chunk;const line=output.split('\n')[0];try{const data=JSON.parse(line);clearTimeout(timer);yes(data.port);}catch{}});child.once('exit',()=>{clearTimeout(timer);no(Error('Simulation fixture exited'));});});
  for(let i=0;i<40;i++){try{if((await call('/healthz')).status===200)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Fixture HTTP not ready');
 };
 const stop=async()=>{if(child&&child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),12000);await done;clearTimeout(timer);}};
 const call=async(path,body)=>{const r=await fetch(`http://127.0.0.1:${port}`+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});return {status:r.status,data:await r.json()};};
 await start();
 const workerSource=await readFile('artifacts/api-server/src/lib/signal-worker.ts','utf8');
 const claimSQL=workerSource.match(/WITH active AS \([\s\S]*?RETURNING id/)[0].replaceAll('${tradeSignalsTable}','trade_signals').replaceAll('${lease}',"interval '10 minutes'");
 return {databaseKind:postgres?'PostgreSQL16':'PGlite',api,db:globalThis.__copierDb,schema,engine,call,claimSQL,restart:async()=>{await stop();await start();},close:async()=>{await stop();await engine.close();await rm(directory,{recursive:true,force:true});delete globalThis.__copierDb;delete globalThis.__copierSchema;}};
}
