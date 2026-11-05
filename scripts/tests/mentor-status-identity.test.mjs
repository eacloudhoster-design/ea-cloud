import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
test('late cancelled and wrong-client status responses cannot populate mentor view',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ea-mentor-status-')),old=globalThis.fetch;
 try{
  await build({entryPoints:['artifacts/ea-cloud/src/pages/admin/mentor-engine-status.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'status.mjs'),logLevel:'silent'});
  const {loadMentorClientStatus}=await import(pathToFileURL(join(dir,'status.mjs')));const data={clientId:1,connection:{verified:true},copier:{state:'blocked'},mappings:[],recentExecutions:[]};
  let resolve;globalThis.fetch=()=>new Promise(r=>resolve=r);
  const c=new AbortController(),late=loadMentorClientStatus('1',c.signal);c.abort();resolve(new Response(JSON.stringify(data)));await assert.rejects(late,{name:'AbortError'});
  globalThis.fetch=async()=>new Response(JSON.stringify(data));await assert.rejects(loadMentorClientStatus('2',new AbortController().signal),/identity/);
  assert.equal((await loadMentorClientStatus('1',new AbortController().signal)).clientId,1);
 }finally{globalThis.fetch=old;await rm(dir,{recursive:true,force:true});}
});
