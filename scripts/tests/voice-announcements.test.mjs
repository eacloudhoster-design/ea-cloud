import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
const load=async path=>{const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));};
const {VoiceAnnouncementService,selectAnnouncementVoice}=await load('artifacts/ea-app/src/lib/voice-announcement-service.ts');
const {scannerAnnouncement,tradeAnnouncement,mt5AttemptAnnouncement,mt5ResultAnnouncement,spokenPrice}=await load('artifacts/ea-app/src/lib/voice-announcement-text.ts');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('native speech starts synchronously, caches English voice, replaces stale groups, prioritizes and deduplicates without network',async()=>{
 const oldWindow=globalThis.window,oldUtterance=globalThis.SpeechSynthesisUtterance,oldFetch=globalThis.fetch;
 let active=null,reads=0,network=0,cancelled=0;const calls=[],events=new EventTarget();
 const synth={getVoices(){reads++;return [{name:'French',lang:'fr-FR'},{name:'Samantha',lang:'en-US',localService:true}];},addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),speak(u){active=u;calls.push({text:u.text,at:performance.now()});},cancel(){cancelled++;active=null;},resume(){},get speaking(){return !!active;}};
 globalThis.window={speechSynthesis:synth};globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};globalThis.fetch=()=>{network++;throw Error('No voice network permitted');};
 let service;
 try{
  service=new VoiceAnnouncementService();const start=performance.now();service.announce('Welcome to Mentor Alpha.','welcome');assert.equal(calls.length,1);assert.ok(calls[0].at-start<100);assert.equal(active.voice.name,'Samantha');assert.equal(active.rate,1.04);assert.equal(active.pitch,1);
  service.announce('Normal mode activated.','normal',2,'mode');assert.equal(calls.at(-1).text,'Normal mode activated.');assert.ok(cancelled>0);
  const obsoleteEnd=active.onend;service.announce('Ultimate mode activated.','ultimate',2,'mode');obsoleteEnd();assert.equal(calls.at(-1).text,'Ultimate mode activated.');
  service.announce('Trade confirmed.','trade-1',3);assert.equal(calls.at(-1).text,'Trade confirmed.');service.announce('Trade confirmed.','trade-1',3);assert.equal(calls.filter(c=>c.text==='Trade confirmed.').length,1);
  service.announce('Old mode.','old',2,'mode');service.announce('Newest mode.','new',2,'mode');active.onend();assert.equal(calls.at(-1).text,'Newest mode.');assert.ok(!calls.some(c=>c.text==='Old mode.'));
  active.onend();service.announce('Welcome again.','welcome-2');active.onerror({error:'not-allowed'});const count=calls.length;service.announce('Symbol configured.','symbol',2,'symbol');assert.equal(calls.length,count);service.unlock();assert.equal(calls.at(-1).text,'Symbol configured.');active.onend();assert.equal(calls.at(-1).text,'Welcome again.');active.onend();
  assert.equal(reads,1);events.dispatchEvent(new Event('voiceschanged'));assert.equal(reads,2);
  service.announce('Bot activated.','bot',3,'bot');service.discard('bot');assert.equal(active,null);
  service.suspend();const hidden=calls.length;service.announce('Hidden event','hidden');assert.equal(calls.length,hidden);service.foreground();service.announce('Resumed','resume');assert.equal(calls.at(-1).text,'Resumed');service.dispose();const disposed=calls.length;service.unlock();service.announce('Old session','old-session');assert.equal(calls.length,disposed);assert.equal(network,0);
 }finally{service?.dispose();globalThis.window=oldWindow;globalThis.SpeechSynthesisUtterance=oldUtterance;globalThis.fetch=oldFetch;}
});
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

test('natural English enhanced voices are preferred without delaying native fallback',()=>{
 const voices=[{name:'Samantha',lang:'en-US',localService:true},{name:'Samantha (Enhanced)',lang:'en-US',localService:true},{name:'Premium French',lang:'fr-FR',localService:true}];
 assert.equal(selectAnnouncementVoice(voices).name,'Samantha (Enhanced)');assert.equal(selectAnnouncementVoice([]),null);
 assert.equal(selectAnnouncementVoice([{name:'Default English',lang:'en',default:true}]).name,'Default English');
 assert.equal(selectAnnouncementVoice([{name:'Spanish',lang:'es-ES'}]),null);
});
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

test('an unheard blocked welcome survives backgrounding until the first permitted gesture',()=>{
 const oldWindow=globalThis.window,oldUtterance=globalThis.SpeechSynthesisUtterance;let allowed=false,active=null;const calls=[];
 globalThis.window={speechSynthesis:{getVoices:()=>[],addEventListener(){},removeEventListener(){},resume(){},cancel(){active=null;},get speaking(){return !!active;},speak(u){calls.push(u.text);if(!allowed)u.onerror({error:'not-allowed'});else active=u;}}};globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 const service=new VoiceAnnouncementService();try{service.announce('Welcome to EA Cloud Pro.','welcome');service.suspend();service.foreground();allowed=true;service.unlock();assert.deepEqual(calls,['Welcome to EA Cloud Pro.','Welcome to EA Cloud Pro.']);active.onend();service.unlock();assert.equal(calls.length,2);}finally{service.dispose();globalThis.window=oldWindow;globalThis.SpeechSynthesisUtterance=oldUtterance;}
});
