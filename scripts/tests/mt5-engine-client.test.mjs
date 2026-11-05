import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
test('client sends credentials once, requires exact verification and cancels bounded requests',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ea-mt5-client-')),old=globalThis.fetch;let calls=0;
 try{
  await build({entryPoints:['artifacts/ea-app/src/lib/mt5-engine.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'client.mjs'),logLevel:'silent'});
  const api=await import(pathToFileURL(join(dir,'client.mjs'))),input={login:'91',server:'Fixture',password:'fixture-secret'},controller=new AbortController();
  let body={connected:true,status:'connected',login:'91',server:'Fixture'};
  globalThis.fetch=async(url,init)=>{calls++;assert.equal(url,'/api/app/mt5-connect');assert.equal(init.credentials,'same-origin');assert.equal(JSON.parse(init.body).password,'fixture-secret');return new Response(JSON.stringify(body),{status:200});};
  assert.equal((await api.connectMt5Account(input,'fixture-cookie-hint',controller.signal)).connected,true);assert.equal(calls,1);
  for(const invalid of [{},{connected:false},{...body,login:'92'}]){body=invalid;await assert.rejects(api.connectMt5Account(input,'fixture-cookie-hint',controller.signal));}
  controller.abort();const before=calls;await assert.rejects(api.connectMt5Account(input,'fixture-cookie-hint',controller.signal),{name:'AbortError'});assert.equal(calls,before);
 }finally{globalThis.fetch=old;await rm(dir,{recursive:true,force:true});}
});
