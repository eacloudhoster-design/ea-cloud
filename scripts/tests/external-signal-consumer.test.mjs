import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
test('hosted external-consumer mode neither reconciles, claims nor wakes the VPS execution queue',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ea-external-role-')),old=process.env.EA_SIGNAL_WORKER_MODE;let calls=0;
 globalThis.__dbMustNotRun=new Proxy({},{get(){calls++;throw Error('Unexpected database mutation')}});
 try{
  await build({entryPoints:['artifacts/api-server/src/lib/signal-worker.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'role.mjs'),logLevel:'silent',plugins:[{name:'nonfinancial-fixture',setup(b){b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));b.onResolve({filter:/^\.\/copy-engine$/},()=>({path:'copier',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='db'?'export const db=globalThis.__dbMustNotRun;export const tradeSignalsTable={};export const tradeExecutionsTable={};':'export const runSignal=()=>{throw Error("Copier must not run")};',loader:'js'}));}}]});
  const role=await import(pathToFileURL(join(dir,'role.mjs')));process.env.EA_SIGNAL_WORKER_MODE='external';
  await role.reconcileOnStartup({});role.startWorker({});role.wakeWorker({});await new Promise(r=>setTimeout(r,20));assert.equal(calls,0);assert.equal(role.signalWorkerHealthy(),false,'External is explicitly reported; no local worker is claimed healthy');
  process.env.EA_SIGNAL_WORKER_MODE='invalid';assert.throws(()=>role.startWorker({}),/Invalid signal worker mode/);assert.equal(calls,0);
 }finally{if(old===undefined)delete process.env.EA_SIGNAL_WORKER_MODE;else process.env.EA_SIGNAL_WORKER_MODE=old;delete globalThis.__dbMustNotRun;await rm(dir,{recursive:true,force:true})}
});
