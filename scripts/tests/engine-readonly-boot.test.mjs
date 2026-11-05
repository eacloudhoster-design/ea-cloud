import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {spawn} from 'node:child_process';import {once} from 'node:events';import net from 'node:net';
test('read-only canary refuses writable DB; isolated restart serves health but rejects mutations',{timeout:15000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ea-readonly-boot-'));let child;
 try{
  const names=[];for(const file of await readdir('lib/db/src/schema'))if(file.endsWith('.ts')){const text=await readFile('lib/db/src/schema/'+file,'utf8');for(const m of text.matchAll(/export const (\w+Table)\s*=/g))names.push(m[1]);}
  await build({entryPoints:['artifacts/api-server/src/engine-readonly.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'canary.mjs'),banner:{js:'import {createRequire} from "node:module";const require=createRequire(import.meta.url);'},logLevel:'silent',plugins:[{name:'fake-db-only',setup(b){b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const db={};export const pool={query:async()=>({rows:[{default_transaction_read_only:process.env.TEST_READONLY_MODE}]}),end:async()=>{}};${[...new Set(names)].map(n=>`export const ${n}={};`).join('')}`}));}}]});
  const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
  const start=mode=>spawn(process.execPath,[join(dir,'canary.mjs')],{env:{...process.env,PORT:String(port),EA_ENGINE_READ_ONLY:'1',SESSION_SECRET:'isolated-test-secret-never-production',TEST_READONLY_MODE:mode},stdio:['ignore','pipe','pipe']});
  child=start('off');let error='';child.stderr.on('data',c=>error+=c);const [code]=await once(child,'exit');assert.notEqual(code,0);assert.match(error,/Read-only database binding required/);
  for(let restart=0;restart<2;restart++){
   child=start('on');child.stderr.resume();child.stdout.resume();let response;
   for(let i=0;i<30;i++){try{response=await fetch(`http://127.0.0.1:${port}/api/healthz`);if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
   assert.equal(response?.status,200);assert.equal((await fetch(`http://127.0.0.1:${port}/api/app/mt5-connect`,{method:'POST',body:'{}'})).status,405);
   const done=once(child,'exit');child.kill('SIGTERM');await done;
  }
 }finally{if(child?.exitCode===null)child.kill('SIGKILL');await rm(dir,{recursive:true,force:true});}
});
