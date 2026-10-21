import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
import { directionalFields } from './fixtures/scanner-direction.mjs';
const b=await build({stdin:{contents:'export {parseChartReport,analyseChart} from "./artifacts/api-server/src/lib/scanner-gemini.ts";export {scannerPredictionJsonSchema,scannerChartResponseJsonSchema} from "./artifacts/api-server/src/lib/scanner-json-schema.ts";export {scannerFailureDiagnostic,reportValidationDetails} from "./artifacts/api-server/src/lib/scanner-diagnostics.ts";export {directionalPredictionSchema,chartReportSchema} from "./lib/api-zod/src/scanner.ts";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {parseChartReport:parse,analyseChart,scannerPredictionJsonSchema:jsonSchema,scannerChartResponseJsonSchema:responseSchema,scannerFailureDiagnostic:diagnostic,reportValidationDetails,directionalPredictionSchema,chartReportSchema}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const minimum={signal:'BUY',reasoning:'The visible trend leans upward, but the screenshot cannot establish actionable levels.'};
const full={...directionalFields,...minimum,symbol:'XAUUSD',timeframe:'H1',entry:3300,stopLoss:3280,takeProfit:3340,limitations:'A historical screenshot is not a current quote.'};
const parseObject=raw=>parse(JSON.stringify(raw));
const original={fetch:global.fetch,key:process.env.GEMINI_API_KEY,model:process.env.GEMINI_SCANNER_MODEL};
afterEach(()=>{global.fetch=original.fetch;for(const [name,value] of [['GEMINI_API_KEY',original.key],['GEMINI_SCANNER_MODEL',original.model]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}});
function failure(raw){try{parseObject(raw);assert.fail('expected validation failure');}catch(error){return diagnostic(error);}}

test('regression: BUY/SELL with all optional fields omitted or null becomes a compatible non-executable report',()=>{
 for(const signal of ['BUY','SELL']){
  for(const optional of [{},{symbol:null,timeframe:null,entry:null,stopLoss:null,takeProfit:null,confidence:null,confidenceReason:null,limitations:null,analysis:null,evidenceTags:null,marketStatus:null,chartClarity:null}]){
   const report=parseObject({...minimum,signal,...optional});assert.equal(report.signal,signal);assert.equal(report.confidence,null);assert.equal(report.entry,null);assert.equal(report.riskRewardRatio,null);assert.equal(report.marketStatus,'unknown');assert.equal(report.executionStatus,'NOT_EXECUTABLE');assert.equal(report.analysis.liquiditySweeps,null);assert.ok(chartReportSchema.safeParse(report).success);
  }
 }
});
test('regression: short unavailable notes, partial analysis and fractional estimated confidence are valid',()=>{
 const report=parseObject({...full,analysis:{liquiditySweeps:'Not visible.'},confidence:57.5,confidenceReason:'A subjective estimate supported by mixed directional evidence in the readable chart.'});
 assert.equal(report.analysis.liquiditySweeps,'Not visible.');assert.equal(report.analysis.marketStructure,null);assert.equal(report.confidence,57.5);assert.equal(report.riskRewardRatio,2);
 const unsupported=parseObject({...full,confidence:90,confidenceReason:null});assert.equal(unsupported.confidence,null);
 const partial=parseObject({...full,takeProfit:undefined});assert.equal(partial.entry,null);assert.equal(partial.stopLoss,null);assert.equal(partial.takeProfit,null);
 const unclear=parseObject({...full,chartClarity:undefined,confidence:80});assert.equal(unclear.entry,null);assert.equal(unclear.confidence,null);
});
test('essential signal/reasoning and numeric/enum/price integrity remain strict with field/type diagnostics',()=>{
 for(const [patch,path,type] of [[{signal:'NO TRADE'},'signal','string'],[{signal:undefined},'signal','missing'],[{reasoning:'short'},'reasoning','string'],[{confidence:'75%'},'confidence','string'],[{entry:'3300'},'entry','string'],[{stopLoss:3400},'entry','number'],[{analysis:[]},'analysis','array'],[{analysis:{liquiditySweeps:12}},'analysis.liquiditySweeps','number']]){
  const log=failure({...full,...patch});assert.equal(log.code,'AI_INVALID_REPORT');assert.equal(log.upstreamStatus,200);assert.equal(log.reportValidation.stage,'schema');assert.ok(log.reportValidation.issues.some(i=>i.path===path&&i.receivedType===type));assert.doesNotMatch(JSON.stringify(log),/3300|3400|75%|visible trend/);
 }
});
test('malformed JSON, unreadable outcomes and malicious property names cannot leak private content',()=>{
 for(const input of ['{"signal":','```json\n{}\n```'])assert.throws(()=>parse(input),e=>diagnostic(e).reportValidation.stage==='json');
 assert.throws(()=>parseObject({error:'UNREADABLE_CHART'}),e=>e.code==='AI_DIRECTION_UNAVAILABLE');
 assert.throws(()=>parseObject({error:'UNREADABLE_CHART',signal:'BUY'}),e=>e.code==='AI_INVALID_REPORT');
 const log=failure({...full,analysis:{['private-chart-image-key']:'private data'}});assert.doesNotMatch(JSON.stringify(log),/private|image-key|private data/);
 const safe=reportValidationDetails('schema',[{path:['private-secret'],code:'private-code'}],{'private-secret':'private-image'});assert.doesNotMatch(JSON.stringify(safe),/private/);
});
test('Gemini receives structured JSON schema with the same canonical optional field names/enums as backend validation',async()=>{
 assert.equal(jsonSchema.additionalProperties,false);assert.deepEqual(jsonSchema.required,['signal','reasoning']);
 assert.deepEqual(Object.keys(jsonSchema.properties).sort(),Object.keys(directionalPredictionSchema._def.schema.shape).sort());
 for(const field of ['entry','stopLoss','takeProfit','confidence']){assert.ok(jsonSchema.properties[field].type.includes('null'));assert.ok(jsonSchema.properties[field].type.includes('number'));}
 const image=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(40)]);process.env.GEMINI_API_KEY='isolated-test-key';process.env.GEMINI_SCANNER_MODEL='gemini-fixture-model';
 global.fetch=async(_url,init)=>{const body=JSON.parse(init.body);assert.equal(body.generationConfig.responseMimeType,'application/json');assert.deepEqual(body.generationConfig.responseJsonSchema,responseSchema);assert.deepEqual(body.generationConfig.responseJsonSchema.anyOf[0].required,['signal','reasoning']);return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(minimum)}]}}]}));};
 const report=await analyseChart(image,'image/jpeg','Auto',new AbortController().signal);assert.equal(report.signal,'BUY');assert.equal(report.entry,null);
});

test('multipart structured JSON is concatenated exactly, without injecting newlines inside keys or strings',async()=>{
 process.env.GEMINI_API_KEY='isolated-test-key';process.env.GEMINI_SCANNER_MODEL='gemini-fixture-model';
 const text=JSON.stringify(minimum),split=text.indexOf('visible')+3;
 global.fetch=async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private thought not part of JSON'},{text:text.slice(0,split)},{text:text.slice(split)}]}}]}));
 const report=await analyseChart(Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(40)]),'image/jpeg','Auto',new AbortController().signal);assert.equal(report.reasoning,minimum.reasoning);assert.equal(report.signal,'BUY');
});
