// Run with PGLITE_MODULE pointing to a locally unpacked @electric-sql/pglite.
// This is an isolated in-memory PostgreSQL engine, never DATABASE_URL.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
import express from '../../artifacts/api-server/node_modules/express/index.js';
import {appRequest} from './helpers/in-process-http.mjs';

const enginePath=process.env.PGLITE_MODULE;
test('EA artwork migration, authenticated ownership, persistence and client isolation', {skip:!enginePath&&'Set PGLITE_MODULE to run isolated PostgreSQL integration'},async()=>{
 const {PGlite}=await import(pathToFileURL(resolve(enginePath)));
 const engine=new PGlite();
 mkdirSync('work/ea-mode-tests',{recursive:true});
 const banner={js:'import {createRequire} from "node:module";const require=createRequire(import.meta.url);'};
 await build({entryPoints:['lib/db/src/schema/index.ts'],bundle:true,platform:'node',format:'esm',outfile:'work/ea-mode-tests/schema.mjs',banner});
 const schema=await import(pathToFileURL(resolve('work/ea-mode-tests/schema.mjs')));
 const {getTableConfig}=await import('../../lib/db/node_modules/drizzle-orm/pg-core/index.js');
 const {drizzle}=await import('../../lib/db/node_modules/drizzle-orm/node-postgres/index.js');
 for(const table of [schema.usersTable,schema.easTable,schema.appAccessTable,schema.licensesTable]){
  const config=getTableConfig(table);
  await engine.exec(`CREATE TABLE "${config.name}" (${config.columns.map(c=>`"${c.name}" ${c.getSQLType()}${c.primary?' PRIMARY KEY':''}`).join(',')})`);
 }
 await engine.exec(`INSERT INTO users(id,role,status,background_image_url) VALUES(5,'mentor','approved','https://images.example/legacy.png'),(6,'mentor','approved',null),(8,'client','approved',null);
 INSERT INTO eas(id,mentor_id,name,symbol,lot_size,risk_level,is_active) VALUES(11,5,'EA One','XAUUSD','0.01','medium',true),(12,5,'EA Two','EURUSD','0.10','high',true),(21,6,'Other mentor','GBPUSD','0.20','low',true);
 INSERT INTO app_access(id,status,license_key,mentor_id) VALUES(7,'approved','VALID',5),(9,'approved','OTHER',6);
 INSERT INTO licenses(id,key,mentor_id,status) VALUES(1,'VALID',5,'active'),(2,'OTHER',6,'active');`);
 const original=(await engine.query('SELECT * FROM eas ORDER BY id')).rows;
 const migration=readFileSync('docs/migrations/20261024-ea-mode-images.sql','utf8');
 await engine.exec(migration);await engine.exec(migration);
 globalThis.__eaModeSchema=schema;
 globalThis.__eaModeDb=drizzle({query:async(config,params)=>{
  const result=await engine.query(typeof config==='string'?config:config.text,params,{rowMode:config.rowMode==='array'?'array':'object'});
  return {rows:result.rows,fields:result.fields};
 }});
 await build({entryPoints:['artifacts/api-server/src/routes/ea-mode-images.ts'],bundle:true,platform:'node',format:'esm',outfile:'work/ea-mode-tests/router.mjs',banner,plugins:[{name:'isolated-mode-db',setup(b){
  b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const db=globalThis.__eaModeDb;${Object.keys(schema).filter(k=>k.endsWith('Table')).map(k=>`export const ${k}=globalThis.__eaModeSchema.${k};`).join('')}`,loader:'js'}));
 }}]});
 const {default:router}=await import(pathToFileURL(resolve('work/ea-mode-tests/router.mjs')));
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.log={error(){}};next();});app.use('/api',router);
 const token=(id,role)=>'Bearer '+Buffer.from(`${id}:${role}:fixture`).toString('base64');
 const call=(path,id=5,role='mentor',images)=>appRequest(app,'https://fixture/api'+path,{method:images?'PUT':'GET',headers:{Authorization:token(id,role),'Content-Type':'application/json'},...(images?{body:JSON.stringify({images})}:{})});
 try{
  assert.equal((await appRequest(app,'https://fixture/api/eas/11/mode-images')).status,401);
  assert.equal((await call('/eas/11/mode-images',8,'client',[null,null,null,null])).status,403);
  assert.equal((await call('/eas/11/mode-images',8,'mentor',[null,null,null,null])).status,403);
  assert.equal((await call('/eas/21/mode-images',5,'mentor',[null,null,null,null])).status,404);
  assert.deepEqual((await(await call('/eas/11/mode-images')).json()).images,['https://images.example/legacy.png',null,null,null]);
  const images=[1,2,3,4].map(i=>`/api/storage/r2/5/image-${i}`);
  assert.equal((await call('/eas/11/mode-images',5,'mentor',images)).status,200);
  assert.deepEqual((await(await call('/eas/11/mode-images')).json()).images,images);
  assert.equal((await call('/eas/11/mode-images',5,'mentor',[null,null,null])).status,400);
  assert.equal((await call('/eas/11/mode-images',5,'mentor',[null,...images.slice(1)])).status,200);
  assert.equal((await(await call('/eas/11/mode-images')).json()).images[0],'https://images.example/legacy.png');
  await call('/eas/11/mode-images',5,'mentor',images);
  const client=await(await call('/app/ea-mode-images',7,'client')).json();
  assert.deepEqual(client.eas.map(e=>e.id),[11,12]);assert.deepEqual(client.eas[0].images,images);
  assert.equal(client.eas[1].images[0],'https://images.example/legacy.png');
  assert.deepEqual((await(await call('/app/ea-mode-images',9,'client')).json()).eas.map(e=>e.id),[21]);
  assert.equal((await call('/eas/11/mode-images',5,'mentor',['javascript:alert(1)',null,null,null])).status,400);
  assert.equal((await call('/eas/11/mode-images',5,'mentor',['/api/storage/r2/6/private',null,null,null])).status,403);
  // Exercise persisted licence states and legacy associations without a production DB.
  const deny=async code=>{const response=await call('/app/ea-mode-images',7,'client');assert.equal(response.status,403);assert.equal((await response.json()).code,code);};
  await engine.exec("UPDATE app_access SET email='Client@Example.invalid' WHERE id=7; UPDATE licenses SET client_email='client@example.invalid' WHERE key='VALID'");
  assert.equal((await call('/app/ea-mode-images',7,'client')).status,200);
  await engine.exec("UPDATE app_access SET license_key='  VALID  ' WHERE id=7");
  assert.equal((await call('/app/ea-mode-images',7,'client')).status,200,'normalise a linked key without changing records');
  await engine.exec("UPDATE app_access SET license_key=null WHERE id=7");
  const beforeFallback=(await engine.query('SELECT * FROM app_access WHERE id=7')).rows;
  assert.equal((await call('/app/ea-mode-images',7,'client')).status,200,'legacy mentor link resolves only its owned valid email licence');
  assert.deepEqual((await engine.query('SELECT * FROM app_access WHERE id=7')).rows,beforeFallback,'access checks never repair/write account records');
  await engine.exec("UPDATE app_access SET license_key='VALID',mentor_id=null WHERE id=7");
  assert.equal((await call('/app/ea-mode-images',7,'client')).status,200,'verified owned key can resolve its mentor read-only');
  await engine.exec("UPDATE app_access SET mentor_id=6 WHERE id=7");await deny('LICENCE_ASSOCIATION_MISMATCH');
  await engine.exec("UPDATE app_access SET mentor_id=5,license_key='MISSING' WHERE id=7");await deny('LICENCE_NOT_FOUND');
  await engine.exec("UPDATE app_access SET license_key='VALID' WHERE id=7; UPDATE licenses SET client_email='other@example.invalid' WHERE key='VALID'");await deny('LICENCE_ASSOCIATION_MISMATCH');
  await engine.exec("UPDATE licenses SET client_email='client@example.invalid',status='inactive' WHERE key='VALID'");await deny('LICENCE_INACTIVE');
  await engine.exec("INSERT INTO licenses(id,key,mentor_id,status,client_email) VALUES(10,'NEWER',5,'active','client@example.invalid'); UPDATE licenses SET status='expired' WHERE key='VALID'");await deny('LICENCE_EXPIRED');
  await engine.exec("UPDATE app_access SET license_key=null,email='client%@example.invalid' WHERE id=7");await deny('LICENCE_NOT_LINKED');
  await engine.exec("UPDATE app_access SET license_key='VALID',email='client@example.invalid' WHERE id=7; UPDATE licenses SET status='active' WHERE key='VALID'; DELETE FROM licenses WHERE key='NEWER'");
  await engine.exec("UPDATE app_access SET status='pending' WHERE id=7");
  assert.equal((await call('/app/ea-mode-images',7,'client')).status,403);
  await engine.exec("UPDATE app_access SET status='approved' WHERE id=7");
  await engine.exec("UPDATE licenses SET status='expired' WHERE key='VALID'");
  assert.equal((await call('/app/ea-mode-images',7,'client')).status,403);
  await engine.exec("UPDATE licenses SET status='active', expires_at=now()-interval '1 day' WHERE key='VALID'");
  assert.equal((await call('/app/ea-mode-images',7,'client')).status,403);
  assert.deepEqual((await engine.query('SELECT * FROM eas ORDER BY id')).rows,original);
  assert.equal((await engine.query('SELECT background_image_url FROM users WHERE id=5')).rows[0].background_image_url,'https://images.example/legacy.png');
  if(process.env.EA_MODE_BROWSER){
    await engine.exec("UPDATE licenses SET status='active', expires_at=null WHERE key='VALID'");
    const {verifyModeBrowser}=await import('./helpers/ea-mode-browser.mjs');await verifyModeBrowser(app,engine);
  }
  await engine.exec('DROP TABLE ea_mode_images');assert.equal((await call('/eas/11/mode-images')).status,503);
 }finally{await engine.close();delete globalThis.__eaModeDb;delete globalThis.__eaModeSchema;}
});
