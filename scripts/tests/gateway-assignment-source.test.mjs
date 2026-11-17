import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
test('hosted assignments refresh from the approved gateway without reconfiguring every account or leaking status edge credentials',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ea-roster-')),previous={...process.env},oldFetch=globalThis.fetch;
 try{
  delete process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS;delete process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS_FILE;delete process.env.COPY_ENGINE_RECEIVING_PERMIT_ACCOUNTS;
  process.env.MT5_VPS_URL='https://status.example.invalid';process.env.MT5_ACCESS_CLIENT_ID='status-id';process.env.MT5_ACCESS_CLIENT_SECRET='status-secret';
  process.env.OBSERVER_MT5_VPS_URL='https://gateway.example.invalid';process.env.OBSERVER_MT5_VPS_TOKEN='x'.repeat(64);process.env.OBSERVER_MT5_ACCOUNT_ASSIGNMENTS_SOURCE='gateway';process.env.OBSERVER_MT5_ACCESS_CLIENT_ID='observer-id';process.env.OBSERVER_MT5_ACCESS_CLIENT_SECRET='observer-secret';
  await build({entryPoints:['artifacts/api-server/src/lib/observer-vps.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'roster.mjs'),logLevel:'silent',plugins:[{name:'no-db',setup(b){b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const pool={query(){throw Error("No database access expected")}};',loader:'js'}));}}]});
  let login=123;globalThis.fetch=async(url,opts)=>{
   assert.equal(new URL(url).origin,'https://gateway.example.invalid');assert.equal(opts.redirect,'error');assert.equal(opts.headers['CF-Access-Client-Id'],'observer-id');assert.equal(opts.headers['CF-Access-Client-Secret'],'observer-secret');assert.ok(!JSON.stringify(opts.headers).includes('status-secret'));
   return String(url).endsWith('/observer/assignments')?Response.json({version:1,assignments:[{login,server:'Fixture',broker:'xm',role:'client'}]}):Response.json({version:1,sessions:[{login,server:'Fixture',broker:'xm',mode:'demo',owner_kind:'client',owner_id:9}]});
  };
  const api=await import(pathToFileURL(join(dir,'roster.mjs')));assert.equal((await api.receivingSessions())[0].login,123);login=124;assert.equal((await api.receivingSessions())[0].login,124);
 }finally{globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in previous))delete process.env[k];Object.assign(process.env,previous);await rm(dir,{recursive:true,force:true})}
});
