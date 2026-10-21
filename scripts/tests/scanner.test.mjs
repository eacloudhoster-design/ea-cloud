import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
const bundle = await build({ entryPoints: ['artifacts/api-server/src/lib/scanner-gemini.ts'], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { parseChartReport, validateChartImage, analyseChart, analyseFundamentals } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const valid = { signal: 'BUY', symbol: 'XAUUSD', timeframe: 'H1', entry: 3300, stopLoss: 3280, takeProfit: 3340, reasoning: 'Visible structure suggests a possible retest with uncertainty.', limitations: 'Screenshot is not a live quote.' };
const bytes = Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(40)]);
const originalFetch = global.fetch, originalKey = process.env.GEMINI_API_KEY, originalModel = process.env.GEMINI_SCANNER_MODEL;
beforeEach(() => { process.env.GEMINI_API_KEY = 'isolated-test-key'; process.env.GEMINI_SCANNER_MODEL='gemini-fixture-model'; });
afterEach(() => { global.fetch = originalFetch; if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey; if(originalModel===undefined)delete process.env.GEMINI_SCANNER_MODEL;else process.env.GEMINI_SCANNER_MODEL=originalModel; });
const response = (text, groundingMetadata) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] }, groundingMetadata }] }), { status: 200 });
test('strict result validation rejects inverted/missing/negative levels and extra instructions', () => {
  assert.deepEqual(parseChartReport(JSON.stringify(valid)), valid);
  for (const patch of [{stopLoss:3400},{takeProfit:3200},{entry:null},{entry:-1},{symbol:null},{timeframe:null},{execute:true},{signal:'CONNECTED'}])
    assert.throws(() => parseChartReport(JSON.stringify({...valid,...patch})), /valid trade levels/);
  assert.throws(() => parseChartReport('```json\n{}\n```'), /unreadable/);
});
test('NO TRADE cannot invent executable levels; SELL requires inverse risk ordering', () => {
  assert.equal(parseChartReport(JSON.stringify({...valid,signal:'NO TRADE',entry:null,stopLoss:null,takeProfit:null})).signal, 'NO TRADE');
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
  assert.deepEqual(await analyseChart(bytes,'image/jpeg','SMC',new AbortController().signal), valid);
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
  await assert.rejects(analyseChart(bytes,'image/jpeg','Auto',new AbortController().signal),/valid trade levels/);
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

test('evidence tags are optional for old history, bounded and never accept confidence or invented tag fields', () => {
  assert.deepEqual(parseChartReport(JSON.stringify(valid)), valid);
  const tags=['Liquidity Sweep','Order Block','Bullish Structure','Volume Support'];
  assert.deepEqual(parseChartReport(JSON.stringify({...valid,evidenceTags:tags})).evidenceTags,tags);
  for(const patch of [{evidenceTags:['Guaranteed Profit']},{evidenceTags:['Liquidity Sweep','Liquidity Sweep']},{evidenceTags:[...tags,'Trend Continuation']},{confidence:87}])
    assert.throws(()=>parseChartReport(JSON.stringify({...valid,...patch})),/valid trade levels/);
});
