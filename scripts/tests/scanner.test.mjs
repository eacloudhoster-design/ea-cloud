import { directionalFields } from "./fixtures/scanner-direction.mjs";
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
const bundle = await build({ entryPoints: ['artifacts/api-server/src/lib/scanner-gemini.ts'], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { parseChartReport, validateChartImage, analyseChart, analyseFundamentals, scannerConfiguration } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const valid = { ...directionalFields, evidenceTags: [], signal: 'BUY', symbol: 'XAUUSD', timeframe: 'H1', entry: 3300, stopLoss: 3280, takeProfit: 3340, reasoning: 'Visible structure suggests a possible retest with uncertainty.', limitations: 'Screenshot is not a live quote.' };
const predictionOnly = ({schemaVersion,riskRewardRatio,executionStatus,nonExecutableReasons,...prediction})=>prediction;
const bytes = Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(40)]);
const originalFetch = global.fetch, originalKey = process.env.GEMINI_API_KEY, originalModel = process.env.GEMINI_SCANNER_MODEL, originalAlias = process.env.GEMINI_MODEL;
beforeEach(() => { delete process.env.GEMINI_MODEL; process.env.GEMINI_API_KEY = 'isolated-test-key'; process.env.GEMINI_SCANNER_MODEL='gemini-fixture-model'; });
afterEach(() => { if(originalAlias===undefined)delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=originalAlias; global.fetch = originalFetch; if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey; if(originalModel===undefined)delete process.env.GEMINI_SCANNER_MODEL;else process.env.GEMINI_SCANNER_MODEL=originalModel; });
const response = (text, groundingMetadata) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] }, groundingMetadata }] }), { status: 200 });
test('strict result validation rejects inverted/missing/negative levels and extra instructions', () => {
  assert.deepEqual(predictionOnly(parseChartReport(JSON.stringify(valid))), valid);
  for (const patch of [{stopLoss:3400},{takeProfit:3200},{entry:-1},{entry:"3300"},{reasoning:""},{execute:true},{signal:'CONNECTED'}])
    assert.throws(() => parseChartReport(JSON.stringify({...valid,...patch})), /invalid directional report/);
  assert.throws(() => parseChartReport('```json\n{}\n```'), /unreadable/);
});
test('successful analyses require BUY or SELL; missing levels remain non-executable', () => {
  assert.equal(parseChartReport(JSON.stringify({...valid,entry:null,stopLoss:null,takeProfit:null})).executionStatus, 'NOT_EXECUTABLE');
  assert.throws(()=>parseChartReport(JSON.stringify({...valid,signal:'NO TRADE',entry:null,stopLoss:null,takeProfit:null})));
  assert.throws(() => parseChartReport(JSON.stringify({...valid,signal:'NO TRADE'})));
  assert.equal(parseChartReport(JSON.stringify({...valid,signal:'SELL',stopLoss:3340,takeProfit:3280})).signal, 'SELL');
});
test('image MIME spoofing, empty/oversized content and unsupported files are rejected', () => {
  validateChartImage(bytes,'image/jpeg');
  for (const [data,type] of [[bytes,'image/png'],[Buffer.from('<svg></svg>'),'image/svg+xml'],[Buffer.alloc(0),'image/jpeg'],[Buffer.alloc(2*1024*1024+1),'image/jpeg']]) assert.throws(() => validateChartImage(data,type));
});
test('chart adapter sends bounded image only through server Gemini endpoint and never executes trades', async () => {
  const calls=[];
  global.fetch = async (url,init) => { calls.push({url,init}); return response(JSON.stringify(valid)); };
  assert.deepEqual(predictionOnly(await analyseChart(bytes,'image/jpeg','SMC',new AbortController().signal)), valid);
  assert.equal(calls.length,1); assert.match(calls[0].url,/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-fixture-model:generateContent$/);
  assert.equal(calls[0].init.headers['x-goog-api-key'],'isolated-test-key');
  assert.equal(new URL(calls[0].url).search,'');
  const body=JSON.parse(calls[0].init.body); assert.equal(body.generationConfig.responseMimeType,'application/json');
  assert.equal(body.contents[0].parts[1].inlineData.data,bytes.toString('base64'));
  assert.match(body.contents[0].parts[0].text,/untrusted market data/);
});
test('missing configuration and provider failures never manufacture signals or expose secrets', async () => {
  delete process.env.GEMINI_API_KEY;
  let calls=0; global.fetch=async()=>{ calls++; return response('{}'); };
  await assert.rejects(analyseChart(bytes,'image/jpeg','Auto',new AbortController().signal),/not configured/); assert.equal(calls,0);
  process.env.GEMINI_API_KEY='isolated-test-key';
  global.fetch=async()=>new Response('private diagnostic isolated-test-key',{status:429});
  await assert.rejects(analyseChart(bytes,'image/jpeg','Auto',new AbortController().signal),error=>error.status===429 && !error.message.includes('isolated-test-key'));
  global.fetch=async()=>response(JSON.stringify({...valid,stopLoss:5000}));
  await assert.rejects(analyseChart(bytes,'image/jpeg','Auto',new AbortController().signal),/invalid directional report/);
});
test('fundamentals require grounded supports and HTTPS sources, not model-only current news', async () => {
  const context={market:'XAUUSD',focus:'CPI',outlook:'Next 1–3 days'};
  global.fetch=async()=>response('Unsupported current-release claims');
  await assert.rejects(analyseFundamentals(context,new AbortController().signal),/could not be verified/);
  global.fetch=async(_url,init)=>{
    const body=JSON.parse(init.body); assert.deepEqual(body.tools,[{google_search:{}}]); assert.match(body.contents[0].parts[0].text,/CPI/);
    return response('CPI context with dated source. Unreleased figures are unavailable. [1]',{groundingSupports:[{groundingChunkIndices:[0]}],groundingChunks:[{web:{title:'BLS CPI',uri:'https://www.bls.gov/cpi/'}},{web:{title:'unsafe',uri:'javascript:alert(1)'}}]});
  };
  const result=await analyseFundamentals(context,new AbortController().signal);
  assert.deepEqual(result.sources,[{title:'BLS CPI',url:'https://www.bls.gov/cpi/'}]); assert.deepEqual(result.context,context); assert.ok(Date.parse(result.asOf));
});
test('aborted provider call never returns a completed report', async () => {
  global.fetch=async(_url,init)=>{ if(init.signal.aborted) throw new DOMException('Aborted','AbortError'); return response(JSON.stringify(valid)); };
  const controller=new AbortController(); controller.abort();
  await assert.rejects(analyseChart(bytes,'image/jpeg','Auto',controller.signal));
});

test('evidence tags are optional for old history, bounded and reject out-of-range confidence or invented tag fields', () => {
  assert.deepEqual(predictionOnly(parseChartReport(JSON.stringify(valid))), valid);
  const tags=['Liquidity Sweep','Order Block','Bullish Structure','Volume Support'];
  assert.deepEqual(parseChartReport(JSON.stringify({...valid,evidenceTags:tags})).evidenceTags,tags);
  for(const patch of [{evidenceTags:['Guaranteed Profit']},{evidenceTags:['Liquidity Sweep','Liquidity Sweep']},{evidenceTags:[...tags,'Trend Continuation']},{confidence:101}])
    assert.throws(()=>parseChartReport(JSON.stringify({...valid,...patch})),/invalid directional report/);
});

test('provider credentials/model/quota failures are distinct from client access failures', async()=>{
 for(const [status,code,category] of [[401,'AI_PROVIDER_ACCESS_DENIED','configuration'],[403,'AI_PROVIDER_ACCESS_DENIED','configuration'],[404,'AI_MODEL_UNAVAILABLE','configuration'],[429,'AI_PROVIDER_QUOTA','ai'],[500,'AI_PROVIDER_UNAVAILABLE','ai']]){
  global.fetch=async()=>new Response('private provider diagnostic',{status});
  await assert.rejects(analyseChart(bytes,'image/jpeg','Auto',new AbortController().signal),error=>error.code===code&&error.category===category&&error.status!==403&&!error.message.includes('private provider'));
 }
});
test('blank key or invalid model fails before contacting Gemini',async()=>{
 let calls=0;global.fetch=async()=>{calls++;return response('{}');};
 process.env.GEMINI_API_KEY='   ';
 await assert.rejects(analyseChart(bytes,'image/jpeg','Auto',new AbortController().signal),error=>error.code==='AI_KEY_NOT_CONFIGURED');
 process.env.GEMINI_API_KEY='isolated-test-key';process.env.GEMINI_SCANNER_MODEL='../bad model';
 await assert.rejects(analyseChart(bytes,'image/jpeg','Auto',new AbortController().signal),error=>error.code==='AI_MODEL_NOT_CONFIGURED');
 assert.equal(calls,0);
});

test('GEMINI_MODEL works alone; scanner override wins; models/ and whitespace are normalized',async()=>{
 delete process.env.GEMINI_SCANNER_MODEL;process.env.GEMINI_MODEL=' models/gemini-fixture-alias \n';process.env.GEMINI_API_KEY=' isolated-test-key ';
 let calls=0;global.fetch=async(url,init)=>{calls++;assert.ok(url.endsWith('/gemini-fixture-alias:generateContent'));assert.equal(init.headers['x-goog-api-key'],'isolated-test-key');return response(JSON.stringify(valid));};
 assert.equal(scannerConfiguration().configured,true);assert.deepEqual(predictionOnly(await analyseChart(bytes,'image/jpeg','Auto',new AbortController().signal)),valid);assert.equal(calls,1);
 process.env.GEMINI_SCANNER_MODEL=' models/gemini-fixture-override ';
 global.fetch=async url=>{assert.ok(url.endsWith('/gemini-fixture-override:generateContent'));return response(JSON.stringify(valid));};
 await analyseChart(bytes,'image/jpeg','Auto',new AbortController().signal);
});
test('missing/quoted/invalid model names fail before any provider call with actionable variable names',async()=>{
 let calls=0;global.fetch=async()=>{calls++;return response('{}');};
 for(const value of ['', '"gemini-fixture-model"', 'models/models/gemini-fixture-model','../model','not-a-gemini-model','gemini-fixture?key=private']){
  process.env.GEMINI_SCANNER_MODEL=value;
  await assert.rejects(analyseChart(bytes,'image/jpeg','Auto',new AbortController().signal),e=>e.code==='AI_MODEL_NOT_CONFIGURED'&&e.message.includes('GEMINI_MODEL')&&e.upstreamStatus===null);
 }
 assert.equal(calls,0);
});
test('malformed HTTP 200 responses and safety blocks never escape as database failures or fabricated reports',async()=>{
 for(const data of [null,[],{candidates:{}},{candidates:[{finishReason:'STOP',content:{parts:{}}}]}]){
  global.fetch=async()=>new Response(JSON.stringify(data));
  await assert.rejects(analyseChart(bytes,'image/jpeg','Auto',new AbortController().signal),e=>e.code.startsWith('AI_')&&e.upstreamStatus===200);
 }
 global.fetch=async()=>new Response(JSON.stringify({promptFeedback:{blockReason:'SAFETY',private:'never expose'}}));
 await assert.rejects(analyseChart(bytes,'image/jpeg','Auto',new AbortController().signal),e=>e.code==='AI_SAFETY_BLOCKED'&&!e.message.includes('never expose'));
});
test('upstream statuses survive sanitization; unsupported model/request is configuration, not licence denial',async()=>{
 for(const [status,code] of [[400,'AI_REQUEST_REJECTED'],[401,'AI_PROVIDER_ACCESS_DENIED'],[403,'AI_PROVIDER_ACCESS_DENIED'],[404,'AI_MODEL_UNAVAILABLE'],[422,'AI_REQUEST_REJECTED'],[429,'AI_PROVIDER_QUOTA'],[503,'AI_PROVIDER_UNAVAILABLE']]){
  global.fetch=async()=>new Response('sensitive image/key/provider body',{status});
  await assert.rejects(analyseChart(bytes,'image/jpeg','Auto',new AbortController().signal),e=>e.upstreamStatus===status&&e.code===code&&!e.message.includes('sensitive'));
 }
});

test('unreadable chart does not invent a direction or successful report',()=>{
 assert.throws(()=>parseChartReport('{"error":"UNREADABLE_CHART"}'),e=>e.code==='AI_DIRECTION_UNAVAILABLE'&&e.status===422);
});
