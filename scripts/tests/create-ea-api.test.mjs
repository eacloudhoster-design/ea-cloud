// Isolated PostgreSQL only; this test never reads DATABASE_URL.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
import express from '../../artifacts/api-server/node_modules/express/index.js';
import {appRequest} from './helpers/in-process-http.mjs';
const modulePath=process.env.PGLITE_MODULE;
test('name-only EA creation uses existing safe defaults and preserves legacy records/edit fields',{skip:!modulePath&&'Set PGLITE_MODULE for isolated PostgreSQL'},async()=>{
 const {PGlite}=await import(pathToFileURL(resolve(modulePath)));const engine=new PGlite();mkdirSync('work/create-ea-api',{recursive:true});
 const banner={js:'import {createRequire} from "node:module";const require=createRequire(import.meta.url);'};
 await build({entryPoints:['lib/db/src/schema/index.ts'],bundle:true,platform:'node',format:'esm',outfile:'work/create-ea-api/schema.mjs',banner});
 const schema=await import(pathToFileURL(resolve('work/create-ea-api/schema.mjs')));
 const {getTableConfig}=await import('../../lib/db/node_modules/drizzle-orm/pg-core/index.js');
 const {drizzle}=await import('../../lib/db/node_modules/drizzle-orm/node-postgres/index.js');
 for(const table of [schema.usersTable,schema.easTable]){const config=getTableConfig(table);await engine.exec(`CREATE TABLE "${config.name}" (${config.columns.map(c=>`"${c.name}" ${c.getSQLType()}${c.primary?' PRIMARY KEY':''}`).join(',')})`);}
 await engine.exec("INSERT INTO users(id,role,status) VALUES(5,'mentor','approved');INSERT INTO eas(id,mentor_id,name,symbol,lot_size,risk_level,is_active) VALUES(99,5,'Existing EA','EURUSD,GBPUSD','0.23','high',false)");
 const original=(await engine.query('SELECT * FROM eas WHERE id=99')).rows[0];
 globalThis.__createEaSchema=schema;globalThis.__createEaDb=drizzle({query:async(config,params)=>{const result=await engine.query(typeof config==='string'?config:config.text,params,{rowMode:config.rowMode==='array'?'array':'object'});return{rows:result.rows,fields:result.fields};}});
 try{
 await build({entryPoints:['artifacts/api-server/src/routes/eas.ts'],bundle:true,platform:'node',format:'esm',outfile:'work/create-ea-api/router.mjs',banner,plugins:[{name:'isolated-ea-db',setup(b){b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const db=globalThis.__createEaDb;export const easTable=globalThis.__createEaSchema.easTable;export const usersTable=globalThis.__createEaSchema.usersTable;',loader:'js'}));}}]});
 const {default:router}=await import(pathToFileURL(resolve('work/create-ea-api/router.mjs')));const app=express();app.use(express.json());
 // Inject the verified principal at the production cookie-middleware boundary.
 app.use((req,_res,next)=>{req.log={error(){}};if(req.headers['x-fixture-principal']==='mentor')req.browserPrincipal={kind:'portal',id:5,role:'mentor'};next();});app.use('/api',router);
 const call=(body,auth=true,path='/eas',method='POST')=>appRequest(app,'https://fixture/api'+path,{method,headers:{'Content-Type':'application/json',...(auth?{'x-fixture-principal':'mentor'}:{})},body:JSON.stringify(body)});
 assert.equal((await call({name:'Unauthorized'},false)).status,401);assert.equal((await call({})).status,400);
 let r=await call({name:'Name only'});assert.equal(r.status,201);let ea=await r.json();assert.equal(ea.name,'Name only');assert.equal(ea.description,null);assert.equal(ea.isActive,true);assert.equal(ea.symbol,'XAUUSD');assert.equal(ea.lotSize,'0.01');assert.equal(ea.riskLevel,'medium');
 r=await call({name:'Inactive EA',description:'Optional description',isActive:false});assert.equal(r.status,201);ea=await r.json();assert.equal(ea.description,'Optional description');assert.equal(ea.isActive,false);assert.equal(ea.symbol,'XAUUSD');assert.equal(ea.lotSize,'0.01');assert.equal(ea.riskLevel,'medium');
 assert.deepEqual((await engine.query('SELECT * FROM eas WHERE id=99')).rows[0],original,'creation never overwrites existing trading values');
 r=await call({name:'Legacy caller',symbol:'GBPUSD',lotSize:'0.07',riskLevel:'low'});assert.equal(r.status,201);ea=await r.json();assert.equal(ea.symbol,'GBPUSD');assert.equal(ea.lotSize,'0.07');assert.equal(ea.riskLevel,'low');
 r=await call({description:'Edited description'},true,'/eas/99','PATCH');assert.equal(r.status,200);ea=await r.json();assert.equal(ea.symbol,original.symbol);assert.equal(ea.lotSize,original.lot_size);assert.equal(ea.riskLevel,original.risk_level);assert.equal(ea.isActive,false);
 }finally{await engine.close();delete globalThis.__createEaDb;delete globalThis.__createEaSchema;}
});
