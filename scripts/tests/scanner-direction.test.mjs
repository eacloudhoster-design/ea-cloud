import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
import { directionalFields } from './fixtures/scanner-direction.mjs';
const bundle=await build({stdin:{contents:'export {buildDirectionalReport} from "./artifacts/api-server/src/lib/scanner-direction.ts";export {chartReportSchema} from "./lib/api-zod/src/scanner.ts";export {confidenceLabel,directionalLabel,formatRiskReward} from "./artifacts/ea-app/src/lib/scanner-report-view.ts";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {buildDirectionalReport:report,chartReportSchema,confidenceLabel,directionalLabel,formatRiskReward}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const base={...directionalFields,signal:'BUY',symbol:'XAUUSD',timeframe:'H1',entry:3300,stopLoss:3280,takeProfit:3340,reasoning:'Visible structure supports a tentative upward bias, subject to invalidation.',limitations:'Screenshot is historical, not a verified live quote.'};
test('BUY and SELL preserve directional bias and derive risk/reward without permitting execution',()=>{
 assert.notEqual(formatRiskReward(.00001),'0');assert.notEqual(formatRiskReward(.00001),'0.00');
 for(const input of [base,{...base,signal:'SELL',stopLoss:3340,takeProfit:3280}]){
  const result=report(input);assert.equal(result.signal,input.signal);assert.equal(result.riskRewardRatio,input.signal==='BUY'?2:.5);assert.equal(result.executionStatus,'NOT_EXECUTABLE');assert.equal(chartReportSchema.safeParse(result).success,true);assert.equal(directionalLabel(result),input.signal);
 }
});
test('low-confidence, unclear and closed-market predictions keep direction while blocking execution',()=>{
 const low=report({...base,confidence:45,confidenceReason:'Tentative estimate based on weak and conflicting directional chart evidence.'});assert.equal(confidenceLabel(low),'45%');assert.ok(low.nonExecutableReasons.some(r=>r.includes('insufficient')));
 const unclear=report({...base,chartClarity:'limited',confidence:90,entry:null,stopLoss:null,takeProfit:null});assert.equal(unclear.signal,'BUY');assert.equal(unclear.confidence,null);assert.equal(confidenceLabel(unclear),'Uncalibrated');assert.equal(unclear.riskRewardRatio,null);
 const closed=report({...base,signal:'SELL',entry:null,stopLoss:null,takeProfit:null,marketStatus:'closed'});assert.equal(closed.signal,'SELL');assert.ok(closed.nonExecutableReasons.some(r=>r.includes('closed')));
 const claimedOpen=report({...base,marketStatus:'open',confidence:98});assert.equal(claimedOpen.marketStatus,'unknown');assert.equal(claimedOpen.executionStatus,'NOT_EXECUTABLE');
});
test('NO TRADE, invented/inverted prices, wrong types and executable overrides fail validation',()=>{
 for(const patch of [{signal:'NO TRADE'},{entry:-1},{entry:'3300'},{stopLoss:3400},{confidence:101},{executionStatus:'EXECUTABLE'},{analysis:{...base.analysis,liquiditySweeps:17}}])assert.throws(()=>report({...base,...patch}));
});
test('legacy NO TRADE and BUY/SELL history remains readable and is never rewritten into fabricated directions',()=>{
 const {confidence,confidenceReason,chartClarity,marketStatus,analysis,...legacy}=base;
 assert.equal(chartReportSchema.safeParse(legacy).success,true);
 const archived={...legacy,signal:'NO TRADE',entry:null,stopLoss:null,takeProfit:null};assert.equal(chartReportSchema.safeParse(archived).success,true);assert.equal(directionalLabel(archived),'Archived analysis');assert.equal(confidenceLabel(legacy),'Uncalibrated');
});
