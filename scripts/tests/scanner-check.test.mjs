import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
const b=await build({entryPoints:['artifacts/api-server/src/check-scanner.ts'],bundle:true,platform:'node',format:'esm',write:false});
const source='data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64');
test('Render capability checker verifies metadata and opt-in image/JSON without exposing credentials or touching credits',async()=>{
 const saved={fetch:global.fetch,log:console.log,error:console.error,argv:process.argv,exit:process.exitCode,key:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL,scanner:process.env.GEMINI_SCANNER_MODEL};
 const logs=[];let calls=0;
 try{
  console.log=console.error=value=>logs.push(value);
  process.env.GEMINI_API_KEY='sensitive-test-key';process.env.GEMINI_MODEL='gemini-fixture-model';delete process.env.GEMINI_SCANNER_MODEL;
  process.argv=['node','check-scanner','--image-probe'];
  global.fetch=async(url,init)=>{calls++;assert.equal(init.headers['x-goog-api-key'],'sensitive-test-key');assert.ok(!url.includes('sensitive'));if(calls===1)return new Response(JSON.stringify({supportedGenerationMethods:['generateContent']}));const body=JSON.parse(init.body);assert.equal(body.generationConfig.responseMimeType,'application/json');assert.equal(body.contents[0].parts[1].inlineData.mimeType,'image/png');return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}]}));};
  await import(source+'#success');assert.equal(calls,2);assert.equal(JSON.parse(logs.at(-1)).imageJsonProbe,'passed');
  global.fetch=async()=>new Response('sensitive raw upstream error',{status:404});await import(source+'#unavailable');assert.equal(process.exitCode,1);assert.equal(JSON.parse(logs.at(-1)).upstreamStatus,404);
  delete process.env.GEMINI_MODEL;calls=0;global.fetch=async()=>{calls++;throw Error('not called');};await import(source+'#missing');assert.equal(calls,0);assert.equal(JSON.parse(logs.at(-1)).code,'AI_MODEL_NOT_CONFIGURED');
  assert.doesNotMatch(logs.join('\n'),/sensitive|inlineData|base64|data:image/);
 }finally{
  global.fetch=saved.fetch;console.log=saved.log;console.error=saved.error;process.argv=saved.argv;process.exitCode=saved.exit;
  for(const [name,value] of [['GEMINI_API_KEY',saved.key],['GEMINI_MODEL',saved.model],['GEMINI_SCANNER_MODEL',saved.scanner]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}
 }
});
