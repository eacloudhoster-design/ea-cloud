import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
import { directionalFields } from './fixtures/scanner-direction.mjs';
const b=await build({stdin:{contents:'import { createElement } from "./artifacts/ea-app/node_modules/react/index.js";import {renderToStaticMarkup} from "./artifacts/ea-app/node_modules/react-dom/server.node.js";import Component from "./artifacts/ea-app/src/components/ScannerChartReport.tsx";export function render(record){return renderToStaticMarkup(createElement(Component,{record,settings:{lotUnits:5,positions:2},onEditSettings:()=>{}}));}export {buildDirectionalReport} from "./artifacts/api-server/src/lib/scanner-direction.ts";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',jsx:'automatic',write:false,banner:{js:'import {createRequire} from "node:module";const require=createRequire(process.cwd()+"/package.json");'},loader:{'.css':'empty'},tsconfig:'artifacts/ea-app/tsconfig.json'});
mkdirSync('work/scanner-ui-tests',{recursive:true});const output=resolve('work/scanner-ui-tests/report.mjs');writeFileSync(output,b.outputFiles[0].text);
const {render,buildDirectionalReport}=await import(pathToFileURL(output));
const base={...directionalFields,signal:'BUY',symbol:'XAUUSD',timeframe:'M15',entry:3300,stopLoss:3280,takeProfit:3340,reasoning:'This is an isolated fixture explaining a tentative structure-based direction.',limitations:'Chart references only. No live market has been verified.'};
const show=report=>render({id:'fixture',kind:'chart',strategy:'SMC',createdAt:'2026-10-21T12:00:00Z',report});
test('new BUY/SELL reports render confidence, all six analysis sections and disabled green execution',()=>{
 for(const direction of ['BUY','SELL']){
  const input={...base,signal:direction,confidence:55,confidenceReason:'An uncertain subjective estimate of the visible direction, not a win probability.',...(direction==='SELL'?{stopLoss:3340,takeProfit:3280}:{})};
  const html=show(buildDirectionalReport(input));assert.ok(html.includes(direction));assert.ok(html.includes('55%'));assert.ok(html.includes('Not a verified win probability'));assert.ok(html.includes('NOT EXECUTABLE'));assert.match(html,/scanner-result-execute[^>]*disabled/);
  for(const heading of ['Market structure','Trend direction','Liquidity sweeps','Support &amp; resistance','Entry reasoning','Risks &amp; invalidation'])assert.ok(html.includes(heading));assert.ok(html.includes('Reference risk / reward'));
 }
});
test('uncalibrated/closed/limited setups and archived history never present fabricated tradability',()=>{
 const html=show(buildDirectionalReport({...base,chartClarity:'limited',marketStatus:'closed',entry:null,stopLoss:null,takeProfit:null}));assert.ok(html.includes('Uncalibrated'));assert.ok(html.includes('Market reported closed'));assert.ok(html.includes('NOT EXECUTABLE'));assert.ok(!html.includes('Reference risk / reward'));
 const {confidence,confidenceReason,chartClarity,marketStatus,analysis,...old}=base;const legacy=show({...old,signal:'NO TRADE',entry:null,stopLoss:null,takeProfit:null});assert.ok(legacy.includes('Archived analysis'));assert.ok(!legacy.includes('NO TRADE'));assert.match(legacy,/scanner-result-execute[^>]*disabled/);
});

test('normalized missing optional fields render safe unavailable labels without prices or percentages',()=>{
 const html=show(buildDirectionalReport({signal:'SELL',reasoning:'The visible trend supports a tentative downward bias, but trade levels are not established.'}));
 assert.ok(html.includes('SELL'));assert.ok(html.includes('Uncalibrated'));assert.ok(html.includes('Not established from this chart.'));assert.ok(html.includes('NOT EXECUTABLE'));assert.match(html,/scanner-result-execute[^>]*disabled/);assert.ok(!html.includes('undefined%'));assert.ok(!html.includes('Reference risk / reward'));
});
