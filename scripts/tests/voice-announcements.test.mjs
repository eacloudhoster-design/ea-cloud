import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
const load=async path=>{const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));};
const {VoiceAnnouncementService}=await load('artifacts/ea-app/src/lib/voice-announcement-service.ts');
const {scannerAnnouncement,tradeAnnouncement,mt5AttemptAnnouncement,mt5ResultAnnouncement,spokenPrice}=await load('artifacts/ea-app/src/lib/voice-announcement-text.ts');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('scanner results and broker receipts remain truthful; no pending/partial execution or fabricated levels',()=>{
 assert.match(scannerAnnouncement({kind:'chart',report:{signal:'BUY',symbol:'XAUUSD'}}),/gold buy directional bias.*verification/);
 assert.match(scannerAnnouncement({kind:'chart',report:{signal:'SELL',symbol:'EURUSD',executable:true}}),/sell directional bias/);
 assert.match(scannerAnnouncement({kind:'chart',report:{signal:'NO TRADE'}}),/No trading opportunity/);assert.equal(scannerAnnouncement({}),null);
 for(const status of ['pending','skipped'])assert.equal(tradeAnnouncement({status}),null);
 for(const retcode of [10008,10010,null])assert.equal(tradeAnnouncement({status:'success',retcode,ticket:'1',signalKind:'OPEN',action:'BUY'}),null);
 assert.match(tradeAnnouncement({status:'success',retcode:10009,ticket:'1',signalKind:'OPEN',action:'SELL',symbol:'XAUUSD'}),/confirmed a sell execution for gold/);
 assert.match(tradeAnnouncement({status:'success',retcode:10009,ticket:'1',signalKind:'CLOSE',symbol:'XAUUSD'}),/confirmed a close order/);
 assert.match(tradeAnnouncement({status:'failed',errorMessage:'private broker error'}),/execution failed/);
});
test('unsupported speech is a silent no-op, without breaking app events',()=>{const old=globalThis.window;try{globalThis.window={};const voice=new VoiceAnnouncementService();voice.announce('Welcome','w');voice.unlock();voice.dispose();}finally{globalThis.window=old;}});

test('chart setup speech preserves actual prices and multiple explicit TP targets without inventing partial or invalid setups',()=>{
 const report={signal:'SELL',symbol:'XAUUSD',entry:2750.25,stopLoss:2760.5,takeProfit:2730,priceEvidence:{visibleMin:2700,visibleMax:2800},levelAssessment:{code:'CHART_LEVELS_RETAINED'}};
 const say=patch=>scannerAnnouncement({kind:'chart',report:{...report,...patch}});
 assert.match(say({}),/gold sell setup detected.*Entry at 2,750\.25.*Stop loss at 2,760\.5.*Take profit at 2,730.*not live verified/);
 assert.match(say({takeProfits:[2720,{price:2710}]}),/Take profit 1 at 2,730.*Take profit 2 at 2,720.*Take profit 3 at 2,710/);
 assert.match(say({signal:'BUY',stopLoss:2730,takeProfit:2790}),/gold buy setup detected/);
 for(const patch of [{entry:null},{entry:'2750'},{entry:NaN},{stopLoss:2700},{takeProfit:2800},{priceEvidence:{visibleMin:2740,visibleMax:2800}},{levelAssessment:{code:'PRICE_SCALE_MISSING'}}]){
  const text=say(patch);assert.match(text,/directional bias/);assert.ok(!text.includes('Entry at'),'invalid/incomplete levels must not become a complete setup');
 }
 assert.equal(spokenPrice(.00001),'0.00001');assert.equal(spokenPrice(1e-25),'0.0000000000000000000000001');
});
test('MT5 speech distinguishes attempts, unverified previews, actual failure categories and explicitly verified success',()=>{
 assert.equal(mt5AttemptAnnouncement(null,null),'Connecting to MT5 account.');
 assert.match(mt5AttemptAnnouncement('Exness','Exness-MT5Real1'),/^Connecting to Exness MT5 Real 1\.$/);
 assert.match(mt5AttemptAnnouncement('Pepperstone','Live01'),/Pepperstone Live01/);
 assert.equal(mt5ResultAnnouncement({status:'backend-unreachable'}),'Connection failed. Backend unreachable.');
 assert.equal(mt5ResultAnnouncement({status:'authentication-failed'}),'Connection failed. Please check your account credentials.');
 assert.equal(mt5ResultAnnouncement({status:'connected'}),null);assert.equal(mt5ResultAnnouncement({status:'connected',verified:false}),null);
 assert.equal(mt5ResultAnnouncement({status:'connected',verified:true}),'MT5 account connected successfully.');
 assert.match(mt5ResultAnnouncement({status:'unverified'}),/remains unverified/);
});

test('announcement source has no browser/system speech engines, and removed legacy queue cannot be imported by the app',async()=>{
 const {readFile,readdir}=await import('node:fs/promises');
 async function files(path){const out=[];for(const item of await readdir(path,{withFileTypes:true})){const name=path+'/'+item.name;if(item.isDirectory())out.push(...await files(name));else if(/\.[jt]sx?$/.test(name))out.push(name);}return out;}
 for(const file of await files('artifacts/ea-app/src')){const source=await readFile(file,'utf8');assert.ok(!/speechSynthesis|SpeechSynthesisUtterance/.test(source),file+' must not invoke native synthesis');assert.ok(!source.includes('voice-queue'),file+' must use the central natural announcer');}
});
