import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
const b=await build({stdin:{contents:`import {createElement} from './artifacts/ea-app/node_modules/react/index.js';import {renderToStaticMarkup} from './artifacts/ea-app/node_modules/react-dom/server.node.js';import {AppContext} from './artifacts/ea-app/src/context/AppContext';import Modal from './artifacts/ea-app/src/components/ChartScannerModal';import Settings from './artifacts/ea-app/src/components/ScannerTradeSettings';
export function modal(branding){return renderToStaticMarkup(createElement(AppContext.Provider,{value:branding},createElement(Modal,{onClose:()=>{},onNavigate:()=>{}})));}
export function confirmation(report){return renderToStaticMarkup(createElement(Settings,{mode:'confirmation',report,initial:{lotUnits:5,positions:2},onClose:()=>{},onConfirm:()=>{}}));}`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',jsx:'automatic',write:false,tsconfig:'artifacts/ea-app/tsconfig.json',loader:{'.css':'empty'},banner:{js:'import {createRequire} from "node:module";const require=createRequire(process.cwd()+"/package.json");'}});
mkdirSync('work/scanner-terminal-tests',{recursive:true});const file=resolve('work/scanner-terminal-tests/actual-components.mjs');writeFileSync(file,b.outputFiles[0].text);const {modal,confirmation}=await import(pathToFileURL(file));
test('each mentor gets its own existing uploaded branding, responsive header and gallery/camera controls',()=>{
 for(const eaName of ['SMC Blueprint EA V3+','Another Mentor EA']){
  const html=modal({eaName,bgImageUrl:'/uploads/mentor-custom.png',clientToken:null});
  assert.ok(html.includes(eaName));assert.ok(html.includes('Chart Scanner'));assert.ok(html.includes('scanner-orb-avatar'));assert.ok(html.includes('/uploads/mentor-custom.png'));
  assert.ok(html.includes('image/heic'));assert.ok(html.includes('Gallery'));assert.ok(html.includes('Camera'));assert.ok(html.includes('CPI'));
  assert.ok(!html.includes('Gemini AI'));assert.ok(!html.includes('ea-cloud-logo'));assert.ok(html.includes('Google Gemini only when you request analysis'));
 }
 const fallback=modal({eaName:'Unbranded EA',bgImageUrl:null,clientToken:null});assert.ok(fallback.includes('scanner-mentor-fallback'));assert.ok(!fallback.includes('ea-cloud-logo'));
});
test('confirmation restores real chart levels and quantities without inventing account identity, risk or execution',()=>{
 const html=confirmation({signal:'SELL',symbol:'XAUUSD',entry:3300,stopLoss:3320,takeProfit:3260,riskRewardRatio:2});
 for(const text of ['XAUUSD','SELL','3,300.00','3,320.00','3,260.00','Connection not verified','Estimated monetary risk','broker tick value','Lot size','Trades per signal'])assert.ok(html.includes(text),text);
 assert.match(html,/<button[^>]*disabled=""[^>]*>Confirm order/);assert.ok(html.includes('No order has been submitted'));
});
