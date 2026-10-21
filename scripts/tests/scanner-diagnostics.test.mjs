import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
const b=await build({entryPoints:['artifacts/api-server/src/lib/scanner-diagnostics.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {scannerFailureDiagnostic:diagnostic}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
test('Gemini diagnostics log only allowlisted operational metadata',()=>{
 const d=diagnostic({code:'AI_PROVIDER_ACCESS_DENIED',category:'configuration',upstreamStatus:403,message:'private-key-and-image',cause:{body:'base64-image'},headers:{'x-goog-api-key':'private'},model:'private'});
 assert.equal(d.upstreamStatus,403);assert.equal(d.category,'configuration');assert.equal(d.code,'AI_PROVIDER_ACCESS_DENIED');assert.doesNotMatch(JSON.stringify(d),/private|base64|headers|message|cause|model/);
 assert.deepEqual(diagnostic({code:'private key',category:'private prompt',upstreamStatus:'private token'}),{event:'scanner_analysis_failed',code:'SCANNER_REQUEST_FAILED',category:'service',upstreamStatus:null,apiVersion:'v1beta'});
});
