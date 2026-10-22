// Review artifact only: actual production components with explicit fixture data.
// Nothing from this harness is imported into the app or deployed.
import {resolve} from 'node:path';
import {build} from '../artifacts/api-server/node_modules/esbuild/lib/main.js';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const output='work/scanner-terminal-preview';mkdirSync(output,{recursive:true});
const entry=`
import React,{useState} from './artifacts/ea-app/node_modules/react/index.js';
import {createRoot} from './artifacts/ea-app/node_modules/react-dom/client.js';
import {AppContext} from './artifacts/ea-app/src/context/AppContext';
import Modal from './artifacts/ea-app/src/components/ChartScannerModal';
import Report from './artifacts/ea-app/src/components/ScannerChartReport';
import Settings from './artifacts/ea-app/src/components/ScannerTradeSettings';
import {buildDirectionalReport} from './artifacts/api-server/src/lib/scanner-direction';
import background from './artifacts/ea-cloud/public/default-robot.jpg';
const values={activeTab:'home',botRunning:false,setBotRunning:()=>{},interfaceStyle:'matrix',setInterfaceStyle:()=>{},accentColor:'#ef4444',setAccentColor:()=>{},shapeStyle:'orbit',setShapeStyle:()=>{},mtConnected:false,setMtConnected:()=>{},eaName:'Example Mentor EA',eaTagline:'Review fixture',eaSymbols:['XAUUSD'],bgImageUrl:background,showBg:true,setShowBg:()=>{},clientToken:'isolated-preview-only'};
// All fetches are isolated; preview cannot contact production or place orders.
window.fetch=async(input)=>{const path=String(input);const readOnly=path.includes('/status')||path.includes('/history');return new Response(JSON.stringify(readOnly?{configured:false,records:[],hasMore:false}:{error:'This review file does not perform analysis or trading. Use the authenticated EA Cloud app.',code:'PREVIEW_OFFLINE',category:'service',retryable:false}),{status:readOnly?200:503,headers:{'Content-Type':'application/json'}});};
function Preview(){const[view,setView]=useState('ready'),[settings,setSettings]=useState({lotUnits:5,positions:2});
 const sell=view==='sell';const report=buildDirectionalReport({signal:sell?'SELL':'BUY',symbol:'XAUUSD',timeframe:'M15',entry:3300,stopLoss:sell?3320:3280,takeProfit:sell?3260:3340,confidence:65,confidenceReason:'Illustrative subjective confidence for interface review, not live analysis or a win rate.',chartClarity:'clear',priceEvidence:{visibleMin:3200,visibleMax:3400,decimalPlaces:2,basis:'Synthetic interface fixture only. No real market evidence.'},reasoning:'Illustrative interface fixture, not a trading recommendation. This example shows how a validated directional setup, chart-reference prices and a two-to-one reference reward/risk ratio appear. Real analyses must derive their own evidence from an uploaded readable chart; execution remains unavailable without verified live account, market and broker checks.',analysis:{marketStructure:'Fixture structure used only to review typography and spacing.',entryReasoning:'Fixture chart-reference entry. No actual market observation.',risksInvalidation:'Illustrative stop only; do not trade these values.'}});
 const record={id:'fixture-only',kind:'chart',strategy:'SMC',createdAt:new Date().toISOString(),report};
 return <AppContext.Provider value={values}><div className="review-toolbar"><strong>Interface review · illustrative data · no live analysis or orders</strong><div>{['ready','buy','sell','history','confirmation'].map(v=><button key={v} onClick={()=>setView(v)}>{v}</button>)}</div></div><main className="review-phone">{view==='ready'?<Modal onClose={()=>setView('buy')} onNavigate={()=>setView('ready')}/>:<div className="scanner-screen"><img className="scanner-background" src={background}/><div className="scanner-shade"/><div className="scanner-scroll"><Report record={record} historical={view==='history'} settings={settings} onEditSettings={()=>setView('confirmation')}/>{view==='confirmation'&&<Settings report={report} mode="confirmation" initial={settings} onConfirm={setSettings} onClose={()=>setView('buy')}/>}</div></div>}</main></AppContext.Provider>}
createRoot(document.getElementById('root')).render(<Preview/>);
`;
const result=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,alias:{react:resolve('artifacts/ea-app/node_modules/react')},platform:'browser',format:'iife',jsx:'automatic',write:false,outdir:output,tsconfig:'artifacts/ea-app/tsconfig.json',loader:{'.css':'css','.jpg':'dataurl','.jpeg':'dataurl','.png':'dataurl','.svg':'dataurl','.webp':'dataurl'},define:{'process.env.NODE_ENV':'"production"'}});
let css=result.outputFiles.find(f=>f.path.endsWith('.css'))?.text??'';
// Tailwind base styling comes from the actual app build when available.
import {readdirSync} from 'node:fs';
try{const dir='artifacts/ea-app/dist/assets';const path=readdirSync(dir).find(name=>/^index-.*\.css$/.test(name));if(path)css=readFileSync(dir+'/'+path,'utf8')+'\n'+css;}catch{}
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
writeFileSync(output+'/index.html','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scanner interface review</title><style>'+css+'\nbody{margin:0;background:#09080b;color:white;font-family:Inter,system-ui}*{box-sizing:border-box}.review-toolbar{max-width:600px;margin:12px auto;padding:12px;font-size:12px;color:#d9b7b7}.review-toolbar div{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.review-toolbar button{background:#32191e;color:#fff;border:1px solid #79434b;border-radius:9px;padding:8px 12px}.review-phone{position:relative;isolation:isolate;width:100%;max-width:430px;height:850px;max-height:calc(100dvh - 115px);margin:auto;border:1px solid #67323a;border-radius:24px;overflow:hidden}.review-phone .scanner-screen{position:absolute;inset:0}</style></head><body><div id="root"></div><script>'+js.replace(/<\/script/gi,'<\\/script')+'</script></body></html>');
console.log(output+'/index.html');
