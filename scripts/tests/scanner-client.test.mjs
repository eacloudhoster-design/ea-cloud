import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
const bundle=await build({entryPoints:['artifacts/ea-app/src/lib/scanner.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {scannerRequest,scannerErrorTitle}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const original=global.fetch;afterEach(()=>global.fetch=original);
test('browser preserves distinct access and AI errors and retry policy',async()=>{
 for(const [status,category,code,retryable,title] of [[403,'access','SCANNER_SUBSCRIPTION_EXPIRED',false,'Scanner access denied'],[503,'configuration','AI_PROVIDER_ACCESS_DENIED',false,'AI analysis unavailable'],[429,'ai','AI_PROVIDER_QUOTA',true,'AI analysis unavailable']]){
  global.fetch=async()=>new Response(JSON.stringify({error:'Safe explanation',category,code,retryable}),{status});
  await assert.rejects(scannerRequest('chart','fixture',new AbortController().signal),error=>error.code===code&&error.retryable===retryable&&scannerErrorTitle(error)===title);
 }
});
test('legacy access responses cannot become retryable AI failures',async()=>{
 global.fetch=async()=>new Response(JSON.stringify({error:'Access denied'}),{status:403});
 await assert.rejects(scannerRequest('chart','fixture',new AbortController().signal),error=>error.category==='access'&&!error.retryable);
});
