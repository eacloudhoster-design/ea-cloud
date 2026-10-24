import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from '../../artifacts/api-server/node_modules/esbuild/lib/main.js';
const load=async path=>{const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));};
const {VoiceAnnouncementService}=await load('artifacts/ea-app/src/lib/voice-announcement-service.ts');
const {scannerAnnouncement,tradeAnnouncement}=await load('artifacts/ea-app/src/lib/voice-announcement-text.ts');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('native speech starts synchronously, caches English voice, replaces stale groups, prioritizes and deduplicates without network',async()=>{
 const oldWindow=globalThis.window,oldUtterance=globalThis.SpeechSynthesisUtterance,oldFetch=globalThis.fetch;
 let active=null,reads=0,network=0,cancelled=0;const calls=[],events=new EventTarget();
 const synth={getVoices(){reads++;return [{name:'French',lang:'fr-FR'},{name:'Samantha',lang:'en-US',localService:true}];},addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),speak(u){active=u;calls.push({text:u.text,at:performance.now()});},cancel(){cancelled++;active=null;},resume(){},get speaking(){return !!active;}};
 globalThis.window={speechSynthesis:synth};globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};globalThis.fetch=()=>{network++;throw Error('No voice network permitted');};
 let service;
 try{
  service=new VoiceAnnouncementService();const start=performance.now();service.announce('Welcome to Mentor Alpha.','welcome');assert.equal(calls.length,1);assert.ok(calls[0].at-start<100);assert.equal(active.voice.name,'Samantha');assert.equal(active.rate,1.1);
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
 assert.match(scannerAnnouncement({kind:'chart',report:{signal:'SELL',symbol:'EURUSD',executable:true}}),/sell opportunity detected/);
 assert.match(scannerAnnouncement({kind:'chart',report:{signal:'NO TRADE'}}),/No trading opportunity/);assert.equal(scannerAnnouncement({}),null);
 for(const status of ['pending','skipped'])assert.equal(tradeAnnouncement({status}),null);
 for(const retcode of [10008,10010,null])assert.equal(tradeAnnouncement({status:'success',retcode,ticket:'1',signalKind:'OPEN',action:'BUY'}),null);
 assert.match(tradeAnnouncement({status:'success',retcode:10009,ticket:'1',signalKind:'OPEN',action:'SELL',symbol:'XAUUSD'}),/confirmed a sell execution for gold/);
 assert.match(tradeAnnouncement({status:'success',retcode:10009,ticket:'1',signalKind:'CLOSE',symbol:'XAUUSD'}),/confirmed a close order/);
 assert.match(tradeAnnouncement({status:'failed',errorMessage:'private broker error'}),/execution failed/);
});
test('unsupported speech is a silent no-op, without breaking app events',()=>{const old=globalThis.window;try{globalThis.window={};const voice=new VoiceAnnouncementService();voice.announce('Welcome','w');voice.unlock();voice.dispose();}finally{globalThis.window=old;}});
