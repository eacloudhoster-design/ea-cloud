import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
const load=async path=>{const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));};
const text=await load('artifacts/ea-app/src/lib/assistant-text.ts');
const provider=await load('artifacts/api-server/src/lib/assistant-voice.ts');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const facts={observedAt:Date.now(),connected:true,engine:true,robotEnabled:true,tradeAllowed:true,account:{balance:1250.5,profit:-12.3,currency:'USD'},positionsCount:3,botName:'Mentor One'};
test('answers use verified fresh account values and never infer positions, success or unavailable levels',()=>{
 assert.match(text.answerIntent('balance',facts,0).text,/1,250 US dollars and 50 cents/);
 assert.match(text.answerIntent('positions',facts,0).text,/3 open positions/);
 assert.match(text.answerIntent('positions',{...facts,positionsCount:null},0).text,/not supplied/);
 assert.match(text.answerIntent('balance',{...facts,connected:null},0).text,/not verified/);
 assert.match(text.answerIntent('balance',{...facts,observedAt:Date.now()-60000},0).text,/stale/);
 assert.match(text.answerIntent('bot',{...facts,engine:false},0).text,/unverified/);
 for(let i=0;i<4;i++)assert.match(text.answerIntent('mode',null,i).text,new RegExp(text.modeNames[i]));
 const report={kind:'chart',report:{signal:'SELL',symbol:'XAUUSD',entry:null,stopLoss:2750,takeProfit:2700,reasoning:'Bearish structure rejects visible resistance.',limitations:null}};
 const spoken=text.narrateAnalysis(report);assert.match(spoken,/Sell directional bias for gold/);assert.match(spoken,/2750/);assert.match(spoken,/2700/);assert.match(spoken,/Complete trade levels are unavailable/);assert.match(spoken,/not an executed trade/);assert.ok(!spoken.includes('Entry at'));
 assert.equal(text.executionSpeech({status:'success',retcode:10008,ticket:'1',signalKind:'OPEN',action:'BUY',symbol:'XAUUSD'}),null);
 assert.match(text.executionSpeech({status:'success',retcode:10009,ticket:'1',signalKind:'OPEN',action:'BUY',symbol:'XAUUSD'}),/confirmed a buy execution for gold/);
 assert.equal(text.executionSpeech({status:'pending',retcode:10009,ticket:'1',signalKind:'OPEN',action:'BUY'}),null);
 assert.ok(text.speechChunks('Sentence one. '.repeat(200)).every(chunk=>chunk.length<=500));
 assert.match(text.speechChunks('Stop loss at 2750.25. Take profit at 2700.5.').join(' '),/2750\.25.*2700\.5/);
});
test('neural provider builds verified PCM WAV and distinguishes upstream/configuration failures without keys in URLs',async()=>{
 const original=globalThis.fetch,old=process.env.GEMINI_API_KEY,oldModel=process.env.GEMINI_VOICE_MODEL;process.env.GEMINI_VOICE_MODEL='gemini-2.5-flash-preview-tts';process.env.GEMINI_API_KEY='private-fixture-key';let calls=0;
 try{
  globalThis.fetch=async(url,init)=>{calls++;assert.ok(!String(url).includes('private-fixture-key'));assert.equal(init.headers['x-goog-api-key'],'private-fixture-key');const body=JSON.parse(init.body);assert.deepEqual(body.generationConfig.responseModalities,['AUDIO']);assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,'Aoede');return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{inlineData:{mimeType:'audio/L16;codec=pcm;rate=24000',data:Buffer.alloc(2400).toString('base64')}}]}}]});};
  const result=await provider.synthesize(7,'Welcome to Mentor One.',new AbortController().signal);assert.equal(result.toString('ascii',0,4),'RIFF');assert.equal(result.readUInt32LE(24),24000);
  await provider.synthesize(7,'Welcome to Mentor One.',new AbortController().signal);assert.equal(calls,1);
  await provider.synthesize(8,'Welcome to Mentor One.',new AbortController().signal);assert.equal(calls,2,'private cache scoped per client');
  for(const status of [400,401,403,404,500]){globalThis.fetch=async()=>new Response('',{status});await assert.rejects(()=>provider.synthesize(7,`failure ${status}`,new AbortController().signal),error=>error.upstreamStatus===status&&error.status===(status===429?429:503)&&!error.message.includes('private-fixture-key'));}
  globalThis.fetch=async()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[]}}]});await assert.rejects(()=>provider.synthesize(7,'Malformed audio',new AbortController().signal),/valid speech/);
  delete process.env.GEMINI_API_KEY;await assert.rejects(()=>provider.synthesize(7,'Unconfigured',new AbortController().signal),/not configured/);
  assert.equal((await provider.classifyQuestion('What is my balance?',new AbortController().signal)).intent,'balance');
  assert.equal((await provider.classifyQuestion('Execute a buy trade',new AbortController().signal)).intent,'unsupported');
 }finally{globalThis.fetch=original;if(oldModel===undefined)delete process.env.GEMINI_VOICE_MODEL;else process.env.GEMINI_VOICE_MODEL=oldModel;if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;}
});
test('assistant routes preserve authentication, licences, account/report ownership and scanner credits',{skip:!process.env.PGLITE_MODULE&&'Set PGLITE_MODULE for isolated PostgreSQL route integration'},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const engine=new PGlite();
 const {mkdirSync}=await import('node:fs');const {resolve}=await import('node:path');const {pathToFileURL}=await import('node:url');
 const {default:express}=await import('../../artifacts/api-server/node_modules/express/index.js');const {appRequest}=await import('./helpers/in-process-http.mjs');
 const banner={js:'import {createRequire} from "node:module";const require=createRequire(import.meta.url);'};mkdirSync('work/voice-tests',{recursive:true});
 await build({entryPoints:['lib/db/src/schema/index.ts'],bundle:true,platform:'node',format:'esm',outfile:'work/voice-tests/schema.mjs',banner});
 const schema=await import(pathToFileURL(resolve('work/voice-tests/schema.mjs')));
 const {getTableConfig}=await import('../../lib/db/node_modules/drizzle-orm/pg-core/index.js');const {drizzle}=await import('../../lib/db/node_modules/drizzle-orm/node-postgres/index.js');
 for(const table of [schema.usersTable,schema.appAccessTable,schema.licensesTable,schema.clientSettingsTable,schema.scannerReportsTable,schema.scannerEntitlementsTable,schema.tradeExecutionsTable]){
  const config=getTableConfig(table);await engine.exec(`CREATE TABLE "${config.name}" (${config.columns.map(c=>`"${c.name}" ${c.getSQLType()}${c.primary?' PRIMARY KEY':''}`).join(',')})`);
 }
 await engine.exec(`INSERT INTO users(id,role,status,robot_name) VALUES(5,'mentor','approved','Mentor Alpha'),(6,'mentor','approved','Mentor Beta');
 INSERT INTO app_access(id,status,license_key,mentor_id) VALUES(7,'approved','VALID',5),(9,'approved','OTHER',6);
 INSERT INTO licenses(id,key,mentor_id,status) VALUES(1,'VALID',5,'active'),(2,'OTHER',6,'active');
 INSERT INTO client_settings(client_id,copying_enabled,mt5_connected) VALUES(7,true,true),(9,false,true);
 INSERT INTO scanner_entitlements(client_id,status,credits_remaining) VALUES(7,'active',12),(9,'active',5);
 INSERT INTO scanner_reports(id,client_id,kind,report,created_at) VALUES('00000000-0000-4000-8000-000000000007',7,'chart','{"signal":"BUY","reasoning":"Own report"}',now()),('00000000-0000-4000-8000-000000000009',9,'chart','{"signal":"SELL","reasoning":"Other report"}',now());`);
 globalThis.__voiceSchema=schema;globalThis.__voiceDB=drizzle({query:async(config,params)=>{const r=await engine.query(typeof config==='string'?config:config.text,params,{rowMode:config.rowMode==='array'?'array':'object'});return {rows:r.rows,fields:r.fields};}});
 globalThis.__voiceRead=async(id,path)=>{assert.equal(path,'activity-snapshot');return {connected:true,tradeAllowed:true,account:{balance:id===7?1250.5:777,equity:1260,profit:9.5,currency:'USD'},positionsCount:3};};
 await build({entryPoints:['artifacts/api-server/src/routes/assistant.ts'],bundle:true,platform:'node',format:'esm',outfile:'work/voice-tests/router.mjs',banner,plugins:[{name:'isolated-voice-db',setup(b){
  b.onResolve({filter:/^@workspace\/db$|scanner-mt5$|signal-worker$/},args=>({path:args.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='@workspace/db'?`export const db=globalThis.__voiceDB;${Object.keys(schema).filter(k=>k.endsWith('Table')).map(k=>`export const ${k}=globalThis.__voiceSchema.${k};`).join('')}`:args.path.endsWith('scanner-mt5')?'export const scannerMt5Read=(...args)=>globalThis.__voiceRead(...args);':'export const signalWorkerHealthy=()=>true;'}));
 }}]});
 const {default:router}=await import(pathToFileURL(resolve('work/voice-tests/router.mjs')));const app=express();app.use(express.json());app.use((req,_res,next)=>{req.log={warn(){}};next();});app.use('/api',router);
 const call=(path,id=7,body,role='client')=>appRequest(app,'https://fixture/api/app/assistant/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+Buffer.from(`${id}:${role}:fixture`).toString('base64'),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 try{
  assert.equal((await appRequest(app,'https://fixture/api/app/assistant/facts')).status,401);
  assert.equal((await call('facts',7,undefined,'mentor')).status,401);
  assert.equal((await appRequest(app,'https://fixture/api/app/assistant/voice-config')).status,401);
  const configuration=await call('voice-config');assert.equal(configuration.status,200);
  const identity=await configuration.json();assert.match(identity.id,/^[a-f0-9]{64}$/);assert.equal(identity.voice,'Aoede');
  assert.ok(!JSON.stringify(identity).includes('API_KEY'));
  assert.equal((await call('speech',7,{text:'Profile check.',profileId:'0'.repeat(64)})).status,409);
  const own=await(await call('facts?clientId=9')).json();assert.equal(own.botName,'Mentor Alpha');assert.equal(own.account.balance,1250.5);assert.equal(own.positionsCount,3);assert.equal(own.latest.id,'00000000-0000-4000-8000-000000000007');assert.ok(!JSON.stringify(own).includes('encryptedMt5Password'));
  const originalRead=globalThis.__voiceRead;globalThis.__voiceRead=async()=>({connected:false,tradeAllowed:false,account:null});
  assert.equal((await(await call('facts')).json()).connected,false);
  globalThis.__voiceRead=async()=>{throw Error('unavailable');};assert.equal((await(await call('facts')).json()).connected,null);
  globalThis.__voiceRead=originalRead;
  const other=await(await call('facts',9)).json();assert.equal(other.account.balance,777);assert.equal(other.latest.id,'00000000-0000-4000-8000-000000000009');
  assert.equal((await(await call('intent',7,{question:'What is my balance?'})).json()).intent,'balance');
  assert.equal((await(await call('intent',7,{question:'Place a buy trade'})).json()).intent,'unsupported');
  assert.equal((await call('speech',7,{text:'password=private'})).status,400);
  assert.equal((await call('report/00000000-0000-4000-8000-000000000007')).status,200);
  assert.equal((await call('report/00000000-0000-4000-8000-000000000009')).status,404);
  await engine.exec("UPDATE scanner_entitlements SET status='revoked' WHERE client_id=7");
  assert.equal((await call('report/00000000-0000-4000-8000-000000000007')).status,403);assert.equal((await(await call('facts')).json()).latest,null);
  assert.equal((await engine.query('SELECT credits_remaining FROM scanner_entitlements WHERE client_id=7')).rows[0].credits_remaining,12);
  await engine.exec("UPDATE licenses SET status='expired' WHERE key='VALID'");assert.equal((await call('speech',7,{text:'Not permitted'})).status,401);assert.equal((await call('facts')).status,401);
  await engine.exec("UPDATE licenses SET status='active', expires_at=now()-interval '1 second' WHERE key='VALID'");assert.equal((await call('intent',7,{question:'Balance'})).status,401);
  await engine.exec("UPDATE licenses SET expires_at=null WHERE key='VALID'; UPDATE app_access SET status='pending' WHERE id=7");assert.equal((await call('facts')).status,401);
 }finally{await engine.close();delete globalThis.__voiceSchema;delete globalThis.__voiceDB;delete globalThis.__voiceRead;}
});
