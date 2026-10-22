import {mkdirSync,writeFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';import {directionalFields} from './fixtures/scanner-direction.mjs';
const b=await build({stdin:{contents:'import {createElement} from "./artifacts/ea-app/node_modules/react/index.js";import {renderToStaticMarkup} from "./artifacts/ea-app/node_modules/react-dom/server.node.js";import Component from "./artifacts/ea-app/src/components/ScannerChartReport.tsx";export function render(record){return renderToStaticMarkup(createElement(Component,{record,settings:{lotUnits:5,positions:2},onEditSettings:()=>{}}));}export {buildDirectionalReport} from "./artifacts/api-server/src/lib/scanner-direction.ts";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',jsx:'automatic',write:false,banner:{js:'import {createRequire} from "node:module";const require=createRequire(process.cwd()+"/package.json");'},loader:{'.css':'empty'},tsconfig:'artifacts/ea-app/tsconfig.json'});mkdirSync('work/scanner-ui-tests',{recursive:true});const output=resolve('work/scanner-ui-tests/report.mjs');writeFileSync(output,b.outputFiles[0].text);const {render,buildDirectionalReport}=await import(pathToFileURL(output));
const base={...directionalFields,signal:'BUY',symbol:'XAUUSD',timeframe:'M15',entry:3300,stopLoss:3280,takeProfit:3340,reasoning:'Readable chart structure supports a tentative directional setup, subject to the original invalidation levels.'};
const show=report=>render({id:'fixture',kind:'chart',strategy:'SMC',createdAt:'2026-10-21T12:00:00Z',report});
test('actual BUY/SELL cards render only requested signal data with clickable review despite missing MT5',()=>{
 for(const signal of ['BUY','SELL']){
  const r=buildDirectionalReport({...base,signal,confidence:55,confidenceReason:'Subjective evidence-based directional estimate from the isolated fixture.',...(signal==='SELL'?{stopLoss:3320,takeProfit:3260}:{})});const html=show(r);
  for(const value of [signal+' GOLD','XAUUSD','M15','SMC','55%','3,300.00','ENTRY','STOP LOSS','TAKE PROFIT','TRADE ANALYSIS','EXECUTE TRADE'])assert.ok(html.includes(value),value);
  for(const banned of ['Uncalibrated','AI-estimated','win probability','Live execution unavailable','Live market unverified','Chart reference levels','not live quotes','Awaiting live verification','Full analysis','Report saved'])assert.ok(!html.includes(banned),banned);
  assert.match(html,/<button class="scanner-result-execute" type="button">/);assert.ok(!html.includes('disabled='));
 }
});
test('missing confidence/prices are never invented and invalid/archived analyses cannot open execution',()=>{
 const r=buildDirectionalReport({...base,confidence:null,entry:null,stopLoss:null,takeProfit:null});const html=show(r);assert.ok(!html.includes('55%'));assert.ok(!html.includes('Uncalibrated'));assert.match(html,/scanner-result-execute[^>]*disabled/);
});
test('visible analysis is a bounded excerpt; original report data is unchanged',()=>{
 const r=buildDirectionalReport({...base,reasoning:Array(120).fill('structure').join(' ')});const before=JSON.stringify(r),html=show(r);assert.equal(JSON.stringify(r),before);assert.equal((html.match(/structure/g)||[]).length,36);assert.ok(!html.includes('<details'));
});
